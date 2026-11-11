import { z } from "zod";
import { orderData, type FoxgenOrder } from "./foxgen-orders";

export const FoxgenCustomerSearch = z.object({
  q: z.string().max(100).optional().catch(undefined),
  page: z.number().int().min(0).optional().catch(undefined),
});
export type FoxgenCustomerFilters = z.infer<typeof FoxgenCustomerSearch>;

export function memberNumber(customer: Pick<FoxgenOrder, "external_id" | "data">): string {
  const value = orderData(customer.data)["member_number"];
  return typeof value === "string" && value.trim() ? value : customer.external_id;
}

export function walletBalance(data: FoxgenOrder["data"]): number | null {
  const value = orderData(data)["wallet_balance"];
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

export function memberPayments(records: FoxgenOrder[], id: string): FoxgenOrder[] {
  return records.filter((record) => record.integration_id === "foxgen" && record.entity === "payments" && customerExternalId(record.data) === id)
    .sort((a, b) => b.source_updated_at.localeCompare(a.source_updated_at) || a.external_id.localeCompare(b.external_id));
}

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