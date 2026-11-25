import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Check, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  const destination = isBot(orderData(order.data)) ? "Telegram chat" : "Email + Store account";
  if (sent)
    return (
      <p role="status" className="mb-5 border-l-2 border-success py-3 pl-4 text-sm">
        Store confirmed approval and delivery. Waiting for its latest order snapshot.
      </p>
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
        setError(result.error);
        return;
      }
      // Credentials are never added to query data, storage, database rows or success overlays.
      setFields({});
      setRequestId(null);
      setSent(true);
      onDelivered();
      const failed = Object.entries(result.delivery ?? {}).filter(
        ([, state]) => !["sent", "visible_in_my_orders"].includes(state),
      );
      if (failed.length)
        toast.warning(
          `Store completed the order; ${failed.map(([channel, status]) => `${channel}: ${status.replaceAll("_", " ")}`).join(" · ")}`,
        );
      else toast.success(`Store confirmed delivery · ${destination}`);
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
      </p>
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
              Approve this order and send the entered delivery details to {destination}? Confirm
              only after checking the received payment.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            Order: {String(orderData(order.data)["order_number"] ?? order.external_id)}
          </p>
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
