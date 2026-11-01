ALTER TABLE public.pos_sales
  ADD COLUMN IF NOT EXISTS reconciliation_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciled_by uuid,
  ADD COLUMN IF NOT EXISTS reconciled_by_name text,
  ADD COLUMN IF NOT EXISTS reconciliation_note text;
UPDATE public.pos_sales SET reconciliation_status = 'reconciled', reconciled_at = COALESCE(reconciled_at, created_at)
  WHERE payment_id IS NOT NULL OR status = 'void';
ALTER TABLE public.pos_sales ADD CONSTRAINT pos_sales_reconciliation_status_chk
  CHECK (reconciliation_status IN ('pending','reconciled','disputed'));

ALTER TABLE public.pos_closeouts
  ADD COLUMN IF NOT EXISTS finance_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS finance_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS finance_reviewed_by_name text,
  ADD COLUMN IF NOT EXISTS finance_review_note text;

CREATE OR REPLACE FUNCTION public.is_pos_staff(_uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role::text IN
    ('master_admin','operations_manager','finance','procurement','sales','inventory','account_manager',
     'corporate_account_manager','customer_account_manager','key_account_manager','customer_success'))
$$;

-- Only Finance may mark sales reconciled or change sales Finance already reconciled.
CREATE OR REPLACE FUNCTION public.guard_pos_reconciliation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_billing_staff(auth.uid()) THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.reconciliation_status := 'pending'; NEW.reconciled_at := NULL; NEW.reconciled_by := NULL;
    NEW.reconciled_by_name := NULL; NEW.payment_id := NULL; NEW.invoice_id := NULL;
    RETURN NEW;
  END IF;
  IF OLD.reconciliation_status = 'reconciled' THEN
    RAISE EXCEPTION 'This sale has been reconciled by Finance and can only be changed by Finance';
  END IF;
  IF NEW.reconciliation_status IS DISTINCT FROM OLD.reconciliation_status
     OR NEW.payment_id IS DISTINCT FROM OLD.payment_id OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
     OR NEW.reconciled_at IS DISTINCT FROM OLD.reconciled_at THEN
    RAISE EXCEPTION 'Only Finance can reconcile POS sales';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_pos_reconciliation ON public.pos_sales;
CREATE TRIGGER trg_guard_pos_reconciliation BEFORE INSERT OR UPDATE ON public.pos_sales
  FOR EACH ROW EXECUTE FUNCTION public.guard_pos_reconciliation();

CREATE OR REPLACE FUNCTION public.guard_pos_closeout_review() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_billing_staff(auth.uid()) THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.finance_reviewed_at := NULL; NEW.finance_reviewed_by := NULL; NEW.finance_reviewed_by_name := NULL;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Only Finance can change a closed trading day';
END $$;
DROP TRIGGER IF EXISTS trg_guard_pos_closeout_review ON public.pos_closeouts;
CREATE TRIGGER trg_guard_pos_closeout_review BEFORE INSERT OR UPDATE ON public.pos_closeouts
  FOR EACH ROW EXECUTE FUNCTION public.guard_pos_closeout_review();

DROP POLICY IF EXISTS "Staff write pos sales" ON public.pos_sales;
DROP POLICY IF EXISTS "Staff write pos sale items" ON public.pos_sale_items;
DROP POLICY IF EXISTS "Staff write pos closeouts" ON public.pos_closeouts;
CREATE POLICY "POS staff write pos sales" ON public.pos_sales FOR ALL TO authenticated
  USING (public.is_pos_staff(auth.uid())) WITH CHECK (public.is_pos_staff(auth.uid()));
CREATE POLICY "POS staff write pos sale items" ON public.pos_sale_items FOR ALL TO authenticated
  USING (public.is_pos_staff(auth.uid())) WITH CHECK (public.is_pos_staff(auth.uid()));
CREATE POLICY "POS staff write pos closeouts" ON public.pos_closeouts FOR ALL TO authenticated
  USING (public.is_pos_staff(auth.uid())) WITH CHECK (public.is_pos_staff(auth.uid()));