CREATE TABLE public.finance_agent_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  agent_name text NOT NULL DEFAULT 'Finance Agent',
  persona text NOT NULL DEFAULT 'You are a careful, polite finance officer at IMT Solutions.',
  enabled_roles text[] NOT NULL DEFAULT ARRAY['invoice_reminders','payment_matching','expense_review'],
  updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.finance_agent_settings (id) VALUES (true);

CREATE TABLE public.finance_agent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  instructions text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'general',
  status text NOT NULL DEFAULT 'queued',
  summary text, error text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz, finished_at timestamptz
);

CREATE TABLE public.finance_agent_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES public.finance_agent_tasks(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  rationale text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid, reviewed_at timestamptz, apply_result text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.finance_agent_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.finance_agent_tasks TO authenticated;
GRANT SELECT ON public.finance_agent_proposals TO authenticated;
GRANT ALL ON public.finance_agent_settings, public.finance_agent_tasks, public.finance_agent_proposals TO service_role;

ALTER TABLE public.finance_agent_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_agent_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance staff read settings" ON public.finance_agent_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'master_admin'));
CREATE POLICY "finance staff edit settings" ON public.finance_agent_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'master_admin'))
  WITH CHECK (public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'master_admin'));
CREATE POLICY "finance staff read tasks" ON public.finance_agent_tasks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'master_admin'));
CREATE POLICY "finance staff add tasks" ON public.finance_agent_tasks FOR INSERT TO authenticated
  WITH CHECK ((public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'master_admin')) AND created_by = auth.uid());
CREATE POLICY "finance staff update tasks" ON public.finance_agent_tasks FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'master_admin'));
CREATE POLICY "finance staff read proposals" ON public.finance_agent_proposals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'master_admin'));