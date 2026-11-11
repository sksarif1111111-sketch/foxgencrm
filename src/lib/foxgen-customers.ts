import { z } from "zod";
import { orderData, type FoxgenOrder } from "./foxgen-orders";

export const FoxgenCustomerSearch = z.object({
  q: z.string().max(100).optional().catch(undefined),
  page: z.number().int().min(0).optional().catch(undefined),
});
export type FoxgenCustomerFilters = z.infer<typeof FoxgenCustomerSearch>;

export function customerExternalId(data: FoxgenOrder["data"]): string | null {
  const value = orderData(data)["customer_external_id"];
  return typeof value === "string" && value.trim() ? value : null;
}

export function customerOrderCounts(orders: Pick<FoxgenOrder, "integration_id" | "entity" | "data">[]) {
  const counts = new Map<string, number>();
  for (const order of orders) {
    if (order.integration_id !== "foxgen" || order.entity !== "orders") continue;
    const id = customerExternalId(order.data);
    if (id !== null) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}