/** Store settings kept in the settings table. Secrets (API key, bot token) never live here. */
export const SETTING_DEFAULTS = {
  store_name: "Digital Store",
  currency_symbol: "$",
  default_markup_percentage: "20",
  low_balance_threshold: "50",
  critical_balance_threshold: "20",
  upi_id: "",
  binance_pay_id: "",
  crypto_wallet: "",
  crypto_network: "USDT (TRC20)",
  owner_telegram_chat_id: "",
  owner_email: "",
  bot_paused: "false",
  auto_deliver: "false",
  support_contact: "",
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type Settings = Record<SettingKey, string>;

export function withDefaults(rows: { key: string; value: string | null }[] | null | undefined): Settings {
  const out: Settings = { ...SETTING_DEFAULTS };
  for (const r of rows ?? []) {
    if (r.key in SETTING_DEFAULTS && r.value !== null) out[r.key as SettingKey] = r.value;
  }
  return out;
}

export function settingNumber(s: Settings, key: SettingKey): number {
  const n = Number(s[key]);
  return Number.isFinite(n) ? n : Number(SETTING_DEFAULTS[key]);
}

export function settingBool(s: Settings, key: SettingKey): boolean {
  return s[key] === "true";
}
