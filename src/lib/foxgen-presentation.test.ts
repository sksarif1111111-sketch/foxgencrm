import { describe, expect, it } from "vitest";
import {
  memberSpending,
  orderTimeline,
  paymentGroup,
  visibleStoreFields,
} from "./foxgen-presentation";
import type { FoxgenOrder } from "./foxgen-orders";

describe("Store presentation", () => {
  it("keeps internal proof locations and credential payloads out of imported record previews", () => {
    expect(
      visibleStoreFields({
        order_number: "FG-1",
        payment_reference: "TX-123",
        payment_evidence_url: "telegram-file:internal",
        product_name: "https://example.test/private-proof",
        items: [{ credentials: "private" }],
      }),
    ).toEqual({ order_number: "FG-1", payment_reference: "TX-123" });
  });
  it("shows explicit payment status independently from the order stage", () => {
    expect(paymentGroup({ status: "processing", data: { payment_status: "under_review" } })).toBe(
      "review",
    );
    expect(paymentGroup({ status: "processing", data: {} })).toBe("paid");
  });
  it("totals only completed purchases and keeps currencies separate", () => {
    expect(
      memberSpending([
        { status: "delivered", amount: 10, currency: "USDT" },
        { status: "completed", amount: 22, currency: "INR" },
        { status: "refunded", amount: 100, currency: "USDT" },
        { status: "pending_payment", amount: 100, currency: "USDT" },
      ]),
    ).toBe("USDT 10.00 · INR 22.00");
  });
  it("does not use an import or update timestamp for missing order events", () => {
    const stamp = "2026-11-11T12:00:00Z";
    const order: FoxgenOrder = {
      external_id: "order-1",
      name: "",
      entity: "orders",
      integration_id: "foxgen",
      status: "processing",
      amount: null,
      currency: null,
      source_updated_at: stamp,
      received_at: stamp,
      data: { created_at: stamp },
    };
    expect(orderTimeline(order)).toEqual([{ label: "Order created", time: Date.parse(stamp) }]);
  });
});
