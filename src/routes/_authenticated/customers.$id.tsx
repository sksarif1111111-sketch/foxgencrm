import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/crm/PageHeader";
import { StatCard } from "@/components/crm/StatCard";
import { Badge } from "@/components/ui/badge";
import { OrderTable, ORDER_SELECT, type OrderRow } from "@/components/orders/OrderTable";
import { useSettings } from "@/lib/crm-queries";
import { formatMoney } from "@/lib/pricing";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/payment-validator";

export const Route = createFileRoute("/_authenticated/customers/$id")({
  head: () => ({ meta: [
    { title: "Customer profile \u2014 Digital Store CRM" },
    { name: "description", content: "Review customer contact details, purchases and lifetime value." },
    { property: "og:title", content: "Customer profile \u2014 Digital Store CRM" },
    { property: "og:description", content: "Review customer contact details, purchases and lifetime value." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: CustomerProfile,
});

function CustomerProfile() {
  const { id } = Route.useParams();
  const { data: s } = useSettings();
  const sym = s?.currency_symbol ?? "$";

  const custQ = useQuery({
    queryKey: ["customers", "detail", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
  const ordersQ = useQuery({
    queryKey: ["orders", "customer", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select(ORDER_SELECT).eq("customer_id", id).order("created_at", { ascending: false }).range(0, 199);
      if (error) throw new Error(error.message);
      return (data ?? []) as OrderRow[];
    },
  });

  const c = custQ.data;
  if (custQ.isLoading) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
  if (!c) return <p>Customer not found.</p>;
  const orders = ordersQ.data ?? [];
  const methods = Array.from(new Set(orders.map((o) => o.payment_method)));
  const profit = orders.filter((o) => o.status === "completed").reduce((sum, o) => sum + Number(o.profit), 0);

  return (
    <>
      <Link to="/customers" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All customers
      </Link>
      <PageHeader
        title={c.name}
        description={[c.telegram_username && `@${c.telegram_username}`, c.whatsapp && `WhatsApp ${c.whatsapp}`, c.phone && `Phone ${c.phone}`, c.email].filter(Boolean).join(" · ") || "No contact details"}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard tone="primary" label="Lifetime value" value={formatMoney(c.total_spent, sym)} />
        <StatCard label="Total orders" value={c.total_orders} />
        <StatCard label="Profit from customer" value={formatMoney(profit, sym)} />
        <StatCard
          label="Customer since"
          value={<span className="text-xl">{c.first_purchase ? format(new Date(c.first_purchase), "dd MMM yyyy") : "—"}</span>}
          hint={c.last_purchase ? `Last purchase ${format(new Date(c.last_purchase), "dd MMM yyyy")}` : undefined}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Payment methods used:</span>
        {methods.length ? methods.map((m) => <Badge key={m} variant="muted">{PAYMENT_METHOD_LABELS[m as PaymentMethod] ?? m}</Badge>) : "—"}
      </div>
      <h2 className="mb-3 mt-8 text-xl font-bold">Order history</h2>
      <OrderTable orders={orders} symbol={sym} />
    </>
  );
}
