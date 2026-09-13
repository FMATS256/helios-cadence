CREATE OR REPLACE FUNCTION public.is_billing_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_master_admin(_user_id)
      OR public.has_role(_user_id, 'finance')
      OR public.has_role(_user_id, 'operations_manager')
$$;

-- Invoices
DROP POLICY IF EXISTS "invoices auth write" ON public.invoices;
CREATE POLICY "billing write invoices" ON public.invoices FOR ALL TO authenticated
  USING (public.is_billing_staff(auth.uid())) WITH CHECK (public.is_billing_staff(auth.uid()));

-- Invoice line items
DROP POLICY IF EXISTS "staff manage inv items" ON public.invoice_line_items;
CREATE POLICY "staff read inv items" ON public.invoice_line_items FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));
CREATE POLICY "billing write inv items" ON public.invoice_line_items FOR ALL TO authenticated
  USING (public.is_billing_staff(auth.uid())) WITH CHECK (public.is_billing_staff(auth.uid()));

-- Payments
DROP POLICY IF EXISTS "staff write payments" ON public.payments;
CREATE POLICY "billing write payments" ON public.payments FOR ALL TO authenticated
  USING (public.is_billing_staff(auth.uid())) WITH CHECK (public.is_billing_staff(auth.uid()));

-- Payment allocations
DROP POLICY IF EXISTS "staff manage allocs" ON public.payment_allocations;
CREATE POLICY "staff read allocs" ON public.payment_allocations FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));
CREATE POLICY "billing write allocs" ON public.payment_allocations FOR ALL TO authenticated
  USING (public.is_billing_staff(auth.uid())) WITH CHECK (public.is_billing_staff(auth.uid()));