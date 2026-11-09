import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Banknote, Clock, PlusCircle, RefreshCw, ShoppingBag, TrendingUp, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/crm/PageHeader";
import { StatCard } from "@/components/crm/StatCard";
import { BalanceAlert, useBalance } from "@/components/crm/BalanceAlert";
import { OrderTable, ORDER_SELECT, type OrderRow } from "@/components/orders/OrderTable";
import { Button } from "@/components/ui/button";
import { fetchSummary, fetchTopProducts, useSettings } from "@/lib/crm-queries";
import { presetRange } from "@/lib/date-ranges";
import { formatMoney, profitMarginPercent } from "@/lib/pricing";
import { fetchBalance } from "@/lib/crm.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [
    { title: "Dashboard \u2014 Digital Store CRM" },
    { name: "description", content: "Review daily revenue, profit, recent orders and supplier balance." },
    { property: "og:title", content: "Dashboard \u2014 Digital Store CRM" },
    { property: "og:description", content: "Review daily revenue, profit, recent orders and supplier balance." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: s } = useSettings();
  const sym = s?.currency_symbol ?? "$";
  const today = presetRange("today");
  const week = presetRange("week");
  const month = presetRange("month");
  const qc = useQueryClient();
  const refreshBalanceFn = useServerFn(fetchBalance);

  const todayQ = useQuery({ queryKey: ["summary", "today", today.from.toISOString()], queryFn: () => fetchSummary(today.from, today.to) });
  const weekQ = useQuery({ queryKey: ["summary", "week", week.from.toISOString()], queryFn: () => fetchSummary(week.from, week.to) });
  const monthQ = useQuery({ queryKey: ["summary", "month", month.from.toISOString()], queryFn: () => fetchSummary(month.from, month.to) });
  const topQ = useQuery({ queryKey: ["top", "month", month.from.toISOString()], queryFn: () => fetchTopProducts(month.from, month.to, 5) });
  const balance = useBalance();
  const recentQ = useQuery({
    queryKey: ["orders", "recent"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select(ORDER_SELECT).order("created_at", { ascending: false }).range(0, 9);
      if (error) throw new Error(error.message);
      return (data ?? []) as OrderRow[];
    },
  });
  const pendingQ = useQuery({
    queryKey: ["orders", "pending-count"],
    queryFn: async () => {
      const { count, error } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending");
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });

  async function refreshBalance() {
    const r = await refreshBalanceFn({ data: { force: true } });
    qc.setQueryData(["balance"], r);
    if (r.error) toast.error(`Balance check failed: ${r.error}`);
    else toast.success("Balance updated");
  }

  const t = todayQ.data;
  return (
    <>
      <PageHeader
        title="Today at a glance"
        description={new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        actions={
          <Button asChild variant="highlight">
            <Link to="/orders/new">
              <PlusCircle /> Add manual order
            </Link>
          </Button>
        }
      />
      <BalanceAlert />
      {(pendingQ.data ?? 0) > 0 && (
        <Link
          to="/orders"
          search={{ status: "pending" }}
          className="mb-6 flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/15 px-4 py-3 text-sm hover:bg-warning/25"
        >
          <Clock className="size-5 text-warning-foreground" />
          <span>
            <b>{pendingQ.data}</b> bot order{pendingQ.data === 1 ? "" : "s"} waiting for payment verification →
          </span>
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="primary" label="Today's revenue" icon={<Banknote />} loading={todayQ.isLoading} value={formatMoney(t?.revenue, sym)} hint={`Cost ${formatMoney(t?.cost, sym)}`} />
        <StatCard
          label="Today's profit"
          icon={<TrendingUp />}
          loading={todayQ.isLoading}
          value={formatMoney(t?.profit, sym)}
          hint={`${profitMarginPercent(t?.profit ?? 0, t?.revenue ?? 0)}% margin`}
        />
        <StatCard
          label="Orders today"
          icon={<ShoppingBag />}
          loading={todayQ.isLoading}
          value={t?.order_count ?? 0}
          hint={`${t?.bot_count ?? 0} bot · ${t?.manual_count ?? 0} manual`}
        />
        <StatCard
          label="Supplier balance"
          icon={<Wallet />}
          loading={balance.isLoading}
          value={balance.data?.balance !== null && balance.data?.balance !== undefined ? formatMoney(balance.data.balance, sym) : "—"}
          hint={
            <span className="flex items-center justify-between gap-2">
              <span className="truncate">{balance.data?.error ? balance.data.error : balance.data?.checkedAt ? `Checked ${new Date(balance.data.checkedAt).toLocaleTimeString()}` : ""}</span>
              <button onClick={refreshBalance} className="shrink-0 text-primary hover:underline" aria-label="Refresh balance">
                <RefreshCw className="size-3.5" />
              </button>
            </span>
          }
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-5 shadow-card">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Order volume</h2>
          <dl className="mt-4 space-y-3">
            {[
              { l: "Today", v: todayQ.data },
              { l: "This week", v: weekQ.data },
              { l: "This month", v: monthQ.data },
            ].map((r) => (
              <div key={r.l} className="flex items-baseline justify-between border-b border-dashed pb-2 last:border-0">
                <dt className="text-sm">{r.l}</dt>
                <dd className="figure text-right">
                  <span className="text-lg font-semibold">{r.v?.order_count ?? "–"}</span>
                  <span className="ml-3 text-sm text-success">{formatMoney(r.v?.profit, sym)}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-card lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Top sellers this month</h2>
            <Link to="/reports" className="text-sm text-primary hover:underline">
              View reports
            </Link>
          </div>
          {topQ.data?.length ? (
            <ol className="mt-4 space-y-2">
              {topQ.data.map((p, i) => (
                <li key={p.product_id} className="flex items-center gap-3">
                  <span className="figure w-6 text-muted-foreground">{i + 1}</span>
                  <span className="flex-1 truncate font-medium">{p.product_name}</span>
                  <span className="figure text-sm text-muted-foreground">{p.units} sold</span>
                  <span className="figure w-24 text-right text-sm text-success">{formatMoney(p.profit, sym)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">No sales yet this month.</p>
          )}
        </div>
      </div>

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-bold">Recent orders</h2>
          <Link to="/orders" className="text-sm text-primary hover:underline">
            View all
          </Link>
        </div>
        <OrderTable orders={recentQ.data ?? []} symbol={sym} compact />
      </div>
    </>
  );
}
