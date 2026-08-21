ALTER TABLE public.pos_sales ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;
ALTER TABLE public.pos_sales ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL;
ALTER TABLE public.pos_sales ADD COLUMN IF NOT EXISTS closeout_id uuid;

CREATE TABLE IF NOT EXISTS public.pos_closeouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_date date NOT NULL,
  opened_at timestamptz,
  closed_at timestamptz NOT NULL DEFAULT now(),
  account_id uuid REFERENCES public.cash_accounts(id) ON DELETE SET NULL,
  currency text NOT NULL DEFAULT 'USD',
  sales_count integer NOT NULL DEFAULT 0,
  units_sold numeric NOT NULL DEFAULT 0,
  gross_sales numeric NOT NULL DEFAULT 0,
  discounts numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  net_sales numeric NOT NULL DEFAULT 0,
  cost_of_sales numeric NOT NULL DEFAULT 0,
  gross_profit numeric NOT NULL DEFAULT 0,
  expected_cash numeric NOT NULL DEFAULT 0,
  counted_cash numeric NOT NULL DEFAULT 0,
  variance numeric NOT NULL DEFAULT 0,
  method_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_closeouts TO authenticated;
GRANT ALL ON public.pos_closeouts TO service_role;
ALTER TABLE public.pos_closeouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read pos closeouts" ON public.pos_closeouts FOR SELECT TO authenticated USING (has_any_role(auth.uid()));
CREATE POLICY "Staff write pos closeouts" ON public.pos_closeouts FOR ALL TO authenticated USING (has_any_role(auth.uid())) WITH CHECK (has_any_role(auth.uid()));