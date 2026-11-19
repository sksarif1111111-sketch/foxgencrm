import type { FoxgenOrder } from "./foxgen-orders";
import { deliveryClock, clockRunning } from "./foxgen-orders";
import { canonicalStatus, marketplaceData } from "./foxgen-marketplace";

export function needsReview(order: FoxgenOrder) {
  return ["payment_submitted", "under_review"].includes(canonicalStatus(order.status));
}
export function needsDelivery(order: FoxgenOrder) {
  return ["payment_confirmed", "awaiting_fulfillment", "awaiting_email", "delayed"].includes(
    canonicalStatus(order.status),
  );
}
export function orderDeadline(order: FoxgenOrder) {
  const d = marketplaceData(order.data);
  const clock = deliveryClock(
    d["confirmed_at"],
    d["shop_delivery_sla_minutes"],
    d["delivered_at"],
    0,
  );
  if (!clock || !clockRunning(order.status) || d["delivered_at"]) return Infinity;
  const minutes = Number(d["shop_delivery_sla_minutes"]);
  return (
    Date.parse(String(d["confirmed_at"])) +
    (Number.isFinite(minutes) && minutes > 0 ? minutes : 30) * 60000
  );
}
export function workspaceOrders(orders: FoxgenOrder[], now: number) {
  const review = orders
    .filter(needsReview)
    .sort((a, b) => a.source_updated_at.localeCompare(b.source_updated_at));
  const delivery = orders
    .filter(needsDelivery)
    .sort(
      (a, b) =>
        orderDeadline(a) - orderDeadline(b) ||
        a.source_updated_at.localeCompare(b.source_updated_at),
    );
  const recent = [...orders].sort((a, b) => b.source_updated_at.localeCompare(a.source_updated_at));
  const overdue = delivery.filter((o) => orderDeadline(o) < now);
  const delayed = delivery.filter(
    (o) => canonicalStatus(o.status) === "delayed" || orderDeadline(o) < now,
  );
  const pending = orders.filter((o) => canonicalStatus(o.status) === "awaiting_payment");
  return { review, delivery, recent, pending, delayed, overdue: overdue.length };
}
