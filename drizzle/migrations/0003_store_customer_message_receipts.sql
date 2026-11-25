CREATE TABLE public.store_message_receipts (request_id uuid PRIMARY KEY, customer_external_id text NOT NULL, order_external_id text, message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 2000), channels jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.store_message_receipts TO authenticated;
GRANT ALL ON public.store_message_receipts TO service_role;
ALTER TABLE public.store_message_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads Store message receipts" ON public.store_message_receipts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX store_message_receipts_customer_idx ON public.store_message_receipts(customer_external_id, created_at DESC);