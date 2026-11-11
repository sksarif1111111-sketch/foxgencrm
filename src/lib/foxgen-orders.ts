import { z } from "zod";
import type { Database, Json } from "@/integrations/supabase/types";

export type FoxgenOrder = Database["public"]["Tables"]["store_records"]["Row"];
export const FOXGEN_STATUSES = [
  "awaiting_payment",
  "payment_submitted",
  "under_review",
  "awaiting_email",
  "payment_confirmed",
  "awaiting_fulfillment",
  "delivered",
  "rejected",
  "cancelled",
  "expired",
] as const;
export const FoxgenSearch = z.object({
  q: z.string().max(100).optional().catch(undefined),
  status: z
    .enum(["all", ...FOXGEN_STATUSES])
    .optional()
    .catch(undefined),
  channel: z.enum(["all", "website", "bot"]).optional().catch(undefined),
  page: z.number().int().min(0).optional().catch(undefined),
});
export type FoxgenFilters = z.infer<typeof FoxgenSearch>;
export const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), order_id: z.string().min(1).max(200) }).strict(),
  z
    .object({
      action: z.literal("reject"),
      order_id: z.string().min(1).max(200),
      reason: z.string().trim().min(1).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("add_fulfillment"),
      order_id: z.string().min(1).max(200),
      kind: z.enum(["link", "code", "instructions"]),
      content: z.string().trim().min(1).max(10000),
    })
    .strict(),
  z.object({ action: z.literal("deliver_email"), order_id: z.string().min(1).max(200) }).strict(),
  z
    .object({ action: z.literal("deliver_telegram"), order_id: z.string().min(1).max(200) })
    .strict(),
  z
    .object({
      action: z.literal("request_info"),
      order_id: z.string().min(1).max(200),
      message: z.string().trim().min(1).max(2000),
    })
    .strict(),
]);
export type FoxgenAction = z.infer<typeof ActionSchema>;
export function orderData(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
export function text(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.map(text).join(", ") || "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
export function timestamp(value: unknown): number | null {
  if (typeof value !== "string" || !value) return null;
  const n = Date.parse(value);
  return Number.isFinite(n) ? n : null;
}
export function slaMinutes(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 30;
}
export function deliveryClock(
  confirmedAt: unknown,
  sla: unknown,
  deliveredAt: unknown,
  now: number,
) {
  const confirmed = timestamp(confirmedAt);
  const delivered = timestamp(deliveredAt);
  if (confirmed === null) return null;
  const window = slaMinutes(sla) * 60000;
  if (delivered !== null) {
    if (delivered < confirmed) return null;
    const elapsed = delivered - confirmed;
    return {
      zone: elapsed > window ? "warning" : "success",
      label: `Delivered in ${Math.round(elapsed / 60000)} min`,
      overdue: false,
    } as const;
  }
  const remaining = confirmed + window - now;
  return {
    zone: remaining < 0 ? "danger" : remaining <= window / 2 ? "warning" : "success",
    label:
      remaining < 0
        ? `${Math.ceil(-remaining / 60000)} min overdue`
        : `${Math.ceil(remaining / 60000)} min remaining`,
    overdue: remaining < 0,
  } as const;
}
export function clockRunning(status: string) {
  return status === "payment_confirmed" || status === "awaiting_fulfillment";
}
export function isBot(data: Record<string, unknown>) {
  return String(data["channel"] ?? "").toLowerCase() === "bot";
}
export function hasEmails(data: Record<string, unknown>) {
  return Array.isArray(data["delivery_emails"])
    ? data["delivery_emails"].some((v) => typeof v === "string" && v.trim())
    : typeof data["delivery_emails"] === "string" && !!data["delivery_emails"].trim();
}
export function allowedAction(action: FoxgenAction["action"], order: FoxgenOrder): boolean {
  const d = orderData(order.data);
  if (action === "approve" || action === "reject")
    return ["under_review", "payment_submitted"].includes(order.status);
  if (action === "request_info")
    return !["delivered", "rejected", "cancelled", "expired"].includes(order.status);
  const approved =
    ["payment_confirmed", "awaiting_fulfillment", "awaiting_email"].includes(order.status) &&
    timestamp(d["confirmed_at"]) !== null;
  if (action === "add_fulfillment") return approved;
  if (!approved || d["has_fulfillment"] !== true) return false;
  return action === "deliver_email" ? hasEmails(d) : isBot(d) || !!d["telegram_user_id"];
}
export function foxgenMetrics(orders: FoxgenOrder[], now: number) {
  let overdue = 0,
    total = 0,
    delivered = 0;
  let lastReceived: string | null = null;
  for (const o of orders) {
    const d = orderData(o.data);
    const clock = deliveryClock(
      d["confirmed_at"],
      d["shop_delivery_sla_minutes"],
      d["delivered_at"],
      now,
    );
    if (clockRunning(o.status) && clock?.overdue && timestamp(d["delivered_at"]) === null)
      overdue++;
    const at = timestamp(d["delivered_at"]),
      confirmed = timestamp(d["confirmed_at"]);
    if (
      at !== null &&
      confirmed !== null &&
      at >= confirmed &&
      at >= now - 7 * 86400000 &&
      at <= now
    ) {
      total += (at - confirmed) / 60000;
      delivered++;
    }
    if ((timestamp(o.received_at) ?? 0) > (timestamp(lastReceived) ?? 0))
      lastReceived = o.received_at;
  }
  return { overdue, averageMinutes: delivered ? total / delivered : null, delivered, lastReceived };
}
