import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { withDefaults } from "./settings-keys";

export const settingsQuery = queryOptions({
  queryKey: ["settings"],
  queryFn: async () => {
    const { data, error } = await supabase.from("settings").select("key, value");
    if (error) throw new Error(error.message);
    return withDefaults(data);
  },
});

export function useSettings() {
  return useQuery(settingsQuery);
}

export const productsQuery = queryOptions({
  queryKey: ["products"],
  queryFn: async () => {
    const { data, error } = await supabase.from("products").select("*").order("name").range(0, 499);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
});

export interface Summary {
  revenue: number;
  cost: number;
  profit: number;
  order_count: number;
  bot_count: number;
  manual_count: number;
}

export async function fetchSummary(from: Date, to: Date): Promise<Summary> {
  const { data, error } = await supabase.rpc("report_summary", { _from: from.toISOString(), _to: to.toISOString() });
  if (error) throw new Error(error.message);
  const r = data?.[0];
  return {
    revenue: Number(r?.revenue ?? 0),
    cost: Number(r?.cost ?? 0),
    profit: Number(r?.profit ?? 0),
    order_count: Number(r?.order_count ?? 0),
    bot_count: Number(r?.bot_count ?? 0),
    manual_count: Number(r?.manual_count ?? 0),
  };
}

export async function fetchTopProducts(from: Date, to: Date, limit = 5) {
  const { data, error } = await supabase.rpc("report_top_products", { _from: from.toISOString(), _to: to.toISOString(), _limit: limit });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ ...r, units: Number(r.units), revenue: Number(r.revenue), profit: Number(r.profit) }));
}

export async function fetchDailySeries(from: Date, to: Date) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const { data, error } = await supabase.rpc("report_daily_series", { _from: from.toISOString(), _to: to.toISOString(), _tz: tz });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ day: r.day, revenue: Number(r.revenue), profit: Number(r.profit), orders: Number(r.order_count) }));
}
