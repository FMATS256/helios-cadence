CREATE OR REPLACE FUNCTION public.is_finance_staff(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role::text IN ('master_admin','operations_manager','finance','procurement'))
$$;
CREATE OR REPLACE FUNCTION public.is_tech_staff(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role::text IN ('master_admin','operations_manager','technical_support','noc','cyber_security','cloud_engineer'))
$$;
CREATE OR REPLACE FUNCTION public.is_sales_staff(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role::text IN ('master_admin','operations_manager','sales','account_manager','corporate_account_manager','customer_account_manager','key_account_manager','customer_success'))
$$;
CREATE OR REPLACE FUNCTION public.manages_customer(_uid uuid, _customer uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.customers WHERE id = _customer AND account_manager_id = _uid)
$$;
GRANT EXECUTE ON FUNCTION public.is_finance_staff(uuid), public.is_tech_staff(uuid), public.is_sales_staff(uuid), public.manages_customer(uuid, uuid) TO authenticated, service_role;

DO $mig$
DECLARE
  t text; p record; grp text; has_cust boolean; sel text; wr text;
  finance_t text[] := ARRAY['invoices','invoice_line_items','payments','payment_allocations','journal_entries','journal_lines','expenses','cash_accounts','cash_movements','chart_of_accounts','refunds','customer_credits','budget_alerts','customer_budgets'];
  tech_t text[] := ARRAY['cloud_activity','cloud_deployments','cloud_servers','monitoring_checks','monitoring_incidents','monitoring_results','server_metrics','server_backups','server_cost_entries','server_action_requests','ops_alerts','ops_alert_events','deployment_steps','deployment_workflows','backup_schedules','noc_shift_notes','alert_rules'];
  sales_t text[] := ARRAY['quotes','quote_line_items','leads'];
BEGIN
  FOREACH t IN ARRAY finance_t || tech_t || sales_t LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    grp := CASE WHEN t = ANY(finance_t) THEN 'finance' WHEN t = ANY(tech_t) THEN 'tech' ELSE 'sales' END;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='customer_id') INTO has_cust;
    IF grp = 'finance' THEN
      wr := 'public.is_finance_staff(auth.uid())';
      sel := wr || CASE WHEN has_cust THEN ' OR (public.is_sales_staff(auth.uid()) AND public.manages_customer(auth.uid(), customer_id))'
                        WHEN t = 'invoice_line_items' THEN ' OR (public.is_sales_staff(auth.uid()) AND EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND public.manages_customer(auth.uid(), i.customer_id)))'
                        ELSE '' END;
    ELSIF grp = 'tech' THEN
      wr := 'public.is_tech_staff(auth.uid())';
      sel := wr || ' OR public.is_sales_staff(auth.uid())';
    ELSE
      wr := 'public.is_sales_staff(auth.uid()) OR public.is_finance_staff(auth.uid())';
      sel := wr;
    END IF;
    FOR p IN SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename=t
             AND (qual = 'has_any_role(auth.uid())' OR (qual IS NULL AND with_check = 'has_any_role(auth.uid())')) LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
      IF p.cmd = 'SELECT' THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)', p.policyname, t, sel);
      ELSIF p.cmd = 'INSERT' THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)', p.policyname, t, wr);
      ELSE
        EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO authenticated USING (%s) WITH CHECK (%s)', p.policyname, t, p.cmd, wr, wr);
      END IF;
    END LOOP;
  END LOOP;
END
$mig$;