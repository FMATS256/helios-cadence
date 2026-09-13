ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS requested_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS request_reason text,
  ADD COLUMN IF NOT EXISTS refund_account_id uuid REFERENCES public.cash_accounts(id),
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_notes text;

CREATE INDEX IF NOT EXISTS refunds_status_idx ON public.refunds (status);
CREATE INDEX IF NOT EXISTS refunds_requested_by_idx ON public.refunds (requested_by);