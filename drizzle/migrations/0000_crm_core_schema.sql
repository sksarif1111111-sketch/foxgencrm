-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- First account ever created becomes the store owner (admin)
CREATE OR REPLACE FUNCTION public.assign_owner_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created_assign_role
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.assign_owner_role();

CREATE OR REPLACE FUNCTION public.owner_exists()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin')
$$;
GRANT EXECUTE ON FUNCTION public.owner_exists() TO anon, authenticated;

-- Customers
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL,
  telegram_id varchar(255) UNIQUE,
  telegram_username varchar(255),
  phone varchar(30),
  whatsapp varchar(30),
  email varchar(255),
  total_orders integer NOT NULL DEFAULT 0,
  total_spent numeric(12,2) NOT NULL DEFAULT 0,
  first_purchase timestamptz,
  last_purchase timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_customers_phone ON public.customers(phone);
CREATE INDEX idx_customers_whatsapp ON public.customers(whatsapp);
CREATE INDEX idx_customers_last_purchase ON public.customers(last_purchase DESC);
CREATE INDEX idx_customers_total_spent ON public.customers(total_spent DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages customers" ON public.customers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Products cache
CREATE TABLE public.products (
  id varchar(255) PRIMARY KEY,
  name varchar(255) NOT NULL,
  description text,
  wholesale_price numeric(12,2) NOT NULL DEFAULT 0,
  selling_price numeric(12,2) NOT NULL DEFAULT 0,
  markup_percentage numeric(6,2),
  stock_count integer,
  total_sold integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  last_synced timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_name ON public.products(name);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages products" ON public.products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Orders
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_order_id varchar(255) UNIQUE NOT NULL,
  product_id varchar(255) NOT NULL,
  product_name varchar(255) NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  wholesale_cost numeric(12,2) NOT NULL CHECK (wholesale_cost >= 0),
  selling_price numeric(12,2) NOT NULL CHECK (selling_price >= 0),
  total_amount numeric(14,2) GENERATED ALWAYS AS (selling_price * quantity) STORED,
  total_cost numeric(14,2) GENERATED ALWAYS AS (wholesale_cost * quantity) STORED,
  profit numeric(14,2) GENERATED ALWAYS AS ((selling_price - wholesale_cost) * quantity) STORED,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  payment_method varchar(20) NOT NULL CHECK (payment_method IN ('binance','upi','crypto','cash')),
  payment_proof varchar(255),
  source varchar(20) NOT NULL CHECK (source IN ('telegram_bot','manual')),
  status varchar(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','completed','failed')),
  delivered_accounts jsonb,
  failure_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_source ON public.orders(source);
CREATE INDEX idx_orders_product_id ON public.orders(product_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages orders" ON public.orders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Keep customer + product stats in sync when an order becomes completed
CREATE OR REPLACE FUNCTION public.apply_order_stats()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed') THEN
    IF NEW.customer_id IS NOT NULL THEN
      UPDATE public.customers
        SET total_orders = total_orders + 1,
            total_spent = total_spent + NEW.selling_price * NEW.quantity,
            first_purchase = COALESCE(first_purchase, NEW.created_at),
            last_purchase = GREATEST(COALESCE(last_purchase, NEW.created_at), NEW.created_at)
        WHERE id = NEW.customer_id;
    END IF;
    UPDATE public.products SET total_sold = total_sold + NEW.quantity WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER orders_stats_ins BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.apply_order_stats();
CREATE TRIGGER orders_stats_upd BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.apply_order_stats();

-- Settings
CREATE TABLE public.settings (
  key varchar(255) PRIMARY KEY,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages settings" ON public.settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- API call log
CREATE TABLE public.api_calls_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action varchar(50) NOT NULL,
  status_code integer,
  success boolean NOT NULL DEFAULT false,
  duration_ms integer,
  external_order_id varchar(255),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_calls_log_created_at ON public.api_calls_log(created_at DESC);
GRANT SELECT ON public.api_calls_log TO authenticated;
GRANT ALL ON public.api_calls_log TO service_role;
ALTER TABLE public.api_calls_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads api log" ON public.api_calls_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Bot sessions (persistent conversation state)
CREATE TABLE public.bot_sessions (
  telegram_id varchar(255) PRIMARY KEY,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bot_sessions TO authenticated;
GRANT ALL ON public.bot_sessions TO service_role;
ALTER TABLE public.bot_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads bot sessions" ON public.bot_sessions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Manual order: find-or-create customer + insert order atomically
CREATE OR REPLACE FUNCTION public.create_manual_order(
  _product_id text, _product_name text, _quantity integer,
  _wholesale_cost numeric, _selling_price numeric,
  _customer_id uuid, _customer_name text, _phone text, _whatsapp text,
  _payment_method text, _payment_proof text, _notes text
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  cid uuid := _customer_id;
  oid uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF cid IS NULL THEN
    IF COALESCE(_whatsapp, '') <> '' THEN
      SELECT id INTO cid FROM public.customers WHERE whatsapp = _whatsapp LIMIT 1;
    END IF;
    IF cid IS NULL AND COALESCE(_phone, '') <> '' THEN
      SELECT id INTO cid FROM public.customers WHERE phone = _phone LIMIT 1;
    END IF;
    IF cid IS NULL THEN
      INSERT INTO public.customers (name, phone, whatsapp)
      VALUES (_customer_name, NULLIF(_phone, ''), NULLIF(_whatsapp, ''))
      RETURNING id INTO cid;
    END IF;
  END IF;
  INSERT INTO public.orders (external_order_id, product_id, product_name, quantity, wholesale_cost,
    selling_price, customer_id, payment_method, payment_proof, source, status, notes)
  VALUES ('manual-' || gen_random_uuid()::text, _product_id, _product_name, _quantity, _wholesale_cost,
    _selling_price, cid, _payment_method, NULLIF(_payment_proof, ''), 'manual', 'completed', NULLIF(_notes, ''))
  RETURNING id INTO oid;
  RETURN oid;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_manual_order(text,text,integer,numeric,numeric,uuid,text,text,text,text,text,text) TO authenticated;

-- Report aggregates (RLS applies: invoker)
CREATE OR REPLACE FUNCTION public.report_summary(_from timestamptz, _to timestamptz)
RETURNS TABLE (revenue numeric, cost numeric, profit numeric, order_count bigint, bot_count bigint, manual_count bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT COALESCE(SUM(total_amount),0), COALESCE(SUM(total_cost),0), COALESCE(SUM(profit),0),
         COUNT(*), COUNT(*) FILTER (WHERE source='telegram_bot'), COUNT(*) FILTER (WHERE source='manual')
  FROM public.orders WHERE status='completed' AND created_at >= _from AND created_at < _to
$$;

CREATE OR REPLACE FUNCTION public.report_top_products(_from timestamptz, _to timestamptz, _limit integer DEFAULT 5)
RETURNS TABLE (product_id text, product_name text, units bigint, revenue numeric, profit numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT product_id::text, MAX(product_name)::text, SUM(quantity)::bigint, SUM(total_amount), SUM(profit)
  FROM public.orders WHERE status='completed' AND created_at >= _from AND created_at < _to
  GROUP BY product_id ORDER BY SUM(quantity) DESC LIMIT _limit
$$;

CREATE OR REPLACE FUNCTION public.report_daily_series(_from timestamptz, _to timestamptz, _tz text DEFAULT 'UTC')
RETURNS TABLE (day date, revenue numeric, profit numeric, order_count bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT (created_at AT TIME ZONE _tz)::date AS day, SUM(total_amount), SUM(profit), COUNT(*)
  FROM public.orders WHERE status='completed' AND created_at >= _from AND created_at < _to
  GROUP BY 1 ORDER BY 1
$$;
GRANT EXECUTE ON FUNCTION public.report_summary(timestamptz,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_top_products(timestamptz,timestamptz,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_daily_series(timestamptz,timestamptz,text) TO authenticated;
