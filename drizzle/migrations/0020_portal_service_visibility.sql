CREATE POLICY "portal read own licenses" ON public.licenses FOR SELECT TO authenticated USING (customer_id = public.portal_customer_id(auth.uid()) AND archived_at IS NULL);
CREATE POLICY "portal read own hosting" ON public.web_hosting_accounts FOR SELECT TO authenticated USING (customer_id = public.portal_customer_id(auth.uid()) AND archived_at IS NULL);
CREATE POLICY "portal read own cloud storage" ON public.cloud_storage_accounts FOR SELECT TO authenticated USING (customer_id = public.portal_customer_id(auth.uid()) AND archived_at IS NULL);
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS assigned_seats integer;
CREATE OR REPLACE FUNCTION public.portal_account_manager(_user_id uuid)
RETURNS TABLE(full_name text, email text, phone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.full_name, p.email, p.phone FROM public.customers c
  JOIN public.profiles p ON p.id = c.account_manager_id
  WHERE c.id = public.portal_customer_id(_user_id) AND _user_id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.portal_account_manager(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.portal_account_manager(uuid) TO authenticated;