CREATE TABLE IF NOT EXISTS public.security_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target text NOT NULL,
  profile text NOT NULL DEFAULT 'standard',
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  account_number text,
  score integer NOT NULL DEFAULT 0,
  grade text NOT NULL DEFAULT 'F',
  risk_level text NOT NULL DEFAULT 'medium',
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  checks_run text[] NOT NULL DEFAULT '{}',
  notes text[] NOT NULL DEFAULT '{}',
  findings_total integer NOT NULL DEFAULT 0,
  open_findings integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NOT NULL DEFAULT now(),
  run_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  run_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.security_assessment_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.security_assessments(id) ON DELETE CASCADE,
  finding_key text NOT NULL,
  title text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  category text NOT NULL DEFAULT 'general',
  evidence text,
  impact text,
  remediation text,
  reference text,
  status text NOT NULL DEFAULT 'open',
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date date,
  resolved_at timestamptz,
  resolution_note text,
  incident_id uuid REFERENCES public.security_incidents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_assessments_customer_idx ON public.security_assessments(customer_id);
CREATE INDEX IF NOT EXISTS security_assessments_account_idx ON public.security_assessments(account_number);
CREATE INDEX IF NOT EXISTS security_assessments_started_idx ON public.security_assessments(started_at DESC);
CREATE INDEX IF NOT EXISTS security_assessment_findings_assessment_idx ON public.security_assessment_findings(assessment_id);
CREATE INDEX IF NOT EXISTS security_assessment_findings_status_idx ON public.security_assessment_findings(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_assessments TO authenticated;
GRANT ALL ON public.security_assessments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_assessment_findings TO authenticated;
GRANT ALL ON public.security_assessment_findings TO service_role;

ALTER TABLE public.security_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_assessment_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read assessments" ON public.security_assessments;
CREATE POLICY "staff read assessments" ON public.security_assessments
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));

DROP POLICY IF EXISTS "security staff write assessments" ON public.security_assessments;
CREATE POLICY "security staff write assessments" ON public.security_assessments
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'master_admin') OR public.has_role(auth.uid(),'cyber_security')
    OR public.has_role(auth.uid(),'operations_manager') OR public.has_role(auth.uid(),'noc')
    OR public.has_role(auth.uid(),'technical_support')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'master_admin') OR public.has_role(auth.uid(),'cyber_security')
    OR public.has_role(auth.uid(),'operations_manager') OR public.has_role(auth.uid(),'noc')
    OR public.has_role(auth.uid(),'technical_support')
  );

DROP POLICY IF EXISTS "staff read assessment findings" ON public.security_assessment_findings;
CREATE POLICY "staff read assessment findings" ON public.security_assessment_findings
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));

DROP POLICY IF EXISTS "security staff write assessment findings" ON public.security_assessment_findings;
CREATE POLICY "security staff write assessment findings" ON public.security_assessment_findings
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'master_admin') OR public.has_role(auth.uid(),'cyber_security')
    OR public.has_role(auth.uid(),'operations_manager') OR public.has_role(auth.uid(),'noc')
    OR public.has_role(auth.uid(),'technical_support')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'master_admin') OR public.has_role(auth.uid(),'cyber_security')
    OR public.has_role(auth.uid(),'operations_manager') OR public.has_role(auth.uid(),'noc')
    OR public.has_role(auth.uid(),'technical_support')
  );

DROP TRIGGER IF EXISTS set_updated_at_security_assessment_findings ON public.security_assessment_findings;
CREATE TRIGGER set_updated_at_security_assessment_findings
  BEFORE UPDATE ON public.security_assessment_findings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();