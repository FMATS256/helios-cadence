
-- Add receipt number + reconciliation to payments
CREATE SEQUENCE IF NOT EXISTS public.receipt_number_seq START 1000;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS receipt_number text UNIQUE,
  ADD COLUMN IF NOT EXISTS reconciliation_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS service_context text;

-- Backfill receipt numbers for existing payments
UPDATE public.payments
SET receipt_number = 'RCP-' || lpad(nextval('public.receipt_number_seq')::text, 5, '0')
WHERE receipt_number IS NULL;

-- Auto-generate receipt number on insert
CREATE OR REPLACE FUNCTION public.set_receipt_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.receipt_number IS NULL OR NEW.receipt_number = '' THEN
    NEW.receipt_number := 'RCP-' || lpad(nextval('public.receipt_number_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS payments_set_receipt ON public.payments;
CREATE TRIGGER payments_set_receipt
BEFORE INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.set_receipt_number();

-- Auto-mark reconciliation status based on allocations vs amount
CREATE OR REPLACE FUNCTION public.recompute_payment_reconciliation(_payment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE pay_total numeric; alloc_sum numeric;
BEGIN
  SELECT amount INTO pay_total FROM public.payments WHERE id = _payment_id;
  SELECT COALESCE(SUM(amount), 0) INTO alloc_sum FROM public.payment_allocations WHERE payment_id = _payment_id;
  UPDATE public.payments SET reconciliation_status = CASE
    WHEN alloc_sum = 0 THEN 'pending'
    WHEN alloc_sum >= pay_total THEN 'matched'
    WHEN alloc_sum > 0 AND alloc_sum < pay_total THEN 'partial'
    ELSE 'pending'
  END WHERE id = _payment_id;
END $$;

CREATE OR REPLACE FUNCTION public.trg_alloc_reconcile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recompute_payment_reconciliation(COALESCE(NEW.payment_id, OLD.payment_id));
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS alloc_reconcile_after ON public.payment_allocations;
CREATE TRIGGER alloc_reconcile_after
AFTER INSERT OR UPDATE OR DELETE ON public.payment_allocations
FOR EACH ROW EXECUTE FUNCTION public.trg_alloc_reconcile();
