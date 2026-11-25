import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callFoxgenAction } from "./foxgen-actions.server";

describe("FoxGen Store action boundary", () => {
  beforeEach(() => {
    vi.stubEnv("SHOP_CRM_ACTION_KEY", "test-only-fixture");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("sends the action to the separate Store API without supplier calls", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    expect(await callFoxgenAction({ action: "approve", order_id: "FG-001234" })).toEqual({
      ok: true,
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://foxgenofficial.lovable.app/api/public/shop/v1/actions",
    );
    expect(JSON.parse(fetcher.mock.calls[0]?.[1].body)).toEqual({
      action: "approve",
      order_id: "FG-001234",
      send: false,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1].headers.Authorization).toBe("Bearer test-only-fixture");
  });
  it("forwards combined delivery fields with a stable idempotency header, not in the payload", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ ok: true, delivery: { telegram: "sent" }, password: "must-not-return" }),
      );
    vi.stubGlobal("fetch", fetcher);
    const result = await callFoxgenAction({
      action: "approve_and_deliver",
      order_id: "b9991bde-8d84-443f-9227-a889e18f6dfd",
      fields: {
        account_email: "account@example.test",
        password: "test-password",
        link: "https://example.test/file",
      },
      request_id: "c9991bde-8d84-443f-9227-a889e18f6dfd",
    });
    expect(JSON.parse(fetcher.mock.calls[0]?.[1].body)).toEqual({
      action: "approve_and_deliver",
      order_id: "b9991bde-8d84-443f-9227-a889e18f6dfd",
      fields: {
        account_email: "account@example.test",
        password: "test-password",
        link: "https://example.test/file",
      },
    });
    expect(fetcher.mock.calls[0]?.[1].headers["Idempotency-Key"]).toBe(
      "c9991bde-8d84-443f-9227-a889e18f6dfd",
    );
    expect(result).toEqual({ ok: true, delivery: { telegram: "sent" } });
  });
  it("forwards customer messages and wallet adjustments without supplier fulfillment", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    await callFoxgenAction({
      action: "message_customer",
      customer_id: "member-id",
      message: "Order update",
      channels: ["telegram", "account"],
      request_id: "request-1",
    });
    await callFoxgenAction({
      action: "adjust_wallet",
      customer_id: "member-id",
      amount_usd: -5,
      reason: "Correction",
      request_id: "request-2",
    });
    expect(JSON.parse(fetcher.mock.calls[0]?.[1].body)).toEqual({
      action: "message_customer",
      customer_id: "member-id",
      message: "Order update",
      channels: ["telegram", "account"],
    });
    expect(JSON.parse(fetcher.mock.calls[1]?.[1].body)).toEqual({
      action: "adjust_wallet",
      customer_id: "member-id",
      amount_usd: -5,
      reason: "Correction",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("requires SHOP_CRM_ACTION_KEY rather than the previous secret name", async () => {
    vi.stubEnv("SHOP_CRM_ACTION_KEY", "");
    vi.stubEnv("FOXGEN_SHOP_ACTION_KEY", "old-test-fixture");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect((await callFoxgenAction({ action: "approve", order_id: "FG-001234" })).ok).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not mistake an unacknowledged response for success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({})));
    expect((await callFoxgenAction({ action: "approve", order_id: "FG-001234" })).ok).toBe(false);
  });
  it("provides a safe authorization error without leaking the response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("private provider detail", { status: 401 })),
    );
    const result = await callFoxgenAction({ action: "approve", order_id: "FG-001234" });
    expect(result).toEqual({
      ok: false,
      error: "The store did not authorize this action. Check the Store action key.",
    });
  });
  it("does not retry an ambiguous timeout", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("timeout"));
    vi.stubGlobal("fetch", fetcher);
    expect((await callFoxgenAction({ action: "deliver_email", order_id: "FG-001234" })).ok).toBe(
      false,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
