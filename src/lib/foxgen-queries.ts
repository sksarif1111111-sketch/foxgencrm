import { queryOptions } from "@tanstack/react-query";
import { getFoxgenMetrics, getFoxgenOrder, getFoxgenOrders } from "./foxgen.functions";
import type { FoxgenFilters } from "./foxgen-orders";

export const foxgenListOptions = (filters: FoxgenFilters) =>
  queryOptions({
    queryKey: ["foxgen", "list", filters],
    queryFn: () => getFoxgenOrders({ data: filters }),
    refetchInterval: 15000,
  });
export const foxgenDetailOptions = (id: string) =>
  queryOptions({
    queryKey: ["foxgen", "detail", id],
    queryFn: () => getFoxgenOrder({ data: { id } }),
    refetchInterval: 15000,
  });
export const foxgenMetricsOptions = queryOptions({
  queryKey: ["foxgen", "metrics"],
  queryFn: () => getFoxgenMetrics(),
  refetchInterval: 15000,
});
