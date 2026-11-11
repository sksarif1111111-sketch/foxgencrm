import { describe, expect, it } from "vitest";
import { orderPaymentData } from "./foxgen-payment-evidence";
import type { FoxgenOrder } from "./foxgen-orders";
const row = (id: string, entity: string, data: FoxgenOrder["data"], version = "2026-11-11T12:00:00Z"): FoxgenOrder => ({ external_id: id, entity, data, integration_id: "foxgen", name: id, status: "under_review", amount: 10, currency: "USDT", received_at: version, source_updated_at: version });
describe("order payment evidence association", () => {
  it("shows the transaction ID from an exact-linked payment when the order reference is empty", () => {
    expect(orderPaymentData(row("order-A", "orders", { payment_reference: "" }), [row("pay-A", "payments", { order_external_id: "order-A", transaction_id: "123456789012" })]).payment_reference).toBe("123456789012");
  });
  it("never shows another order, wallet deposit or refund transaction ID", () => {
    expect(orderPaymentData(row("order-A", "orders", {}), [row("other", "payments", { order_external_id: "order-AB", transaction_id: "OTHER" }), row("wallet", "payments", { customer_external_id: "order-A", transaction_id: "WALLET" }), row("refund", "refunds", { order_external_id: "order-A", transaction_id: "REFUND" })]).payment_reference).toBeUndefined();
  });
  it("keeps the order's own submitted transaction reference authoritative", () => {
    expect(orderPaymentData(row("order-A", "orders", { payment_reference: "ORDER-UTR" }), [row("pay-A", "payments", { order_external_id: "order-A", transaction_id: "PAYMENT-UTR" })]).payment_reference).toBe("ORDER-UTR");
  });
  it("uses the newest matching payment reference without manufacturing a proof timestamp", () => {
    const d = orderPaymentData(row("order-A", "orders", {}), [row("older", "payments", { order_external_id: "order-A", reference: "OLD" }), row("newer", "payments", { order_external_id: "order-A", utr: "NEW" }, "2026-11-11T13:00:00Z")]);
    expect(d.payment_reference).toBe("NEW");
    expect(d.proof_submitted_at).toBeUndefined();
  });
});