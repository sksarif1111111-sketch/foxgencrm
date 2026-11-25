import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ActionSchema,
  CustomerActionSchema,
  allowedAction,
  FoxgenSearch,
  foxgenMetrics,
  type FoxgenOrder,
} from "./foxgen-orders";
import { callFoxgenAction } from "./foxgen-actions.server";
import {
  customerOrderCounts,
  FoxgenCustomerSearch,
  memberPayments,
  snapshotNumber,
} from "./foxgen-customers";
import { memberSpending, PAYMENT_GROUPS } from "./foxgen-presentation";
import { orderPaymentData } from "./foxgen-payment-evidence";
import {
  canonicalStatus,
  marketplaceData,
  relatedOrderRecords,
  STATUS_GROUPS,
  connectionSummary,
} from "./foxgen-marketplace";

export const getFoxgenWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rows: FoxgenOrder[] = [];
    for (let offset = 0; ; offset += 1000) {
      const result = await context.supabase
        .from("store_records")
        .select("*")
        .eq("integration_id", "foxgen")
        .eq("entity", "orders")
        .order("external_id")
        .range(offset, offset + 999);
      if (result.error) throw new Error("Could not load the order workspace.");
      rows.push(...(result.data ?? []));
      if (!result.data || result.data.length < 1000) break;
    }
    return rows.map((row) => ({
      ...row,
      status: canonicalStatus(row.status),
      data: marketplaceData(row.data) as FoxgenOrder["data"],
    }));
  });

export const getFoxgenPaymentProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ id: z.string().min(1).max(200), kind: z.enum(["order", "topup"]).default("order") })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const role = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (role.error || !role.data) throw new Error("Only the owner can view payment proofs.");
    const order = await context.supabase
      .from("store_records")
      .select("external_id,data")
      .eq("integration_id", "foxgen")
      .eq("entity", data.kind === "topup" ? "payments" : "orders")
      .eq("external_id", data.id)
      .maybeSingle();
    if (order.error || !order.data) throw new Error("This order is unavailable.");
    if (data.kind === "topup" && marketplaceData(order.data.data)["order_external_id"])
      throw new Error("This payment belongs to an order, not a wallet top-up.");
    const key = process.env["SHOP_CRM_ACTION_KEY"];
    if (!key)
      return {
        ok: false as const,
        error: "The Store action key is missing. Connect it before viewing private proofs.",
      };
    try {
      const { fetchStoreProof } = await import("./foxgen-proof.server");
      return await fetchStoreProof(data.id, key, data.kind);
    } catch {
      return {
        ok: false as const,
        error: "Could not load the private payment proof. Try again or review it in Store admin.",
      };
    }
  });

