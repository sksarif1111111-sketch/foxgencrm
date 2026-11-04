import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";
import { esc, sendMessage, answerCallback, type InlineKeyboard } from "./telegram.server";
import { alertOwner, fulfillOrder, loadSettings, rejectOrder, syncProducts, syncProductsIfStale } from "./store.server";
import { formatMoney, round2 } from "./pricing";
import { maskProof, normalizeProof, proofHint, validatePaymentProof, PAYMENT_METHOD_LABELS, type BotPaymentMethod } from "./payment-validator";
import { settingBool, type Settings } from "./settings-keys";
import { errorMessage, logger } from "./logger";

type Admin = SupabaseClient<Database>;

const ORDER_COOLDOWN_MS = 30 * 1000;
const MAX_QTY = 100;

const StateSchema = z.object({
  step: z.enum(["idle", "qty", "pay", "proof"]).default("idle"),
  catalog: z.array(z.string()).default([]),
  productId: z.string().optional(),
  quantity: z.number().int().optional(),
  method: z.enum(["upi", "binance", "crypto"]).optional(),
  externalOrderId: z.string().optional(),
  lastOrderAt: z.number().optional(),
  lastUpdateId: z.number().optional(),
});
type BotState = z.infer<typeof StateSchema>;

const UserSchema = z.object({ id: z.number(), first_name: z.string().optional(), last_name: z.string().optional(), username: z.string().optional() });
const UpdateSchema = z.object({
  update_id: z.number(),
  message: z
    .object({ chat: z.object({ id: z.number(), type: z.string() }), from: UserSchema.optional(), text: z.string().optional() })
    .optional(),
  callback_query: z
    .object({
      id: z.string(),
      from: UserSchema,
      data: z.string().optional(),
      message: z.object({ chat: z.object({ id: z.number() }) }).optional(),
    })
    .optional(),
});
type TgUser = z.infer<typeof UserSchema>;

async function loadState(db: Admin, tgId: string): Promise<BotState> {
  const { data } = await db.from("bot_sessions").select("state").eq("telegram_id", tgId).maybeSingle();
  const parsed = StateSchema.safeParse(data?.state ?? {});
  return parsed.success ? parsed.data : StateSchema.parse({});
}
async function saveState(db: Admin, tgId: string, state: BotState) {
  await db.from("bot_sessions").upsert({ telegram_id: tgId, state, updated_at: new Date().toISOString() });
}

/** Status notes must never block the work that follows them. */
async function safeSend(chatId: number | string, text: string, keyboard?: InlineKeyboard) {
  try {
    await sendMessage(chatId, text, keyboard);
  } catch (e) {
    logger.warn("status message failed", { error: errorMessage(e) });
  }
}

const mainMenu: InlineKeyboard = [
  [{ text: "🛍 Browse Products", callback_data: "browse" }],
  [{ text: "📦 My Orders", callback_data: "my_orders" }],
];

function displayName(u: TgUser): string {
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || `Telegram ${u.id}`;
}

async function showWelcome(chatId: number, s: Settings) {
  await sendMessage(chatId, `👋 Welcome to <b>${esc(s.store_name)}</b>!\nBrowse our digital products and get them delivered instantly.`, mainMenu);
}

async function showCatalog(db: Admin, chatId: number, state: BotState, s: Settings) {
  if (settingBool(s, "bot_paused")) {
    await sendMessage(chatId, "🛠 The store is temporarily unavailable. Please check back soon.");
    return;
  }
  await syncProductsIfStale(db);
  const { data, error } = await db
    .from("products")
    .select("id, name, selling_price, stock_count")
    .eq("is_active", true)
    .order("name")
    .range(0, 39);
  if (error) throw new Error(error.message);
  if (!data?.length) {
    await sendMessage(chatId, "No products are available right now. Please check back soon.", mainMenu);
    return;
  }
  state.catalog = data.map((p) => p.id);
  state.step = "idle";
  const kb: InlineKeyboard = data.map((p, i) => {
    const out = p.stock_count !== null && p.stock_count <= 0;
    const stock = p.stock_count === null ? "" : out ? " · Unavailable" : ` · ${p.stock_count} left`;
    return [{ text: `${p.name} — ${formatMoney(p.selling_price, s.currency_symbol)}${stock}`.slice(0, 60), callback_data: `p:${i}` }];
  });
  await sendMessage(chatId, "🛍 <b>Available products</b>\nTap a product to buy:", kb);
}

async function getProduct(db: Admin, id: string) {
  const { data } = await db.from("products").select("*").eq("id", id).eq("is_active", true).maybeSingle();
  return data;
}

