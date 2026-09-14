CREATE POLICY "finance staff read receipts" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'finance-receipts' AND (public.is_master_admin(auth.uid()) OR public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'operations_manager')));

CREATE POLICY "finance staff upload receipts" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'finance-receipts' AND (public.is_master_admin(auth.uid()) OR public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'operations_manager')));

CREATE POLICY "finance staff update receipts" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'finance-receipts' AND (public.is_master_admin(auth.uid()) OR public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'operations_manager')));

CREATE POLICY "finance staff delete receipts" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'finance-receipts' AND (public.is_master_admin(auth.uid()) OR public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'operations_manager')));