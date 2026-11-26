import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ActionSchema,
  allowedAction,
  isBot,
  orderData,
  type DeliveryFields,
  type FoxgenOrder,
} from "@/lib/foxgen-orders";
import { operateFoxgenOrder } from "@/lib/foxgen.functions";

const labels = {
  account_email: "Account email/Gmail",
  account_username: "Username",
  account_number: "Account number",
  password: "Password",
  link: "Link (Drive/APK/any)",
  notes: "Notes",
} as const;
const CHANNEL_NAMES: Record<string, string> = {
  telegram: "Telegram",
  email: "Email",
  account: "Store account",
};
const SENT_STATES = new Set(["sent", "delivered", "ok", "visible_in_my_orders"]);
function isChannelSent(status: string) {
  return SENT_STATES.has(status.toLowerCase());
}
function formatChannelStatus(channel: string, status: string) {
  return `${CHANNEL_NAMES[channel] ?? channel}: ${status.replaceAll("_", " ")}`;
}

export function FoxgenDeliveryForm({
  order,
  verified,
  onDelivered,
}: {
  order: FoxgenOrder;
  verified: boolean;
  onDelivered: () => void;
}) {
  const operate = useServerFn(operateFoxgenOrder);
  const qc = useQueryClient();
  const [fields, setFields] = useState<DeliveryFields>({});
  const [requestId, setRequestId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [deliveryResults, setDeliveryResults] = useState<Record<string, string> | null>(null);
  const [failedWarning, setFailedWarning] = useState<{
    message: string;
    outcomes: Record<string, string>;
  } | null>(null);
  const data = orderData(order.data);
  const botOrder = isBot(data);
  const destination = botOrder ? "Telegram chat" : "Email + Store account";
  const recipientHint = botOrder
    ? data["telegram_username"]
      ? `@${String(data["telegram_username"]).replace(/^@/, "")}`
      : data["telegram_user_id"]
        ? `Telegram ID ${String(data["telegram_user_id"])}`
        : null
    : typeof data["customer_email"] === "string" && data["customer_email"].trim()
      ? data["customer_email"].trim()
      : null;
  const filledFieldLabels = Object.entries(labels)
    .filter(([key]) => Boolean(fields[key as keyof DeliveryFields]?.trim()))
    .map(([, label]) => label);
  if (sent)
    return (
      <div role="status" className="mb-5 space-y-2 rounded-lg border border-success/40 bg-success/10 p-4 text-sm">
        <p className="font-semibold text-foreground">
          Order approved and delivered · {destination}
        </p>
        {deliveryResults && Object.keys(deliveryResults).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(deliveryResults).map(([channel, status]) => (
              <Badge key={channel} variant={isChannelSent(status) ? "success" : "danger"}>
                {formatChannelStatus(channel, status)}
              </Badge>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Waiting for the Store's latest order snapshot.
        </p>
      </div>
    );
  if (!allowedAction("approve_and_deliver", order)) return null;
  async function send() {
    if (!requestId || busy || !verified) return;
    const parsed = ActionSchema.safeParse({
      action: "approve_and_deliver",
      order_id: order.external_id,
      fields,
      request_id: requestId,
    });
    if (!parsed.success) {
      setError("Enter valid delivery details.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await operate({ data: parsed.data });
      if (!result.ok) {
        const failedOutcomes = result.delivery ?? result.channels ?? {};
        if (result.code === "NOT_DELIVERED" || result.code === "DELIVERY_FAILED") {
          setFailedWarning({
            message:
              "Nothing was sent to the customer. The order remains in Waiting for approval.",
            outcomes: failedOutcomes,
          });
          setRequestId(null);
          toast.error(result.error);
          return;
        }
        setError(result.error);
        return;
      }
      const outcomes = result.delivery ?? result.channels ?? {};
      const entries = Object.entries(outcomes);
      const succeeded = entries.filter(([, state]) => isChannelSent(state));
      const failed = entries.filter(([, state]) => !isChannelSent(state));
      if (entries.length > 0 && succeeded.length === 0) {
        setFailedWarning({
          message:
            "Nothing was sent to the customer. The order remains in Waiting for approval.",
          outcomes,
        });
        setRequestId(null);
        toast.error(
          `Nothing was sent · ${failed.map(([channel, status]) => formatChannelStatus(channel, status)).join(" · ")}`,
        );
        return;
      }
      // Credentials are never added to query data, storage, database rows or success overlays.
      setFields({});
      setRequestId(null);
      setFailedWarning(null);
      setDeliveryResults(entries.length ? outcomes : null);
      setSent(true);
      onDelivered();
      const summary = entries
        .map(([channel, status]) => formatChannelStatus(channel, status))
        .join(" · ");
      if (failed.length)
        toast.warning(`Order delivered with partial failures · ${summary}`);
      else toast.success(summary ? `Delivered · ${summary}` : `Store confirmed delivery · ${destination}`);
      await qc.invalidateQueries({ queryKey: ["foxgen"] });
    } catch {
      setError("The response was interrupted. Check the Store before retrying the same request.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mb-5 border-y py-5">
      <h2 className="text-lg font-semibold">Approve & Deliver</h2>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        Delivery destination: <span className="font-semibold text-foreground">{destination}</span>
        {recipientHint ? ` (${recipientHint})` : ""}
      </p>
      {failedWarning && (
        <div
          role="alert"
          className="mb-4 space-y-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4 shrink-0" />
            {failedWarning.message}
          </p>
          {Object.keys(failedWarning.outcomes).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(failedWarning.outcomes).map(([channel, status]) => (
                <Badge key={channel} variant="danger">
                  {formatChannelStatus(channel, status)}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
      <form
        autoComplete="off"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = ActionSchema.safeParse({
            action: "approve_and_deliver",
            order_id: order.external_id,
            fields,
            request_id: crypto.randomUUID(),
          });
          if (!parsed.success) {
            setError("Enter at least one delivery field.");
            return;
          }
          setError(null);
          if (parsed.data.action === "approve_and_deliver") setRequestId(parsed.data.request_id);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {Object.entries(labels).map(([key, label]) => {
            const field = key as keyof DeliveryFields;
            return (
              <div key={field} className={field === "notes" ? "sm:col-span-2" : ""}>
                <Label htmlFor={`delivery-${field}`} className="mb-2 block">
                  {label}
                </Label>
                {field === "notes" ? (
                  <Textarea
                    id={`delivery-${field}`}
                    maxLength={2000}
                    value={fields[field] ?? ""}
                    disabled={busy || !!requestId}
                    onChange={(e) =>
                      setFields((values) => ({ ...values, [field]: e.target.value }))
                    }
                  />
                ) : (
                  <Input
                    id={`delivery-${field}`}
                    type={
                      field === "password"
                        ? "password"
                        : field === "account_email"
                          ? "email"
                          : "text"
                    }
                    autoComplete={field === "password" ? "new-password" : "off"}
                    maxLength={
                      field === "password"
                        ? 500
                        : field === "link"
                          ? 2000
                          : field === "account_email"
                            ? 320
                            : 200
                    }
                    value={fields[field] ?? ""}
                    disabled={busy || !!requestId}
                    onChange={(e) =>
                      setFields((values) => ({ ...values, [field]: e.target.value }))
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
        {error && !requestId && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" variant="success" disabled={busy || !!requestId || !verified}>
          <Check />
          Approve & Deliver
        </Button>
      </form>
      <Dialog
        open={!!requestId}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setRequestId(null);
            setError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm approval and delivery</DialogTitle>
            <DialogDescription>
              This will approve the payment, mark the order as delivered, and send your entered
              delivery details to the customer.
            </DialogDescription>
          </DialogHeader>
          <dl className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="shrink-0 text-muted-foreground">Order</dt>
              <dd className="font-semibold text-right break-all">
                {String(data["order_number"] ?? order.external_id)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="shrink-0 text-muted-foreground">Where it goes</dt>
              <dd className="font-semibold text-right break-all">
                {destination}
                {recipientHint ? ` (${recipientHint})` : ""}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="shrink-0 text-muted-foreground">Fields included</dt>
              <dd className="text-right">{filledFieldLabels.join(", ")}</dd>
            </div>
          </dl>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setRequestId(null);
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="success" disabled={busy} onClick={send}>
              {busy ? <LoaderCircle className="animate-spin" /> : <Check />}
              {busy ? "Sending…" : error ? "Retry same request" : "Confirm & Deliver"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
