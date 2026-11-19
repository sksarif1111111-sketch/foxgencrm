import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { BarChart3, Banknote, Download, Receipt, TrendingUp, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/crm/PageHeader";
import { StatCard } from "@/components/crm/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchDailySeries, fetchSummary, fetchTopProducts, useSettings } from "@/lib/crm-queries";
import { customRange, presetRange, toInputDate, type Preset, type Range } from "@/lib/date-ranges";
import { formatMoney, profitMarginPercent, round2 } from "@/lib/pricing";
import { buildOrdersCsv } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports \u2014 FOXGEN CRM" },
      {
        name: "description",
        content: "Review sales revenue, costs and profit over your chosen period.",
      },
      { property: "og:title", content: "Reports \u2014 FOXGEN CRM" },
      {
        property: "og:description",
        content: "Review sales revenue, costs and profit over your chosen period.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
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
  const custom = customRange(fromStr, toStr);
  const invalidRange =
    preset === "custom" &&
    (!Number.isFinite(custom.from.getTime()) ||
      !Number.isFinite(custom.to.getTime()) ||
      custom.from >= custom.to);
  const range: Range =
    preset === "custom" && !invalidRange
      ? custom
      : presetRange(preset === "custom" ? "month" : preset);
  const key = [range.from.toISOString(), range.to.toISOString()];
  const [period, setPeriod] = useState<"daily" | "monthly">("daily");
  const [exporting, setExporting] = useState(false);

  const sumQ = useQuery({
    enabled: !invalidRange,
    queryKey: ["summary", "range", ...key],
    queryFn: () => fetchSummary(range.from, range.to),
  });
  const topQ = useQuery({
    enabled: !invalidRange,
    queryKey: ["top", "range", ...key],
    queryFn: () => fetchTopProducts(range.from, range.to, 5),
  });
  const seriesQ = useQuery({
    enabled: !invalidRange,
    queryKey: ["series", ...key],
    queryFn: () => fetchDailySeries(range.from, range.to),
  });

  const storeQ = useQuery({
    enabled: !invalidRange,
    queryKey: ["foxgen", "financial-records", ...key],
    queryFn: async () => {
      const totals = new Map<
        string,
        { currency: string; refunds: number; expenses: number; fees: number | null }
      >();
      for (let offset = 0; ; offset += 1000) {
        const result = await supabase
          .from("store_records")
          .select("entity,status,amount,currency,data")
          .eq("integration_id", "foxgen")
          .in("entity", ["refunds", "expenses", "payments"])
          .gte("source_updated_at", key[0] ?? "")
          .lt("source_updated_at", key[1] ?? "")
          .order("entity")
          .order("external_id")
          .range(offset, offset + 999);
        if (result.error) throw new Error("Could not load Store financial records.");
        for (const record of result.data ?? []) {
          if (
            !record.currency ||
            !["approved", "paid", "completed", "refunded", "verified", "payment_verified"].includes(
              record.status.toLowerCase(),
            )
          )
            continue;
          const row = totals.get(record.currency) ?? {
            currency: record.currency,
            refunds: 0,
            expenses: 0,
            fees: null,
          };
          if (record.entity === "refunds") row.refunds += record.amount ?? 0;
          if (record.entity === "expenses") row.expenses += record.amount ?? 0;
          if (
            record.entity === "payments" &&
            record.data &&
            typeof record.data === "object" &&
            !Array.isArray(record.data)
          ) {
            const fee = record.data["payment_fee"] ?? record.data["fee_amount"];
            if (
              typeof fee === "number" &&
              Number.isFinite(fee) &&
              (!record.data["fee_currency"] || record.data["fee_currency"] === record.currency)
            )
              row.fees = (row.fees ?? 0) + fee;
          }
          totals.set(record.currency, row);
        }
        if (!result.data || result.data.length < 1000) break;
      }
      return [...totals.values()];
    },
  });
  const daily = invalidRange ? [] : (seriesQ.data ?? []);
  const months = new Map<string, (typeof daily)[number]>();
  for (const day of daily) {
    const month = `${day.day.slice(0, 7)}-01`;
    const total = months.get(month) ?? { day: month, orders: 0, revenue: 0, profit: 0 };
    total.orders += day.orders;
    total.revenue += day.revenue;
    total.profit += day.profit;
    months.set(month, total);
  }
  const series = period === "monthly" ? [...months.values()] : daily;
  const sm = invalidRange ? undefined : sumQ.data;
  const aov = sm && sm.order_count ? round2(sm.revenue / sm.order_count) : 0;

  async function exportCsv() {
    setExporting(true);
    try {
      const all: Parameters<typeof buildOrdersCsv>[0] = [];
      for (let page = 0; page < 50; page++) {
        const { data, error } = await supabase
          .from("orders")
          .select(
            "created_at, external_order_id, source, status, product_name, quantity, wholesale_cost, selling_price, total_cost, total_amount, profit, payment_method, customers(name, whatsapp, telegram_username)",
          )
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
        description={`${format(range.from, "dd MMM yyyy")} – ${format(new Date(range.to.getTime() - 1), "dd MMM yyyy")} · completed native orders`}
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={exporting || invalidRange}>
            <Download /> {exporting ? "Exporting…" : "Export CSV"}
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3 shadow-card">
        {PRESETS.map((p) => (
          <Button
            key={p.id}
            size="sm"
            variant={preset === p.id ? "default" : "outline"}
            onClick={() => setPreset(p.id)}
          >
            {p.label}
          </Button>
        ))}
        <Button
          size="sm"
          variant={preset === "custom" ? "default" : "outline"}
          onClick={() => setPreset("custom")}
        >
          Custom
        </Button>
        {preset === "custom" && (
          <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:w-auto">
            <Input
              type="date"
              aria-label="Start date"
              className="h-8 min-w-0"
              value={fromStr}
              onChange={(e) => setFromStr(e.target.value)}
            />
            <span className="text-muted-foreground">to</span>
            <Input
              type="date"
              aria-label="End date"
              className="h-8 min-w-0"
              value={toStr}
              onChange={(e) => setToStr(e.target.value)}
            />
          </div>
        )}
      </div>

      {invalidRange && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          Choose a valid start and end date.
        </p>
      )}
      {sumQ.isError && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          Could not load native sales totals.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        <StatCard
          tone="primary"
          label="Revenue"
          icon={<Banknote />}
          loading={sumQ.isLoading}
          value={sm ? formatMoney(sm.revenue, sym) : "—"}
        />
        <StatCard
          label="Cost"
          icon={<Wallet />}
          loading={sumQ.isLoading}
          value={sm ? formatMoney(sm.cost, sym) : "—"}
        />
        <StatCard
          label="Profit"
          icon={<TrendingUp />}
          loading={sumQ.isLoading}
          value={sm ? formatMoney(sm.profit, sym) : "—"}
        />
        <StatCard
          label="Profit margin"
          icon={<BarChart3 />}
          loading={sumQ.isLoading}
          value={sm?.revenue ? `${profitMarginPercent(sm.profit, sm.revenue)}%` : "—"}
        />
        <StatCard
          label="Orders"
          icon={<Receipt />}
          loading={sumQ.isLoading}
          value={sm?.order_count ?? "—"}
          hint={sm ? `${sm.bot_count} bot · ${sm.manual_count} manual` : undefined}
        />
        <StatCard
          label="Avg. order value"
          loading={sumQ.isLoading}
          value={sm ? formatMoney(aov, sym) : "—"}
        />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 shadow-card lg:col-span-2 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-extrabold">Native sales trend</h2>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={period === "daily" ? "secondary" : "ghost"}
                aria-pressed={period === "daily"}
                onClick={() => setPeriod("daily")}
              >
                Daily
              </Button>
              <Button
                size="sm"
                variant={period === "monthly" ? "secondary" : "ghost"}
                aria-pressed={period === "monthly"}
                onClick={() => setPeriod("monthly")}
              >
                Monthly
              </Button>
            </div>
          </div>
          <div className="mt-4 h-72">
            {seriesQ.isLoading ? (
              <div className="h-full animate-pulse rounded-md bg-muted" />
            ) : seriesQ.isError ? (
              <p role="alert" className="text-sm text-destructive">
                Could not load the sales trend.
              </p>
            ) : series.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(d: string) =>
                      format(new Date(`${d}T00:00:00`), period === "daily" ? "dd MMM" : "MMM yyyy")
                    }
                    tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                  />
                  <YAxis tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} width={50} />
                  <Tooltip
                    formatter={(v: number, n: string) => [
                      formatMoney(v, sym),
                      n === "revenue" ? "Revenue" : "Profit",
                    ]}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                    }}
                  />
                  <Bar
                    isAnimationActive={false}
                    dataKey="revenue"
                    fill="var(--chart-1)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    isAnimationActive={false}
                    dataKey="profit"
                    fill="var(--chart-2)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No sales in this period.
              </div>
            )}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-5 shadow-card">
          <h2 className="font-extrabold">Top selling products</h2>
          {!invalidRange && topQ.data?.length ? (
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

      {series.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-lg border bg-card shadow-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-2 font-medium">{period === "daily" ? "Day" : "Month"}</th>
                <th className="px-4 py-2 text-right font-medium">Orders</th>
                <th className="px-4 py-2 text-right font-medium">Revenue</th>
                <th className="px-4 py-2 text-right font-medium">Profit</th>
              </tr>
            </thead>
            <tbody className="figure">
              {series.map((d) => (
                <tr key={d.day} className="border-b last:border-0">
                  <td className="px-4 py-2">
                    {format(
                      new Date(`${d.day}T00:00:00`),
                      period === "daily" ? "EEE dd MMM" : "MMM yyyy",
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">{d.orders}</td>
                  <td className="px-4 py-2 text-right">{formatMoney(d.revenue, sym)}</td>
                  <td className="px-4 py-2 text-right text-success">
                    {formatMoney(d.profit, sym)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <section className="mt-6 rounded-lg border bg-card p-4 shadow-card">
        <h2 className="font-extrabold">Store financial records</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Imported activity by update date and currency · excluded from native sales
        </p>
        {storeQ.isLoading ? (
          <div className="mt-3 h-12 animate-pulse rounded-md bg-muted" />
        ) : storeQ.isError ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            Could not load Store records.
          </p>
        ) : invalidRange || !storeQ.data?.length ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No completed refund, expense or payment records received in this period.
          </p>
        ) : (
          <div className="mt-3 overflow-auto">
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead className="bg-muted text-xs text-muted-foreground">
                <tr>
                  {["Currency", "Refunds", "Expenses", "Reported payment fees"].map((label) => (
                    <th key={label} className="px-3 py-2">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {storeQ.data.map((row) => (
                  <tr key={row.currency} className="border-b last:border-0">
                    <th className="px-3 py-2">{row.currency}</th>
                    <td className="figure px-3 py-2">{row.refunds.toFixed(2)}</td>
                    <td className="figure px-3 py-2">{row.expenses.toFixed(2)}</td>
                    <td className="figure px-3 py-2">
                      {row.fees === null ? "Not reported" : row.fees.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
