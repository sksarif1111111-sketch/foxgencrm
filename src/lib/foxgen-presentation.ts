import { canonicalStatus, marketplaceData } from "./foxgen-marketplace";
import { orderData, timestamp, type FoxgenOrder } from "./foxgen-orders";

export const PAYMENT_GROUPS = {
  pending: {
    label: "Pending",
    explicit: ["awaiting_payment", "pending_payment", "pending", "unpaid"],
    orders: ["awaiting_payment", "pending_payment"],
  },
  review: {
    label: "Under review",
    explicit: ["payment_submitted", "proof_submitted", "under_review", "submitted"],
    orders: ["payment_submitted", "proof_submitted", "under_review"],
  },
  paid: {
    label: "Paid",
    explicit: ["payment_confirmed", "payment_verified", "verified", "paid", "approved"],
    orders: [
      "payment_confirmed",
      "payment_verified",
      "paid",
      "awaiting_fulfillment",
      "processing",
      "delayed",
      "delivered",
      "completed",
    ],
  },
  rejected: {
    label: "Rejected",
    explicit: ["payment_rejected", "rejected", "failed"],
    orders: ["payment_rejected", "rejected"],
  },
  refunded: { label: "Refunded", explicit: ["refunded"], orders: ["refunded"] },
} as const;
export type PaymentGroup = keyof typeof PAYMENT_GROUPS;

export function paymentGroup(order: Pick<FoxgenOrder, "data" | "status">): PaymentGroup | null {
  const value = orderData(order.data)["payment_status"];
  return (
    (Object.keys(PAYMENT_GROUPS) as PaymentGroup[]).find((key) => {
      const group = PAYMENT_GROUPS[key];
      const options: readonly string[] = typeof value === "string" ? group.explicit : group.orders;
      return options.includes(typeof value === "string" ? value : order.status);
    }) ?? null
  );
}

export function moneyLabel(amount: number | null, currency: string | null | undefined) {
  return amount === null ? "—" : `${currency ? `${currency} ` : ""}${amount.toFixed(2)}`;
}

export function memberSpending(orders: Pick<FoxgenOrder, "status" | "amount" | "currency">[]) {
  const totals = new Map<string, number>();
  for (const order of orders) {
    if (canonicalStatus(order.status) !== "delivered" || !order.currency || order.amount === null)
      continue;
    totals.set(order.currency, (totals.get(order.currency) ?? 0) + order.amount);
  }
  return [...totals].map(([currency, total]) => moneyLabel(total, currency)).join(" · ") || "—";
}

export function orderTimeline(order: FoxgenOrder, records: FoxgenOrder[] = []) {
  const data = marketplaceData(order.data);
  const events = [
    ["Order created", data["created_at"] ?? data["order_created_at"]],
    ["Payment submitted", data["proof_submitted_at"] ?? data["payment_submitted_at"]],
    ["Payment verified", data["confirmed_at"]],
    ["Processing started", data["processing_started_at"]],
    ["Delivery completed", data["delivered_at"]],
    [
      "Refund issued",
      data["refunded_at"] ??
        records.flatMap((record) => {
          if (
            record.entity !== "refunds" ||
            !["completed", "approved", "refunded"].includes(record.status)
          )
            return [];
          const info = orderData(record.data);
          const at = info["refunded_at"] ?? info["completed_at"];
          return timestamp(at) === null ? [] : [at];
        })[0],
    ],
  ] as const;
  return events
    .flatMap(([label, value]) => {
      const time = timestamp(value);
      return time === null ? [] : [{ label, time }];
    })
    .sort((a, b) => a.time - b.time);
}

// Imported JSON can contain legacy internal references. Render only known scalar metadata.
export function visibleStoreFields(value: FoxgenOrder["data"]) {
  const safe = new Set([
    "order_number",
    "customer_external_id",
    "customer_name",
    "customer_email",
    "member_number",
    "telegram_user_id",
    "telegram_username",
    "email",
    "name",
    "joined_at",
    "phone",
    "wallet_currency",
    "wallet_balance",
    "product_id",
    "product_name",
    "quantity",
    "unit_price",
    "stock_quantity",
    "category",
    "currency",
    "channel",
    "source",
    "payment_reference",
    "transaction_id",
    "reference",
    "payment_method",
    "payment_method_name",
    "payment_status",
    "payment_amount",
    "has_payment_proof",
    "proof_submitted_at",
    "payment_submitted_at",
    "confirmed_at",
    "created_at",
    "order_created_at",
    "processing_started_at",
    "delivered_at",
    "refunded_at",
    "delivery_status",
    "shop_delivery_sla_minutes",
  ]);
  return Object.fromEntries(
    Object.entries(orderData(value)).filter(
      ([key, field]) =>
        safe.has(key) &&
        (typeof field === "boolean" ||
          typeof field === "number" ||
          (typeof field === "string" && !/^(https?:|telegram-file:|data:)/i.test(field.trim()))),
    ),
  );
}
