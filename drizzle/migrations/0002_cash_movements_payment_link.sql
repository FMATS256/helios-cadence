ALTER TABLE public.cash_movements
  ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cash_movements_payment_id_idx ON public.cash_movements(payment_id);