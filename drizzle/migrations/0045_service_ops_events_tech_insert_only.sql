DROP POLICY IF EXISTS "Staff log own service ops events" ON public.service_ops_events;
CREATE POLICY "Staff log own service ops events" ON public.service_ops_events
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.is_tech_staff(auth.uid()) OR public.is_master_admin(auth.uid()) OR public.has_role(auth.uid(), 'operations_manager'))
    AND actor_id = auth.uid() AND status IN ('success','failed')
  );