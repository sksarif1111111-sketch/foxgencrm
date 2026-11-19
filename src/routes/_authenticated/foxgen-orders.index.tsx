import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowUpRight, RefreshCw, Search, Store } from "lucide-react";
import { PageHeader } from "@/components/crm/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DeliveryCountdown } from "@/components/crm/DeliveryCountdown";
import { FoxgenSource, FoxgenStatus } from "@/components/crm/FoxgenStatus";
import { FoxgenOrderSkeleton } from "@/components/crm/FoxgenOrderSkeleton";
import { FOXGEN_STATUSES, FoxgenSearch, orderData, type FoxgenFilters } from "@/lib/foxgen-orders";
import { Badge } from "@/components/ui/badge";
import { foxgenDate } from "@/components/crm/FoxgenCustomersShared";
import { moneyLabel, paymentGroup, PAYMENT_GROUPS } from "@/lib/foxgen-presentation";
import { foxgenListOptions } from "@/lib/foxgen-queries";

export const Route = createFileRoute("/_authenticated/foxgen-orders/")({
  validateSearch: FoxgenSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(foxgenListOptions(deps)),
  pendingMs: 150,
  pendingComponent: FoxgenOrderSkeleton,
  errorComponent: FoxgenListError,
  notFoundComponent: () => <p>FoxGen order list not found.</p>,
  head: () => ({
    meta: [
      { title: "FoxGen Store Orders — FOXGEN CRM" },
      {
        name: "description",
        content: "Manage FoxGen Store payment review and customer delivery deadlines.",
      },
      { property: "og:title", content: "FoxGen Store Orders — FOXGEN CRM" },
      {
        property: "og:description",
        content: "Manage FoxGen Store payment review and customer delivery deadlines.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FoxgenOrders,
});
function FoxgenListError() {
  const router = useRouter();
  return (
    <div role="alert" className="space-y-4">
      <p className="text-destructive">Could not load Store orders. Try again in a moment.</p>
      <Button variant="outline" onClick={() => router.invalidate()}>
        Try again
      </Button>
    </div>
  );
}
function FoxgenOrders() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/foxgen-orders/" });
  const q = useSuspenseQuery(foxgenListOptions(search));
  const page = search.page ?? 0;
  const filtered = Boolean(
    search.q ||
    (search.status && search.status !== "all") ||
    (search.channel && search.channel !== "all") ||
    (search.payment && search.payment !== "all"),
  );
  const set = (patch: Partial<FoxgenFilters>) =>
    navigate({ search: (prev) => ({ ...prev, page: undefined, ...patch }) });
  return (
    <div className="foxgen-section">
      <PageHeader
        title="Store Orders"
        description={`${q.data.count} orders`}
        actions={
          <Button variant="outline" disabled={q.isFetching} onClick={() => q.refetch()}>
            <RefreshCw className={q.isFetching ? "animate-spin" : ""} />
            {q.isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />
      <div className="mb-4 grid min-w-0 gap-3 rounded-lg border bg-card p-4 shadow-card sm:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))]">
        <div>
          <Label htmlFor="fg-search" className="mb-2 block">
            Search
          </Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              id="fg-search"
              className="pl-9"
              maxLength={100}
              placeholder="Order ID, customer ID, name or email"
              value={search.q ?? ""}
              onChange={(e) => set({ q: e.target.value || undefined })}
            />
          </div>
        </div>
        <div>
          <Label className="mb-2 block">Order status</Label>
          <Select
            value={search.status ?? "all"}
            onValueChange={(v) => {
              const status = FoxgenSearch.shape.status.parse(v);
              set({ status });
            }}
          >
            <SelectTrigger aria-label="Filter FoxGen status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {FOXGEN_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.replaceAll("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-2 block">Payment status</Label>
          <Select
            value={search.payment ?? "all"}
            onValueChange={(value) => set({ payment: FoxgenSearch.shape.payment.parse(value) })}
          >
            <SelectTrigger aria-label="Filter payment status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All payment statuses</SelectItem>
              {Object.entries(PAYMENT_GROUPS).map(([key, group]) => (
                <SelectItem key={key} value={key}>
                  {group.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-2 block">Source</Label>
          <Select
            value={search.channel ?? "all"}
            onValueChange={(v) => {
              const channel = FoxgenSearch.shape.channel.parse(v);
              set({ channel });
            }}
          >
            <SelectTrigger aria-label="Filter FoxGen source">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="website">Website</SelectItem>
              <SelectItem value="bot">Telegram bot</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {q.isRefetchError && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          Could not refresh Store orders. Showing the last received information.
        </p>
      )}
      {!q.data.rows.length ? (
        <section className="rounded-lg border bg-card px-4 py-12 text-center">
          <Store className="mx-auto mb-4 size-8 text-muted-foreground" />
          <h2 className="text-lg font-semibold">
            {filtered ? "No matching orders" : "No FoxGen orders yet"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {filtered
              ? "No orders match these filters."
              : "Orders will appear when FoxGen Store sends them."}
          </p>
          {filtered ? (
            <Button variant="outline" className="mt-4" onClick={() => navigate({ search: {} })}>
              Clear filters
            </Button>
          ) : (
            <Button asChild variant="outline" className="mt-4">
              <Link to="/store">Store connection</Link>
            </Button>
          )}
        </section>
      ) : (
        <div className="min-w-0 rounded-lg border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  "Order ID",
                  "Customer",
                  "Product",
                  "Source",
                  "Amount",
                  "Payment",
                  "Order status",
                  "Delivery",
                  "Created at",
                  "Action",
                ].map((label) => (
                  <TableHead key={label} className="whitespace-nowrap">
                    {label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.rows.map((o) => {
                const d = orderData(o.data);
                const payment = paymentGroup(o);
                const customer =
                  typeof d["customer_external_id"] === "string" ? d["customer_external_id"] : "";
                const created = d["created_at"] ?? d["order_created_at"];
                const orderId = String(d["order_number"] ?? o.external_id);
                return (
                  <TableRow key={o.external_id}>
                    <TableCell className="min-w-36 max-w-52">
                      <Link
                        to="/foxgen-orders/$id"
                        params={{ id: o.external_id }}
                        className="block break-all font-extrabold text-primary hover:underline"
                      >
                        {orderId}
                      </Link>
                      {orderId !== o.external_id && (
                        <p
                          className="mt-1 truncate text-xs text-muted-foreground"
                          title={o.external_id}
                        >
                          {o.external_id}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="min-w-36 max-w-52 break-words">
                      {customer ? (
                        <Link
                          to="/foxgen-customers/$id"
                          params={{ id: customer }}
                          className="block font-semibold text-primary hover:underline"
                        >
                          {String(d["customer_name"] ?? customer)}
                          <span className="block truncate text-xs font-medium text-muted-foreground">
                            {String(d["member_number"] ?? customer)}
                          </span>
                        </Link>
                      ) : (
                        String(d["customer_name"] ?? "—")
                      )}
                    </TableCell>
                    <TableCell className="min-w-32 max-w-56 break-words">
                      {String(d["product_name"] ?? o.name ?? "—")}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <FoxgenSource data={d} />
                    </TableCell>
                    <TableCell className="figure whitespace-nowrap font-bold">
                      {moneyLabel(o.amount, o.currency)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {payment ? (
                        <Badge
                          variant={
                            payment === "paid"
                              ? "success"
                              : payment === "rejected"
                                ? "danger"
                                : payment === "refunded"
                                  ? "muted"
                                  : "warning"
                          }
                        >
                          {PAYMENT_GROUPS[payment].label}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <FoxgenStatus status={o.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <DeliveryCountdown
                        status={o.status}
                        confirmedAt={d["confirmed_at"]}
                        slaMinutes={d["shop_delivery_sla_minutes"]}
                        deliveredAt={d["delivered_at"]}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {foxgenDate(typeof created === "string" ? created : null)}
                    </TableCell>
                    <TableCell>
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        aria-label={`Open order ${orderId}`}
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
        </div>
      )}
      {q.data.count > 50 && (
        <div className="mt-4 flex items-center justify-end gap-3">
          <Button variant="outline" disabled={page === 0} onClick={() => set({ page: page - 1 })}>
            Previous
          </Button>
          <span className="figure text-sm">
            {page + 1} / {Math.ceil(q.data.count / 50)}
          </span>
          <Button
            variant="outline"
            disabled={(page + 1) * 50 >= q.data.count}
            onClick={() => set({ page: page + 1 })}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
