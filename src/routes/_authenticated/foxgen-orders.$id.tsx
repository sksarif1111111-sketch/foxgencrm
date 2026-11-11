import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Check,
  LoaderCircle,
  Mail,
  MessageCircle,
  Plus,
  RefreshCw,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/crm/PageHeader";
import { DeliveryCountdown } from "@/components/crm/DeliveryCountdown";
import { FoxgenSource, FoxgenStatus } from "@/components/crm/FoxgenStatus";
import { FoxgenOrderSkeleton } from "@/components/crm/FoxgenOrderSkeleton";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { foxgenDetailOptions } from "@/lib/foxgen-queries";
import { operateFoxgenOrder } from "@/lib/foxgen.functions";
import {
  ActionSchema,
  allowedAction,
  hasEmails,
  isBot,
  orderData,
  text,
  type FoxgenAction,
  type FoxgenOrder,
} from "@/lib/foxgen-orders";
import type { Json } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/foxgen-orders/$id")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(foxgenDetailOptions(params.id)),
  pendingMs: 150,
  pendingComponent: FoxgenOrderSkeleton,
  errorComponent: FoxgenDetailError,
  notFoundComponent: () => <p>FoxGen order not found.</p>,
  head: () => ({
    meta: [
      { title: "FoxGen Order Details — Digital Store CRM" },
      {
        name: "description",
        content:
          "Review a FoxGen order, approve payment and send delivery material to the customer.",
      },
      { property: "og:title", content: "FoxGen Order Details — Digital Store CRM" },
      {
        property: "og:description",
        content:
          "Review a FoxGen order, approve payment and send delivery material to the customer.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FoxgenDetail,
});
function FoxgenDetailError() {
  const router = useRouter();
  return (
    <div role="alert" className="space-y-4">
      <p className="text-destructive">Could not load this Store order. Try again in a moment.</p>
      <Button variant="outline" onClick={() => router.invalidate()}>
        Try again
      </Button>
    </div>
  );
}
const successMessages: Record<FoxgenAction["action"], string> = {
  approve: "Payment approved",
  reject: "Order rejected and customer notified",
  add_fulfillment: "Delivery material saved",
  deliver_email: "Delivered to the customer by email",
  deliver_telegram: "Delivered to the customer via Telegram",
  request_info: "More information requested from the customer",
};
type Overlay = {
  version: string;
  status: string;
  data: Record<string, Json | undefined>;
  message: string;
};
function FoxgenDetail() {
  const { id } = Route.useParams();
  const q = useSuspenseQuery(foxgenDetailOptions(id));
  const qc = useQueryClient();
  const operate = useServerFn(operateFoxgenOrder);
  const [busy, setBusy] = useState<FoxgenAction["action"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<"reject" | "request_info" | "add_fulfillment" | null>(null);
  const [content, setContent] = useState("");
  const [kind, setKind] = useState<"link" | "code" | "instructions">("link");
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const source = q.data;
  if (!source)
    return (
      <div className="space-y-4">
        <p>FoxGen order not found.</p>
        <Button asChild variant="outline">
          <Link to="/foxgen-orders">All FoxGen orders</Link>
        </Button>
      </div>
    );
  const pendingSync = overlay?.version === source.source_updated_at ? overlay : null;
  const d = pendingSync?.data ?? orderData(source.data);
  const o: FoxgenOrder = {
    ...source,
    status: pendingSync?.status ?? source.status,
    data: JSON.parse(JSON.stringify(d)) as Json,
  };
  function open(next: typeof form) {
    setError(null);
    setContent("");
    setForm(next);
  }
  async function run(input: FoxgenAction) {
    if (!source || busy) return;
    setBusy(input.action);
    setError(null);
    try {
      const r = await operate({ data: input });
      if (!r.ok) {
        setError(r.error);
        toast.error(r.error);
        return;
      }
      const next = { ...d };
      let status = o.status;
      if (input.action === "approve") {
        status = "payment_confirmed";
        next["confirmed_at"] ??= new Date().toISOString();
      }
      if (input.action === "reject") status = "rejected";
      if (input.action === "add_fulfillment") next["has_fulfillment"] = true;
      if (input.action === "deliver_email" || input.action === "deliver_telegram") {
        status = "delivered";
        next["delivered_at"] = new Date().toISOString();
      }
      const message = successMessages[input.action];
      setOverlay({ version: source.source_updated_at, status, data: next, message });
      toast.success(message);
      setForm(null);
      setContent("");
      await qc.invalidateQueries({ queryKey: ["foxgen"] });
    } catch {
      const message =
        "Could not reach the store. Check the order's latest status before trying again.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  }
  const can = (action: FoxgenAction["action"]) => !pendingSync && allowedAction(action, o);
  const icon = (action: FoxgenAction["action"], normal: React.ReactNode) =>
    busy === action ? <LoaderCircle className="animate-spin" /> : normal;
  const showDelivery = ["payment_confirmed", "awaiting_fulfillment", "awaiting_email"].includes(
    o.status,
  );
  return (
    <div className="foxgen-section">
      <Link
        to="/foxgen-orders"
        className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        FoxGen Store Orders
      </Link>
      <PageHeader
        title={o.name || o.external_id}
        actions={
          <Button variant="outline" disabled={q.isFetching || !!busy} onClick={() => q.refetch()}>
            <RefreshCw className={q.isFetching ? "animate-spin" : ""} />
            {q.isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />
      <p className="figure mb-4 break-all text-sm text-muted-foreground">{o.external_id}</p>
      <div className="mb-6 flex flex-wrap gap-2">
        <FoxgenStatus status={o.status} />
        <FoxgenSource data={d} />
        <DeliveryCountdown
          status={o.status}
          confirmedAt={d["confirmed_at"]}
          slaMinutes={d["shop_delivery_sla_minutes"]}
          deliveredAt={d["delivered_at"]}
        />
      </div>
      {pendingSync && (
        <p role="status" className="mb-4 rounded-lg border bg-accent p-3 text-sm">
          {pendingSync.message}. Waiting for the Store's next sync before another action.
        </p>
      )}
      {error && !form && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {q.isRefetchError && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          Could not refresh this order. Showing the last received information.
        </p>
      )}
      <div className="mb-6 flex flex-wrap gap-3">
        {["under_review", "payment_submitted"].includes(o.status) && (
          <>
            <Button
              variant="success"
              disabled={!!busy || !can("approve")}
              onClick={() => run({ action: "approve", order_id: id })}
            >
              {icon("approve", <Check />)}
              {busy === "approve" ? "Approving payment…" : "Approve payment"}
            </Button>
            <Button
              variant="outline"
              disabled={!!busy || !can("reject")}
              onClick={() => open("reject")}
            >
              <X />
              Reject
            </Button>
          </>
        )}
        {showDelivery && (
          <Button
            variant="outline"
            disabled={!!busy || !can("add_fulfillment")}
            onClick={() => open("add_fulfillment")}
          >
            <Plus />
            Add delivery material
          </Button>
        )}
        {showDelivery && hasEmails(d) && (
          <Button
            disabled={!!busy || !can("deliver_email")}
            onClick={() => run({ action: "deliver_email", order_id: id })}
          >
            {icon("deliver_email", <Mail />)}
            {busy === "deliver_email" ? "Sending email…" : "Send via email"}
          </Button>
        )}
        {showDelivery && (isBot(d) || !!d["telegram_user_id"]) && (
          <Button
            variant="secondary"
            disabled={!!busy || !can("deliver_telegram")}
            onClick={() => run({ action: "deliver_telegram", order_id: id })}
          >
            {icon("deliver_telegram", <Send />)}
            {busy === "deliver_telegram" ? "Sending via Telegram…" : "Send via Telegram"}
          </Button>
        )}
        {allowedAction("request_info", o) && (
          <Button
            variant="outline"
            disabled={!!busy || !!pendingSync}
            onClick={() => open("request_info")}
          >
            <MessageCircle />
            Request more info
          </Button>
        )}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="border-t pt-4">
          <h2 className="mb-4 text-lg font-semibold">Customer</h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            {Object.entries({
              "Customer name": d["customer_name"] ?? d["name"],
              "Customer email": d["customer_email"],
              "Delivery emails": d["delivery_emails"],
              "Telegram username": d["telegram_username"],
              "Telegram ID": d["telegram_user_id"],
            }).map(([label, value]) => (
              <Field key={label} label={label} value={value} />
            ))}
          </dl>
        </section>
        <section className="border-t pt-4">
          <h2 className="mb-4 text-lg font-semibold">Payment and delivery</h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Amount"
              value={o.amount == null ? null : `${o.currency ?? ""} ${o.amount.toFixed(2)}`}
            />
            <Field label="Payment method" value={d["payment_method"]} />
            <Field
              label="Payment reference"
              value={d["payment_reference"] ?? d["payment_ref"] ?? d["payment_proof"]}
            />
            <Field
              label="Delivery material"
              value={d["has_fulfillment"] === true ? "Available" : "Not added"}
            />
            <Field label="Payment confirmed" value={d["confirmed_at"]} />
            <Field label="Delivered at" value={d["delivered_at"]} />
          </dl>
        </section>
      </div>
      <section className="mt-6 border-t pt-4">
        <h2 className="mb-4 text-lg font-semibold">Line items</h2>
        {Array.isArray(d["line_items"] ?? d["items"]) ? (
          <ul className="divide-y">
            {(Array.isArray(d["line_items"])
              ? d["line_items"]
              : Array.isArray(d["items"])
                ? d["items"]
                : []
            ).map((item, i) => {
              const value =
                typeof item === "object" && item !== null && !Array.isArray(item) ? item : {};
              return (
                <li key={i} className="flex flex-wrap justify-between gap-4 py-3">
                  <span>{text(value["name"] ?? value["product_name"] ?? item)}</span>
                  <span className="figure text-sm">
                    {value["quantity"] != null ? `×${text(value["quantity"])}` : ""}{" "}
                    {text(value["amount"] ?? value["price"] ?? value["total"])}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No line item details received.</p>
        )}
      </section>
      <details className="mt-6 border-t pt-4">
        <summary className="cursor-pointer text-sm font-medium">All Store information</summary>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {Object.entries(d).map(([label, value]) => (
            <Field key={label} label={label.replaceAll("_", " ")} value={value} />
          ))}
        </dl>
      </details>
      <Dialog
        open={!!form}
        onOpenChange={(value) => {
          if (!value && !busy) {
            setForm(null);
            setError(null);
          }
        }}
      >
        <DialogContent className="foxgen-section">
          <DialogHeader>
            <DialogTitle>
              {form === "reject"
                ? "Reject order"
                : form === "add_fulfillment"
                  ? "Add delivery material"
                  : "Request more info"}
            </DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const input =
                form === "reject"
                  ? { action: form, order_id: id, reason: content }
                  : form === "request_info"
                    ? { action: form, order_id: id, message: content }
                    : { action: "add_fulfillment", order_id: id, kind, content };
              const parsed = ActionSchema.safeParse(input);
              if (!parsed.success) {
                setError("Enter the required details before sending.");
                return;
              }
              run(parsed.data);
            }}
          >
            {form === "add_fulfillment" && (
              <div>
                <Label className="mb-2 block">Kind</Label>
                <Select
                  value={kind}
                  onValueChange={(v) => {
                    if (v === "link" || v === "code" || v === "instructions") setKind(v);
                  }}
                >
                  <SelectTrigger aria-label="Delivery material kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="link">Link</SelectItem>
                    <SelectItem value="code">Code</SelectItem>
                    <SelectItem value="instructions">Instructions</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label htmlFor="fg-content" className="mb-2 block">
                {form === "reject" ? "Reason" : form === "request_info" ? "Message" : "Content"}
              </Label>
              <Textarea
                id="fg-content"
                required
                disabled={!!busy}
                maxLength={form === "reject" ? 500 : form === "request_info" ? 2000 : 10000}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={5}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={!!busy || !content.trim()}>
              {busy ? <LoaderCircle className="animate-spin" /> : <Check />}
              {busy
                ? "Sending to store…"
                : form === "reject"
                  ? "Reject and notify"
                  : form === "add_fulfillment"
                    ? "Save delivery material"
                    : "Send request"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function Field({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words text-sm">{text(value)}</dd>
    </div>
  );
}
