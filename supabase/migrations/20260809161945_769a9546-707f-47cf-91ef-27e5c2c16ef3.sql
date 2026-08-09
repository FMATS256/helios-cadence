CREATE TABLE public.automation_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rule TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success',
  trigger TEXT NOT NULL DEFAULT 'cron',
  processed INTEGER NOT NULL DEFAULT 0,
  notified INTEGER NOT NULL DEFAULT 0,
  emailed INTEGER NOT NULL DEFAULT 0,
  actioned INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.automation_runs TO authenticated;
GRANT ALL ON public.automation_runs TO service_role;

ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view automation runs"
ON public.automation_runs FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid()));

CREATE INDEX automation_runs_created_idx ON public.automation_runs (created_at DESC);
CREATE INDEX automation_runs_rule_idx ON public.automation_runs (rule, created_at DESC);