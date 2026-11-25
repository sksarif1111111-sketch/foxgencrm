import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/crm/PageHeader";
import {
  FoxgenCustomersError,
  FoxgenCustomersSkeleton,
  foxgenDate,
} from "@/components/crm/FoxgenCustomersShared";
import { FoxgenSource, FoxgenStatus } from "@/components/crm/FoxgenStatus";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCard } from "@/components/crm/StatCard";
import { memberSpending, moneyLabel, visibleStoreFields } from "@/lib/foxgen-presentation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { orderData, text } from "@/lib/foxgen-orders";
import { foxgenCustomerDetailOptions } from "@/lib/foxgen-queries";
import { FoxgenCustomerActions, type MessageReceipt } from "@/components/crm/FoxgenCustomerActions";
import { FoxgenPaymentEvidence } from "@/components/crm/FoxgenPaymentEvidence";
import {
  memberNumber,
  walletBalance,
  snapshotNumber,
  telegramChatUrl,
} from "@/lib/foxgen-customers";

export const Route = createFileRoute("/_authenticated/foxgen-customers/$id")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(foxgenCustomerDetailOptions(params.id)),
  pendingMs: 150,
  pendingComponent: FoxgenCustomersSkeleton,
  errorComponent: FoxgenCustomersError,
  notFoundComponent: () => <p>FoxGen customer not found.</p>,
  head: () => ({
    meta: [
      { title: "FoxGen Customer Profile — FOXGEN CRM" },
      {
        name: "description",
        content: "Review a FoxGen member's account, wallet funding and complete purchase history.",
      },
      { property: "og:title", content: "FoxGen Customer Profile — FOXGEN CRM" },
      {
        property: "og:description",
        content: "Review a FoxGen member's account, wallet funding and complete purchase history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FoxgenCustomerProfile,
});

function FoxgenCustomerProfile() {
  const { id } = Route.useParams();
  const query = useSuspenseQuery(foxgenCustomerDetailOptions(id));
  const { customer, orders, payments, messages } = query.data;
  const [sentMessages, setSentMessages] = useState<MessageReceipt[]>([]);
  if (!customer)
    return (
      <div className="space-y-4">
        <p>FoxGen customer not found.</p>
        <Button asChild variant="outline">
          <Link to="/foxgen-customers">All FoxGen customers</Link>
        </Button>
      </div>
    );
  const data = orderData(customer.data);
  const balance = walletBalance(customer.data);
  const name = customer.name || text(data["name"] ?? data["customer_name"] ?? customer.external_id);
  const balanceLabel = moneyLabel(
    balance,
    typeof data["wallet_currency"] === "string"
      ? data["wallet_currency"]
      : typeof data["currency"] === "string"
        ? data["currency"]
        : null,
  );
  const memberId = memberNumber(customer);
  const chatUrl = telegramChatUrl(data["telegram_username"]);
  const spentSnapshot = data["total_spent"];
  const spent =
    spentSnapshot && typeof spentSnapshot === "object" && !Array.isArray(spentSnapshot)
      ? Object.entries(spentSnapshot)
          .filter(([, value]) => typeof value === "number")
          .map(([currency, value]) => moneyLabel(Number(value), currency))
          .join(" · ") || "—"
      : memberSpending(orders);
  const importedMessages = Array.isArray(data["messages_sent"])
    ? data["messages_sent"].filter(
        (value) => value && typeof value === "object" && !Array.isArray(value),
      )
    : [];
  const funding = payments.filter((payment) => !orderData(payment.data)["order_external_id"]);
  const activity = [...orders, ...payments].sort((a, b) =>
    b.source_updated_at.localeCompare(a.source_updated_at),
  );
  const fields = {
    "Customer ID": memberId,
    "External customer ID": customer.external_id,
    Joined: foxgenDate(data["joined_at"] ?? data["first_seen_at"]),
    "Account email": data["email"] ?? data["customer_email"],
    "Telegram ID": data["telegram_user_id"],
    "Telegram username": data["telegram_username"],
    "Delivery emails": data["delivery_emails"],
    Phone: data["phone"],
    "Last updated": foxgenDate(customer.source_updated_at),
  };
  const activityList = (rows: typeof activity) =>
    rows.length ? (
      <ul className="divide-y">
        {rows.map((row) => (
          <li
            key={`${row.entity}:${row.external_id}`}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 py-3 text-sm"
          >
            <div className="min-w-0">
              <p className="break-words font-semibold">
                {row.entity === "orders" ? (
                  <Link
                    to="/foxgen-orders/$id"
                    params={{ id: row.external_id }}
                    className="text-primary hover:underline"
                  >
                    {row.name || row.external_id}
                  </Link>
                ) : (
                  `Payment · ${moneyLabel(row.amount, row.currency)}`
                )}
              </p>
              <p className="text-xs text-muted-foreground">{foxgenDate(row.source_updated_at)}</p>
            </div>
            <FoxgenStatus status={row.status} />
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-sm text-muted-foreground">No member activity received.</p>
    );
  return (
    <div className="min-w-0">
      <Link
        to="/foxgen-customers"
        className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="size-4" />
        Store Members
      </Link>
      <div className="mb-5 rounded-lg border bg-card p-4 shadow-card sm:p-5">
        <div className="flex items-start gap-4">
          <div
            aria-hidden="true"
            className="grid size-12 shrink-0 place-items-center rounded-lg bg-secondary text-lg font-extrabold text-primary"
          >
            {name
              .trim()
              .split(/\s+/)
              .slice(0, 2)
              .map((word) => word[0])
              .join("")
              .toUpperCase()}
          </div>
          <div className="min-w-0 grow">
            <PageHeader
              title={name}
              description={memberId}
              actions={
                <Button
                  variant="outline"
                  disabled={query.isFetching}
                  onClick={() => query.refetch()}
                >
                  <RefreshCw />
                  {query.isFetching ? "Refreshing…" : "Refresh"}
                </Button>
              }
            />
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-3 border-t pt-4 sm:grid-cols-4">
          {Object.entries({
            "Account email": fields["Account email"],
            "Telegram ID": fields["Telegram ID"],
            "Telegram username": fields["Telegram username"],
            Joined: fields.Joined,
          }).map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs font-bold text-muted-foreground">{label}</dt>
              <dd className="mt-1 break-all text-sm">{text(value)}</dd>
            </div>
          ))}
        </dl>
      </div>
      {chatUrl && (
        <Button asChild variant="outline" size="sm" className="mb-4">
          <a href={chatUrl} target="_blank" rel="noreferrer">
            Open Telegram chat
          </a>
        </Button>
      )}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard tone="primary" label="Wallet balance" value={balanceLabel} />
        <StatCard label="Credits" value={snapshotNumber(customer.data, "credit_balance") ?? "—"} />
        <StatCard label="Total spent" value={<span className="text-base">{spent}</span>} />
        <StatCard
          label="Total orders"
          value={snapshotNumber(customer.data, "total_orders") ?? orders.length}
        />
      </div>
      <FoxgenCustomerActions
        key={id}
        customerId={id}
        data={customer.data}
        wallet={data["channel"] === "telegram" || !!data["telegram_user_id"]}
        onMessage={(receipt) => setSentMessages((values) => [receipt, ...values])}
      />
      {query.isRefetchError && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          Could not refresh this member. Showing the last received information.
        </p>
      )}
      <Tabs defaultValue="overview" className="min-w-0">
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="wallet">Wallet top-ups</TabsTrigger>
            <TabsTrigger value="messages">Messages sent</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border bg-card p-4 shadow-card">
              <h2 className="mb-4 font-extrabold">Member details</h2>
              <dl className="grid grid-cols-2 gap-4">
                {Object.entries(fields).map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1 break-all text-sm">{text(value)}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <section className="rounded-lg border bg-card p-4 shadow-card">
              <h2 className="mb-2 font-extrabold">Recent activity</h2>
              {activityList(activity.slice(0, 5))}
            </section>
          </div>
        </TabsContent>
        <TabsContent value="orders" className="rounded-lg border bg-card shadow-card">
          <h2 className="border-b px-4 py-3 font-extrabold">Order history</h2>
          {!orders.length ? (
            <p className="p-5 text-sm text-muted-foreground">
              No orders yet — this member has not purchased yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    "Order ID",
                    "Product",
                    "Source",
                    "Status",
                    "Transaction ID",
                    "Screenshot",
                    "Amount",
                    "Created",
                  ].map((label) => (
                    <TableHead key={label}>{label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => {
                  const info = orderData(order.data);
                  const created = info["created_at"] ?? info["order_created_at"];
                  return (
                    <TableRow key={order.external_id}>
                      <TableCell className="min-w-36 max-w-52 break-all">
                        <Link
                          to="/foxgen-orders/$id"
                          params={{ id: order.external_id }}
                          className="font-bold text-primary hover:underline"
                        >
                          {text(info["order_number"] ?? order.external_id)}
                        </Link>
                      </TableCell>
                      <TableCell className="min-w-32">
                        {text(info["product_name"] ?? order.name)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <FoxgenSource data={info} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <FoxgenStatus status={order.status} />
                      </TableCell>
                      <TableCell className="figure max-w-52 break-all">
                        {text(info["payment_reference"] ?? info["transaction_id"])}
                      </TableCell>
                      <TableCell>
                        <FoxgenPaymentEvidence key={order.external_id} order={order} compact />
                      </TableCell>
                      <TableCell className="figure whitespace-nowrap">
                        {moneyLabel(order.amount, order.currency)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {foxgenDate(typeof created === "string" ? created : null)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </TabsContent>
        <TabsContent value="wallet" className="space-y-4">
          <div className="max-w-xs">
            <StatCard tone="primary" label="Current wallet balance" value={balanceLabel} />
          </div>
          <section className="rounded-lg border bg-card shadow-card">
            <h2 className="border-b px-4 py-3 font-extrabold">Funding activity</h2>
            {!funding.length ? (
              <p className="p-5 text-sm text-muted-foreground">No funding activity yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Screenshot</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {funding.map((payment) => {
                    const info = orderData(payment.data);
                    return (
                      <TableRow key={payment.external_id}>
                        <TableCell className="min-w-32 max-w-52 break-all">
                          {text(
                            info["transaction_id"] ??
                              info["reference"] ??
                              info["payment_reference"] ??
                              payment.external_id,
                          )}
                        </TableCell>
                        <TableCell className="figure whitespace-nowrap">
                          {moneyLabel(payment.amount, payment.currency)}
                        </TableCell>
                        <TableCell>
                          <FoxgenStatus status={payment.status} />
                        </TableCell>
                        <TableCell>
                          <FoxgenPaymentEvidence
                            key={payment.external_id}
                            order={payment}
                            kind="topup"
                            compact
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {foxgenDate(payment.source_updated_at)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </section>
        </TabsContent>
        <TabsContent value="messages" className="min-w-0 border-t py-4">
          <h2 className="mb-3 font-semibold">Messages sent</h2>
          {!sentMessages.length && !importedMessages.length && !messages.length && (
            <p className="text-sm text-muted-foreground">
              No message history received from the Store.
            </p>
          )}
          <ul className="divide-y">
            {sentMessages
              .filter((message) => !messages.some((receipt) => receipt.request_id === message.id))
              .map((message) => (
                <li key={message.id} className="py-3">
                  <p className="whitespace-pre-wrap break-words text-sm">{message.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {foxgenDate(message.at)} ·{" "}
                    {Object.entries(message.channels)
                      .map(([channel, status]) => `${channel}: ${status.replaceAll("_", " ")}`)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            {messages.map((receipt) => (
              <li key={receipt.request_id} className="py-3">
                <p className="whitespace-pre-wrap break-words text-sm">{receipt.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {foxgenDate(receipt.created_at)} ·{" "}
                  {Object.entries(orderData(receipt.channels))
                    .map(([channel, status]) => `${channel}: ${text(status).replaceAll("_", " ")}`)
                    .join(" · ")}
                </p>
              </li>
            ))}
            {importedMessages.map((value, index) => {
              const message =
                value && typeof value === "object" && !Array.isArray(value) ? value : {};
              return (
                <li key={index} className="py-3">
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {text(message["message"] ?? message["body"])}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {foxgenDate(message["sent_at"] ?? message["created_at"])}
                  </p>
                </li>
              );
            })}
          </ul>
        </TabsContent>
        <TabsContent value="activity" className="rounded-lg border bg-card p-4 shadow-card">
          <h2 className="mb-2 font-extrabold">Member activity</h2>
          {activityList(activity)}
          <details className="mt-4 border-t pt-3">
            <summary className="cursor-pointer text-sm font-bold">Imported member fields</summary>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              {Object.entries(visibleStoreFields(customer.data)).map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{label.replaceAll("_", " ")}</dt>
                  <dd className="mt-1 break-all text-sm">{text(value)}</dd>
                </div>
              ))}
            </dl>
          </details>
        </TabsContent>
      </Tabs>
    </div>
  );
}
