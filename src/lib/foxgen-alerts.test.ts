import { describe, expect, it } from "vitest";
import { newOrderAlerts } from "./foxgen-alerts";
import type { FoxgenOrder } from "./foxgen-orders";
const order = (id: string, status: string): FoxgenOrder => ({
  integration_id: "foxgen",
  entity: "orders",
  external_id: id,
  status,
  data: {},
  amount: null,
  currency: null,
  name: "",
  received_at: "2026-11-25T10:00:00Z",
  source_updated_at: "2026-11-25T10:00:00Z",
});
describe("in-session order alerts", () => {
  it("alerts new orders and newly submitted proof, not unchanged older orders", () => {
    const previous = new Map([
      ["old", false],
      ["review", true],
      ["paid", false],
    ]);
    expect(
      newOrderAlerts(previous, [
        order("old", "awaiting_payment"),
        order("review", "under_review"),
        order("paid", "payment_submitted"),
        order("new", "awaiting_payment"),
      ]).map((row) => row.external_id),
    ).toEqual(["paid", "new"]);
  });
});
