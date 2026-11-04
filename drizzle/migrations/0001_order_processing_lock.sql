ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS telegram_chat_id varchar(255);