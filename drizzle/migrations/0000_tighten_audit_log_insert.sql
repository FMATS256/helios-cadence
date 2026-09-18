DROP POLICY IF EXISTS "audit insert any" ON public.audit_log;
CREATE POLICY "audit insert own actor" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());