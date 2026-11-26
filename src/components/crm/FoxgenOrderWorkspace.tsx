import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Clock3,
  FileCheck2,
  Layers3,
  PackageCheck,
  RefreshCw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCard } from "./StatCard";
import { FoxgenStatus, FoxgenSource } from "./FoxgenStatus";
import { DeliveryCountdown } from "./DeliveryCountdown";
import { foxgenWorkspaceOptions } from "@/lib/foxgen-queries";
import { approvalClock, workspaceOrders } from "@/lib/foxgen-workspace";
import { ApprovalCountdown } from "./ApprovalCountdown";
import { marketplaceData } from "@/lib/foxgen-marketplace";
import { moneyLabel, paymentGroup, PAYMENT_GROUPS } from "@/lib/foxgen-presentation";
import { foxgenDate } from "./FoxgenCustomersShared";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

export function FoxgenOrderWorkspace() {
  const q = useSuspenseQuery(foxgenWorkspaceOptions);
  const [tab, setTab] = useState(() => {
    const initial = workspaceOrders(q.data, Date.now());
    return initial.review.length ? "review" : initial.delivery.length ? "delivery" : "recent";
  });
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  const queue = workspaceOrders(q.data, now);
  const base =
    tab === "review"
      ? queue.review
      : tab === "delivery"
        ? queue.delivery
        : tab === "delayed"
          ? queue.delayed
          : queue.recent;
  const term = search.trim().toLowerCase();
  const rows = base
    .filter((o) => {
      const d = marketplaceData(o.data);
      return [
        o.name,
        o.external_id,
        d["order_number"],
        d["customer_name"],
        d["customer_external_id"],
        d["customer_email"],
        d["payment_reference"],
      ].some((v) =>
        String(v ?? "")
          .toLowerCase()
          .includes(term),
      );
    })
    .slice(0, 12);
  return (
    <section className="mb-7 min-w-0">
      <div className="mb-3 flex items-center gap-2">
        <Layers3 className="size-4 text-primary" />
        <h2 className="text-sm font-extrabold">Store operations</h2>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Pending payments"
          icon={<Clock3 />}
          value={queue.pending.length}
          hint="Awaiting payment"
        />
        <StatCard
          tone="primary"
          label="Under review"
          icon={<FileCheck2 />}
          value={queue.review.length}
          hint="Proofs awaiting review"
        />
        <StatCard
          label="Awaiting delivery"
          icon={<PackageCheck />}
          value={queue.delivery.length}
          hint="Store delivery queue"
        />
        <StatCard
          label="Delayed orders"
          icon={<Clock3 />}
          value={queue.delayed.length}
          hint={`${queue.overdue} past delivery target`}
        />
      </div>
      <div className="rounded-lg border bg-card shadow-card">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-4 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold">Order desk</h2>
            <p className="text-xs text-muted-foreground">Website and Telegram orders</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={q.isFetching}
            aria-label="Refresh order desk"
            title="Refresh order desk"
            onClick={() => q.refetch()}
          >
            <RefreshCw className={q.isFetching ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
        <div className="flex min-w-0 flex-col justify-between gap-3 border-y px-3 py-3 sm:px-5 2xl:flex-row">
          <Tabs value={tab} onValueChange={setTab} className="min-w-0 overflow-x-auto">
            <TabsList className="justify-start">
              <TabsTrigger value="review">
                Waiting for approval{" "}
                <span className="ml-1 text-primary">{queue.review.length}</span>
              </TabsTrigger>
              <TabsTrigger value="delivery">Urgent delivery</TabsTrigger>
              <TabsTrigger value="recent">Recently updated</TabsTrigger>
              <TabsTrigger value="delayed">Delayed</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative 2xl:w-64">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              aria-label="Search order desk"
              className="pl-9"
              placeholder="Order, customer, transaction…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        {q.isRefetchError && (
          <p role="alert" className="px-4 py-2 text-sm text-destructive">
            Could not refresh. Showing the last received orders.
          </p>
        )}
        {rows.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order / product</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Payment / order</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Timing</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o) => {
                const d = marketplaceData(o.data);
                const customerId =
                  typeof d["customer_external_id"] === "string" ? d["customer_external_id"] : "";
                const name = String(
                  d["customer_name"] ?? d["telegram_username"] ?? (customerId || "—"),
                );
                const payment = paymentGroup(o);
                const created = d["created_at"] ?? d["order_created_at"];
                return (
                  <TableRow
                    key={o.external_id}
                    className={
                      approvalClock(o, now)?.overdue
                        ? "border-l-4 border-l-destructive bg-destructive/10 hover:bg-destructive/15"
                        : ""
                    }
                  >
                    <TableCell className="min-w-40 max-w-64">
                      <Link
                        to="/foxgen-orders/$id"
                        params={{ id: o.external_id }}
                        className="block truncate font-extrabold text-primary hover:underline"
                      >
                        {String(d["order_number"] ?? o.external_id)}
                      </Link>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {String(d["product_name"] ?? o.name)}
                      </p>
                    </TableCell>
                    <TableCell className="min-w-32 max-w-48">
                      {customerId ? (
                        <Link
                          to="/foxgen-customers/$id"
                          params={{ id: customerId }}
                          className="block truncate font-bold text-primary hover:underline"
                        >
                          {name}
                          <span className="mt-1 block truncate text-xs font-medium text-muted-foreground">
                            {customerId}
                          </span>
                        </Link>
                      ) : (
                        name
                      )}
                    </TableCell>
                    <TableCell>
                      <FoxgenSource data={d} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <FoxgenStatus status={o.status} />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {payment ? PAYMENT_GROUPS[payment].label : "Payment unknown"}
                      </p>
                    </TableCell>
                    <TableCell className="figure whitespace-nowrap font-bold">
                      {moneyLabel(o.amount, o.currency)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      <p>{foxgenDate(typeof created === "string" ? created : null)}</p>
                      <ApprovalCountdown order={o} />
                      {typeof d["confirmed_at"] === "string" && (
                        <p>Paid {foxgenDate(d["confirmed_at"])}</p>
                      )}
                      <DeliveryCountdown
                        status={o.status}
                        confirmedAt={d["confirmed_at"]}
                        deliveredAt={d["delivered_at"]}
                        slaMinutes={d["shop_delivery_sla_minutes"]}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        aria-label={`Open order ${String(d["order_number"] ?? o.external_id)}`}
                        title="Open order"
                      >
                        <Link to="/foxgen-orders/$id" params={{ id: o.external_id }}>
                          <ArrowUpRight />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="py-10 text-center">
            <PackageCheck className="mx-auto mb-2 size-7 text-primary" />
            <h3 className="font-bold">
              {search
                ? "No matching orders"
                : tab === "review"
                  ? "No payments awaiting review"
                  : tab === "delivery"
                    ? "No orders awaiting delivery"
                    : tab === "delayed"
                      ? "No delayed orders"
                      : "No Store orders received"}
            </h3>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t px-3 py-2 sm:px-5">
          <p className="text-xs text-muted-foreground">
            {base.length} {base.length === 1 ? "order" : "orders"} in this queue
          </p>
          <Button asChild size="sm" variant="link">
            <Link to="/foxgen-orders">
              All Store orders <ArrowUpRight />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
