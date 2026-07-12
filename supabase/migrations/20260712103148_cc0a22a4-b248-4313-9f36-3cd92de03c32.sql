
-- Provisioning plans (dry-run reports)
CREATE TABLE public.provisioning_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  request JSONB NOT NULL,
  provider TEXT NOT NULL,
  region TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- draft|approved|rejected|executed|failed
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  workflow_id UUID,
  report JSONB NOT NULL, -- {architecture, resources, software, costs, workflow_steps, risks, security, recommendations, dry_run_actions}
  estimated_monthly_usd NUMERIC,
  estimated_hourly_usd NUMERIC,
  estimated_setup_minutes INTEGER,
  notes TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provisioning_plans TO authenticated;
GRANT ALL ON public.provisioning_plans TO service_role;
ALTER TABLE public.provisioning_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read plans" ON public.provisioning_plans FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));
CREATE POLICY "staff manage plans" ON public.provisioning_plans FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));

CREATE TRIGGER set_provisioning_plans_updated_at BEFORE UPDATE ON public.provisioning_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Deployment workflows (execution state)
CREATE TABLE public.deployment_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  plan_id UUID REFERENCES public.provisioning_plans(id) ON DELETE SET NULL,
  server_id UUID REFERENCES public.cloud_servers(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|running|completed|failed|cancelled|rolled_back
  current_step TEXT,
  progress INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb, -- shared workflow context (ids, ips, credentials refs)
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deployment_workflows TO authenticated;
GRANT ALL ON public.deployment_workflows TO service_role;
ALTER TABLE public.deployment_workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read workflows" ON public.deployment_workflows FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));
CREATE POLICY "staff manage workflows" ON public.deployment_workflows FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));
CREATE TRIGGER set_deployment_workflows_updated_at BEFORE UPDATE ON public.deployment_workflows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Deployment steps (per-step log)
CREATE TABLE public.deployment_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.deployment_workflows(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  step_label TEXT NOT NULL,
  seq INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|running|completed|failed|skipped|rolled_back
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  output JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.deployment_steps(workflow_id, seq);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deployment_steps TO authenticated;
GRANT ALL ON public.deployment_steps TO service_role;
ALTER TABLE public.deployment_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read steps" ON public.deployment_steps FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));
CREATE POLICY "staff manage steps" ON public.deployment_steps FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));
