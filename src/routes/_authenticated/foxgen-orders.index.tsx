import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { RefreshCw, Store } from "lucide-react";
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
      { title: "FoxGen Store Orders — Digital Store CRM" },
      {
        name: "description",
        content: "Manage FoxGen Store payment review and customer delivery deadlines.",
      },
      { property: "og:title", content: "FoxGen Store Orders — Digital Store CRM" },
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
  const set = (patch: Partial<FoxgenFilters>) =>
    navigate({ search: (prev) => ({ ...prev, page: undefined, ...patch }) });
  return (
    <div className="foxgen-section">
      <PageHeader
        title="FoxGen Store Orders"
        description={`${q.data.count} orders`}
        actions={
          <Button variant="outline" disabled={q.isFetching} onClick={() => q.refetch()}>
            <RefreshCw className={q.isFetching ? "animate-spin" : ""} />
            {q.isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />
      <div className="mb-4 grid gap-4 border-b pb-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="fg-search" className="mb-2 block">
            Search
          </Label>
          <Input
            id="fg-search"
            placeholder="Order, customer or email"
            value={search.q ?? ""}
            onChange={(e) => set({ q: e.target.value || undefined })}
          />
        </div>
        <div>
          <Label className="mb-2 block">Status</Label>
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
              <SelectItem value="bot">Bot</SelectItem>
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
        <section className="border-b py-12 text-center">
          <Store className="mx-auto mb-4 size-8 text-muted-foreground" />
          <h2 className="text-lg font-semibold">
            {search.q ||
            (search.status && search.status !== "all") ||
            (search.channel && search.channel !== "all")
              ? "No matching orders"
              : "No FoxGen orders yet"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {search.q ||
            (search.status && search.status !== "all") ||
            (search.channel && search.channel !== "all")
              ? "No orders match these filters."
              : "Orders will appear when FoxGen Store sends them."}
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/store">Store connection</Link>
          </Button>
        </section>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Delivery</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.rows.map((o) => {
                const d = orderData(o.data);
                return (
                  <TableRow key={o.external_id}>
                    <TableCell className="min-w-48 max-w-80">
                      <Link
                        to="/foxgen-orders/$id"
                        params={{ id: o.external_id }}
                        className="font-medium text-primary hover:underline"
                      >
                        {o.name || o.external_id}
                      </Link>
                      <p className="figure mt-1 break-all text-xs text-muted-foreground">
                        {o.external_id}
                      </p>
                    </TableCell>
                    <TableCell>
                      <FoxgenSource data={d} />
                    </TableCell>
                    <TableCell className="min-w-40 max-w-64 break-words">
                      {typeof d["customer_external_id"] === "string" &&
                      d["customer_external_id"] ? (
                        <Link
                          to="/foxgen-customers/$id"
                          params={{ id: d["customer_external_id"] }}
                          className="text-primary hover:underline"
                        >
                          {String(d["customer_name"] ?? d["customer_external_id"])}
                        </Link>
                      ) : (
                        String(d["customer_name"] ?? "—")
                      )}
                    </TableCell>
                    <TableCell>
                      <FoxgenStatus status={o.status} />
                    </TableCell>
                    <TableCell className="figure whitespace-nowrap">
                      {o.amount == null ? "—" : `${o.currency ?? ""} ${o.amount.toFixed(2)}`}
                    </TableCell>
                    <TableCell>
                      <DeliveryCountdown
                        status={o.status}
                        confirmedAt={d["confirmed_at"]}
                        slaMinutes={d["shop_delivery_sla_minutes"]}
                        deliveredAt={d["delivered_at"]}
                      />
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
