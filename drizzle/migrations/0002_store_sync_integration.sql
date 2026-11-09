CREATE TABLE public.store_integrations (id text PRIMARY KEY, store_url text NOT NULL, key_hash text NOT NULL, enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), last_received_at timestamptz);
GRANT SELECT, INSERT, UPDATE ON public.store_integrations TO authenticated;
GRANT ALL ON public.store_integrations TO service_role;
ALTER TABLE public.store_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_store_integrations ON public.store_integrations FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TABLE public.store_records (integration_id text NOT NULL REFERENCES public.store_integrations(id), entity text NOT NULL CHECK (entity IN ('orders','payments','customers','products','refunds','expenses','inventory')), external_id text NOT NULL, name text NOT NULL DEFAULT '', status text NOT NULL DEFAULT '', amount numeric, currency text, source_updated_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), data jsonb NOT NULL DEFAULT '{}', PRIMARY KEY(integration_id, entity, external_id));
GRANT SELECT ON public.store_records TO authenticated;
GRANT ALL ON public.store_records TO service_role;
ALTER TABLE public.store_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_store_records_read ON public.store_records FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX store_records_recent ON public.store_records(entity, received_at DESC);
CREATE FUNCTION public.ingest_store_records(_integration_id text, _records jsonb) RETURNS integer LANGUAGE plpgsql SET search_path = public AS $$
DECLARE affected integer;
BEGIN
INSERT INTO public.store_records(integration_id,entity,external_id,name,status,amount,currency,source_updated_at,data)
SELECT _integration_id,r.entity,r.external_id,coalesce(r.name,''),coalesce(r.status,''),r.amount,r.currency,r.updated_at,r.data FROM jsonb_to_recordset(_records) AS r(entity text, external_id text,name text,status text,amount numeric,currency text,updated_at timestamptz,data jsonb)
ON CONFLICT(integration_id,entity,external_id) DO UPDATE SET name=excluded.name,status=excluded.status,amount=excluded.amount,currency=excluded.currency,source_updated_at=excluded.source_updated_at,data=excluded.data,received_at=now() WHERE excluded.source_updated_at > store_records.source_updated_at;
GET DIAGNOSTICS affected = ROW_COUNT;
UPDATE public.store_integrations SET last_received_at=now() WHERE id=_integration_id;
RETURN affected;
END; $$;
REVOKE ALL ON FUNCTION public.ingest_store_records(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_store_records(text,jsonb) TO service_role;