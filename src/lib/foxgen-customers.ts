import { z } from "zod";
import { orderData, type FoxgenOrder } from "./foxgen-orders";

export const FoxgenCustomerSearch = z.object({
  q: z.preprocess(
    (value) => (typeof value === "number" && Number.isFinite(value) ? String(value) : value),
    z.string().max(100).optional().catch(undefined),
  ),
  orders: z.enum(["all", "with", "without"]).optional().catch(undefined),
  page: z.number().int().min(0).optional().catch(undefined),
});
export type FoxgenCustomerFilters = z.infer<typeof FoxgenCustomerSearch>;

export function snapshotNumber(data: FoxgenOrder["data"], key: string): number | null {
  const value = orderData(data)[key];
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function telegramChatUrl(usernameValue: unknown, telegramIdValue?: unknown): string | null {
  if (typeof usernameValue === "string") {
    const username = usernameValue.trim().replace(/^@/, "");
    if (/^[a-zA-Z0-9_]{5,32}$/.test(username)) return `https://t.me/${username}`;
  }
  const idText =
    typeof telegramIdValue === "number" && Number.isSafeInteger(telegramIdValue)
      ? String(telegramIdValue)
      : typeof telegramIdValue === "string"
        ? telegramIdValue.trim()
        : "";
  if (/^[1-9]\d{4,19}$/.test(idText)) return `tg://user?id=${idText}`;
  return null;
}

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
  return records
    .filter(
      (record) =>
        record.integration_id === "foxgen" &&
        record.entity === "payments" &&
        customerExternalId(record.data) === id,
    )
    .sort(
      (a, b) =>
        b.source_updated_at.localeCompare(a.source_updated_at) ||
        a.external_id.localeCompare(b.external_id),
    );
}

export function customerExternalId(data: FoxgenOrder["data"]): string | null {
  const value = orderData(data)["customer_external_id"];
  return typeof value === "string" && value.trim() ? value : null;
}

export function customerOrderCounts(
  orders: Pick<FoxgenOrder, "integration_id" | "entity" | "data">[],
) {
  const counts = new Map<string, number>();
  for (const order of orders) {
    if (order.integration_id !== "foxgen" || order.entity !== "orders") continue;
    const id = customerExternalId(order.data);
    if (id !== null) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
