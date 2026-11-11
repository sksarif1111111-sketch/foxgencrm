import { describe, expect, it } from "vitest";
import {
  canonicalStatus,
  marketplaceData,
  relatedOrderRecords,
  connectionSummary,
} from "./foxgen-marketplace";
import { allowedAction, clockRunning, deliveryClock, type FoxgenOrder } from "./foxgen-orders";
const row = (status: string, data: FoxgenOrder["data"], entity = "orders"): FoxgenOrder => ({
  integration_id: "foxgen",
  entity,
  external_id: "order-80",
  name: "",
  status,
  data,
  amount: 10,
  currency: "USD",
  received_at: "2026-11-11T03:00:00Z",
  source_updated_at: "2026-11-11T03:00:00Z",
});
describe("marketplace compatibility", () => {
  it("recognizes the Store payment states without trusting evidence", () => {
    expect(canonicalStatus("Proof Submitted")).toBe("payment_submitted");
    expect(allowedAction("approve", row("proof_submitted", {}))).toBe(true);
    expect(
      allowedAction("add_fulfillment", row("proof_submitted", { transaction_id: "123456789012" })),
    ).toBe(false);
  });
  it("runs processing and delayed delivery clocks from verified timestamps", () => {
    expect(clockRunning("Processing")).toBe(true);
    expect(clockRunning("Delayed")).toBe(true);
    const d = marketplaceData({
      payment_verified_at: "2026-11-11T03:00:00Z",
      created_at: "2026-11-11T01:00:00Z",
    });
    expect(
      deliveryClock(d["confirmed_at"], 30, null, Date.parse("2026-11-11T03:31:00Z"))?.overdue,
    ).toBe(true);
    expect(marketplaceData({ created_at: "2026-11-11T01:00:00Z" })["confirmed_at"]).toBeUndefined();
  });
  it("never allows operations on refunded orders", () => {
    for (const action of [
      "approve",
      "reject",
      "request_info",
      "add_fulfillment",
      "deliver_telegram",
    ] as const)
      expect(
        allowedAction(
          action,
          row("refunded", {
            confirmed_at: "2026-11-11T03:00:00Z",
            has_fulfillment: true,
            telegram_user_id: "123",
          }),
        ),
      ).toBe(false);
  });
  it("links payments and refunds only by exact order ID, never customer ID", () => {
    const match = row("approved", { order_external_id: "order-80" }, "payments");
    expect(
      relatedOrderRecords(
        [
          match,
          row("approved", { customer_external_id: "order-80" }, "payments"),
          row("approved", { order_external_id: "order-800" }, "refunds"),
        ],
        "order-80",
      ),
    ).toEqual([match]);
  });
  it("flags missing customer references and verified payment times", () => {
    expect(
      connectionSummary([
        row("processing", {}),
        row("awaiting_payment", { customer_external_id: "member-1" }),
      ]),
    ).toMatchObject({ counts: { orders: 2 }, missingCustomer: 1, missingPaymentTime: 1 });
  });
});
