import type { CustomerAction, FoxgenAction } from "./foxgen-orders";
import type { catalogueAction } from "./foxgen-catalogue";

export type ActionResult =
  | {
      ok: true;
      channels?: Record<string, string>;
      delivery?: Record<string, string>;
      balance_usd?: number;
    }
  | { ok: false; error: string };
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
    const response = await fetch("https://foxgenofficial.lovable.app/api/public/shop/v1/actions", {
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
      const error =
        response.status === 401 || response.status === 403
          ? "The store did not authorize this action. Check the Store action key."
          : response.status === 409
            ? "The store order has changed. Refresh it before trying again."
            : response.status === 404
              ? "The store could not find the requested item or its actions endpoint."
              : response.status === 400 || response.status === 422
                ? "The store could not accept these details. Check the submitted information."
                : "Could not reach the store. Check its latest status before trying again.";
      return { ok: false, error };
    }
    const body: unknown = await response.json();
    if (
      !body ||
      typeof body !== "object" ||
      !(("ok" in body && body.ok === true) || ("success" in body && body.success === true)) ||
      ("error" in body && body.error)
    ) {
      return {
        ok: false,
        error: "The store did not confirm this action. Refresh the store before trying again.",
      };
    }
    // Only expose bounded delivery outcomes, never provider credentials or fulfilment content.
    const outcomes = (value: unknown) =>
      value && typeof value === "object"
        ? (Object.fromEntries(
            Object.entries(value).filter(
              ([key, status]) =>
                ["telegram", "email", "account"].includes(key) &&
                typeof status === "string" &&
                /^[a-z_]{1,60}$/.test(status),
            ),
          ) as Record<string, string>)
        : undefined;
    const channels = "channels" in body ? outcomes(body.channels) : undefined;
    const delivery = "delivery" in body ? outcomes(body.delivery) : undefined;
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
