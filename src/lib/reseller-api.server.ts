import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { logger, errorMessage } from "./logger";
import { assertOk, isNotFound, parseAccounts, parseBalance, parseProducts, parseUnitCost } from "./reseller-normalize";
import type { SupplierProduct } from "./reseller-normalize";

const DEFAULT_BASE = "https://eygkdpfjrjwwbiackfpr.supabase.co/functions/v1/reseller-api";
const TIMEOUT_MS = 20000;

export class ResellerError extends Error {
  constructor(
    message: string,
    public code: "TIMEOUT" | "HTTP" | "API" | "CONFIG",
    public statusCode: number | null = null,
  ) {
    super(message);
  }
}

type Admin = SupabaseClient<Database>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ResellerAPI {
  constructor(private admin: Admin | null) {}

  private async log(action: string, status: number | null, ok: boolean, ms: number, extOrder?: string, error?: string) {
    if (!this.admin) return;
    try {
      await this.admin.from("api_calls_log").insert({
        action,
        status_code: status,
        success: ok,
        duration_ms: ms,
        external_order_id: extOrder ?? null,
        error: error ? error.slice(0, 500) : null,
      });
    } catch (e) {
      logger.warn("api log insert failed", { error: errorMessage(e) });
    }
  }

  private async request(action: string, query: Record<string, string> = {}, init?: { method: "GET" | "POST"; body?: unknown }, extOrder?: string): Promise<unknown> {
    const key = process.env["RESELLER_API_KEY"];
    if (!key) throw new ResellerError("Supplier API key is not configured", "CONFIG");
    const base = process.env["RESELLER_API_URL"] || DEFAULT_BASE;
    const params = new URLSearchParams({ action, ...query });
    const started = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let status: number | null = null;
    try {
      const res = await fetch(`${base}?${params.toString()}`, {
        method: init?.method ?? "GET",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: init?.body ? JSON.stringify(init.body) : null,
        signal: ctrl.signal,
      });
      status = res.status;
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { error: text.slice(0, 200) };
      }
      if (!res.ok) {
        const msg =
          (json && typeof json === "object" && "error" in json && typeof (json as { error: unknown }).error === "string"
            ? (json as { error: string }).error
            : res.statusText) || `HTTP ${res.status}`;
        throw new ResellerError(msg, "HTTP", res.status);
      }
      try {
        assertOk(json);
      } catch (e) {
        throw new ResellerError(errorMessage(e), "API", res.status);
      }
      await this.log(action, status, true, Date.now() - started, extOrder);
      return json;
    } catch (e) {
      const err =
        e instanceof ResellerError
          ? e
          : (e as { name?: string })?.name === "AbortError"
            ? new ResellerError("Supplier API timed out", "TIMEOUT")
            : new ResellerError(errorMessage(e), "TIMEOUT");
      await this.log(action, status, false, Date.now() - started, extOrder, err.message);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async getProducts(): Promise<SupplierProduct[]> {
    return parseProducts(await this.request("products"));
  }

  async getBalance(): Promise<number> {
    return parseBalance(await this.request("balance"));
  }

  async getOrderStatus(externalOrderId: string): Promise<{ accounts: string[] | null; raw: unknown } | null> {
    try {
      const raw = await this.request("order_status", { external_order_id: externalOrderId }, { method: "GET" }, externalOrderId);
      return { accounts: parseAccounts(raw), raw };
    } catch (e) {
      if (e instanceof ResellerError && (e.statusCode === 404 || isNotFound(e.message))) return null;
      throw e;
    }
  }

  /**
   * Idempotent order creation: on timeout / duplicate, check order_status
   * before retrying (max 3 attempts, 1s/2s/4s backoff).
   */
  async createOrderSafe(data: { product_id: string; quantity: number; external_order_id: string }): Promise<{ accounts: string[]; unitCost: number | null }> {
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const raw = await this.request("order", {}, { method: "POST", body: data }, data.external_order_id);
        const accounts = parseAccounts(raw);
        if (accounts && accounts.length) return { accounts, unitCost: parseUnitCost(raw, data.quantity) };
        // Order accepted but accounts not inline — check status.
        await sleep(2000);
        const st = await this.getOrderStatus(data.external_order_id);
        if (st?.accounts?.length) return { accounts: st.accounts, unitCost: parseUnitCost(st.raw, data.quantity) };
        throw new ResellerError("Order placed but no accounts returned yet", "API");
      } catch (e) {
        lastErr = e;
        const recoverable = e instanceof ResellerError && (e.code === "TIMEOUT" || e.statusCode === 409 || (e.statusCode ?? 0) >= 500);
        if (!recoverable) throw e;
        await sleep(2000);
        try {
          const st = await this.getOrderStatus(data.external_order_id);
          if (st?.accounts?.length) return { accounts: st.accounts, unitCost: parseUnitCost(st.raw, data.quantity) };
        } catch (statusErr) {
          logger.warn("order_status check failed", { external_order_id: data.external_order_id, error: errorMessage(statusErr) });
        }
        if (attempt < 2) await sleep(1000 * Math.pow(2, attempt));
      }
    }
    throw lastErr instanceof Error ? lastErr : new ResellerError("Order failed", "API");
  }
}
