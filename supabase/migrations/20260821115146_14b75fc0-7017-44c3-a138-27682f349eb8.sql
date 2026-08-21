-- 1. Pin search_path on the remaining mutable functions
ALTER FUNCTION public.fill_account_number_from_customer() SET search_path = public;
ALTER FUNCTION public.fill_cred_account_number() SET search_path = public;
ALTER FUNCTION public.gen_customer_account_number() SET search_path = public;
ALTER FUNCTION public.prevent_account_number_change() SET search_path = public;

-- 2. Trigger + internal functions: nobody should call these over the API
REVOKE ALL ON FUNCTION public.fill_account_number_from_customer() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fill_cred_account_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_account_number_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gen_customer_account_number() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_ticket_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_po_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_receipt_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_subscription_from_cloud_service() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_alloc_after() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_alloc_reconcile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_invoice_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_payment_reconciliation(uuid) FROM PUBLIC, anon, authenticated;

-- 3. RLS helper functions: needed by signed-in staff (policies evaluate them as the caller), never by anon
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_any_role(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_master_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_workspace_role(uuid, uuid, public.workspace_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_workspace_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.workspace_role_of(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_customer_id(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_master_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_workspace_role(uuid, uuid, public.workspace_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_role_of(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_customer_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gen_customer_account_number() TO authenticated;