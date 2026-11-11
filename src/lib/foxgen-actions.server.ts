import type { FoxgenAction } from "./foxgen-orders";

export type ActionResult = { ok: true } | { ok: false; error: string };
export async function callFoxgenAction(input: FoxgenAction): Promise<ActionResult> {
  const key = process.env["FOXGEN_SHOP_ACTION_KEY"];
  if (!key)
    return {
      ok: false,
      error: "Store actions are not connected. Add the Store action key in Lovable secrets.",
    };
  try {
    const response = await fetch("https://foxgenofficial.lovable.app/api/public/shop/v1/actions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(25000),
      redirect: "error",
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
              ? "The store could not find this order or its actions endpoint."
              : response.status === 400 || response.status === 422
                ? "The store could not accept these details. Check the order and submitted information."
                : "Could not reach the store. Check the order's latest status before trying again.";
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
        error: "The store did not confirm this action. Refresh the order before trying again.",
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      error:
        "Could not reach the store. The action may have reached it; check the order before trying again.",
    };
  }
}
