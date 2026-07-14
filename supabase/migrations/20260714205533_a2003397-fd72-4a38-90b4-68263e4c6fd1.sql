REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_any_role(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_master_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_ticket_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_customer_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recompute_invoice_status(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_alloc_after() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_subscription_from_cloud_service() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.has_any_role(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_master_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_customer_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recompute_invoice_status(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trg_alloc_after() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notify_ticket_change() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_subscription_from_cloud_service() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;