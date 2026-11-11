import { afterEach, describe, expect, it, vi } from "vitest";
import { catalogueAction } from "./foxgen-catalogue";
import { pushFoxgenCatalogue } from "./foxgen-catalogue.server";
import { syncProducts } from "./store.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

vi.mock("./reseller-api.server", () => ({
  ResellerAPI: class { getProducts() { return Promise.resolve([{ id: "p-1", name: "License", description: "One seat", wholesale_price: 10, stock: 3, image_url: "https://example.test/product.jpg" }]); } },
  ResellerError: class extends Error {},
}));
vi.mock("./telegram.server", () => ({ esc: (s: string) => s, sendMessage: vi.fn() }));

const product = { id: "p-1", name: "License", description: "One seat", selling_price: 12, stock_count: 3 };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("one-way Store catalogue push", () => {
  it("maps the selling price and stock exactly and sends no publication flag", () => {
    expect(catalogueAction(product)).toEqual({ action: "upsert_product", reseller_product_id: "p-1", name: "License", short_description: "One seat", price_usdt: 12, stock_quantity: 3, image_url: null });
    expect(catalogueAction({ ...product, image_url: "https://example.test/product.jpg" }).image_url).toBe("https://example.test/product.jpg");
  });
  it("attempts every product once with the existing action key, continuing after rejection", async () => {
    vi.stubEnv("SHOP_CRM_ACTION_KEY", "test-fixture");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("rejected", { status: 422 })).mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    expect(await pushFoxgenCatalogue([product, { ...product, id: "p-2" }])).toEqual({ pushed: 1, failed: 1 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://foxgenofficial.lovable.app/api/public/shop/v1/actions");
    expect(fetcher.mock.calls[0]?.[1].headers.Authorization).toBe("Bearer test-fixture");
  });
  it("keeps a completed native sync successful when every Store push fails", async () => {
    vi.stubEnv("SHOP_CRM_ACTION_KEY", "test-fixture");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const writes: string[] = [];
    const db = { from: (table: string) => ({
      select: () => Promise.resolve({ data: [], error: null }),
      upsert: (rows: unknown) => { writes.push(table); if (table === "products") expect(rows).toEqual([expect.objectContaining({ id: "p-1", selling_price: 12, stock_count: 3 })]); return Promise.resolve({ error: null }); },
    }) } as unknown as SupabaseClient<Database>;
    const fetcher = vi.fn().mockImplementation(() => {
      expect(writes).toEqual(["products", "settings"]);
      return Promise.reject(new Error("timeout"));
    });
    vi.stubGlobal("fetch", fetcher);
    expect(await syncProducts(db)).toEqual({ count: 1, shopPush: { pushed: 0, failed: 1 } });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0]?.[1].body)).toEqual({ ...catalogueAction(product), image_url: "https://example.test/product.jpg" });
  });
});