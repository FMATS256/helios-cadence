-- cloud_servers: drop anonymous access, keep workspace read, add staff access
DROP POLICY IF EXISTS "cloud_servers open read" ON public.cloud_servers;
DROP POLICY IF EXISTS "cloud_servers open write" ON public.cloud_servers;
CREATE POLICY "cloud_servers staff read" ON public.cloud_servers
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "cloud_servers staff write" ON public.cloud_servers
  FOR ALL TO authenticated
  USING (public.is_master_admin(auth.uid()) OR public.has_role(auth.uid(),'cloud_engineer') OR public.has_role(auth.uid(),'operations_manager') OR public.has_role(auth.uid(),'technical_support') OR public.has_role(auth.uid(),'noc'))
  WITH CHECK (public.is_master_admin(auth.uid()) OR public.has_role(auth.uid(),'cloud_engineer') OR public.has_role(auth.uid(),'operations_manager') OR public.has_role(auth.uid(),'technical_support') OR public.has_role(auth.uid(),'noc'));

-- cloud_deployments
DROP POLICY IF EXISTS "cloud_deployments open read" ON public.cloud_deployments;
DROP POLICY IF EXISTS "cloud_deployments open write" ON public.cloud_deployments;
CREATE POLICY "cloud_deployments staff read" ON public.cloud_deployments
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "cloud_deployments staff write" ON public.cloud_deployments
  FOR ALL TO authenticated
  USING (public.is_master_admin(auth.uid()) OR public.has_role(auth.uid(),'cloud_engineer') OR public.has_role(auth.uid(),'operations_manager') OR public.has_role(auth.uid(),'technical_support'))
  WITH CHECK (public.is_master_admin(auth.uid()) OR public.has_role(auth.uid(),'cloud_engineer') OR public.has_role(auth.uid(),'operations_manager') OR public.has_role(auth.uid(),'technical_support'));

-- cloud_activity
DROP POLICY IF EXISTS "cloud_activity open read" ON public.cloud_activity;
DROP POLICY IF EXISTS "cloud_activity open insert" ON public.cloud_activity;
CREATE POLICY "cloud_activity staff read" ON public.cloud_activity
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "cloud_activity staff insert" ON public.cloud_activity
  FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid()));

-- credential_versions: align with the trusted-role rule on credentials
DROP POLICY IF EXISTS "credver insert" ON public.credential_versions;
CREATE POLICY "credver insert trusted" ON public.credential_versions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_master_admin(auth.uid()) OR public.has_role(auth.uid(),'technical_support') OR public.has_role(auth.uid(),'cloud_engineer') OR public.has_role(auth.uid(),'cyber_security'));

-- notifications: only trusted roles may notify other users
DROP POLICY IF EXISTS "staff insert notifications" ON public.notifications;
CREATE POLICY "staff insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_master_admin(auth.uid())
    OR public.has_role(auth.uid(),'operations_manager')
    OR public.has_role(auth.uid(),'finance')
    OR public.has_role(auth.uid(),'technical_support')
    OR public.has_role(auth.uid(),'customer_success')
    OR public.has_role(auth.uid(),'noc')
  );