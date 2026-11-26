import type { CustomerAction, FoxgenAction } from "./foxgen-orders";
import type { catalogueAction } from "./foxgen-catalogue";
import { getStoreBaseUrl } from "./store-url.server";

export type ActionResult =
  | {
      ok: true;
      channels?: Record<string, string>;
      delivery?: Record<string, string>;
      balance_usd?: number;
    }
  | {
      ok: false;
      error: string;
      code?: string;
      channels?: Record<string, string>;
      delivery?: Record<string, string>;
    };

const CHANNEL_LABELS: Record<string, string> = {
  telegram: "Telegram",
  email: "Email",
  account: "Store account",
};

function safeText(value: unknown, max = 300): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/[\u0000-\u001F\u007F]+/g, " ").trim();
  return clean ? clean.slice(0, max) : null;
}

function extractOutcomes(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries: Array<[string, string]> = [];
  for (const [key, raw] of Object.entries(value)) {
    if (!["telegram", "email", "account"].includes(key)) continue;
    const status =
      typeof raw === "string"
        ? raw
        : raw && typeof raw === "object" && "status" in raw && typeof raw.status === "string"
          ? raw.status
          : null;
    const clean = status?.trim();
    if (clean && /^[a-zA-Z0-9 _:-]{1,80}$/.test(clean)) entries.push([key, clean]);
  }
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function formatFailedChannels(
  outcomes: Record<string, string> | undefined,
  failedList: unknown,
): string | null {
  if (outcomes) {
    const entries = Object.entries(outcomes);
    const failed = entries.filter(
      ([, state]) => !["sent", "delivered", "ok", "visible_in_my_orders"].includes(state.toLowerCase()),
    );
    const list = failed.length ? failed : entries;
    if (list.length) {
      return list
        .map(([channel, state]) => `${CHANNEL_LABELS[channel] ?? channel}: ${state.replaceAll("_", " ")}`)
        .join(" · ");
    }
  }
  if (Array.isArray(failedList)) {
    const names = failedList
      .filter((item): item is string => typeof item === "string" && item in CHANNEL_LABELS)
      .map((item) => CHANNEL_LABELS[item]);
    if (names.length) return names.join(", ");
  }
  return null;
}

function mapStoreError(status: number, body: unknown): Extract<ActionResult, { ok: false }> {
  if (status === 401 || status === 403) {
    return {
      ok: false,
      error: "The store did not authorize this action. Check the Store action key.",
    };
  }
  const record = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
  const code = safeText(record?.["code"] ?? record?.["error_code"], 80) ?? undefined;
  const rawMessage = safeText(record?.["message"] ?? record?.["error"]);
  const channels = record ? extractOutcomes(record["channels"]) : undefined;
  const delivery = record ? extractOutcomes(record["delivery"]) : undefined;
  const outcomeMap = delivery ?? channels;

  if (code === "INSUFFICIENT_BALANCE") {
    return { ok: false, code, error: "Wallet balance is too low" };
  }
  if (code === "NOT_DELIVERED" || code === "DELIVERY_FAILED") {
    const details = formatFailedChannels(outcomeMap, record?.["failed_channels"]);
    return {
      ok: false,
      code,
      ...(channels ? { channels } : {}),
      ...(delivery ? { delivery } : {}),
      error: details
        ? `Delivery failed (${details})`
        : rawMessage ?? "Delivery failed — nothing was sent to the customer.",
    };
  }
  if (code === "REQUEST_IN_PROGRESS") {
    return { ok: false, code, error: "Still processing, wait a moment" };
  }
  if (code === "ORDER_STATE_CONFLICT") {
    return {
      ok: false,
      code,
      error: "The store order has changed. Refresh it before trying again.",
    };
  }
  if (status >= 400 && status < 500) {
    if (rawMessage) {
      return {
        ok: false,
        ...(code ? { code } : {}),
        ...(channels ? { channels } : {}),
        ...(delivery ? { delivery } : {}),
        error: rawMessage,
      };
    }
    return {
      ok: false,
      ...(code ? { code } : {}),
      error:
        status === 404
          ? "The store could not find the requested item or its actions endpoint."
          : status === 400 || status === 422
            ? "The store could not accept these details. Check the submitted information."
            : "The store could not complete this request. Refresh and try again.",
    };
  }
  if (status >= 200 && status < 300) {
    return {
      ok: false,
      ...(code ? { code } : {}),
      ...(channels ? { channels } : {}),
      ...(delivery ? { delivery } : {}),
      error:
        rawMessage ??
        "The store did not confirm this action. Refresh the store before trying again.",
    };
  }
  return {
    ok: false,
    error: "Could not reach the store. Check its latest status before trying again.",
  };
}

export async function callFoxgenAction(
  input: FoxgenAction | CustomerAction | ReturnType<typeof catalogueAction>,
): Promise<ActionResult> {
  const key = process.env["SHOP_CRM_ACTION_KEY"];
  if (!key)
    return {
      ok: false,
      error: "Store actions are not connected. Add the Store action key in Lovable secrets.",
    };
  try {
    const { request_id: requestId, ...payload } =
      "request_id" in input ? input : { ...input, request_id: undefined };
    const bodyText = JSON.stringify(
      input.action === "approve" ? { ...payload, send: false } : payload,
    );
    if (new TextEncoder().encode(bodyText).length > 16384)
      return { ok: false, error: "These details are too long. Shorten them before sending." };
    const response = await fetch(`${getStoreBaseUrl()}/api/public/shop/v1/actions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(requestId ? { "Idempotency-Key": requestId } : {}),
      },
      body: bodyText,
      signal: AbortSignal.timeout(25000),
      redirect: "manual",
    });
    if (!response.ok) {
      // Never log provider bodies: delivery content and credentials can appear in them.
      console.error("FoxGen action failed", response.status);
      let errorBody: unknown = null;
      if (response.status >= 400 && response.status < 500 && response.status !== 401 && response.status !== 403) {
        try {
          errorBody = await response.json();
        } catch {
          errorBody = null;
        }
      }
      return mapStoreError(response.status, errorBody);
    }
    const body: unknown = await response.json();
    if (
      !body ||
      typeof body !== "object" ||
      !(("ok" in body && body.ok === true) || ("success" in body && body.success === true)) ||
      ("error" in body && body.error)
    ) {
      return mapStoreError(response.status, body);
    }
    // Only expose bounded delivery outcomes, never provider credentials or fulfilment content.
    const channels = "channels" in body ? extractOutcomes(body.channels) : undefined;
    const delivery = "delivery" in body ? extractOutcomes(body.delivery) : undefined;
    return {
      ok: true,
      ...(channels ? { channels } : {}),
      ...(delivery ? { delivery } : {}),
      ...("balance_usd" in body &&
      typeof body.balance_usd === "number" &&
      Number.isFinite(body.balance_usd)
        ? { balance_usd: body.balance_usd }
        : {}),
    };
  } catch {
    return {
      ok: false,
      error:
        "Could not reach the store. The action may have reached it; check the store before trying again.",
    };
  }
}
