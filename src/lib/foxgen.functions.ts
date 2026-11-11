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
import { customerOrderCounts, FoxgenCustomerSearch, memberPayments } from "./foxgen-customers";
import {
  canonicalStatus,
  marketplaceData,
  relatedOrderRecords,
  STATUS_GROUPS,
  connectionSummary,
} from "./foxgen-marketplace";

export const getFoxgenCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FoxgenCustomerSearch.parse(input))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("store_records")
      .select("*", { count: "exact" })
      .eq("integration_id", "foxgen")
      .eq("entity", "customers");
    const term = (data.q ?? "").replace(/[^\p{L}\p{N}\s@._-]/gu, " ").trim();
    if (term)
      query = query.or(
        `name.ilike.%${term}%,external_id.ilike.%${term}%,data->>member_number.ilike.%${term}%,data->>email.ilike.%${term}%,data->>customer_email.ilike.%${term}%,data->>telegram_username.ilike.%${term}%,data->>telegram_user_id.ilike.%${term}%`,
      );
    const page = data.page ?? 0;
    const {
      data: rows,
      count,
      error,
    } = await query
      .order("source_updated_at", { ascending: false })
      .order("external_id")
      .range(page * 50, page * 50 + 49);
    if (error) throw new Error("Could not load FoxGen customers. Try again in a moment.");
    const customers = rows ?? [];
    if (!customers.length) return { rows: [], count: count ?? 0 };
    const orders: Pick<FoxgenOrder, "integration_id" | "entity" | "data">[] = [];
    for (let offset = 0; ; offset += 1000) {
      const result = await context.supabase
        .from("store_records")
        .select("integration_id,entity,data")
        .eq("integration_id", "foxgen")
        .eq("entity", "orders")
        .in(
          "data->>customer_external_id",
          customers.map((customer) => customer.external_id),
        )
        .order("external_id")
        .range(offset, offset + 999);
      if (result.error)
        throw new Error("Could not load customer order counts. Try again in a moment.");
      orders.push(...(result.data ?? []));
      if (!result.data || result.data.length < 1000) break;
    }
    const counts = customerOrderCounts(orders);
    return {
      rows: customers.map((customer) => ({
        ...customer,
        orderCount: counts.get(customer.external_id) ?? 0,
      })),
      count: count ?? 0,
    };
  });

export const getFoxgenCustomer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data, context }) => {
    const result = await context.supabase
      .from("store_records")
      .select("*")
      .eq("integration_id", "foxgen")
      .eq("entity", "customers")
      .eq("external_id", data.id)
      .maybeSingle();
    if (result.error)
      throw new Error("Could not load this FoxGen customer. Try again in a moment.");
    if (!result.data) return { customer: null, orders: [], payments: [] };
    const orders: FoxgenOrder[] = [];
    for (let offset = 0; ; offset += 1000) {
      const batch = await context.supabase
        .from("store_records")
        .select("*")
        .eq("integration_id", "foxgen")
        .eq("entity", "orders")
        .eq("data->>customer_external_id", result.data.external_id)
        .order("source_updated_at", { ascending: false })
        .order("external_id")
        .range(offset, offset + 999);
      if (batch.error)
        throw new Error("Could not load this customer's orders. Try again in a moment.");
      orders.push(...(batch.data ?? []));
      if (!batch.data || batch.data.length < 1000) break;
    }
    const payments: FoxgenOrder[] = [];
    for (let offset = 0; ; offset += 1000) {
      const batch = await context.supabase
        .from("store_records")
        .select("*")
        .eq("integration_id", "foxgen")
        .eq("entity", "payments")
        .eq("data->>customer_external_id", result.data.external_id)
        .order("source_updated_at", { ascending: false })
        .order("external_id")
        .range(offset, offset + 999);
      if (batch.error)
        throw new Error("Could not load this member's wallet activity. Try again in a moment.");
      payments.push(...(batch.data ?? []));
      if (!batch.data || batch.data.length < 1000) break;
    }
    return {
      customer: result.data,
      orders,
      payments: memberPayments(payments, result.data.external_id),
    };
  });

export const getFoxgenOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FoxgenSearch.parse(input))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("store_records")
      .select("*", { count: "exact" })
      .eq("integration_id", "foxgen")
      .eq("entity", "orders");
    if (data.status && data.status !== "all")
      q = q.in("status", STATUS_GROUPS[data.status] ?? [data.status]);
    if (data.channel && data.channel !== "all")
      q = q.or(
        data.channel === "bot"
          ? "data->>channel.in.(bot,telegram),data->>source.in.(bot,telegram)"
          : "data->>channel.eq.website,data->>source.eq.website",
      );
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
    return {
      rows: (rows ?? []).map((row) => ({
        ...row,
        status: canonicalStatus(row.status),
        data: marketplaceData(row.data) as FoxgenOrder["data"],
      })),
      count: count ?? 0,
    };
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
    return order
      ? {
          ...order,
          status: canonicalStatus(order.status),
          data: marketplaceData(order.data) as FoxgenOrder["data"],
        }
      : null;
  });
export const getFoxgenOrderActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data, context }) => {
    const records: FoxgenOrder[] = [];
    for (let offset = 0; ; offset += 1000) {
      const result = await context.supabase
        .from("store_records")
        .select("*")
        .eq("integration_id", "foxgen")
        .in("entity", ["payments", "refunds"])
        .eq("data->>order_external_id", data.id)
        .order("external_id")
        .range(offset, offset + 999);
      if (result.error) throw new Error("Could not load payment and refund activity.");
      records.push(...(result.data ?? []));
      if (!result.data || result.data.length < 1000) break;
    }
    return relatedOrderRecords(records, data.id);
  });

export const getFoxgenConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (role.error || !role.data) throw new Error("Only the owner can inspect this connection.");
    const integration = await context.supabase
      .from("store_integrations")
      .select("enabled,last_received_at")
      .eq("id", "foxgen")
      .maybeSingle();
    if (integration.error) throw new Error("Could not check the Store connection.");
    const rows: Pick<FoxgenOrder, "entity" | "status" | "data" | "received_at">[] = [];
    for (let offset = 0; ; offset += 1000) {
      const result = await context.supabase
        .from("store_records")
        .select("entity,status,data,received_at")
        .eq("integration_id", "foxgen")
        .order("entity")
        .order("external_id")
        .range(offset, offset + 999);
      if (result.error) throw new Error("Could not inspect imported Store records.");
      rows.push(...(result.data ?? []));
      if (!result.data || result.data.length < 1000) break;
    }
    return {
      ...connectionSummary(rows),
      integration: integration.data,
      actionsConfigured: Boolean(process.env["SHOP_CRM_ACTION_KEY"]),
      checkedAt: new Date().toISOString(),
    };
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
