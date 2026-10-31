CREATE TABLE public.personal_assistant_settings (
  user_id uuid PRIMARY KEY,
  assistant_name text NOT NULL DEFAULT 'Personal Assistant',
  persona text NOT NULL DEFAULT '',
  enabled_roles text[] NOT NULL DEFAULT ARRAY['email_summary','reply_drafting','daily_briefing','client_followups'],
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_assistant_settings TO authenticated;
GRANT ALL ON public.personal_assistant_settings TO service_role;
ALTER TABLE public.personal_assistant_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages assistant settings" ON public.personal_assistant_settings FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.personal_assistant_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  instructions text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'running',
  summary text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_assistant_tasks TO authenticated;
GRANT ALL ON public.personal_assistant_tasks TO service_role;
ALTER TABLE public.personal_assistant_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages assistant tasks" ON public.personal_assistant_tasks FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX personal_assistant_tasks_user_idx ON public.personal_assistant_tasks (user_id, created_at DESC);