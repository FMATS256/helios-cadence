CREATE TABLE IF NOT EXISTS public.customer_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  shared_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.customer_shares TO authenticated;
GRANT ALL ON public.customer_shares TO service_role;
ALTER TABLE public.customer_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shares read own or admin" ON public.customer_shares FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'master_admin') OR public.has_role(auth.uid(), 'operations_manager'));
CREATE POLICY "shares managed by admins" ON public.customer_shares FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master_admin') OR public.has_role(auth.uid(), 'operations_manager'))
  WITH CHECK (public.has_role(auth.uid(), 'master_admin') OR public.has_role(auth.uid(), 'operations_manager'));

-- Staff who are only in sales/account management (no other department)
CREATE OR REPLACE FUNCTION public.is_sales_only(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_sales_staff(_uid) AND NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role::text NOT IN ('sales','account_manager','corporate_account_manager','customer_account_manager','key_account_manager','customer_success','custom'))
$$;
CREATE OR REPLACE FUNCTION public.can_see_customer(_uid uuid, _customer uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_any_role(_uid) AND (
    NOT public.is_sales_only(_uid)
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = _customer AND (c.account_manager_id = _uid OR c.created_by = _uid))
    OR EXISTS (SELECT 1 FROM public.customer_shares s WHERE s.customer_id = _customer AND s.user_id = _uid))
$$;
CREATE OR REPLACE FUNCTION public.manages_customer(_uid uuid, _customer uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.customers WHERE id = _customer AND (account_manager_id = _uid OR created_by = _uid))
      OR EXISTS (SELECT 1 FROM public.customer_shares WHERE customer_id = _customer AND user_id = _uid)
$$;
GRANT EXECUTE ON FUNCTION public.is_sales_only(uuid), public.can_see_customer(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "customers read for any role" ON public.customers;
CREATE POLICY "customers read for any role" ON public.customers FOR SELECT TO authenticated
  USING (public.can_see_customer(auth.uid(), id));

-- NOC/technical staff can see invoices and payments made (not ledgers, cash or expenses)
DO $mig$
DECLARE t text; p record; q text;
BEGIN
  FOREACH t IN ARRAY ARRAY['invoices','invoice_line_items','payments','payment_allocations'] LOOP
    FOR p IN SELECT policyname, qual FROM pg_policies WHERE schemaname='public' AND tablename=t AND cmd='SELECT' AND qual LIKE '%is_finance_staff%' LOOP
      EXECUTE format('ALTER POLICY %I ON public.%I USING ((%s) OR public.is_tech_staff(auth.uid()))', p.policyname, t, p.qual);
    END LOOP;
  END LOOP;
  -- Finance gets view-only access to service/technical records
  FOR p IN SELECT tablename, policyname, qual FROM pg_policies WHERE schemaname='public' AND cmd='SELECT'
           AND qual LIKE '%is_tech_staff(auth.uid())%' AND qual LIKE '%is_sales_staff(auth.uid())%' AND qual NOT LIKE '%is_finance_staff%' LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I USING ((%s) OR public.is_finance_staff(auth.uid()))', p.policyname, p.tablename, p.qual);
  END LOOP;
END
$mig$;