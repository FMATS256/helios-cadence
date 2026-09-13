CREATE TABLE public.payment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  account_number text,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'USD',
  method text NOT NULL DEFAULT 'bank_transfer',
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  reference text,
  proof_document_id uuid REFERENCES public.customer_documents(id) ON DELETE SET NULL,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','clarification','approved','rejected','cancelled')),
  duplicate_flag jsonb,
  submitted_by uuid,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  rejection_reason text,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  receipt_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_submissions_customer ON public.payment_submissions(customer_id);
CREATE INDEX idx_payment_submissions_status ON public.payment_submissions(status);
CREATE INDEX idx_payment_submissions_submitter ON public.payment_submissions(submitted_by);

GRANT SELECT, INSERT, UPDATE ON public.payment_submissions TO authenticated;
GRANT ALL ON public.payment_submissions TO service_role;

ALTER TABLE public.payment_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view payment submissions"
  ON public.payment_submissions FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));

CREATE POLICY "Staff can create their own payment submissions"
  ON public.payment_submissions FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid()) AND submitted_by = auth.uid());

CREATE POLICY "Billing can review payment submissions"
  ON public.payment_submissions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'finance') OR public.has_role(auth.uid(), 'operations_manager') OR public.is_master_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'finance') OR public.has_role(auth.uid(), 'operations_manager') OR public.is_master_admin(auth.uid()));

CREATE TRIGGER payment_submissions_updated
  BEFORE UPDATE ON public.payment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER payment_submissions_fill_acct
  BEFORE INSERT ON public.payment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.fill_account_number_from_customer();

CREATE TABLE public.payment_submission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.payment_submissions(id) ON DELETE CASCADE,
  actor_id uuid,
  action text NOT NULL,
  notes text,
  document_id uuid REFERENCES public.customer_documents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_submission_events_submission ON public.payment_submission_events(submission_id);

GRANT SELECT, INSERT ON public.payment_submission_events TO authenticated;
GRANT ALL ON public.payment_submission_events TO service_role;

ALTER TABLE public.payment_submission_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view submission history"
  ON public.payment_submission_events FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));

CREATE POLICY "Staff can add submission history"
  ON public.payment_submission_events FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid()) AND actor_id = auth.uid());