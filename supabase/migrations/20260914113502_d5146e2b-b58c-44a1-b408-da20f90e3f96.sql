ALTER TABLE public.payment_submissions ADD COLUMN IF NOT EXISTS cash_account_id uuid REFERENCES public.cash_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS cash_account_id uuid REFERENCES public.cash_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS payment_submissions_cash_account_idx ON public.payment_submissions(cash_account_id);
CREATE INDEX IF NOT EXISTS payments_cash_account_idx ON public.payments(cash_account_id);