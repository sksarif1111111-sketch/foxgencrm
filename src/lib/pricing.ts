/** Pure pricing helpers shared by CRM, bot and tests. */

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Selling price = wholesale + markup%. */
export function computeSellingPrice(wholesale: number, markupPercent: number): number {
  return round2(wholesale * (1 + markupPercent / 100));
}

/** Markup % implied by a chosen selling price. */
export function markupFromPrice(wholesale: number, sellingPrice: number): number {
  if (wholesale <= 0) return 0;
  return round2(((sellingPrice - wholesale) / wholesale) * 100);
}

/** Effective markup: per-product override, otherwise the store default. */
export function effectiveMarkup(override: number | null | undefined, defaultMarkup: number): number {
  return override === null || override === undefined ? defaultMarkup : override;
}

export interface OrderTotals {
  revenue: number;
  cost: number;
  profit: number;
}

/** Totals for an order line: prices are per unit. */
export function orderTotals(sellingPrice: number, wholesaleCost: number, quantity: number): OrderTotals {
  return {
    revenue: round2(sellingPrice * quantity),
    cost: round2(wholesaleCost * quantity),
    profit: round2((sellingPrice - wholesaleCost) * quantity),
  };
}

export function profitMarginPercent(profit: number, revenue: number): number {
  if (revenue <= 0) return 0;
  return round2((profit / revenue) * 100);
}

export type BalanceLevel = "ok" | "low" | "critical";

/** Balance alert level: below critical → critical, below low → low. */
export function balanceLevel(balance: number, lowThreshold: number, criticalThreshold: number): BalanceLevel {
  if (balance < criticalThreshold) return "critical";
  if (balance < lowThreshold) return "low";
  return "ok";
}

export function formatMoney(n: number | string | null | undefined, symbol = "$"): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  const safe = Number.isFinite(v) ? v : 0;
  const sign = safe < 0 ? "-" : "";
  return `${sign}${symbol}${Math.abs(safe).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
