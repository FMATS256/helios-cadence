-- Vault step-up grants
CREATE TABLE public.vault_step_up_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  method text NOT NULL DEFAULT 'password',
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  ip text,
  user_agent text
);
CREATE INDEX vault_step_up_user_idx ON public.vault_step_up_grants(user_id, expires_at DESC);
GRANT SELECT ON public.vault_step_up_grants TO authenticated;
GRANT ALL ON public.vault_step_up_grants TO service_role;
ALTER TABLE public.vault_step_up_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own step-up grants readable" ON public.vault_step_up_grants
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Security incidents (SOC)
CREATE TABLE public.security_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text,
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'other',
  severity text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  account_number text,
  affected_asset text,
  source text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  contained_at timestamptz,
  resolved_at timestamptz,
  assigned_to uuid,
  root_cause text,
  remediation text,
  impact text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX security_incidents_status_idx ON public.security_incidents(status, severity, detected_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_incidents TO authenticated;
GRANT ALL ON public.security_incidents TO service_role;
ALTER TABLE public.security_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read security incidents" ON public.security_incidents
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "soc staff write security incidents" ON public.security_incidents
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'master_admin') OR public.has_role(auth.uid(),'cyber_security') OR public.has_role(auth.uid(),'operations_manager') OR public.has_role(auth.uid(),'noc') OR public.has_role(auth.uid(),'technical_support'))
  WITH CHECK (public.has_role(auth.uid(),'master_admin') OR public.has_role(auth.uid(),'cyber_security') OR public.has_role(auth.uid(),'operations_manager') OR public.has_role(auth.uid(),'noc') OR public.has_role(auth.uid(),'technical_support'));
CREATE TRIGGER security_incidents_updated BEFORE UPDATE ON public.security_incidents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.security_incident_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.security_incidents(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  note text,
  actor_id uuid,
  actor_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX security_incident_events_idx ON public.security_incident_events(incident_id, created_at DESC);
GRANT SELECT, INSERT ON public.security_incident_events TO authenticated;
GRANT ALL ON public.security_incident_events TO service_role;
ALTER TABLE public.security_incident_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read incident events" ON public.security_incident_events
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "staff add incident events" ON public.security_incident_events
  FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid()));