export type BotPaymentMethod = "upi" | "binance" | "crypto";
export type PaymentMethod = BotPaymentMethod | "cash";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  upi: "UPI",
  binance: "Binance",
  crypto: "Crypto",
  cash: "Cash",
};

const RULES: Record<BotPaymentMethod, { re: RegExp; hint: string }> = {
  upi: { re: /^[A-Z0-9]{12}$/, hint: "UPI transaction IDs are 12 characters (letters and numbers)." },
  binance: { re: /^\d{10,}$/, hint: "Binance order IDs are numbers, at least 10 digits." },
  crypto: { re: /^(0x)?[a-fA-F0-9]{64}$/, hint: "Transaction hashes are 64 hexadecimal characters." },
};

/** Normalises what the customer typed (trim, uppercase UPI). */
export function normalizeProof(method: BotPaymentMethod, raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, "");
  return method === "upi" ? trimmed.toUpperCase() : trimmed;
}

/** Payment proof format check — must pass before any supplier order is placed. */
export function validatePaymentProof(method: string, proof: string): boolean {
  if (method !== "upi" && method !== "binance" && method !== "crypto") return false;
  return RULES[method].re.test(proof);
}

export function proofHint(method: BotPaymentMethod): string {
  return RULES[method].hint;
}

/** Only the last 4 characters are ever shown in logs. */
export function maskProof(proof: string | null | undefined): string {
  if (!proof) return "";
  return proof.length <= 4 ? proof : `••••${proof.slice(-4)}`;
}
