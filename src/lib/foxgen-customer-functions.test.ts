import { beforeEach, describe, expect, it, vi } from "vitest";
import { operateFoxgenCustomer } from "./foxgen.functions";
import type { CustomerAction } from "./foxgen-orders";

const mocks = vi.hoisted(() => ({ action: vi.fn(), write: vi.fn(), upsert: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware() {
      return this;
    },
    inputValidator() {
      return this;
    },
    handler(fn: unknown) {
      return fn;
    },
  }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./foxgen-actions.server", () => ({ callFoxgenAction: mocks.action }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: mocks.write } }));

const id = "b9991bde-8d84-443f-9227-a889e18f6dfd";
const input: CustomerAction = {
  action: "message_customer",
  customer_id: id,
  message: "Owner message",
  channels: ["account"],
  request_id: id,
};
function ownerContext(admin: boolean, orderExists = true) {
  const queries = [
    { data: { external_id: id }, error: null },
    { data: orderExists ? { external_id: id } : null, error: null },
  ];
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => queries.shift()),
  };
  return {
    userId: id,
    supabase: { rpc: vi.fn(async () => ({ data: admin, error: null })), from: vi.fn(() => chain) },
  };
}
type Context = ReturnType<typeof ownerContext>;
const call = operateFoxgenCustomer as unknown as (input: {
  data: CustomerAction;
  context: Context;
}) => Promise<{ ok: boolean; historySaved?: boolean }>;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.action.mockResolvedValue({ ok: true, channels: { account: "sent" } });
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.write.mockReturnValue({ upsert: mocks.upsert });
});
describe("owner-only Store customer actions", () => {
  it("denies non-owner actions before Store calls or receipt writes", async () => {
    expect((await call({ data: input, context: ownerContext(false) })).ok).toBe(false);
    expect(mocks.action).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("rejects an order not exactly linked to this customer", async () => {
    const context = ownerContext(true, false);
    expect((await call({ data: { ...input, order_id: id }, context })).ok).toBe(false);
    expect(context.supabase.from.mock.results[0]?.value.eq).toHaveBeenCalledWith(
      "data->>customer_external_id",
      id,
    );
    expect(mocks.action).not.toHaveBeenCalled();
  });
  it("stores only an acknowledged message receipt once, not delivery fields", async () => {
    expect(await call({ data: input, context: ownerContext(true) })).toMatchObject({
      ok: true,
      historySaved: true,
    });
    expect(mocks.write).toHaveBeenCalledWith("store_message_receipts");
    expect(mocks.upsert).toHaveBeenCalledWith(
      {
        request_id: id,
        customer_external_id: id,
        order_external_id: null,
        message: "Owner message",
        channels: { account: "sent" },
      },
      { onConflict: "request_id", ignoreDuplicates: true },
    );
  });
  it("never records unacknowledged messages as sent", async () => {
    mocks.action.mockResolvedValue({ ok: false, error: "Store unavailable" });
    expect((await call({ data: input, context: ownerContext(true) })).ok).toBe(false);
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
