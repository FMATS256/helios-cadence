CREATE POLICY "Staff can read job photos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'job-photos' AND public.has_any_role(auth.uid()));

CREATE POLICY "Staff can upload job photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'job-photos' AND public.has_any_role(auth.uid()));

CREATE POLICY "Staff can update job photos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'job-photos' AND public.has_any_role(auth.uid()))
WITH CHECK (bucket_id = 'job-photos' AND public.has_any_role(auth.uid()));

CREATE POLICY "Staff can delete job photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'job-photos' AND public.has_any_role(auth.uid()));

CREATE POLICY "Customers can read their job photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'job-photos'
  AND EXISTS (
    SELECT 1
    FROM public.job_photos jp
    JOIN public.service_tasks st ON st.id = jp.task_id
    WHERE jp.storage_path = storage.objects.name
      AND st.customer_id = public.portal_customer_id(auth.uid())
  )
);