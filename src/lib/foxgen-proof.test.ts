import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchStoreProof } from "./foxgen-proof.server";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("private payment evidence", () => {
  it("uses only the fixed Store endpoint with hidden server authorization", async () => {
    const f = vi
      .fn()
      .mockResolvedValue(
        new Response(new Uint8Array([1, 2]), { headers: { "Content-Type": "image/png" } }),
      );
    vi.stubGlobal("fetch", f);
    expect((await fetchStoreProof("order-id", "test-key")).ok).toBe(true);
    expect(f.mock.calls[0]?.[0]).toBe(
      "https://foxgenofficial.lovable.app/api/public/shop/v1/payment-proof/order-id",
    );
    expect(f.mock.calls[0]?.[1].redirect).toBe("manual");
  });
  it("loads wallet evidence only from the fixed top-up endpoint", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(new Uint8Array([1, 2]), { headers: { "Content-Type": "image/png" } }),
      );
    vi.stubGlobal("fetch", fetcher);
    expect((await fetchStoreProof("topup-id", "test-key", "topup")).ok).toBe(true);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://foxgenofficial.lovable.app/api/public/shop/v1/topup-proof/topup-id",
    );
  });
  it("rejects HTML and SVG instead of rendering untrusted proof content", async () => {
    for (const mime of ["text/html", "image/svg+xml"]) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("private", { headers: { "Content-Type": mime } })),
      );
      expect((await fetchStoreProof("id", "test")).ok).toBe(false);
    }
  });
  it("does not leak Store error bodies or treat missing proof support as success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("secret detail", { status: 404 })),
    );
    const result = await fetchStoreProof("id", "test");
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("secret detail");
  });
  it("uses STORE_BASE_URL when set", async () => {
    vi.stubEnv("STORE_BASE_URL", "https://custom-store.example.com/");
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(new Uint8Array([1, 2]), { headers: { "Content-Type": "image/png" } }),
      );
    vi.stubGlobal("fetch", fetcher);
    expect((await fetchStoreProof("order-1", "test-key")).ok).toBe(true);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://custom-store.example.com/api/public/shop/v1/payment-proof/order-1",
    );
  });
});
