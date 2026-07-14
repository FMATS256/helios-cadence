REVOKE ALL ON FUNCTION public.sync_subscription_from_cloud_service() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_subscription_from_cloud_service() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_subscription_from_cloud_service() TO service_role;