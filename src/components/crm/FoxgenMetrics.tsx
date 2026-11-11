import { useQuery } from "@tanstack/react-query";
import { Clock, Timer } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { foxgenMetricsOptions } from "@/lib/foxgen-queries";
import { StatCard } from "./StatCard";

export function FoxgenKpis() {
  const q = useQuery(foxgenMetricsOptions);
  return (
    <section className="mt-4" aria-label="FoxGen delivery metrics">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="FoxGen orders overdue right now"
          icon={<Clock />}
          loading={q.isPending}
          value={q.data?.overdue ?? "—"}
          hint={
            <Link to="/foxgen-orders" className="text-primary hover:underline">
              FoxGen Store Orders
            </Link>
          }
        />
        <StatCard
          label="Average delivery time this week"
          icon={<Timer />}
          loading={q.isPending}
          value={q.data?.averageMinutes == null ? "—" : `${Math.round(q.data.averageMinutes)} min`}
          hint={`${q.data?.delivered ?? 0} delivered in the last 7 days`}
        />
      </div>
      {q.isError && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          Could not load FoxGen delivery metrics. Refresh to try again.
        </p>
      )}
    </section>
  );
}
export function FoxgenConnectionCard() {
  const q = useQuery(foxgenMetricsOptions);
  return (
    <section className="rounded-xl border bg-card p-5 shadow-card">
      <h2 className="text-lg font-bold">FoxGen Store</h2>
      {q.isPending ? (
        <div className="mt-3 h-16 animate-pulse rounded-md bg-muted" />
      ) : q.isError ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          Could not check the Store connection. Try again in a moment.
        </p>
      ) : (
        <dl className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Last order received</dt>
            <dd className="mt-1">
              {q.data?.lastReceived
                ? new Date(q.data.lastReceived).toLocaleString()
                : "No orders received yet"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Currently overdue</dt>
            <dd className="figure">{q.data?.overdue ?? 0}</dd>
          </div>
        </dl>
      )}
      <Link to="/store" className="mt-4 block text-sm text-primary hover:underline">
        Store connection and API key
      </Link>
    </section>
  );
}
