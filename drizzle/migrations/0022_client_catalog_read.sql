CREATE POLICY "catalog read portal clients active" ON public.service_catalog FOR SELECT TO authenticated
  USING (is_active AND public.portal_customer_id(auth.uid()) IS NOT NULL);