export interface CsvOrder {
  created_at: string;
  external_order_id: string;
  source: string;
  status: string;
  product_name: string;
  quantity: number;
  wholesale_cost: number;
  selling_price: number;
  total_cost: number | null;
  total_amount: number | null;
  profit: number | null;
  payment_method: string;
  customers: { name: string; whatsapp: string | null; telegram_username: string | null } | null;
}

function cell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  // Quote and neutralise spreadsheet formula injection.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) || safe !== s ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function buildOrdersCsv(orders: CsvOrder[]): string {
  const header = [
    "date",
    "order_id",
    "source",
    "status",
    "product",
    "quantity",
    "unit_cost",
    "unit_price",
    "total_cost",
    "revenue",
    "profit",
    "payment_method",
    "customer",
    "whatsapp",
    "telegram",
  ];
  const lines = orders.map((o) =>
    [
      o.created_at,
      o.external_order_id,
      o.source,
      o.status,
      o.product_name,
      o.quantity,
      o.wholesale_cost,
      o.selling_price,
      o.total_cost,
      o.total_amount,
      o.profit,
      o.payment_method,
      o.customers?.name,
      o.customers?.whatsapp,
      o.customers?.telegram_username,
    ]
      .map(cell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}
