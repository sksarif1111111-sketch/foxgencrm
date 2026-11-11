import { queryOptions } from "@tanstack/react-query";
import {
  getFoxgenCustomer,
  getFoxgenCustomers,
  getFoxgenMetrics,
  getFoxgenOrder,
  getFoxgenOrders,
  getFoxgenOrderActivity,
  getFoxgenConnection,
} from "./foxgen.functions";
import type { FoxgenFilters } from "./foxgen-orders";
import type { FoxgenCustomerFilters } from "./foxgen-customers";

export const foxgenCustomerListOptions = (filters: FoxgenCustomerFilters) =>
  queryOptions({
    queryKey: ["foxgen", "customers", "list", filters],
    queryFn: () => getFoxgenCustomers({ data: filters }),
    refetchInterval: 15000,
  });
export const foxgenCustomerDetailOptions = (id: string) =>
  queryOptions({
    queryKey: ["foxgen", "customers", "detail", id],
    queryFn: () => getFoxgenCustomer({ data: { id } }),
    refetchInterval: 15000,
  });

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
export const foxgenConnectionOptions = queryOptions({
  queryKey: ["foxgen", "connection"],
  queryFn: () => getFoxgenConnection(),
  refetchInterval: 15000,
});
export const foxgenOrderActivityOptions = (id: string) =>
  queryOptions({
    queryKey: ["foxgen", "activity", id],
    queryFn: () => getFoxgenOrderActivity({ data: { id } }),
    refetchInterval: 15000,
  });
