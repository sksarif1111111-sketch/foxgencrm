import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import type { Database } from "@/integrations/supabase/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SourceBadge, StatusBadge } from "@/components/crm/StatusBadge";
import { formatMoney } from "@/lib/pricing";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/payment-validator";

export type OrderRow = Database["public"]["Tables"]["orders"]["Row"] & {
  customers: { id: string; name: string; telegram_username: string | null; whatsapp: string | null } | null;
};

export function OrderTable({ orders, symbol, compact = false }: { orders: OrderRow[]; symbol: string; compact?: boolean }) {
  if (!orders.length) {
    return <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">No orders found.</div>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order</TableHead>
            <TableHead>Product</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            {!compact && <TableHead className="text-right">Cost</TableHead>}
            <TableHead className="text-right">Selling</TableHead>
            <TableHead className="text-right">Profit</TableHead>
            <TableHead>Customer</TableHead>
            {!compact && <TableHead>Payment</TableHead>}
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((o) => (
            <TableRow key={o.id}>
              <TableCell>
                <Link to="/orders/$id" params={{ id: o.id }} className="font-medium text-primary hover:underline">
                  <span className="figure text-xs">{o.external_order_id.slice(0, 22)}</span>
                </Link>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <SourceBadge source={o.source} />
                  {format(new Date(o.created_at), "dd MMM, HH:mm")}
                </div>
              </TableCell>
              <TableCell className="max-w-[200px] truncate font-medium">{o.product_name}</TableCell>
              <TableCell className="figure text-right">{o.quantity}</TableCell>
              {!compact && <TableCell className="figure text-right text-muted-foreground">{formatMoney(o.total_cost, symbol)}</TableCell>}
              <TableCell className="figure text-right">{formatMoney(o.total_amount, symbol)}</TableCell>
              <TableCell className="figure text-right font-semibold text-success">{formatMoney(o.profit, symbol)}</TableCell>
              <TableCell>
                {o.customers ? (
                  <Link to="/customers/$id" params={{ id: o.customers.id }} className="hover:underline">
                    {o.customers.name}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              {!compact && <TableCell>{PAYMENT_METHOD_LABELS[o.payment_method as PaymentMethod] ?? o.payment_method}</TableCell>}
              <TableCell>
                <StatusBadge status={o.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export const ORDER_SELECT = "*, customers(id, name, telegram_username, whatsapp)";
