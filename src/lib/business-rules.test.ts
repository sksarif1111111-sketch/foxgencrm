import { describe, expect, it } from "vitest";
import { balanceLevel, computeSellingPrice, effectiveMarkup, markupFromPrice, orderTotals } from "./pricing";
import { normalizeProof, validatePaymentProof } from "./payment-validator";
import { parseAccounts, parseBalance, parseProducts } from "./reseller-normalize";

describe("pricing", () => {
  it("wholesale $5 with 40% markup sells at $7", () => {
    expect(computeSellingPrice(5, 40)).toBe(7);
  });
  it("default markup is 20% when no override", () => {
    expect(effectiveMarkup(null, 20)).toBe(20);
    expect(effectiveMarkup(35, 20)).toBe(35);
  });
  it("profit = (selling - cost) × quantity: $8 vs $5 × 1 = $3", () => {
    expect(orderTotals(8, 5, 1).profit).toBe(3);
  });
  it("bot total: $5.99 × 2 = $11.98", () => {
    expect(orderTotals(5.99, 4, 2).revenue).toBe(11.98);
  });
  it("markup implied by a price", () => {
    expect(markupFromPrice(5, 7)).toBe(40);
  });
  it("balance under $50 is low, under $20 is critical", () => {
    expect(balanceLevel(49.99, 50, 20)).toBe("low");
    expect(balanceLevel(19.99, 50, 20)).toBe("critical");
    expect(balanceLevel(50, 50, 20)).toBe("ok");
  });
});

describe("payment proof validation", () => {
  it("UPI needs 12 alphanumeric characters", () => {
    expect(validatePaymentProof("upi", normalizeProof("upi", "abc123def456"))).toBe(true);
    expect(validatePaymentProof("upi", "ABC123")).toBe(false);
  });
  it("Binance needs 10+ digits", () => {
    expect(validatePaymentProof("binance", "1234567890")).toBe(true);
    expect(validatePaymentProof("binance", "123456789")).toBe(false);
  });
  it("crypto needs a 64-char hex hash", () => {
    expect(validatePaymentProof("crypto", "a".repeat(64))).toBe(true);
    expect(validatePaymentProof("crypto", "g".repeat(64))).toBe(false);
  });
  it("cash proofs are never accepted by the bot", () => {
    expect(validatePaymentProof("cash", "anything")).toBe(false);
  });
});

describe("supplier payload parsing", () => {
  it("reads products from a wrapped list", () => {
    const p = parseProducts({ ok: true, products: [{ id: "n1", name: "Netflix", price: "5.00", stock: 3 }] });
    expect(p).toEqual([{ id: "n1", name: "Netflix", description: null, wholesale_price: 5, stock: 3 }]);
  });
  it("throws on ok:false", () => {
    expect(() => parseBalance({ ok: false, error: "Reseller account is not active" })).toThrow("Reseller account is not active");
  });
  it("reads accounts given as objects", () => {
    expect(parseAccounts({ ok: true, order: { accounts: [{ email: "a@b.c", password: "x" }] } })).toEqual(["a@b.c:x"]);
  });
});
