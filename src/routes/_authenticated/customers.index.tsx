import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { format } from "date-fns";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/crm/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSettings } from "@/lib/crm-queries";
import { formatMoney } from "@/lib/pricing";

const SearchSchema = z.object({
  q: z.string().max(100).optional().catch(undefined),
  minSpent: z.number().min(0).optional().catch(undefined),
  minOrders: z.number().int().min(0).optional().catch(undefined),
  sort: z.enum(["latest", "ltv", "orders"]).optional().catch(undefined),
  page: z.number().int().min(0).optional().catch(undefined),
});

export const Route = createFileRoute("/_authenticated/customers/")({
  validateSearch: SearchSchema,
  head: () => ({ meta: [{ title: "Customers — Digital Store CRM" }] }),
  component: CustomersPage,
});

const PAGE = 50;
const clean = (q: string) => q.replace(/[%,()*\\]/g, " ").trim();

function CustomersPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/customers/" });
  const { data: s } = useSettings();
  const sym = s?.currency_symbol ?? "$";
  const [q, setQ] = useState(search.q ?? "");
  const page = search.page ?? 0;
  const set = (patch: Partial<z.infer<typeof SearchSchema>>) => navigate({ search: (prev) => ({ ...prev, page: undefined, ...patch }) });

  const listQ = useQuery({
    queryKey: ["customers", "list", search],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase.from("customers").select("*", { count: "exact" });
      const term = clean(search.q ?? "");
      if (term)
        query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%,whatsapp.ilike.%${term}%,telegram_username.ilike.%${term}%,email.ilike.%${term}%`);
      if (search.minSpent) query = query.gte("total_spent", search.minSpent);
      if (search.minOrders) query = query.gte("total_orders", search.minOrders);
      const sort = search.sort ?? "latest";
      const col = sort === "ltv" ? "total_spent" : sort === "orders" ? "total_orders" : "last_purchase";
      const { data, error, count } = await query.order(col, { ascending: false, nullsFirst: false }).range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw new Error(error.message);
      return { rows: data ?? [], count: count ?? 0 };
    },
  });
  const total = listQ.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <>
      <PageHeader title="Customers" description={`${total} customer${total === 1 ? "" : "s"}`} />
      <div className="mb-4 grid gap-3 rounded-xl border bg-card p-4 shadow-card sm:grid-cols-2 lg:grid-cols-5">
        <form
          className="relative sm:col-span-2"
          onSubmit={(e) => {
            e.preventDefault();
            set({ q: q || undefined });
          }}
        >
          <Label className="mb-1.5 block text-xs text-muted-foreground">Search</Label>
          <Search className="absolute bottom-2.5 left-3 size-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Name, phone, WhatsApp, @username" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => set({ q: q || undefined })} />
        </form>
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">Min. spent</Label>
          <Input type="number" min={0} value={search.minSpent ?? ""} onChange={(e) => set({ minSpent: e.target.value ? Number(e.target.value) : undefined })} />
        </div>
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">Min. orders</Label>
          <Input type="number" min={0} value={search.minOrders ?? ""} onChange={(e) => set({ minOrders: e.target.value ? Number(e.target.value) : undefined })} />
        </div>
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">Sort by</Label>
          <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={search.sort ?? "latest"} onChange={(e) => set({ sort: e.target.value as "latest" })}>
            <option value="latest">Latest purchase</option>
            <option value="ltv">Lifetime value</option>
            <option value="orders">Order count</option>
          </select>
        </div>
      </div>

      {listQ.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      ) : !listQ.data?.rows.length ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">No customers found.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-right">Total spent</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead>Last purchase</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {listQ.data.rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {[c.telegram_username && `@${c.telegram_username}`, c.whatsapp, c.phone].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell className="figure text-right font-semibold">{formatMoney(c.total_spent, sym)}</TableCell>
                  <TableCell className="figure text-right">{c.total_orders}</TableCell>
                  <TableCell className="text-sm">{c.last_purchase ? format(new Date(c.last_purchase), "dd MMM yyyy") : "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/customers/$id" params={{ id: c.id }}>
                        View history
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
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
