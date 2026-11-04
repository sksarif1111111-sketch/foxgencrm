import { z } from "zod";

export const CreateManualOrderSchema = z.object({
  product_id: z.string().min(1, "Choose a product").max(255),
  quantity: z.coerce.number().int().positive().max(100),
  selling_price: z.coerce.number().nonnegative().max(100000),
  wholesale_cost: z.coerce.number().nonnegative().max(100000),
  customer_id: z.string().uuid().nullable().optional(),
  customer_name: z.string().trim().min(1, "Customer name is required").max(255),
  phone: z.string().trim().max(30).optional().default(""),
  whatsapp: z.string().trim().max(30).optional().default(""),
  payment_method: z.enum(["upi", "binance", "crypto", "cash"]),
  payment_proof: z.string().trim().max(255).optional().default(""),
  notes: z.string().trim().max(2000).optional().default(""),
});
export type CreateManualOrderInput = z.infer<typeof CreateManualOrderSchema>;

export const SettingsSchema = z.object({
  store_name: z.string().trim().min(1).max(100),
  currency_symbol: z.string().trim().min(1).max(5),
  default_markup_percentage: z.coerce.number().min(0).max(1000),
  low_balance_threshold: z.coerce.number().min(0),
  critical_balance_threshold: z.coerce.number().min(0),
  upi_id: z.string().trim().max(100),
  binance_pay_id: z.string().trim().max(100),
  crypto_wallet: z.string().trim().max(200),
  crypto_network: z.string().trim().max(60),
  owner_telegram_chat_id: z.string().trim().regex(/^-?\d*$/, "Numbers only").max(30),
  owner_email: z.string().trim().max(255),
  support_contact: z.string().trim().max(100),
  bot_paused: z.boolean(),
  auto_deliver: z.boolean(),
});
export type SettingsInput = z.infer<typeof SettingsSchema>;
