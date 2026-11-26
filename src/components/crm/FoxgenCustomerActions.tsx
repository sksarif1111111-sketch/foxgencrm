import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Send, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  CustomerActionSchema,
  isBot,
  orderData,
  type CustomerAction,
  type FoxgenOrder,
} from "@/lib/foxgen-orders";
import { operateFoxgenCustomer } from "@/lib/foxgen.functions";

export type MessageReceipt = {
  id: string;
  message: string;
  at: string;
  channels: Record<string, string>;
};
export function FoxgenCustomerActions({
  customerId,
  orderId,
  data,
  onMessage,
  wallet = false,
}: {
  customerId: string;
  orderId?: string;
  data: FoxgenOrder["data"];
  onMessage?: (receipt: MessageReceipt) => void;
  wallet?: boolean;
}) {
  const operate = useServerFn(operateFoxgenCustomer);
  const qc = useQueryClient();
  const [message, setMessage] = useState("");
  const [channels, setChannels] = useState<Array<"telegram" | "email" | "account">>(() =>
    isBot(orderData(data)) || orderData(data)["telegram_user_id"]
      ? ["telegram"]
      : ["email", "account"],
  );
  const [adjusting, setAdjusting] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<CustomerAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const info = orderData(data);
  const customerLabel = String(
    info["customer_name"] ?? info["name"] ?? info["member_number"] ?? customerId,
  );
  const channelDestination = (channel: "telegram" | "email" | "account") => {
    if (channel === "telegram") {
      const handle = info["telegram_username"]
        ? `@${String(info["telegram_username"]).replace(/^@/, "")}`
        : info["telegram_user_id"]
          ? `ID ${String(info["telegram_user_id"])}`
          : null;
      return handle ? `Telegram (${handle})` : "Telegram";
    }
    if (channel === "email") {
      const mail = info["email"] ?? info["customer_email"];
      return typeof mail === "string" && mail.trim() ? `Email (${mail.trim()})` : "Email";
    }
    return "Store account";
  };
  function prepare(input: unknown) {
    const parsed = CustomerActionSchema.safeParse(input);
    if (!parsed.success) {
      setError(
        "Enter a message and select a channel, or a non-zero USD amount and a reason of at least 3 characters.",
      );
      return;
    }
    setError(null);
    setPending(parsed.data);
  }
  async function send() {
    if (!pending || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await operate({ data: pending });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (pending.action === "message_customer") {
        const states = result.channels ?? {};
        const details = Object.entries(states)
          .map(([channel, state]) => `${channel}: ${state.replaceAll("_", " ")}`)
          .join(" · ");
        setOutcome(details || "Store accepted the message; delivery details were not returned.");
        if ("historySaved" in result && result.historySaved === false)
          toast.warning(
            "Store processed the message, but its history could not be saved. Do not resend it just to save history.",
          );
        onMessage?.({
          id: pending.request_id,
          message: pending.message,
          at: new Date().toISOString(),
          channels: states,
        });
        setMessage("");
        toast.success("Store processed the message");
      } else {
        setOutcome(
          `Wallet adjustment confirmed${result.balance_usd === undefined ? "" : ` · USD ${result.balance_usd.toFixed(2)}`} · awaiting latest Store snapshot`,
        );
        setAmount("");
        setReason("");
        setAdjusting(false);
        toast.success("Wallet adjustment confirmed");
      }
      setPending(null);
      await qc.invalidateQueries({ queryKey: ["foxgen"] });
    } catch {
      setError(
        "The Store response was interrupted. Check the Store before retrying this same request.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="min-w-0 border-t py-5">
      <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <h2 className="font-semibold">Send message</h2>
        {wallet && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setError(null);
              setAdjusting(true);
            }}
          >
            <Wallet />
            Adjust wallet
          </Button>
        )}
      </div>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          prepare({
            action: "message_customer",
            customer_id: customerId,
            ...(orderId ? { order_id: orderId } : {}),
            message,
            channels,
            request_id: crypto.randomUUID(),
          });
        }}
      >
        <Label htmlFor={`message-${customerId}`} className="sr-only">
          Message customer
        </Label>
        <Textarea
          id={`message-${customerId}`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={2000}
          rows={3}
          required
          disabled={busy || !!pending}
          placeholder="Message customer…"
        />
        <div className="flex flex-wrap items-center gap-4">
          {(["telegram", "email", "account"] as const).map((channel) => (
            <Label key={channel} className="flex min-h-10 items-center gap-2 capitalize">
              <Checkbox
                checked={channels.includes(channel)}
                disabled={busy || !!pending}
                onCheckedChange={(checked) =>
                  setChannels((values) =>
                    checked === true
                      ? [...new Set([...values, channel])]
                      : values.filter((value) => value !== channel),
                  )
                }
              />
              {channel}
            </Label>
          ))}
          <Button type="submit" disabled={busy || !!pending || !message.trim() || !channels.length}>
            <Send />
            Send message
          </Button>
        </div>
      </form>
      {outcome && (
        <p role="status" className="mt-3 break-words text-sm text-muted-foreground">
          {outcome}
        </p>
      )}
      {error && !pending && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <Dialog
        open={adjusting && !pending}
        onOpenChange={(open) => {
          if (!busy) setAdjusting(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust wallet</DialogTitle>
            <DialogDescription>USD wallet adjustment for this Store member.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              prepare({
                action: "adjust_wallet",
                customer_id: customerId,
                amount_usd: Number(amount),
                reason,
                request_id: crypto.randomUUID(),
              });
            }}
          >
            <div>
              <Label htmlFor="wallet-amount">Amount (USD; negative to deduct)</Label>
              <Input
                id="wallet-amount"
                type="number"
                step="0.01"
                min={-100000}
                max={100000}
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="wallet-reason">Reason</Label>
              <Textarea
                id="wallet-reason"
                minLength={3}
                maxLength={500}
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit">Review adjustment</Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!pending}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setPending(null);
            setError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pending?.action === "adjust_wallet"
                ? "Confirm wallet adjustment"
                : "Confirm customer message"}
            </DialogTitle>
            <DialogDescription>
              {pending?.action === "adjust_wallet"
                ? `This will immediately ${pending.amount_usd > 0 ? "add" : "deduct"} $${Math.abs(pending.amount_usd).toFixed(2)} USD ${pending.amount_usd > 0 ? "to" : "from"} ${customerLabel}'s Store wallet.`
                : `This will send the message below to ${customerLabel} immediately.`}
            </DialogDescription>
          </DialogHeader>
          <dl className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="shrink-0 text-muted-foreground">Customer</dt>
              <dd className="font-semibold text-right break-all">{customerLabel}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="shrink-0 text-muted-foreground">Where it goes</dt>
              <dd className="font-semibold text-right break-words">
                {pending?.action === "adjust_wallet"
                  ? "Store wallet balance"
                  : pending?.action === "message_customer"
                    ? pending.channels.map(channelDestination).join(" · ")
                    : ""}
              </dd>
            </div>
            {pending?.action === "adjust_wallet" && (
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-muted-foreground">Change</dt>
                <dd className="figure font-semibold text-right">
                  {pending.amount_usd > 0 ? "+" : ""}${pending.amount_usd.toFixed(2)} USD
                </dd>
              </div>
            )}
          </dl>
          <p className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-sm">
            {pending?.action === "adjust_wallet" ? pending.reason : pending?.message}
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
                setPending(null);
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button disabled={busy} onClick={send}>
              {busy ? <LoaderCircle className="animate-spin" /> : <Send />}
              {busy ? "Sending…" : error ? "Retry same request" : "Confirm and send"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
