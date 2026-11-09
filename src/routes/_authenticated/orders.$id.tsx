import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ReactNode } from "react";
import { format } from "date-fns";
import { ArrowLeft, Check, Send, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/crm/PageHeader";
import { SourceBadge, StatusBadge } from "@/components/crm/StatusBadge";
import { ORDER_SELECT, type OrderRow } from "@/components/orders/OrderTable";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/crm-queries";
import { formatMoney } from "@/lib/pricing";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/payment-validator";
import { approveOrder, declineOrder, resendAccounts } from "@/lib/crm.functions";

export const Route = createFileRoute("/_authenticated/orders/$id")({
  head: () => ({ meta: [
    { title: "Order details \u2014 Digital Store CRM" },
    { name: "description", content: "Review payment details and delivery status for a digital product order." },
    { property: "og:title", content: "Order details \u2014 Digital Store CRM" },
    { property: "og:description", content: "Review payment details and delivery status for a digital product order." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: OrderDetail,
});

function OrderDetail() {
  const { id } = Route.useParams();
  const { data: s } = useSettings();
  const sym = s?.currency_symbol ?? "$";
  const qc = useQueryClient();
  const approve = useServerFn(approveOrder);
  const decline = useServerFn(declineOrder);
  const resend = useServerFn(resendAccounts);
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["orders", "detail", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select(ORDER_SELECT).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data as OrderRow | null;
    },
  });

  async function run(kind: "approve" | "decline" | "resend") {
    setBusy(true);
    try {
      if (kind === "approve") {
        const r = await approve({ data: { orderId: id } });
        r.ok ? toast.success(`Delivered ${r.count} account(s) to the customer`) : toast.error(`Not delivered: ${r.error}`);
      } else if (kind === "decline") {
        const r = await decline({ data: { orderId: id, reason: "Payment rejected by owner" } });
        r.ok ? toast.success("Order rejected and customer notified") : toast.error("Order was already handled");
      } else {
        const r = await resend({ data: { orderId: id } });
        r.ok ? toast.success("Accounts re-sent") : toast.error(r.error ?? "Could not resend");
      }
      await qc.invalidateQueries({ queryKey: ["orders"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (q.isLoading) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
  const o = q.data;
  if (!o) return <p>Order not found.</p>;
  const accounts = Array.isArray(o.delivered_accounts) ? (o.delivered_accounts as string[]) : [];
  const canDecide = o.status === "pending" && !o.processing_started_at;

  return (
    <>
      <Link to="/orders" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All orders
      </Link>
      <PageHeader
        title={o.product_name}
        description={`${o.external_order_id} · ${format(new Date(o.created_at), "dd MMM yyyy, HH:mm")}`}
        actions={
          <>
            {canDecide && (
              <>
                <Button variant="success" disabled={busy} onClick={() => run("approve")}>
                  <Check /> Approve & deliver
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => run("decline")}>
                  <X /> Reject
                </Button>
              </>
            )}
            {o.status === "pending" && o.processing_started_at && <span className="text-sm text-muted-foreground">Delivering…</span>}
            {o.status === "completed" && o.telegram_chat_id && accounts.length > 0 && (
              <Button variant="outline" disabled={busy} onClick={() => run("resend")}>
                <Send /> Resend accounts
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-5 shadow-card lg:col-span-2">
          <div className="mb-4 flex gap-2">
            <StatusBadge status={o.status} />
            <SourceBadge source={o.source} />
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <Field label="Quantity" value={<span className="figure">{o.quantity}</span>} />
            <Field label="Unit cost" value={<span className="figure">{formatMoney(o.wholesale_cost, sym)}</span>} />
            <Field label="Unit price" value={<span className="figure">{formatMoney(o.selling_price, sym)}</span>} />
            <Field label="Total cost" value={<span className="figure">{formatMoney(o.total_cost, sym)}</span>} />
            <Field label="Revenue" value={<span className="figure">{formatMoney(o.total_amount, sym)}</span>} />
            <Field label="Profit" value={<span className="figure font-semibold text-success">{formatMoney(o.profit, sym)}</span>} />
            <Field label="Payment" value={PAYMENT_METHOD_LABELS[o.payment_method as PaymentMethod] ?? o.payment_method} />
            <Field label="Payment proof" value={<span className="figure break-all text-sm">{o.payment_proof ?? "—"}</span>} />
            <Field label="Product ID" value={<span className="figure break-all text-sm">{o.product_id}</span>} />
          </dl>
          {o.failure_reason && <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{o.failure_reason}</p>}
          {o.notes && (
            <div className="mt-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Notes</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{o.notes}</p>
            </div>
          )}
        </div>
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-5 shadow-card">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Customer</p>
            {o.customers ? (
              <Link to="/customers/$id" params={{ id: o.customers.id }} className="mt-1 block text-lg font-semibold text-primary hover:underline">
                {o.customers.name}
              </Link>
            ) : (
              <p className="mt-1">—</p>
            )}
            {o.customers?.telegram_username && <p className="text-sm text-muted-foreground">@{o.customers.telegram_username}</p>}
            {o.customers?.whatsapp && <p className="text-sm text-muted-foreground">WhatsApp {o.customers.whatsapp}</p>}
          </div>
          {accounts.length > 0 && (
            <div className="rounded-xl border bg-card p-5 shadow-card">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Delivered accounts</p>
              <ul className="figure mt-2 space-y-1 text-sm">
                {accounts.map((a, i) => (
                  <li key={i} className="break-all rounded bg-muted px-2 py-1">
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}
