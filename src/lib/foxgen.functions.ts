import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ActionSchema,
  allowedAction,
  FoxgenSearch,
  foxgenMetrics,
  type FoxgenOrder,
} from "./foxgen-orders";
import { callFoxgenAction } from "./foxgen-actions.server";

export const getFoxgenOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FoxgenSearch.parse(input))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("store_records")
      .select("*", { count: "exact" })
      .eq("integration_id", "foxgen")
      .eq("entity", "orders");
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.channel && data.channel !== "all") q = q.ilike("data->>channel", data.channel);
    const term = (data.q ?? "").replace(/[^\p{L}\p{N}\s@._-]/gu, " ").trim();
    if (term)
      q = q.or(
        `name.ilike.%${term}%,external_id.ilike.%${term}%,data->>customer_email.ilike.%${term}%,data->>customer_name.ilike.%${term}%`,
      );
    const page = data.page ?? 0;
    const {
      data: rows,
      count,
      error,
    } = await q
      .order("source_updated_at", { ascending: false })
      .order("external_id")
      .range(page * 50, page * 50 + 49);
    if (error) throw new Error("Could not load Store orders. Try again in a moment.");
    return { rows: rows ?? [], count: count ?? 0 };
  });
export const getFoxgenOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: order, error } = await context.supabase
      .from("store_records")
      .select("*")
      .eq("integration_id", "foxgen")
      .eq("entity", "orders")
      .eq("external_id", data.id)
      .maybeSingle();
    if (error) throw new Error("Could not load this Store order. Try again in a moment.");
    return order;
  });
export const getFoxgenMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rows: FoxgenOrder[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await context.supabase
        .from("store_records")
        .select("*")
        .eq("integration_id", "foxgen")
        .eq("entity", "orders")
        .order("external_id")
        .range(offset, offset + 999);
      if (error) throw new Error("Could not check the Store connection. Try again in a moment.");
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    return foxgenMetrics(rows, Date.now());
  });
export const operateFoxgenOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ActionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: admin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError || !admin)
      return { ok: false as const, error: "Only the CRM owner can operate Store orders." };
    const { data: order, error } = await context.supabase
      .from("store_records")
      .select("*")
      .eq("integration_id", "foxgen")
      .eq("entity", "orders")
      .eq("external_id", data.order_id)
      .maybeSingle();
    if (error || !order)
      return {
        ok: false as const,
        error: "This Store order is unavailable. Refresh the order list.",
      };
    if (!allowedAction(data.action, order))
      return {
        ok: false as const,
        error: "This action is not available in the order's current state. Refresh the order.",
      };
    return callFoxgenAction(data);
  });
