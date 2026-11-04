import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { ResellerAPI, ResellerError } from "./reseller-api.server";
import { isInsufficientBalance, isOutOfStock } from "./reseller-normalize";
import { computeSellingPrice, effectiveMarkup, formatMoney } from "./pricing";
import { settingNumber, withDefaults, type Settings } from "./settings-keys";
import { esc, sendMessage } from "./telegram.server";
import { errorMessage, logger } from "./logger";

type Admin = SupabaseClient<Database>;

export const PRODUCT_CACHE_TTL = 5 * 60 * 1000;
export const BALANCE_CACHE_TTL = 60 * 60 * 1000;

export async function loadSettings(db: Admin): Promise<Settings> {
  const { data, error } = await db.from("settings").select("key, value");
  if (error) throw new Error(error.message);
  return withDefaults(data);
}

async function getMeta(db: Admin, key: string): Promise<string | null> {
  const { data } = await db.from("settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}
async function setMeta(db: Admin, key: string, value: string) {
  await db.from("settings").upsert({ key, value, updated_at: new Date().toISOString() });
}

/** Pull catalog from supplier and upsert, keeping per-product markup overrides. */
export async function syncProducts(db: Admin): Promise<{ count: number }> {
  const api = new ResellerAPI(db);
  const [products, settings, existingRes] = await Promise.all([
    api.getProducts(),
    loadSettings(db),
    db.from("products").select("id, markup_percentage"),
  ]);
  if (existingRes.error) throw new Error(existingRes.error.message);
  const overrides = new Map((existingRes.data ?? []).map((p) => [p.id, p.markup_percentage]));
  const defMarkup = settingNumber(settings, "default_markup_percentage");
  const now = new Date().toISOString();
  const rows = products.map((p) => {
    const override = overrides.get(p.id) ?? null;
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      wholesale_price: p.wholesale_price,
      selling_price: computeSellingPrice(p.wholesale_price, effectiveMarkup(override, defMarkup)),
      markup_percentage: override,
      stock_count: p.stock,
      is_active: true,
      last_synced: now,
    };
  });
  if (rows.length) {
    const { error } = await db.from("products").upsert(rows);
    if (error) throw new Error(error.message);
  }
  const ids = new Set(rows.map((r) => r.id));
  const stale = (existingRes.data ?? []).filter((p) => !ids.has(p.id)).map((p) => p.id);
  if (stale.length) await db.from("products").update({ is_active: false }).in("id", stale);
  await setMeta(db, "products_synced_at", now);
  return { count: rows.length };
}

/** Sync only when the cache is older than 5 minutes; never throws. */
export async function syncProductsIfStale(db: Admin): Promise<void> {
  const at = await getMeta(db, "products_synced_at");
  if (at && Date.now() - new Date(at).getTime() < PRODUCT_CACHE_TTL) return;
  try {
    await syncProducts(db);
  } catch (e) {
    logger.warn("product sync failed, using cache", { error: errorMessage(e) });
  }
}

export interface BalanceInfo {
  balance: number | null;
  checkedAt: string | null;
  error: string | null;
}

/** Balance cached for 1 hour unless forced. */
export async function getBalance(db: Admin, force = false): Promise<BalanceInfo> {
  const [cached, at] = await Promise.all([getMeta(db, "cached_balance"), getMeta(db, "cached_balance_at")]);
  if (!force && cached !== null && at && Date.now() - new Date(at).getTime() < BALANCE_CACHE_TTL) {
    return { balance: Number(cached), checkedAt: at, error: null };
  }
  try {
    const balance = await new ResellerAPI(db).getBalance();
    const now = new Date().toISOString();
    await Promise.all([setMeta(db, "cached_balance", String(balance)), setMeta(db, "cached_balance_at", now)]);
    await maybeAlertBalance(db, balance);
    return { balance, checkedAt: now, error: null };
  } catch (e) {
    return { balance: cached !== null ? Number(cached) : null, checkedAt: at, error: errorMessage(e) };
  }
}

async function maybeAlertBalance(db: Admin, balance: number) {
  const s = await loadSettings(db);
  const low = settingNumber(s, "low_balance_threshold");
  const crit = settingNumber(s, "critical_balance_threshold");
  if (balance >= low) return;
  const level = balance < crit ? "critical" : "low";
  const lastKey = `last_balance_alert_${level}`;
  const last = await getMeta(db, lastKey);
  if (last && Date.now() - new Date(last).getTime() < 6 * 60 * 60 * 1000) return;
  await alertOwner(
    db,
    `${level === "critical" ? "🚨 CRITICAL" : "⚠️ Low"} supplier balance: <b>${esc(formatMoney(balance, s.currency_symbol))}</b>. Please top up.`,
    s,
  );
  await setMeta(db, lastKey, new Date().toISOString());
}

export async function alertOwner(db: Admin, html: string, s?: Settings, keyboard?: Parameters<typeof sendMessage>[2]) {
  const settings = s ?? (await loadSettings(db));
  const chat = settings.owner_telegram_chat_id;
  if (!chat) {
    logger.warn("owner alert skipped: no owner chat id", {});
    return;
  }
  try {
    await sendMessage(chat, html, keyboard);
  } catch (e) {
    logger.error("owner alert failed", { error: errorMessage(e) });
  }
}

export function formatAccounts(accounts: string[]): string {
  return accounts.map((a, i) => `${i + 1}. <code>${esc(a)}</code>`).join("\n");
}

export type FulfillResult =
  | { ok: true; accounts: string[] }
  | { ok: false; reason: string; customerMessage: string };

/**
 * Places the supplier order for a pending order row, saves accounts and
 * messages the customer. A DB claim makes it safe to call twice.
 */
export async function fulfillOrder(db: Admin, orderId: string): Promise<FulfillResult> {
  const { data: claimed, error: claimErr } = await db
    .from("orders")
    .update({ processing_started_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "pending")
    .is("processing_started_at", null)
    .select("*")
    .maybeSingle();
  if (claimErr) throw new Error(claimErr.message);
  if (!claimed) return { ok: false, reason: "Order is already being processed or not pending", customerMessage: "" };

  const settings = await loadSettings(db);
  const sym = settings.currency_symbol;

  try {
    const result = await new ResellerAPI(db).createOrderSafe({
      product_id: claimed.product_id,
      quantity: claimed.quantity,
      external_order_id: claimed.external_order_id,
    });
    const update: Database["public"]["Tables"]["orders"]["Update"] = {
      status: "completed",
      delivered_accounts: result.accounts,
      failure_reason: null,
    };
    if (result.unitCost !== null && result.unitCost >= 0) update.wholesale_cost = Math.round(result.unitCost * 100) / 100;
    const { error } = await db.from("orders").update(update).eq("id", orderId);
    if (error) logger.error("order save after delivery failed", { order_id: orderId, error: error.message });

    if (claimed.telegram_chat_id) {
      try {
        await sendMessage(
          claimed.telegram_chat_id,
          `✅ <b>Order completed!</b>\n${esc(claimed.product_name)} × ${claimed.quantity} — ${esc(formatMoney(Number(claimed.selling_price) * claimed.quantity, sym))}\n\n<b>Your accounts:</b>\n${formatAccounts(result.accounts)}\n\nOrder ref: <code>${esc(claimed.external_order_id)}</code>`,
          [[{ text: "🛍 Shop again", callback_data: "browse" }]],
        );
      } catch (e) {
        logger.error("account delivery message failed", { order_id: orderId, error: errorMessage(e) });
        await alertOwner(db, `⚠️ Order <code>${esc(claimed.external_order_id)}</code> was fulfilled but the accounts message failed. Use "Resend accounts" in the CRM.`, settings);
      }
    }
    // Refresh balance in background-ish (cached path handles alerting).
    void getBalance(db, true).catch(() => undefined);
    return { ok: true, accounts: result.accounts };
  } catch (e) {
    const msg = errorMessage(e);
    let customerMessage = "⚠️ We couldn't complete your order right now. Our team has been notified and will contact you shortly.";
    if (isInsufficientBalance(msg)) {
      await db.from("settings").upsert({ key: "bot_paused", value: "true", updated_at: new Date().toISOString() });
      await alertOwner(db, `🚨 <b>Supplier balance insufficient.</b> Bot sales are now paused.\nOrder <code>${esc(claimed.external_order_id)}</code> could not be delivered.`, settings);
      customerMessage = "⚠️ This store is temporarily unavailable. Your payment is recorded and our team will contact you.";
    } else if (isOutOfStock(msg)) {
      customerMessage = "😔 Sorry, this product just sold out. Our team will contact you about your payment. Tap below to see other products.";
    } else {
      await alertOwner(db, `❗ Order <code>${esc(claimed.external_order_id)}</code> failed: ${esc(msg)}`, settings);
    }
    const timeout = e instanceof ResellerError && e.code === "TIMEOUT";
    await db
      .from("orders")
      .update(
        timeout
          ? { failure_reason: `Timed out: ${msg}`, processing_started_at: null }
          : { status: "failed", failure_reason: msg.slice(0, 500) },
      )
      .eq("id", orderId);
    if (claimed.telegram_chat_id) {
      try {
        await sendMessage(claimed.telegram_chat_id, customerMessage, [[{ text: "🛍 Browse products", callback_data: "browse" }]]);
      } catch {
        /* ignore */
      }
    }
    return { ok: false, reason: msg, customerMessage };
  }
}

/** Owner rejected the payment proof. */
export async function rejectOrder(db: Admin, orderId: string, reason: string): Promise<boolean> {
  const { data } = await db
    .from("orders")
    .update({ status: "failed", failure_reason: reason.slice(0, 500) })
    .eq("id", orderId)
    .eq("status", "pending")
    .is("processing_started_at", null)
    .select("telegram_chat_id, external_order_id")
    .maybeSingle();
  if (!data) return false;
  if (data.telegram_chat_id) {
    try {
      await sendMessage(
        data.telegram_chat_id,
        `❌ We couldn't verify your payment for order <code>${esc(data.external_order_id)}</code>.\nIf you believe this is a mistake, please contact support.`,
        [[{ text: "🛍 Browse products", callback_data: "browse" }]],
      );
    } catch {
      /* ignore */
    }
  }
  return true;
}
