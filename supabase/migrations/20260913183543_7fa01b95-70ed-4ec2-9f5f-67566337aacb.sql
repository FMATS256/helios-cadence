REVOKE EXECUTE ON FUNCTION public.is_billing_staff(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_billing_staff(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_billing_staff(uuid) TO authenticated, service_role;