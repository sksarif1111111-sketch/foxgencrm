import { describe, expect, it } from "vitest";
import { customerExternalId, customerOrderCounts, memberNumber, memberPayments, walletBalance } from "./foxgen-customers";
import type { FoxgenOrder } from "./foxgen-orders";

describe("FoxGen buyer identity", () => {
  it("uses the member number as the primary identifier even without orders", () => {
    expect(memberNumber({ external_id: "member-123", data: { member_number: "M-000123" } })).toBe("M-000123");
    expect(customerOrderCounts([]).get("member-123") ?? 0).toBe(0);
    expect(memberNumber({ external_id: "legacy-1", data: {} })).toBe("legacy-1");
  });
  it("reads the current wallet snapshot without deriving balance from funding", () => {
    expect(walletBalance({ wallet_balance: "42.75" })).toBe(42.75);
    expect(walletBalance({ wallet_balance: 0 })).toBe(0);
    expect(walletBalance({})).toBeNull();
    expect(walletBalance({ wallet_balance: "" })).toBeNull();
  });
  it("includes every funding status for the exact member, newest first, excluding other integrations and entities", () => {
    const payment = (id: string, status: string, at: string, customer = "member-1", integration = "foxgen", entity = "payments"): FoxgenOrder => ({ external_id: id, status, source_updated_at: at, received_at: at, name: id, amount: 10, currency: "USDT", integration_id: integration, entity, data: { customer_external_id: customer } });
    const result = memberPayments([
      payment("a", "approved", "2026-11-01T00:00:00Z"),
      payment("b", "pending", "2026-11-03T00:00:00Z"),
      payment("c", "rejected", "2026-11-02T00:00:00Z"),
      payment("d", "approved", "2026-11-04T00:00:00Z", "member-10"),
      payment("e", "approved", "2026-11-04T00:00:00Z", "member-1", "other"),
      payment("f", "approved", "2026-11-04T00:00:00Z", "member-1", "foxgen", "orders"),
    ], "member-1");
    expect(result.map((record) => [record.external_id, record.status])).toEqual([["b", "pending"], ["c", "rejected"], ["a", "approved"]]);
  });
  it("groups repeat orders by stable customer_external_id, not name or email", () => {
    const counts = customerOrderCounts([
      { integration_id: "foxgen", entity: "orders", data: { customer_external_id: "buyer-1", customer_email: "first@example.test" } },
      { integration_id: "foxgen", entity: "orders", data: { customer_external_id: "buyer-1", customer_email: "changed@example.test" } },
      { integration_id: "foxgen", entity: "orders", data: { customer_external_id: "buyer-10", customer_email: "first@example.test" } },
    ]);
    expect(counts.get("buyer-1")).toBe(2);
    expect(counts.get("buyer-10")).toBe(1);
  });
  it("excludes other integrations, entities and orders with no stable buyer ID", () => {
    expect(customerOrderCounts([
      { integration_id: "other", entity: "orders", data: { customer_external_id: "buyer-1" } },
      { integration_id: "foxgen", entity: "customers", data: { customer_external_id: "buyer-1" } },
      { integration_id: "foxgen", entity: "orders", data: {} },
    ]).size).toBe(0);
  });
  it("preserves exact stable IDs and rejects invalid identities", () => {
    expect(customerExternalId({ customer_external_id: "buyer-1" })).toBe("buyer-1");
    expect(customerExternalId({ customer_external_id: 123 })).toBeNull();
    expect(customerExternalId({ customer_external_id: " " })).toBeNull();
  });
});