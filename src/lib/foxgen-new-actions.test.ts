import { describe, expect, it } from "vitest";
import {
  ActionSchema,
  CustomerActionSchema,
  allowedAction,
  type FoxgenOrder,
} from "./foxgen-orders";
import { FoxgenCustomerSearch, snapshotNumber, telegramChatUrl } from "./foxgen-customers";
const id = "b9991bde-8d84-443f-9227-a889e18f6dfd";
describe("new Store action validation", () => {
  it("preserves numeric Telegram IDs parsed from the search URL", () => {
    expect(FoxgenCustomerSearch.parse({ q: 8139775161 }).q).toBe("8139775161");
    expect(FoxgenCustomerSearch.parse({ q: "@Murshad57" }).q).toBe("@Murshad57");
  });
  it("requires at least one delivery field and rejects extra persisted content", () => {
    const input = { action: "approve_and_deliver", order_id: id, request_id: id };
    expect(ActionSchema.safeParse({ ...input, fields: {} }).success).toBe(false);
    expect(
      ActionSchema.safeParse({ ...input, fields: { password: "test-password" } }).success,
    ).toBe(true);
    expect(
      ActionSchema.safeParse({ ...input, fields: { credentials_url: "https://example.test" } })
        .success,
    ).toBe(false);
  });
  it("requires a non-empty message and at least one selected channel", () => {
    const input = {
      action: "message_customer",
      customer_id: id,
      request_id: id,
      message: "Order update",
    };
    expect(CustomerActionSchema.safeParse({ ...input, channels: [] }).success).toBe(false);
    expect(
      CustomerActionSchema.safeParse({ ...input, channels: ["telegram", "email", "account"] })
        .success,
    ).toBe(true);
    expect(
      CustomerActionSchema.safeParse({ ...input, channels: ["telegram"], message: " " }).success,
    ).toBe(false);
  });
  it("requires a signed non-zero adjustment and a reason", () => {
    const input = {
      action: "adjust_wallet",
      customer_id: id,
      request_id: id,
      reason: "Correction",
    };
    expect(CustomerActionSchema.safeParse({ ...input, amount_usd: -5 }).success).toBe(true);
    expect(CustomerActionSchema.safeParse({ ...input, amount_usd: 5 }).success).toBe(true);
    expect(CustomerActionSchema.safeParse({ ...input, amount_usd: 0 }).success).toBe(false);
    expect(CustomerActionSchema.safeParse({ ...input, amount_usd: 5, reason: " " }).success).toBe(
      false,
    );
  });
  it("blocks combined delivery for unpaid and completed orders", () => {
    const order = {
      integration_id: "foxgen",
      entity: "orders",
      external_id: id,
      status: "under_review",
      data: {},
      amount: 1,
      currency: "USD",
      name: "Order",
      received_at: "2026-11-25T10:00:00Z",
      source_updated_at: "2026-11-25T10:00:00Z",
    } satisfies FoxgenOrder;
    expect(allowedAction("approve_and_deliver", order)).toBe(true);
    expect(allowedAction("approve_and_deliver", { ...order, status: "awaiting_payment" })).toBe(
      false,
    );
    expect(allowedAction("approve_and_deliver", { ...order, status: "delivered" })).toBe(false);
  });
  it("reads credits only from the Store snapshot", () => {
    expect(snapshotNumber({ credit_balance: 17 }, "credit_balance")).toBe(17);
    expect(snapshotNumber({ wallet_balance: 42 }, "credit_balance")).toBeNull();
  });
  it("opens a validated Telegram username chat or falls back to tg://user?id", () => {
    expect(telegramChatUrl("@foxgen_user")).toBe("https://t.me/foxgen_user");
    expect(telegramChatUrl("@foxgen_user", "8793093292")).toBe("https://t.me/foxgen_user");
    expect(telegramChatUrl(null, 8793093292)).toBe("tg://user?id=8793093292");
    expect(telegramChatUrl("", "8793093292")).toBe("tg://user?id=8793093292");
    expect(telegramChatUrl("evil.example/path")).toBeNull();
    expect(telegramChatUrl(null, "not-an-id")).toBeNull();
  });
});
