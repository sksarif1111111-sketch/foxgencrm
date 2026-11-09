import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hashStoreKey, STORE_URL } from "./store-sync";

export const rotateStoreKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (roleError || !admin) throw new Error("Forbidden");
    const key = `fgcrm_${Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    const { error } = await context.supabase.from("store_integrations").upsert({ id: "foxgen", store_url: STORE_URL, key_hash: await hashStoreKey(key), enabled: true });
    if (error) throw new Error(error.message);
    return { key };
  });

export const setStoreEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ enabled: z.boolean() }).strict().parse(input))
  .handler(async ({ data, context }) => {
    const { data: admin, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (roleError || !admin) throw new Error("Forbidden");
    const { data: updated, error } = await context.supabase.from("store_integrations").update({ enabled: data.enabled }).eq("id", "foxgen").select("id").maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Create an API key first");
    return { ok: true };
  });