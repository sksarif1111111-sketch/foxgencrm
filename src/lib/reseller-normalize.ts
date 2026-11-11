/** Tolerant parsers for supplier API payloads (shape not fully documented). */

export interface SupplierProduct {
  id: string;
  name: string;
  description: string | null;
  wholesale_price: number;
  stock: number | null;
  image_url?: string | null;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}
function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim() !== "") return v;
  if (typeof v === "number") return String(v);
  return null;
}
function pick(o: Obj, keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
}

/** Throws if the payload says ok:false or carries an error. */
export function assertOk(payload: unknown): void {
  if (isObj(payload)) {
    if (payload["ok"] === false || payload["success"] === false || (payload["error"] && !payload["data"])) {
      const err = str(payload["error"]) ?? str(payload["message"]) ?? "Supplier API error";
      throw new Error(err);
    }
  }
}

function findArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (isObj(payload)) {
    for (const k of ["products", "data", "result", "items"]) {
      const v = payload[k];
      if (Array.isArray(v)) return v;
      if (isObj(v)) {
        const inner = findArray(v);
        if (inner.length) return inner;
      }
    }
  }
  return [];
}

export function parseProducts(payload: unknown): SupplierProduct[] {
  assertOk(payload);
  const out: SupplierProduct[] = [];
  for (const raw of findArray(payload)) {
    if (!isObj(raw)) continue;
    const id = str(pick(raw, ["id", "product_id", "sku", "code"]));
    const name = str(pick(raw, ["name", "title", "product_name"]));
    const price = num(pick(raw, ["wholesale_price", "reseller_price", "price", "cost", "unit_price"]));
    if (!id || !name || price === null) continue;
    const stockRaw = pick(raw, ["stock", "stock_count", "available", "in_stock", "quantity"]);
    const stock = typeof stockRaw === "boolean" ? (stockRaw ? null : 0) : num(stockRaw);
    out.push({
      id,
      name,
      description: str(pick(raw, ["description", "desc", "details"])),
      wholesale_price: price,
      stock: stock === null ? null : Math.max(0, Math.floor(stock)),
      ...(str(pick(raw, ["image_url", "image", "thumbnail_url", "thumbnail"])) ? { image_url: str(pick(raw, ["image_url", "image", "thumbnail_url", "thumbnail"])) } : {}),
    });
  }
  return out;
}

export function parseBalance(payload: unknown): number {
  assertOk(payload);
  const direct = num(payload);
  if (direct !== null) return direct;
  if (isObj(payload)) {
    const b = num(pick(payload, ["balance", "amount", "credit"]));
    if (b !== null) return b;
    for (const k of ["data", "result"]) {
      const v = payload[k];
      if (v !== undefined) {
        try {
          return parseBalance(v);
        } catch {
          /* keep looking */
        }
      }
    }
  }
  throw new Error("Could not read balance from supplier response");
}

function accountToString(a: unknown): string {
  if (typeof a === "string") return a;
  if (isObj(a)) {
    const user = str(pick(a, ["email", "username", "login", "user", "account"]));
    const pass = str(pick(a, ["password", "pass", "pwd"]));
    if (user && pass) {
      const extra = str(pick(a, ["note", "notes", "pin", "profile"]));
      return extra ? `${user}:${pass} (${extra})` : `${user}:${pass}`;
    }
    const code = str(pick(a, ["code", "key", "license", "value", "content", "data"]));
    if (code) return code;
    return JSON.stringify(a);
  }
  return String(a);
}

/** Extracts delivered accounts from an order / order_status response; null when none present. */
export function parseAccounts(payload: unknown): string[] | null {
  if (!isObj(payload)) return null;
  for (const k of ["accounts", "delivery", "delivered_accounts", "items", "credentials", "codes"]) {
    const v = payload[k];
    if (Array.isArray(v) && v.length) return v.map(accountToString);
    if (typeof v === "string" && v.trim()) return v.split(/\r?\n/).filter(Boolean);
  }
  for (const k of ["order", "data", "result"]) {
    const v = payload[k];
    const inner = parseAccounts(v);
    if (inner) return inner;
  }
  return null;
}

/** Unit cost charged by supplier, when the order response includes it. */
export function parseUnitCost(payload: unknown, quantity: number): number | null {
  if (!isObj(payload)) return null;
  const unit = num(pick(payload, ["unit_price", "price_per_unit"]));
  if (unit !== null) return unit;
  const total = num(pick(payload, ["total", "total_price", "amount", "charged", "cost"]));
  if (total !== null && quantity > 0) return total / quantity;
  for (const k of ["order", "data", "result"]) {
    const inner = parseUnitCost(payload[k], quantity);
    if (inner !== null) return inner;
  }
  return null;
}

export function isInsufficientBalance(message: string): boolean {
  return /insufficient|not enough balance|low balance/i.test(message);
}
export function isOutOfStock(message: string): boolean {
  return /out of stock|insufficient stock|not enough stock|sold out/i.test(message);
}
export function isNotFound(message: string): boolean {
  return /not found|no order|does not exist/i.test(message);
}
