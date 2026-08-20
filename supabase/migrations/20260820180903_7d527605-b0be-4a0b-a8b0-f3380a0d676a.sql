-- POS: point of sale for hardware, routers, switches and stock

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS sale_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_sellable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS barcode text;

CREATE TABLE IF NOT EXISTS public.pos_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_number text NOT NULL UNIQUE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  account_number text,
  walkin_name text,
  walkin_phone text,
  subtotal numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  payment_method text NOT NULL DEFAULT 'cash',
  amount_paid numeric NOT NULL DEFAULT 0,
  change_due numeric NOT NULL DEFAULT 0,
  account_id uuid REFERENCES public.cash_accounts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'completed',
  notes text,
  sold_by uuid,
  sold_by_name text,
  voided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pos_sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.pos_sales(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  sku text,
  name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pos_sales_created_at_idx ON public.pos_sales (created_at DESC);
CREATE INDEX IF NOT EXISTS pos_sale_items_sale_idx ON public.pos_sale_items (sale_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_sales TO authenticated;
GRANT ALL ON public.pos_sales TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_sale_items TO authenticated;
GRANT ALL ON public.pos_sale_items TO service_role;

ALTER TABLE public.pos_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_sale_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read pos sales" ON public.pos_sales FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "Staff write pos sales" ON public.pos_sales FOR ALL TO authenticated USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));
CREATE POLICY "Staff read pos sale items" ON public.pos_sale_items FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "Staff write pos sale items" ON public.pos_sale_items FOR ALL TO authenticated USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));

CREATE TRIGGER pos_sales_set_updated_at BEFORE UPDATE ON public.pos_sales
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();