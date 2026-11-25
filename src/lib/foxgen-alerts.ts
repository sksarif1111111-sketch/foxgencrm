import type { FoxgenOrder } from "./foxgen-orders";
import { needsReview } from "./foxgen-workspace";

export function newOrderAlerts(previous: Map<string, boolean>, orders: FoxgenOrder[]) {
  return orders.filter(
    (order) =>
      !previous.has(order.external_id) ||
      (needsReview(order) && previous.get(order.external_id) === false),
  );
}
