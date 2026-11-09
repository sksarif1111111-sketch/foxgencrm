import { describe, expect, it, vi } from "vitest";
import { handleStoreSync, hashStoreKey, STORE_ENTITIES, SyncSchema } from "./store-sync";

const key = `fgcrm_${"a".repeat(64)}`;
const order = { entity: "orders", external_id: "order-100", name: "Digital product", status: "paid", amount: 24, currency: "USD", updated_at: "2026-11-09T21:00:00Z", data: { quantity: 2 } };
function request(body: unknown, credential = key) {
  return new Request("https://crm.example/api/public/store/sync", { method: "POST", headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

describe("tracking-only store sync", () => {
  it("imports all requested store information categories", () => {
    for (const entity of STORE_ENTITIES) expect(SyncSchema.parse({ records: [{ ...order, entity }] }).records[0]?.entity).toBe(entity);
  });
  it("rejects unauthenticated writes before ingestion", async () => {
    const ingest = vi.fn();
    const authorize = vi.fn().mockResolvedValue(null);
    expect((await handleStoreSync(request({ records: [order] }, "wrong"), { authorize, ingest })).status).toBe(401);
    expect(ingest).not.toHaveBeenCalled();
    expect(authorize).not.toHaveBeenCalled();
  });
  it("rejects revoked or disabled keys", async () => {
    const ingest = vi.fn();
    expect((await handleStoreSync(request({ records: [order] }), { authorize: async () => null, ingest })).status).toBe(401);
    expect(ingest).not.toHaveBeenCalled();
  });
  it("stores records without initiating supplier delivery", async () => {
    const ingest = vi.fn().mockResolvedValue(1);
    const authorize = vi.fn().mockResolvedValue("foxgen");
    const response = await handleStoreSync(request({ records: [order] }), { authorize, ingest });
    expect(await response.json()).toEqual({ ok: true, received: 1, changed: 1 });
    expect(authorize).toHaveBeenCalledWith(await hashStoreKey(key));
    expect(ingest).toHaveBeenCalledWith("foxgen", { records: [order] });
  });
  it("rejects duplicate entities in a batch", () => {
    expect(SyncSchema.safeParse({ records: [order, order] }).success).toBe(false);
  });
  it("requires a source timestamp to prevent stale overwrites", () => {
    expect(SyncSchema.safeParse({ records: [{ ...order, updated_at: "" }] }).success).toBe(false);
  });
  it("bounds batches to 100 records", () => {
    expect(SyncSchema.safeParse({ records: Array.from({ length: 101 }, (_, i) => ({ ...order, external_id: `${i}` })) }).success).toBe(false);
  });
});