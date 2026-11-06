CREATE TABLE public.work_order_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.service_tasks(id) ON DELETE CASCADE,
  author_id uuid,
  kind text NOT NULL DEFAULT 'comment',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX work_order_updates_task_idx ON public.work_order_updates(task_id, created_at);
GRANT SELECT, INSERT ON public.work_order_updates TO authenticated;
GRANT ALL ON public.work_order_updates TO service_role;
ALTER TABLE public.work_order_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read work order updates" ON public.work_order_updates FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "Staff add own work order updates" ON public.work_order_updates FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid()) AND author_id = auth.uid());