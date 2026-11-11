import { describe, expect, it } from "vitest";
import { customerExternalId, customerOrderCounts } from "./foxgen-customers";

describe("FoxGen buyer identity", () => {
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