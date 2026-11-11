import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/crm/PageHeader";
import { FoxgenCustomersError, FoxgenCustomersSkeleton, foxgenDate } from "@/components/crm/FoxgenCustomersShared";
import { FoxgenStatus } from "@/components/crm/FoxgenStatus";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { orderData, text } from "@/lib/foxgen-orders";
import { foxgenCustomerDetailOptions } from "@/lib/foxgen-queries";
import { memberNumber, walletBalance } from "@/lib/foxgen-customers";

export const Route = createFileRoute("/_authenticated/foxgen-customers/$id")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(foxgenCustomerDetailOptions(params.id)),
  pendingMs: 150,
  pendingComponent: FoxgenCustomersSkeleton,
  errorComponent: FoxgenCustomersError,
  notFoundComponent: () => <p>FoxGen customer not found.</p>,
  head: () => ({ meta: [
    { title: "FoxGen Customer Profile — Digital Store CRM" },
    { name: "description", content: "Review a FoxGen member's account, wallet funding and complete purchase history." },
    { property: "og:title", content: "FoxGen Customer Profile — Digital Store CRM" },
    { property: "og:description", content: "Review a FoxGen member's account, wallet funding and complete purchase history." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: FoxgenCustomerProfile,
});

function FoxgenCustomerProfile() {
  const { id } = Route.useParams();
  const query = useSuspenseQuery(foxgenCustomerDetailOptions(id));
  const { customer, orders, payments } = query.data;
  if (!customer) return <div className="space-y-4"><p>FoxGen customer not found.</p><Button asChild variant="outline"><Link to="/foxgen-customers">All FoxGen customers</Link></Button></div>;
  const data = orderData(customer.data);
  const balance = walletBalance(customer.data);
  return <div className="foxgen-section">
    <Link to="/foxgen-customers" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />FoxGen Customers</Link>
    <PageHeader title={customer.name || text(data["name"] ?? data["customer_name"] ?? customer.external_id)} description={`${orders.length} FoxGen orders`} actions={
      <Button variant="outline" disabled={query.isFetching} onClick={() => query.refetch()}><RefreshCw className={query.isFetching ? "animate-spin" : ""} />{query.isFetching ? "Refreshing…" : "Refresh"}</Button>
    } />
    <p className="figure mb-6 break-all text-sm text-muted-foreground">{memberNumber(customer)}</p>
    {query.isRefetchError && <p role="alert" className="mb-4 text-sm text-destructive">Could not refresh this customer. Showing the last received information.</p>}
    <div className="grid items-start gap-6 lg:grid-cols-2">
    <section className="border-t pt-4"><h2 className="mb-4 text-lg font-semibold">Member information</h2>
      <dl className="grid gap-4 sm:grid-cols-2">{Object.entries({
        "Member number": memberNumber(customer),
        "Joined": foxgenDate(typeof data["joined_at"] === "string" ? data["joined_at"] : null),
        Email: data["email"] ?? data["customer_email"],
        "Delivery emails": data["delivery_emails"],
        "Telegram username": data["telegram_username"],
        "Telegram ID": data["telegram_user_id"],
        "Phone": data["phone"],
        "Updated": foxgenDate(customer.source_updated_at),
      }).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm">{text(value)}</dd></div>)}</dl>
    </section>
    <section className="min-w-0 rounded-lg border bg-card p-4">
      <h2 className="text-lg font-semibold">Wallet</h2>
      <p className="mt-3 text-xs text-muted-foreground">Current balance</p>
      <p className="figure mt-1 text-2xl font-semibold">{balance === null ? "—" : `${text(data["wallet_currency"] ?? data["currency"] ?? "USDT")} ${balance.toFixed(2)}`}</p>
      <h3 className="mb-2 mt-6 text-sm font-medium">Funding activity</h3>
      {!payments.length ? <p className="py-4 text-sm text-muted-foreground">No funding activity yet.</p> : <div className="max-h-80 overflow-auto"><Table>
        <TableHeader><TableRow><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Timestamp</TableHead></TableRow></TableHeader>
        <TableBody>{payments.map((payment) => <TableRow key={payment.external_id}>
          <TableCell className="figure whitespace-nowrap">{payment.amount === null ? "—" : `${payment.currency ?? "—"} ${payment.amount.toFixed(2)}`}</TableCell>
          <TableCell><Badge variant={payment.status === "approved" ? "success" : payment.status === "rejected" ? "danger" : "warning"}>{payment.status || "Unknown"}</Badge></TableCell>
          <TableCell className="whitespace-nowrap text-xs">{foxgenDate(payment.source_updated_at)}</TableCell>
        </TableRow>)}</TableBody>
      </Table></div>}
    </section>
    </div>
    <section className="mt-6 border-t pt-4"><h2 className="mb-4 text-lg font-semibold">FoxGen purchase history</h2>
      {!orders.length ? <p className="py-6 text-sm text-muted-foreground">No orders yet — this member has not purchased yet.</p> : <div className="overflow-x-auto"><Table>
        <TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Status</TableHead><TableHead>Amount</TableHead><TableHead>Updated</TableHead></TableRow></TableHeader>
        <TableBody>{orders.map((order) => <TableRow key={order.external_id}>
          <TableCell className="min-w-48 max-w-80"><Link to="/foxgen-orders/$id" params={{ id: order.external_id }} className="font-medium text-primary hover:underline">{order.name || order.external_id}</Link><p className="figure mt-1 break-all text-xs text-muted-foreground">{order.external_id}</p></TableCell>
          <TableCell><FoxgenStatus status={order.status} /></TableCell>
          <TableCell className="figure whitespace-nowrap">{order.amount == null ? "—" : `${order.currency ?? ""} ${order.amount.toFixed(2)}`}</TableCell>
          <TableCell className="whitespace-nowrap text-sm">{foxgenDate(order.source_updated_at)}</TableCell>
        </TableRow>)}</TableBody>
      </Table></div>}
    </section>
    <details className="mt-6 border-t pt-4"><summary className="cursor-pointer text-sm font-medium">All Store customer information</summary><dl className="mt-4 grid gap-4 sm:grid-cols-2">{Object.entries(data).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label.replaceAll("_", " ")}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm">{text(value)}</dd></div>)}</dl></details>
  </div>;
}