async function suggestAlternatives(db: Admin, chatId: number, excludeId: string, state: BotState, s: Settings) {
  const { data } = await db
    .from("products")
    .select("id, name, selling_price")
    .eq("is_active", true)
    .neq("id", excludeId)
    .or("stock_count.is.null,stock_count.gt.0")
    .order("total_sold", { ascending: false })
    .range(0, 3);
  if (!data?.length) {
    await sendMessage(chatId, "😔 This product is currently unavailable.", mainMenu);
    return;
  }
  const kb: InlineKeyboard = data.map((p) => {
    let idx = state.catalog.indexOf(p.id);
    if (idx < 0) {
      state.catalog.push(p.id);
      idx = state.catalog.length - 1;
    }
    return [{ text: `${p.name} — ${formatMoney(p.selling_price, s.currency_symbol)}`.slice(0, 60), callback_data: `p:${idx}` }];
  });
  await sendMessage(chatId, "😔 This product is currently unavailable. You might like:", kb);
}

async function selectProduct(db: Admin, chatId: number, idx: number, state: BotState, s: Settings) {
  const id = state.catalog[idx];
  const p = id ? await getProduct(db, id) : null;
  if (!p) {
    await sendMessage(chatId, "That product is no longer available.", [[{ text: "🛍 Browse Products", callback_data: "browse" }]]);
    return;
  }
  if (p.stock_count !== null && p.stock_count <= 0) {
    await suggestAlternatives(db, chatId, p.id, state, s);
    return;
  }
  state.productId = p.id;
  state.step = "qty";
  state.quantity = undefined;
  state.method = undefined;
  state.externalOrderId = undefined;
  const max = Math.min(MAX_QTY, p.stock_count ?? MAX_QTY);
  const quick = [1, 2, 3, 5].filter((n) => n <= max).map((n) => ({ text: String(n), callback_data: `q:${n}` }));
  await sendMessage(
    chatId,
    `<b>${esc(p.name)}</b>\n${p.description ? esc(p.description) + "\n" : ""}\nPrice: <b>${esc(formatMoney(p.selling_price, s.currency_symbol))}</b> each\nStock: ${p.stock_count ?? "Available"}\n\nHow many do you want? Tap or type a number (max ${max}).`,
    [quick, [{ text: "⬅️ Back", callback_data: "browse" }]],
  );
}

async function setQuantity(db: Admin, chatId: number, qty: number, state: BotState, s: Settings) {
  const p = state.productId ? await getProduct(db, state.productId) : null;
  if (!p) {
    state.step = "idle";
    await sendMessage(chatId, "Please choose a product first.", mainMenu);
    return;
  }
  const max = Math.min(MAX_QTY, p.stock_count ?? MAX_QTY);
  if (!Number.isInteger(qty) || qty < 1 || qty > max) {
    await sendMessage(chatId, `Please enter a quantity between 1 and ${max}.`);
    return;
  }
  state.quantity = qty;
  state.step = "pay";
  const total = round2(Number(p.selling_price) * qty);
  const methods: { m: BotPaymentMethod; ok: boolean }[] = [
    { m: "upi", ok: !!s.upi_id },
    { m: "binance", ok: !!s.binance_pay_id },
    { m: "crypto", ok: !!s.crypto_wallet },
  ];
  const available = methods.filter((x) => x.ok);
  if (!available.length) {
    await sendMessage(chatId, "Payments are not configured yet. Please contact support.");
    return;
  }
  await sendMessage(
    chatId,
    `🧾 <b>${esc(p.name)}</b> × ${qty}\nTotal = ${esc(formatMoney(p.selling_price, s.currency_symbol))} × ${qty} = <b>${esc(formatMoney(total, s.currency_symbol))}</b>\n\nChoose payment method:`,
    [available.map((x) => ({ text: PAYMENT_METHOD_LABELS[x.m], callback_data: `m:${x.m}` })), [{ text: "❌ Cancel", callback_data: "cancel" }]],
  );
}

async function chooseMethod(db: Admin, chatId: number, tgId: string, method: BotPaymentMethod, state: BotState, s: Settings) {
  const p = state.productId ? await getProduct(db, state.productId) : null;
  if (!p || !state.quantity) {
    state.step = "idle";
    await sendMessage(chatId, "Your cart expired. Please start again.", mainMenu);
    return;
  }
  state.method = method;
  state.step = "proof";
  // One external id per checkout — reused if the customer resubmits (idempotency).
  state.externalOrderId = state.externalOrderId ?? `tg-${tgId}-${Date.now()}`;
  const total = formatMoney(round2(Number(p.selling_price) * state.quantity), s.currency_symbol);
  const where =
    method === "upi"
      ? `UPI ID: <code>${esc(s.upi_id)}</code>`
      : method === "binance"
        ? `Binance Pay ID: <code>${esc(s.binance_pay_id)}</code>`
        : `Wallet (${esc(s.crypto_network)}): <code>${esc(s.crypto_wallet)}</code>`;
  const what = method === "upi" ? "UPI transaction ID" : method === "binance" ? "Binance order ID" : "transaction hash";
  await sendMessage(
    chatId,
    `💳 Pay <b>${esc(total)}</b> via ${PAYMENT_METHOD_LABELS[method]}\n${where}\n\nAfter paying, send your <b>${what}</b> here.\n<i>${esc(proofHint(method))}</i>`,
    [[{ text: "❌ Cancel", callback_data: "cancel" }]],
  );
}

