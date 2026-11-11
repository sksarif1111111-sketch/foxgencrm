import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowUpRight, Clock3, FileCheck2, PackageCheck, RefreshCw, Receipt, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCard } from "./StatCard";
import { FoxgenStatus, FoxgenSource } from "./FoxgenStatus";
import { DeliveryCountdown } from "./DeliveryCountdown";
import { foxgenWorkspaceOptions } from "@/lib/foxgen-queries";
import { workspaceOrders } from "@/lib/foxgen-workspace";
import { marketplaceData } from "@/lib/foxgen-marketplace";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export function FoxgenOrderWorkspace() {
  const q = useSuspenseQuery(foxgenWorkspaceOptions);
  const [tab, setTab] = useState(() => { const initial = workspaceOrders(q.data, Date.now()); return initial.review.length ? "review" : initial.delivery.length ? "delivery" : "recent"; });
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(timer); }, []);
  const queue = workspaceOrders(q.data, now);
  const base = tab === "review" ? queue.review : tab === "delivery" ? queue.delivery : queue.recent;
  const term = search.trim().toLowerCase();
  const rows = base.filter(o => { const d = marketplaceData(o.data); return [o.name, o.external_id, d["order_number"], d["customer_name"], d["telegram_username"], d["payment_reference"]].some(v => String(v ?? "").toLowerCase().includes(term)); }).slice(0, 12);
  return (
    <section className="foxgen-section mb-10">
      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard tone="primary" label="Payment review" icon={<FileCheck2 />} value={queue.review.length} hint="Customer proofs awaiting review" />
        <StatCard label="To deliver" icon={<PackageCheck />} value={queue.delivery.length} hint="Paid orders awaiting fulfillment" />
        <StatCard label="Overdue" icon={<Clock3 />} value={queue.overdue} hint="Delivery target exceeded" />
        <StatCard label="Store orders" icon={<Receipt />} value={q.data.length} hint="Telegram & website" />
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Order desk</h2>
        <div className="flex gap-2"><Button variant="outline" size="sm" disabled={q.isFetching} onClick={() => q.refetch()}><RefreshCw className={q.isFetching ? "animate-spin" : ""} />Refresh</Button><Button asChild size="sm"><Link to="/foxgen-orders">All orders <ArrowUpRight /></Link></Button></div>
      </div>
      <div className="mb-3 flex flex-col justify-between gap-3 xl:flex-row">
        <Tabs value={tab} onValueChange={setTab}><TabsList className="h-auto flex-wrap justify-start"><TabsTrigger value="review">Payment review · {queue.review.length}</TabsTrigger><TabsTrigger value="delivery">Delivery · {queue.delivery.length}</TabsTrigger><TabsTrigger value="recent">Recent orders</TabsTrigger></TabsList></Tabs>
        <div className="relative xl:w-72"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input aria-label="Search order desk" className="pl-9" placeholder="Order, customer, transaction…" value={search} onChange={e => setSearch(e.target.value)} /></div>
      </div>
      {q.isRefetchError && <p role="alert" className="mb-3 text-sm text-destructive">Could not refresh. Showing the last received orders.</p>}
      {rows.length ? <div className="overflow-x-auto border-y"><Table><TableHeader><TableRow><TableHead>Order / customer</TableHead><TableHead>Source</TableHead><TableHead>Status</TableHead><TableHead>Amount</TableHead><TableHead>{tab === "review" ? "Transaction ID" : "Delivery target"}</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{rows.map(o => { const d = marketplaceData(o.data); return <TableRow key={o.external_id}><TableCell className="min-w-48 max-w-72"><Link to="/foxgen-orders/$id" params={{ id: o.external_id }} className="font-semibold text-primary hover:underline">{String(d["order_number"] ?? o.external_id)}</Link><p className="mt-1 truncate text-sm">{o.name}</p><p className="text-xs text-muted-foreground">{String(d["customer_name"] ?? d["telegram_username"] ?? "—")}</p></TableCell><TableCell><FoxgenSource data={d} /></TableCell><TableCell><FoxgenStatus status={o.status} /></TableCell><TableCell className="figure whitespace-nowrap">{o.amount == null ? "—" : `${o.currency ?? ""} ${o.amount.toFixed(2)}`}</TableCell><TableCell className="max-w-48 break-all">{tab === "review" ? <span className="figure text-xs">{String(d["payment_reference"] ?? "Not received")}</span> : <DeliveryCountdown status={o.status} confirmedAt={d["confirmed_at"]} deliveredAt={d["delivered_at"]} slaMinutes={d["shop_delivery_sla_minutes"]} />}</TableCell><TableCell className="text-right"><Button asChild variant="outline" size="sm"><Link to="/foxgen-orders/$id" params={{ id: o.external_id }}>{tab === "review" ? "Review proof" : tab === "delivery" ? "Deliver" : "Open"}<ArrowUpRight /></Link></Button></TableCell></TableRow>; })}</TableBody></Table></div> : <div className="border-y py-10 text-center"><PackageCheck className="mx-auto mb-3 size-7 text-primary" /><h3 className="font-semibold">{search ? "No matching orders" : tab === "review" ? "No payments awaiting review" : tab === "delivery" ? "No orders awaiting delivery" : "No Store orders received"}</h3><Button asChild variant="link" className="mt-2"><Link to="/store">Store connection <ArrowUpRight /></Link></Button></div>}
      <p className="mt-3 text-xs text-muted-foreground">Last checked {new Date(q.dataUpdatedAt).toLocaleTimeString()} · {base.length} {tab === "review" ? "awaiting review" : tab === "delivery" ? "awaiting delivery" : "orders"}</p>
    </section>
  );
}