export const getFoxgenCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FoxgenCustomerSearch.parse(input))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("store_records")
      .select("*", { count: "exact" })
      .eq("integration_id", "foxgen")
      .eq("entity", "customers");
    const term = (data.q ?? "")
      .replace(/[^\p{L}\p{N}\s@._-]/gu, " ")
      .trim()
      .replace(/^@/, "");
    const orderCustomerIds = new Set<string>();
    if (/^FG-/i.test(term)) {
      for (let offset = 0; ; offset += 1000) {
        const linked = await context.supabase
          .from("store_records")
          .select("data")
          .eq("integration_id", "foxgen")
          .eq("entity", "orders")
          .or(`external_id.ilike.%${term}%,data->>order_number.ilike.%${term}%`)
          .order("external_id")
          .range(offset, offset + 999);
        if (linked.error) throw new Error("Could not search by order number.");
        for (const order of linked.data ?? []) {
          const id = marketplaceData(order.data)["customer_external_id"];
          if (typeof id === "string" && /^[a-zA-Z0-9_-]+$/.test(id)) orderCustomerIds.add(id);
        }
        if (!linked.data || linked.data.length < 1000) break;
      }
    }
    if (term)
      query = query.or(
        `name.ilike.%${term}%,external_id.ilike.%${term}%,data->>member_number.ilike.%${term}%,data->>email.ilike.%${term}%,data->>customer_email.ilike.%${term}%,data->>telegram_username.ilike.%${term}%,data->>telegram_user_id.ilike.%${term}%${orderCustomerIds.size ? `,external_id.in.(${[...orderCustomerIds].join(",")})` : ""}`,
      );
    const page = data.page ?? 0;
    const filtered = data.orders === "with" || data.orders === "without";
    const customers: FoxgenOrder[] = [];
    let count = 0;
    const start = filtered ? 0 : page * 50;
    const size = filtered ? 500 : 50;
    for (let offset = start; ; offset += size) {
      const batch = await query
        .order("source_updated_at", { ascending: false })
        .order("external_id")
        .range(offset, offset + size - 1);
      if (batch.error) throw new Error("Could not load FoxGen customers. Try again in a moment.");
      customers.push(...(batch.data ?? []));
      count = batch.count ?? 0;
      if (!filtered || !batch.data || batch.data.length < size) break;
    }
    const orders: Pick<
      FoxgenOrder,
      "integration_id" | "entity" | "data" | "status" | "amount" | "currency" | "source_updated_at"
    >[] = [];
    for (let index = 0; index < customers.length; index += 50) {
      const ids = customers.slice(index, index + 50).map((customer) => customer.external_id);
      for (let offset = 0; ; offset += 1000) {
        const result = await context.supabase
          .from("store_records")
          .select("integration_id,entity,data,status,amount,currency,source_updated_at")
          .eq("integration_id", "foxgen")
          .eq("entity", "orders")
          .in("data->>customer_external_id", ids)
          .order("external_id")
          .range(offset, offset + 999);
        if (result.error) throw new Error("Could not load member order history.");
        orders.push(...(result.data ?? []));
        if (!result.data || result.data.length < 1000) break;
      }
    }
    const counts = customerOrderCounts(orders);
    const byCustomer = new Map<string, typeof orders>();
    for (const order of orders) {
      const id = marketplaceData(order.data)["customer_external_id"];
      if (typeof id !== "string") continue;
      const existing = byCustomer.get(id);
      if (existing) existing.push(order);
      else byCustomer.set(id, [order]);
    }
    const matching = customers.filter(
      (customer) =>
        !filtered || (counts.get(customer.external_id) ?? 0) > 0 === (data.orders === "with"),
    );
    return {
      rows: (filtered ? matching.slice(page * 50, page * 50 + 50) : matching).map((customer) => {
        const history = byCustomer.get(customer.external_id) ?? [];
        return {
          ...customer,
          orderCount:
            snapshotNumber(customer.data, "total_orders") ?? counts.get(customer.external_id) ?? 0,
          lastOrder: orderDataLastOrder(customer.data, history),
          spending: memberSpending(history),
          lastActivity: history.reduce(
            (latest, order) =>
              order.source_updated_at > latest ? order.source_updated_at : latest,
            customer.source_updated_at,
          ),
        };
      }),
      count: filtered ? matching.length : count,
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
    if (!result.data) return { customer: null, orders: [], payments: [], messages: [] };
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
    const messages = [];
    for (let offset = 0; ; offset += 1000) {
      const receipts = await context.supabase
        .from("store_message_receipts")
        .select("*")
        .eq("customer_external_id", result.data.external_id)
        .order("created_at", { ascending: false })
        .order("request_id")
        .range(offset, offset + 999);
      if (receipts.error) throw new Error("Could not load sent message history.");
      messages.push(...(receipts.data ?? []));
      if (!receipts.data || receipts.data.length < 1000) break;
    }
    return {
      customer: result.data,
      messages,
      orders: orders.map((order) => ({
        ...order,
        data: orderPaymentData(order, payments) as FoxgenOrder["data"],
      })),
      payments: memberPayments(payments, result.data.external_id),
    };
  });