async function submitProof(db: Admin, chatId: number, user: TgUser, text: string, state: BotState, s: Settings) {
  const method = state.method;
  if (!method || !state.productId || !state.quantity || !state.externalOrderId) {
    state.step = "idle";
    await sendMessage(chatId, "Your cart expired. Please start again.", mainMenu);
    return;
  }
  const proof = normalizeProof(method, text);
  if (!validatePaymentProof(method, proof)) {
    logger.warn("invalid payment proof", { method, telegram_id: user.id, proof: maskProof(proof) });
    await sendMessage(chatId, `❌ Invalid format. ${esc(proofHint(method))} Please check and resend.`);
    return;
  }
  if (settingBool(s, "bot_paused")) {
    await sendMessage(chatId, "🛠 The store is temporarily unavailable. Please contact support about your payment.");
    return;
  }
  if (state.lastOrderAt && Date.now() - state.lastOrderAt < ORDER_COOLDOWN_MS) {
    await sendMessage(chatId, "⏳ Please wait 30 seconds between orders.");
    return;
  }

  // Re-check stock right before ordering.
  try {
    await syncProducts(db);
  } catch (e) {
    logger.warn("stock re-check failed", { error: errorMessage(e) });
  }
  const p = await getProduct(db, state.productId);
  if (!p || (p.stock_count !== null && p.stock_count < state.quantity)) {
    state.step = "idle";
    await suggestAlternatives(db, chatId, state.productId, state, s);
    return;
  }

  const tgId = String(user.id);
  const { data: customer, error: custErr } = await db
    .from("customers")
    .upsert({ telegram_id: tgId, telegram_username: user.username ?? null, name: displayName(user) }, { onConflict: "telegram_id" })
    .select("id")
    .single();
  if (custErr || !customer) throw new Error(custErr?.message ?? "customer upsert failed");

  const { data: order, error: orderErr } = await db
    .from("orders")
    .insert({
      external_order_id: state.externalOrderId,
      product_id: p.id,
      product_name: p.name,
      quantity: state.quantity,
      wholesale_cost: p.wholesale_price,
      selling_price: p.selling_price,
      customer_id: customer.id,
      payment_method: method,
      payment_proof: proof,
      source: "telegram_bot",
      status: "pending",
      telegram_chat_id: String(chatId),
    })
    .select("id, external_order_id")
    .single();
  if (orderErr) {
    if (orderErr.code === "23505") {
      await sendMessage(chatId, "✅ We already received this order. You'll get your accounts shortly.");
      return;
    }
    throw new Error(orderErr.message);
  }

  const qty = state.quantity;
  const total = formatMoney(round2(Number(p.selling_price) * qty), s.currency_symbol);
  state.lastOrderAt = Date.now();
  state.step = "idle";
  state.externalOrderId = undefined;
  state.productId = undefined;
  state.quantity = undefined;
  state.method = undefined;
  await saveState(db, tgId, state);

  if (settingBool(s, "auto_deliver")) {
    await safeSend(chatId, "⏳ Payment proof received. Processing your order…");
    await fulfillOrder(db, order.id);
  } else {
    await safeSend(chatId, "⏳ Payment proof received! We're verifying your payment — your accounts will arrive here shortly.");
    await alertOwner(
      db,
      `🛒 <b>New order to verify</b>\n${esc(p.name)} × ${qty} — ${esc(total)}\nCustomer: ${esc(displayName(user))}${user.username ? " @" + esc(user.username) : ""}\nMethod: ${PAYMENT_METHOD_LABELS[method]}\nProof: <code>${esc(proof)}</code>\nRef: <code>${esc(order.external_order_id)}</code>`,
      s,
      [[{ text: "✅ Approve & deliver", callback_data: `ok:${order.id}` }, { text: "❌ Reject", callback_data: `no:${order.id}` }]],
    );
  }
}

