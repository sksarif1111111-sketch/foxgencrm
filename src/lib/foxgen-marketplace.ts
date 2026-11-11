import type { FoxgenOrder } from "./foxgen-orders";
import type { Json } from "@/integrations/supabase/types";

function orderData(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function timestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Read compatibility only; the Store remains authoritative for financial transitions. */
export const STATUS_GROUPS: Record<string, string[]> = {
  awaiting_payment: ["awaiting_payment", "pending_payment"],
  payment_submitted: ["payment_submitted", "proof_submitted"],
  under_review: ["under_review"],
  payment_confirmed: ["payment_confirmed", "payment_verified", "paid"],
  awaiting_fulfillment: ["awaiting_fulfillment", "processing"],
  awaiting_email: ["awaiting_email"],
  delivered: ["delivered", "completed"],
  rejected: ["rejected", "payment_rejected"],
  cancelled: ["cancelled", "canceled"],
  delayed: ["delayed"],
  refunded: ["refunded"],
  expired: ["expired"],
};

export function canonicalStatus(status: string): string {
  const value = status
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return Object.entries(STATUS_GROUPS).find(([, aliases]) => aliases.includes(value))?.[0] ?? value;
}

export function marketplaceData(value: FoxgenOrder["data"]): ReturnType<typeof orderData> {
  const d = orderData(value);
  return {
    ...d,
    // Never substitute order creation time for verified payment time.
    confirmed_at: d["confirmed_at"] ?? d["payment_verified_at"] ?? d["payment_confirmed_at"],
    delivered_at: d["delivered_at"] ?? d["delivery_completed_at"],
    shop_delivery_sla_minutes: d["shop_delivery_sla_minutes"] ?? d["delivery_target_minutes"],
    channel: d["channel"] ?? d["source"],
    payment_reference:
      d["payment_reference"] ?? d["transaction_id"] ?? d["utr"] ?? d["payment_ref"],
  };
}

export function relatedOrderRecords(records: FoxgenOrder[], orderId: string): FoxgenOrder[] {
  return records
    .filter(
      (r) =>
        r.integration_id === "foxgen" &&
        ["payments", "refunds"].includes(r.entity) &&
        orderData(r.data)["order_external_id"] === orderId,
    )
    .sort((a, b) => b.source_updated_at.localeCompare(a.source_updated_at));
}

export function connectionSummary(
  records: Pick<FoxgenOrder, "entity" | "status" | "data" | "received_at">[],
) {
  const counts: Record<string, number> = {};
  let latest: string | null = null;
  let missingCustomer = 0;
  let missingPaymentTime = 0;
  for (const r of records) {
    counts[r.entity] = (counts[r.entity] ?? 0) + 1;
    if ((timestamp(r.received_at) ?? 0) > (timestamp(latest) ?? 0)) latest = r.received_at;
    if (r.entity !== "orders") continue;
    const d = marketplaceData(r.data);
    if (typeof d["customer_external_id"] !== "string" || !d["customer_external_id"].trim())
      missingCustomer++;
    if (
      ["payment_confirmed", "awaiting_fulfillment", "delayed", "delivered"].includes(
        canonicalStatus(r.status),
      ) &&
      timestamp(d["confirmed_at"]) === null
    )
      missingPaymentTime++;
  }
  return { counts, latest, missingCustomer, missingPaymentTime };
}
