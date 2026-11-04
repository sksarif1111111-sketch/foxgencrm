import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { PlusCircle, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/crm/PageHeader";
import { OrderTable, ORDER_SELECT, type OrderRow } from "@/components/orders/OrderTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSettings } from "@/lib/crm-queries";
import { customRange } from "@/lib/date-ranges";

const SearchSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  source: z.enum(["all", "telegram_bot", "manual"]).optional().catch(undefined),
  status: z.enum(["all", "pending", "completed", "failed"]).optional().catch(undefined),
  q: z.string().max(100).optional().catch(undefined),
  page: z.number().int().min(0).optional().catch(undefined),
});

export const Route = createFileRoute("/_authenticated/orders/")({
  validateSearch: SearchSchema,
  head: () => ({ meta: [{ title: "Orders — Digital Store CRM" }] }),
  component: OrdersPage,
});

const PAGE = 50;
const clean = (q: string) => q.replace(/[%,()*\\]/g, " ").trim();

function OrdersPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/orders/" });
  const { data: s } = useSettings();
  const [q, setQ] = useState(search.q ?? "");
  const page = search.page ?? 0;

  const set = (patch: Partial<z.infer<typeof SearchSchema>>) => navigate({ search: (prev) => ({ ...prev, page: undefined, ...patch }) });

  const ordersQ = useQuery({
    queryKey: ["orders", "list", search],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase.from("orders").select(ORDER_SELECT, { count: "exact" });
      if (search.from && search.to) {
        const r = customRange(search.from, search.to);
        query = query.gte("created_at", r.from.toISOString()).lt("created_at", r.to.toISOString());
      } else if (search.from) {
        query = query.gte("created_at", customRange(search.from, search.from).from.toISOString());
      } else if (search.to) {
        query = query.lt("created_at", customRange(search.to, search.to).to.toISOString());
      }
      if (search.source && search.source !== "all") query = query.eq("source", search.source);
      if (search.status && search.status !== "all") query = query.eq("status", search.status);
      const term = clean(search.q ?? "");
      if (term) {
        const { data: custs } = await supabase.from("customers").select("id").ilike("name", `%${term}%`).range(0, 199);
        const ids = (custs ?? []).map((c) => c.id);
        const parts = [`external_order_id.ilike.%${term}%`, `product_name.ilike.%${term}%`];
        if (ids.length) parts.push(`customer_id.in.(${ids.join(",")})`);
        query = query.or(parts.join(","));
      }
      const { data, error, count } = await query.order("created_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as OrderRow[], count: count ?? 0 };
    },
  });

  const total = ordersQ.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <>
      <PageHeader
        title="Orders"
        description={`${total} order${total === 1 ? "" : "s"} match`}
        actions={
          <Button asChild variant="highlight">
            <Link to="/orders/new">
              <PlusCircle /> Add manual order
            </Link>
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 rounded-xl border bg-card p-4 shadow-card sm:grid-cols-2 lg:grid-cols-6">
        <form
          className="relative sm:col-span-2"
          onSubmit={(e) => {
            e.preventDefault();
            set({ q: q || undefined });
          }}
        >
          <Label className="mb-1.5 block text-xs text-muted-foreground">Search</Label>
          <Search className="absolute bottom-2.5 left-3 size-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Order ID, product or customer" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => set({ q: q || undefined })} />
        </form>
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">From</Label>
          <Input type="date" value={search.from ?? ""} onChange={(e) => set({ from: e.target.value || undefined })} />
        </div>
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">To</Label>
          <Input type="date" value={search.to ?? ""} onChange={(e) => set({ to: e.target.value || undefined })} />
        </div>
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">Source</Label>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={search.source ?? "all"}
            onChange={(e) => set({ source: e.target.value as "all" })}
          >
            <option value="all">All sources</option>
            <option value="telegram_bot">Bot</option>
            <option value="manual">Manual</option>
          </select>
        </div>
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">Status</Label>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={search.status ?? "all"}
            onChange={(e) => set({ status: e.target.value as "all" })}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {ordersQ.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      ) : ordersQ.error ? (
        <p className="text-destructive">{(ordersQ.error as Error).message}</p>
      ) : (
        <OrderTable orders={ordersQ.data?.rows ?? []} symbol={s?.currency_symbol ?? "$"} />
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => navigate({ search: (p) => ({ ...p, page: page - 1 }) })}>
            Previous
          </Button>
          <span className="figure">
            {page + 1} / {pages}
          </span>
          <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => navigate({ search: (p) => ({ ...p, page: page + 1 }) })}>
            Next
          </Button>
        </div>
      )}
    </>
  );
}
