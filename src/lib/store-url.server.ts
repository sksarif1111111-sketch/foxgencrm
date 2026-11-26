import { STORE_URL } from "./store-sync";

export function getStoreBaseUrl(): string {
  const raw = process.env["STORE_BASE_URL"]?.trim();
  if (!raw) return STORE_URL;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return STORE_URL;
    return parsed.origin + parsed.pathname.replace(/\/+$/, "");
  } catch {
    return STORE_URL;
  }
}