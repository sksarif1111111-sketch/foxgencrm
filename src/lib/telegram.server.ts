import { createHash } from "crypto";
import { logger } from "./logger";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

export interface InlineButton {
  text: string;
  callback_data: string;
}
export type InlineKeyboard = InlineButton[][];

function creds() {
  const lovable = process.env["LOVABLE_API_KEY"];
  const tg = process.env["TELEGRAM_API_KEY"];
  if (!lovable) throw new Error("LOVABLE_API_KEY is not configured");
  if (!tg) throw new Error("TELEGRAM_API_KEY is not configured");
  return { lovable, tg };
}

export async function tgCall<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const { lovable, tg } = creds();
  const res = await fetch(`${GATEWAY_URL}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovable}`,
      "X-Connection-Api-Key": tg,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    logger.error("telegram call failed", { method, status: res.status, body: text.slice(0, 300) });
    throw new Error(`Telegram ${method} failed [${res.status}]: ${text.slice(0, 300)}`);
  }
  const json = JSON.parse(text) as { ok: boolean; result: T; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method} error: ${json.description ?? "unknown"}`);
  return json.result;
}

/** Escape text for Telegram HTML parse mode. */
export function esc(s: string | number | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function sendMessage(chatId: string | number, text: string, keyboard?: InlineKeyboard) {
  // Telegram limit: 4096 chars per message.
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += 4000) chunks.push(text.slice(i, i + 4000));
  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    await tgCall("sendMessage", {
      chat_id: chatId,
      text: chunks[i],
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(isLast && keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    });
  }
}

export async function answerCallback(id: string, text?: string) {
  try {
    await tgCall("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
  } catch {
    /* non-critical */
  }
}

export function deriveWebhookSecret(): string {
  const { tg } = creds();
  return createHash("sha256").update(`telegram-webhook:${tg}`).digest("base64url");
}
