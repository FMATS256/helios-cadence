CREATE TABLE public.invoice_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  account_number text,
  title text NOT NULL,
  description text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  currency text NOT NULL DEFAULT 'USD',
  estimated_amount numeric NOT NULL DEFAULT 0,
  due_days integer NOT NULL DEFAULT 14,
  needed_by date,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_notes text,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.invoice_requests TO authenticated;
GRANT ALL ON public.invoice_requests TO service_role;

ALTER TABLE public.invoice_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view invoice requests" ON public.invoice_requests
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));

CREATE POLICY "Staff can create invoice requests" ON public.invoice_requests
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid()) AND requested_by = auth.uid());

CREATE POLICY "Billing or requester can update invoice requests" ON public.invoice_requests
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'finance')
    OR public.has_role(auth.uid(), 'operations_manager')
    OR public.is_master_admin(auth.uid())
    OR requested_by = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'finance')
    OR public.has_role(auth.uid(), 'operations_manager')
    OR public.is_master_admin(auth.uid())
    OR requested_by = auth.uid()
  );

CREATE INDEX idx_invoice_requests_status ON public.invoice_requests(status);
CREATE INDEX idx_invoice_requests_customer ON public.invoice_requests(customer_id);
CREATE INDEX idx_invoice_requests_requester ON public.invoice_requests(requested_by);

CREATE TRIGGER invoice_requests_updated BEFORE UPDATE ON public.invoice_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER invoice_requests_fill_acct BEFORE INSERT ON public.invoice_requests
  FOR EACH ROW EXECUTE FUNCTION public.fill_account_number_from_customer();