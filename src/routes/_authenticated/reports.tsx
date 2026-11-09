import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/crm/PageHeader";
import { StatCard } from "@/components/crm/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchDailySeries, fetchSummary, fetchTopProducts, useSettings } from "@/lib/crm-queries";
import { customRange, presetRange, toInputDate, type Preset, type Range } from "@/lib/date-ranges";
import { formatMoney, round2 } from "@/lib/pricing";
import { buildOrdersCsv } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [
    { title: "Reports \u2014 Digital Store CRM" },
    { name: "description", content: "Review sales revenue, costs and profit over your chosen period." },
    { property: "og:title", content: "Reports \u2014 Digital Store CRM" },
    { property: "og:description", content: "Review sales revenue, costs and profit over your chosen period." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Reports,
});

const PRESETS: { id: Exclude<Preset, "custom">; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
];

function Reports() {
  const { data: s } = useSettings();
  const sym = s?.currency_symbol ?? "$";
  const [preset, setPreset] = useState<Preset>("month");
  const initial = presetRange("month");
  const [fromStr, setFromStr] = useState(toInputDate(initial.from));
  const [toStr, setToStr] = useState(toInputDate(new Date()));
  const range: Range = preset === "custom" ? customRange(fromStr, toStr) : presetRange(preset);
  const key = [range.from.toISOString(), range.to.toISOString()];
  const [exporting, setExporting] = useState(false);

  const sumQ = useQuery({ queryKey: ["summary", "range", ...key], queryFn: () => fetchSummary(range.from, range.to) });
  const topQ = useQuery({ queryKey: ["top", "range", ...key], queryFn: () => fetchTopProducts(range.from, range.to, 5) });
  const seriesQ = useQuery({ queryKey: ["series", ...key], queryFn: () => fetchDailySeries(range.from, range.to) });

  const sm = sumQ.data;
  const aov = sm && sm.order_count ? round2(sm.revenue / sm.order_count) : 0;

  async function exportCsv() {
    setExporting(true);
    try {
      const all: Parameters<typeof buildOrdersCsv>[0] = [];
      for (let page = 0; page < 50; page++) {
        const { data, error } = await supabase
          .from("orders")
          .select("created_at, external_order_id, source, status, product_name, quantity, wholesale_cost, selling_price, total_cost, total_amount, profit, payment_method, customers(name, whatsapp, telegram_username)")
          .gte("created_at", range.from.toISOString())
          .lt("created_at", range.to.toISOString())
          .order("created_at")
          .range(page * 1000, page * 1000 + 999);
        if (error) throw new Error(error.message);
        all.push(...((data ?? []) as Parameters<typeof buildOrdersCsv>[0]));
        if (!data || data.length < 1000) break;
      }
      const csv = buildOrdersCsv(all);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `orders_${toInputDate(range.from)}_to_${toInputDate(new Date(range.to.getTime() - 1))}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(`Exported ${all.length} orders`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Financial reports"
        description={`${format(range.from, "dd MMM yyyy")} – ${format(new Date(range.to.getTime() - 1), "dd MMM yyyy")} · completed orders`}
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={exporting}>
            <Download /> {exporting ? "Exporting…" : "Export CSV"}
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap items-end gap-2">
        {PRESETS.map((p) => (
          <Button key={p.id} size="sm" variant={preset === p.id ? "default" : "outline"} onClick={() => setPreset(p.id)}>
            {p.label}
          </Button>
        ))}
        <Button size="sm" variant={preset === "custom" ? "default" : "outline"} onClick={() => setPreset("custom")}>
          Custom
        </Button>
        {preset === "custom" && (
          <div className="flex items-center gap-2">
            <Input type="date" className="h-8 w-auto" value={fromStr} onChange={(e) => setFromStr(e.target.value)} />
            <span className="text-muted-foreground">to</span>
            <Input type="date" className="h-8 w-auto" value={toStr} onChange={(e) => setToStr(e.target.value)} />
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard tone="primary" label="Revenue" loading={sumQ.isLoading} value={formatMoney(sm?.revenue, sym)} />
        <StatCard label="Cost" loading={sumQ.isLoading} value={formatMoney(sm?.cost, sym)} />
        <StatCard label="Net profit" loading={sumQ.isLoading} value={<span className="text-success">{formatMoney(sm?.profit, sym)}</span>} />
        <StatCard label="Orders" loading={sumQ.isLoading} value={sm?.order_count ?? 0} hint={`${sm?.bot_count ?? 0} bot · ${sm?.manual_count ?? 0} manual`} />
        <StatCard label="Avg. order value" loading={sumQ.isLoading} value={formatMoney(aov, sym)} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-5 shadow-card lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Revenue trend</h2>
          <div className="mt-4 h-72">
            {seriesQ.data?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={seriesQ.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="day" tickFormatter={(d: string) => format(new Date(`${d}T00:00:00`), "dd MMM")} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                  <YAxis tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} width={50} />
                  <Tooltip
                    formatter={(v: number, n: string) => [formatMoney(v, sym), n === "revenue" ? "Revenue" : "Profit"]}
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }}
                  />
                  <Bar dataKey="revenue" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="profit" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No sales in this period.</div>
            )}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-card">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Top 5 products</h2>
          {topQ.data?.length ? (
            <ol className="mt-4 space-y-3">
              {topQ.data.map((p, i) => (
                <li key={p.product_id} className="border-b border-dashed pb-2 last:border-0">
                  <div className="flex justify-between gap-2">
                    <span className="truncate font-medium">
                      <span className="figure mr-2 text-muted-foreground">{i + 1}</span>
                      {p.product_name}
                    </span>
                    <span className="figure text-sm">{p.units}×</span>
                  </div>
                  <div className="figure mt-0.5 flex justify-between text-xs text-muted-foreground">
                    <span>{formatMoney(p.revenue, sym)} revenue</span>
                    <span className="text-success">{formatMoney(p.profit, sym)} profit</span>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">No sales in this period.</p>
          )}
        </div>
      </div>

      {seriesQ.data && seriesQ.data.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-xl border bg-card shadow-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-2 font-medium">Day</th>
                <th className="px-4 py-2 text-right font-medium">Orders</th>
                <th className="px-4 py-2 text-right font-medium">Revenue</th>
                <th className="px-4 py-2 text-right font-medium">Profit</th>
              </tr>
            </thead>
            <tbody className="figure">
              {seriesQ.data.map((d) => (
                <tr key={d.day} className="border-b last:border-0">
                  <td className="px-4 py-2">{format(new Date(`${d.day}T00:00:00`), "EEE dd MMM")}</td>
                  <td className="px-4 py-2 text-right">{d.orders}</td>
                  <td className="px-4 py-2 text-right">{formatMoney(d.revenue, sym)}</td>
                  <td className="px-4 py-2 text-right text-success">{formatMoney(d.profit, sym)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
