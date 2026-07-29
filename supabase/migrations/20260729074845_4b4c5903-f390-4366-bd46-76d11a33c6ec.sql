-- ============ Customer 360 Block 1 foundation ============

-- 1. KYC / customer documents
CREATE TABLE public.customer_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  account_number text NOT NULL,
  doc_key text NOT NULL,
  doc_label text NOT NULL,
  category text NOT NULL DEFAULT 'kyc',
  file_path text,
  file_name text,
  mime_type text,
  file_size integer,
  status text NOT NULL DEFAULT 'pending',
  issued_on date,
  expires_at date,
  notes text,
  uploaded_by uuid,
  verified_by uuid,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_documents TO authenticated;
GRANT ALL ON public.customer_documents TO service_role;
ALTER TABLE public.customer_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage customer documents" ON public.customer_documents
  FOR ALL TO authenticated USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));
CREATE POLICY "Portal users read own documents" ON public.customer_documents
  FOR SELECT TO authenticated USING (customer_id = public.portal_customer_id(auth.uid()));
CREATE INDEX idx_customer_documents_customer ON public.customer_documents(customer_id);
CREATE TRIGGER trg_customer_documents_updated BEFORE UPDATE ON public.customer_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Package / subscription change history
CREATE TABLE public.subscription_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  account_number text NOT NULL,
  change_type text NOT NULL,
  from_plan text,
  to_plan text,
  from_amount numeric,
  to_amount numeric,
  from_cycle text,
  to_cycle text,
  from_status text,
  to_status text,
  effective_on date NOT NULL DEFAULT CURRENT_DATE,
  reason text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.subscription_history TO authenticated;
GRANT ALL ON public.subscription_history TO service_role;
ALTER TABLE public.subscription_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read subscription history" ON public.subscription_history
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "Staff write subscription history" ON public.subscription_history
  FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid()));
CREATE INDEX idx_subscription_history_customer ON public.subscription_history(customer_id);

-- 3. Refunds
CREATE TABLE public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  account_number text NOT NULL,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  method text,
  reference text,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  refunded_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.refunds TO authenticated;
GRANT ALL ON public.refunds TO service_role;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage refunds" ON public.refunds
  FOR ALL TO authenticated USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));
CREATE INDEX idx_refunds_customer ON public.refunds(customer_id);
CREATE TRIGGER trg_refunds_updated BEFORE UPDATE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Customer credit / wallet ledger (signed entries)
CREATE TABLE public.customer_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  account_number text NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  kind text NOT NULL DEFAULT 'credit',
  source_payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  source_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.customer_credits TO authenticated;
GRANT ALL ON public.customer_credits TO service_role;
ALTER TABLE public.customer_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read customer credits" ON public.customer_credits
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "Staff write customer credits" ON public.customer_credits
  FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid()));
CREATE INDEX idx_customer_credits_customer ON public.customer_credits(customer_id);

-- 5. Note typing so billing / finance notes can live beside general notes
ALTER TABLE public.customer_notes ADD COLUMN IF NOT EXISTS note_type text NOT NULL DEFAULT 'general';

-- 6. Communications: prepare for SMS / WhatsApp / call logs threading
ALTER TABLE public.communications ADD COLUMN IF NOT EXISTS thread_id uuid;
ALTER TABLE public.communications ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.communications(id) ON DELETE SET NULL;
ALTER TABLE public.communications ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_communications_thread ON public.communications(thread_id);
