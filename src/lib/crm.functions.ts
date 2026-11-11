import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const PROJECT_ID = "89ef405a-3b92-4a46-a34f-3186c0336acf";

/** Verifies the caller is the store owner, then returns the privileged client. */
async function ownerAdmin(ctx: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data: isAdmin } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const fetchBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ force: z.boolean().default(false) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const db = await ownerAdmin(context);
    const { getBalance } = await import("./store.server");
    return getBalance(db, data.force);
  });

export const syncCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await ownerAdmin(context);
    const { syncProducts } = await import("./store.server");
    try {
      const r = await syncProducts(db);
      return { ok: true as const, count: r.count, shopPush: r.shopPush, error: null };
    } catch (e) {
      return { ok: false as const, count: 0, error: e instanceof Error ? e.message : String(e) };
    }
  });

export const approveOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await ownerAdmin(context);
    const { fulfillOrder } = await import("./store.server");
    const r = await fulfillOrder(db, data.orderId);
    return r.ok ? { ok: true as const, count: r.accounts.length, error: null } : { ok: false as const, count: 0, error: r.reason };
  });

export const declineOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid(), reason: z.string().max(300).default("Payment rejected by owner") }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await ownerAdmin(context);
    const { rejectOrder } = await import("./store.server");
    return { ok: await rejectOrder(db, data.orderId, data.reason) };
  });

/** Re-sends delivered accounts to the customer (dispute handling). */
export const resendAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await ownerAdmin(context);
    const { data: o } = await db.from("orders").select("*").eq("id", data.orderId).maybeSingle();
    if (!o?.telegram_chat_id || !Array.isArray(o.delivered_accounts)) return { ok: false, error: "No Telegram chat or accounts on this order" };
    const { sendMessage } = await import("./telegram.server");
    const { formatAccounts } = await import("./store.server");
    await sendMessage(o.telegram_chat_id, `📦 Your accounts for <b>${o.product_name}</b>:\n${formatAccounts(o.delivered_accounts as string[])}`);
    return { ok: true, error: null };
  });

export const botStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ownerAdmin(context);
    const { tgCall } = await import("./telegram.server");
    try {
      const [me, hook] = await Promise.all([
        tgCall<{ username: string; first_name: string }>("getMe", {}),
        tgCall<{ url: string; pending_update_count: number; last_error_message?: string; last_error_date?: number }>("getWebhookInfo", {}),
      ]);
      return { ok: true as const, username: me.username, name: me.first_name, webhookUrl: hook.url, pending: hook.pending_update_count, lastError: hook.last_error_message ?? null, error: null };
    } catch (e) {
      return { ok: false as const, username: null, name: null, webhookUrl: null, pending: 0, lastError: null, error: e instanceof Error ? e.message : String(e) };
    }
  });

export const registerWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ target: z.enum(["preview", "live"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await ownerAdmin(context);
    const { tgCall, deriveWebhookSecret } = await import("./telegram.server");
    const host = data.target === "live" ? `project--${PROJECT_ID}.lovable.app` : `project--${PROJECT_ID}-dev.lovable.app`;
    const url = `https://${host}/api/public/telegram/webhook`;
    try {
      await tgCall("setWebhook", { url, secret_token: deriveWebhookSecret(), allowed_updates: ["message", "callback_query"], drop_pending_updates: false });
      await tgCall("setMyCommands", {
        commands: [
          { command: "start", description: "Open the store" },
          { command: "products", description: "Browse products" },
          { command: "orders", description: "My recent orders" },
          { command: "cancel", description: "Cancel current checkout" },
          { command: "myid", description: "Show my chat ID" },
        ],
      });
      return { ok: true as const, url, error: null };
    } catch (e) {
      return { ok: false as const, url, error: e instanceof Error ? e.message : String(e) };
    }
  });

export const sendOwnerTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await ownerAdmin(context);
    const { loadSettings } = await import("./store.server");
    const s = await loadSettings(db);
    if (!s.owner_telegram_chat_id) return { ok: false, error: "Set your Telegram chat ID first" };
    const { sendMessage } = await import("./telegram.server");
    try {
      await sendMessage(s.owner_telegram_chat_id, "✅ Owner alerts are working. You'll get low-balance and new-order alerts here.");
      return { ok: true, error: null };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
