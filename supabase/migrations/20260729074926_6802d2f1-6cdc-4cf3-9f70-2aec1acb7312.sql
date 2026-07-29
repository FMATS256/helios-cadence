CREATE POLICY "Staff read customer docs" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'customer-documents' AND public.has_any_role(auth.uid()));
CREATE POLICY "Staff upload customer docs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'customer-documents' AND public.has_any_role(auth.uid()));
CREATE POLICY "Staff update customer docs" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'customer-documents' AND public.has_any_role(auth.uid()))
  WITH CHECK (bucket_id = 'customer-documents' AND public.has_any_role(auth.uid()));
CREATE POLICY "Staff delete customer docs" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'customer-documents' AND public.has_any_role(auth.uid()));