function orderDataLastOrder(data: FoxgenOrder["data"], history: { data: FoxgenOrder["data"] }[]) {
  const snapshot = marketplaceData(data)["last_order_at"];
  if (typeof snapshot === "string") return snapshot;
  return (
    history
      .map(
        (order) =>
          marketplaceData(order.data)["created_at"] ??
          marketplaceData(order.data)["order_created_at"],
      )
      .filter((at): at is string => typeof at === "string")
      .sort()
      .at(-1) ?? null
  );
}

export const operateFoxgenCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CustomerActionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const role = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (role.error || !role.data)
      return { ok: false as const, error: "Only the owner can manage Store customers." };
    const customer = await context.supabase
      .from("store_records")
      .select("external_id")
      .eq("integration_id", "foxgen")
      .eq("entity", "customers")
      .eq("external_id", data.customer_id)
      .maybeSingle();
    if (customer.error || !customer.data)
      return { ok: false as const, error: "This Store customer is unavailable." };
    if (data.action === "message_customer" && data.order_id) {
      const order = await context.supabase
        .from("store_records")
        .select("external_id")
        .eq("integration_id", "foxgen")
        .eq("entity", "orders")
        .eq("external_id", data.order_id)
        .eq("data->>customer_external_id", data.customer_id)
        .maybeSingle();
      if (order.error || !order.data)
        return { ok: false as const, error: "This order does not belong to this customer." };
    }
    const result = await callFoxgenAction(data);
    if (result.ok && data.action === "message_customer") {
      // This privileged write follows both the owner and exact customer/order checks above.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const receipt = await supabaseAdmin.from("store_message_receipts").upsert(
        {
          request_id: data.request_id,
          customer_external_id: data.customer_id,
          order_external_id: data.order_id ?? null,
          message: data.message,
          channels: result.channels ?? {},
        },
        { onConflict: "request_id", ignoreDuplicates: true },
      );
      return { ...result, historySaved: !receipt.error };
    }
    return result;
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
    if (data.payment && data.payment !== "all") {
      const filter = PAYMENT_GROUPS[data.payment];
      q = q.or(
        `data->>payment_status.in.(${filter.explicit.join(",")}),and(data->>payment_status.is.null,status.in.(${filter.orders.join(",")}))`,
      );
    }
    if (data.channel && data.channel !== "all")
      q = q.or(
        data.channel === "bot"
          ? "data->>channel.in.(bot,telegram),data->>source.in.(bot,telegram)"
          : "data->>channel.eq.website,data->>source.eq.website",
      );
    const term = (data.q ?? "").replace(/[^\p{L}\p{N}\s@._-]/gu, " ").trim();
    if (term)
      q = q.or(
        `name.ilike.%${term}%,external_id.ilike.%${term}%,data->>customer_email.ilike.%${term}%,data->>customer_name.ilike.%${term}%,data->>customer_external_id.ilike.%${term}%,data->>member_number.ilike.%${term}%,data->>order_number.ilike.%${term}%,data->>telegram_username.ilike.%${term}%`,
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
    if (!order) return null;
    const payments: FoxgenOrder[] = [];
    for (let offset = 0; ; offset += 1000) {
      const result = await context.supabase
        .from("store_records")
        .select("*")
        .eq("integration_id", "foxgen")
        .eq("entity", "payments")
        .eq("data->>order_external_id", order.external_id)
        .order("external_id")
        .range(offset, offset + 999);
      if (result.error) throw new Error("Could not load this order's payment evidence.");
      payments.push(...(result.data ?? []));
      if (!result.data || result.data.length < 1000) break;
    }
    return order
      ? {
          ...order,
          status: canonicalStatus(order.status),
          data: orderPaymentData(order, payments) as FoxgenOrder["data"],
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
    const rows: Pick<FoxgenOrder, "external_id" | "entity" | "status" | "data" | "received_at">[] =
      [];
    for (let offset = 0; ; offset += 1000) {
      const result = await context.supabase
        .from("store_records")
        .select("external_id,entity,status,data,received_at")
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