async function showMyOrders(db: Admin, chatId: number, tgId: string, s: Settings) {
  const { data: cust } = await db.from("customers").select("id").eq("telegram_id", tgId).maybeSingle();
  if (!cust) {
    await sendMessage(chatId, "You have no orders yet.", mainMenu);
    return;
  }
  const { data } = await db
    .from("orders")
    .select("product_name, quantity, total_amount, status, created_at, external_order_id")
    .eq("customer_id", cust.id)
    .order("created_at", { ascending: false })
    .range(0, 4);
  if (!data?.length) {
    await sendMessage(chatId, "You have no orders yet.", mainMenu);
    return;
  }
  const icon = (st: string) => (st === "completed" ? "✅" : st === "pending" ? "⏳" : "❌");
  const lines = data.map(
    (o) => `${icon(o.status)} ${esc(o.product_name)} × ${o.quantity} — ${esc(formatMoney(o.total_amount, s.currency_symbol))}\n   ${new Date(o.created_at).toISOString().slice(0, 10)} · <code>${esc(o.external_order_id)}</code>`,
  );
  await sendMessage(chatId, `📦 <b>Your recent orders</b>\n\n${lines.join("\n\n")}`, mainMenu);
}

async function handleOwnerDecision(db: Admin, chatId: number, user: TgUser, data: string, s: Settings) {
  if (!s.owner_telegram_chat_id || String(user.id) !== s.owner_telegram_chat_id) {
    await sendMessage(chatId, "Only the store owner can do that.");
    return;
  }
  const [kind, orderId] = data.split(":");
  if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) return;
  if (kind === "ok") {
    await safeSend(chatId, "⏳ Delivering…");
    const r = await fulfillOrder(db, orderId);
    await safeSend(chatId, r.ok ? `✅ Delivered ${r.accounts.length} account(s).` : `❗ Not delivered: ${esc(r.reason)}`);
  } else {
    const ok = await rejectOrder(db, orderId, "Payment rejected by owner");
    await safeSend(chatId, ok ? "Order rejected and customer notified." : "Order was already handled.");
  }
}

export async function handleUpdate(db: Admin, raw: unknown): Promise<void> {
  const parsed = UpdateSchema.safeParse(raw);
  if (!parsed.success) return;
  const update = parsed.data;
  const cb = update.callback_query;
  const msg = update.message;
  const user = cb?.from ?? msg?.from;
  const chatId = cb?.message?.chat.id ?? msg?.chat.id;
  if (!user || chatId === undefined) return;
  if (msg && msg.chat.type !== "private") return;

  const tgId = String(user.id);
  const state = await loadState(db, tgId);
  if (state.lastUpdateId !== undefined && update.update_id <= state.lastUpdateId) return; // Telegram retry
  state.lastUpdateId = update.update_id;
  await saveState(db, tgId, state);

  const s = await loadSettings(db);

  try {
    if (cb) {
      await answerCallback(cb.id);
      const data = cb.data ?? "";
      if (data === "browse") await showCatalog(db, chatId, state, s);
      else if (data === "my_orders") await showMyOrders(db, chatId, tgId, s);
      else if (data === "cancel") {
        state.step = "idle";
        state.externalOrderId = undefined;
        await sendMessage(chatId, "Cancelled.", mainMenu);
      } else if (data.startsWith("p:")) await selectProduct(db, chatId, Number(data.slice(2)), state, s);
      else if (data.startsWith("q:")) await setQuantity(db, chatId, Number(data.slice(2)), state, s);
      else if (data.startsWith("m:")) {
        const m = data.slice(2);
        if (m === "upi" || m === "binance" || m === "crypto") await chooseMethod(db, chatId, tgId, m, state, s);
      } else if (data.startsWith("ok:") || data.startsWith("no:")) await handleOwnerDecision(db, chatId, user, data, s);
    } else if (msg?.text) {
      const text = msg.text.trim();
      if (text === "/start" || text.startsWith("/start ")) {
        state.step = "idle";
        await showWelcome(chatId, s);
      } else if (text === "/products" || text === "/shop") await showCatalog(db, chatId, state, s);
      else if (text === "/orders") await showMyOrders(db, chatId, tgId, s);
      else if (text === "/myid") await sendMessage(chatId, `Your chat ID: <code>${chatId}</code>`);
      else if (text === "/cancel") {
        state.step = "idle";
        state.externalOrderId = undefined;
        await sendMessage(chatId, "Cancelled.", mainMenu);
      } else if (state.step === "qty") await setQuantity(db, chatId, Number(text), state, s);
      else if (state.step === "proof") await submitProof(db, chatId, user, text, state, s);
      else await sendMessage(chatId, "Use the buttons below to shop 👇", mainMenu);
    }
  } catch (e) {
    logger.error("bot handler failed", { telegram_id: tgId, error: errorMessage(e) });
    try {
      await sendMessage(chatId, "Something went wrong. Please try /start again.");
    } catch {
      /* ignore */
    }
  }
  // submitProof saves its own state before long work; re-save the latest state.
  const fresh = await loadState(db, tgId);
  const merged: BotState = { ...state, lastOrderAt: Math.max(state.lastOrderAt ?? 0, fresh.lastOrderAt ?? 0) || undefined };
  await saveState(db, tgId, merged);
}
