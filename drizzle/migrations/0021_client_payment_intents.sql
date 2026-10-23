CREATE TABLE public.client_payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'USD',
  method text NOT NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'PROCESSING',
  submission_id uuid REFERENCES public.payment_submissions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.client_payment_intents TO authenticated;
GRANT ALL ON public.client_payment_intents TO service_role;
ALTER TABLE public.client_payment_intents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client reads own intents" ON public.client_payment_intents FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_any_role(auth.uid()));
CREATE POLICY "client creates own intents" ON public.client_payment_intents FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND customer_id = public.portal_customer_id(auth.uid()));