GRANT INSERT ON public.service_ops_events TO authenticated;
DROP POLICY IF EXISTS "Staff log own service ops events" ON public.service_ops_events;
CREATE POLICY "Staff log own service ops events" ON public.service_ops_events
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid()) AND actor_id = auth.uid() AND status IN ('success','failed'));