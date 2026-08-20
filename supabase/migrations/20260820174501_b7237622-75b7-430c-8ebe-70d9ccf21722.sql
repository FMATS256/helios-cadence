-- Vendors
CREATE TABLE public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  contact_name text,
  email text,
  phone text,
  website text,
  address text,
  country text,
  currency text NOT NULL DEFAULT 'USD',
  payment_terms text NOT NULL DEFAULT 'net_30',
  tax_number text,
  status text NOT NULL DEFAULT 'active',
  rating int NOT NULL DEFAULT 3,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO authenticated;
GRANT ALL ON public.vendors TO service_role;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read vendors" ON public.vendors FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "staff write vendors" ON public.vendors FOR ALL TO authenticated USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));
CREATE TRIGGER vendors_updated BEFORE UPDATE ON public.vendors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE SEQUENCE IF NOT EXISTS public.po_number_seq START 1001;

CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text UNIQUE,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_date date,
  received_date date,
  currency text NOT NULL DEFAULT 'USD',
  fx_rate numeric NOT NULL DEFAULT 1,
  subtotal numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read pos" ON public.purchase_orders FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "staff write pos" ON public.purchase_orders FOR ALL TO authenticated USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));
CREATE TRIGGER purchase_orders_updated BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.set_po_number()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.po_number IS NULL OR NEW.po_number = '' THEN
    NEW.po_number := 'PO-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.po_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER purchase_orders_set_number BEFORE INSERT ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.set_po_number();

CREATE TABLE public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  received_qty numeric NOT NULL DEFAULT 0,
  line_total numeric GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_items TO authenticated;
GRANT ALL ON public.purchase_order_items TO service_role;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage po items" ON public.purchase_order_items FOR ALL TO authenticated USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));

-- Multi-currency
CREATE TABLE public.exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency text NOT NULL DEFAULT 'USD',
  currency text NOT NULL,
  rate numeric NOT NULL,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  source text NOT NULL DEFAULT 'manual',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (base_currency, currency, effective_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exchange_rates TO authenticated;
GRANT ALL ON public.exchange_rates TO service_role;
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read rates" ON public.exchange_rates FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "staff write rates" ON public.exchange_rates FOR ALL TO authenticated USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));

INSERT INTO public.exchange_rates (currency, rate, source) VALUES
  ('USD', 1, 'system'), ('ZWG', 26.5, 'manual'), ('ZAR', 18.2, 'manual'), ('GBP', 0.79, 'manual'), ('EUR', 0.92, 'manual')
ON CONFLICT DO NOTHING;

-- NOC additions
ALTER TABLE public.monitoring_incidents
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'major',
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid,
  ADD COLUMN IF NOT EXISTS ack_note text;

CREATE TABLE public.noc_shift_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_date date NOT NULL DEFAULT CURRENT_DATE,
  shift text NOT NULL DEFAULT 'day',
  author_id uuid,
  author_email text,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.noc_shift_notes TO authenticated;
GRANT ALL ON public.noc_shift_notes TO service_role;
ALTER TABLE public.noc_shift_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage noc notes" ON public.noc_shift_notes FOR ALL TO authenticated USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));

-- link expenses to vendors
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS fx_rate numeric NOT NULL DEFAULT 1;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL;