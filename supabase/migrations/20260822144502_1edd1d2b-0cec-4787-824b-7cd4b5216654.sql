-- ============ Technical Operations Phase 1 ============

-- 1. Job (service_tasks) enrichment
ALTER TABLE public.service_tasks
  ADD COLUMN IF NOT EXISTS site_name text,
  ADD COLUMN IF NOT EXISTS site_address text,
  ADD COLUMN IF NOT EXISTS site_lat double precision,
  ADD COLUMN IF NOT EXISTS site_lng double precision,
  ADD COLUMN IF NOT EXISTS site_contact_name text,
  ADD COLUMN IF NOT EXISTS site_contact_phone text,
  ADD COLUMN IF NOT EXISTS network_config text,
  ADD COLUMN IF NOT EXISTS installation_notes text,
  ADD COLUMN IF NOT EXISTS testing_notes text,
  ADD COLUMN IF NOT EXISTS signed_off_at timestamptz,
  ADD COLUMN IF NOT EXISTS report_sent_at timestamptz;

-- 2. Requirements
CREATE TABLE IF NOT EXISTS public.job_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.service_tasks(id) ON DELETE CASCADE,
  label text NOT NULL,
  category text NOT NULL DEFAULT 'equipment',
  quantity integer NOT NULL DEFAULT 1,
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  notes text,
  fulfilled boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_requirements TO authenticated;
GRANT ALL ON public.job_requirements TO service_role;
ALTER TABLE public.job_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage job requirements" ON public.job_requirements
  FOR ALL TO authenticated USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));

-- 3. Equipment allocations
CREATE TABLE IF NOT EXISTS public.job_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.service_tasks(id) ON DELETE CASCADE,
  requirement_id uuid REFERENCES public.job_requirements(id) ON DELETE SET NULL,
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'reserved',
  serial_numbers text,
  technician_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  stock_deducted boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_equipment TO authenticated;
GRANT ALL ON public.job_equipment TO service_role;
ALTER TABLE public.job_equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage job equipment" ON public.job_equipment
  FOR ALL TO authenticated USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));
CREATE TRIGGER job_equipment_updated BEFORE UPDATE ON public.job_equipment
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Checklist
CREATE TABLE IF NOT EXISTS public.job_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.service_tasks(id) ON DELETE CASCADE,
  label text NOT NULL,
  phase text NOT NULL DEFAULT 'installation',
  position integer NOT NULL DEFAULT 0,
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  done_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_checklist TO authenticated;
GRANT ALL ON public.job_checklist TO service_role;
ALTER TABLE public.job_checklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage job checklist" ON public.job_checklist
  FOR ALL TO authenticated USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));

-- 5. Photos (files stored in the private job-photos bucket, served via signed URLs)
CREATE TABLE IF NOT EXISTS public.job_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.service_tasks(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  caption text,
  phase text NOT NULL DEFAULT 'installation',
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_photos TO authenticated;
GRANT ALL ON public.job_photos TO service_role;
ALTER TABLE public.job_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage job photos" ON public.job_photos
  FOR ALL TO authenticated USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));

-- 6. Sign-off
CREATE TABLE IF NOT EXISTS public.job_signoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.service_tasks(id) ON DELETE CASCADE,
  signed_by_name text NOT NULL,
  signed_by_role text,
  signature_data text,
  satisfaction text,
  notes text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  captured_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_signoffs TO authenticated;
GRANT ALL ON public.job_signoffs TO service_role;
ALTER TABLE public.job_signoffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage job signoffs" ON public.job_signoffs
  FOR ALL TO authenticated USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));

-- 7. Alert rules
CREATE TABLE IF NOT EXISTS public.alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  source text NOT NULL,
  metric text NOT NULL,
  comparator text NOT NULL DEFAULT 'gt',
  threshold numeric,
  severity text NOT NULL DEFAULT 'warning',
  enabled boolean NOT NULL DEFAULT true,
  notify_roles text[] NOT NULL DEFAULT ARRAY['noc','operations_manager']::text[],
  description text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_rules TO authenticated;
GRANT ALL ON public.alert_rules TO service_role;
ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read alert rules" ON public.alert_rules
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "Managers manage alert rules" ON public.alert_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'master_admin') OR public.has_role(auth.uid(),'operations_manager') OR public.has_role(auth.uid(),'noc'))
  WITH CHECK (public.has_role(auth.uid(),'master_admin') OR public.has_role(auth.uid(),'operations_manager') OR public.has_role(auth.uid(),'noc'));
CREATE TRIGGER alert_rules_updated BEFORE UPDATE ON public.alert_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 8. Operational alerts
CREATE TABLE IF NOT EXISTS public.ops_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL,
  rule_id uuid REFERENCES public.alert_rules(id) ON DELETE SET NULL,
  source text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  title text NOT NULL,
  detail text,
  metric_value numeric,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  account_number text,
  entity_type text,
  entity_id uuid,
  status text NOT NULL DEFAULT 'open',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolution text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  occurrences integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ops_alerts_open_dedupe
  ON public.ops_alerts (dedupe_key) WHERE status <> 'resolved';
CREATE INDEX IF NOT EXISTS ops_alerts_status_idx ON public.ops_alerts (status, severity, last_seen_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ops_alerts TO authenticated;
GRANT ALL ON public.ops_alerts TO service_role;
ALTER TABLE public.ops_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage ops alerts" ON public.ops_alerts
  FOR ALL TO authenticated USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));
CREATE TRIGGER ops_alerts_updated BEFORE UPDATE ON public.ops_alerts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 9. Alert timeline
CREATE TABLE IF NOT EXISTS public.ops_alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES public.ops_alerts(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  note text,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ops_alert_events TO authenticated;
GRANT ALL ON public.ops_alert_events TO service_role;
ALTER TABLE public.ops_alert_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read alert events" ON public.ops_alert_events
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "Staff write alert events" ON public.ops_alert_events
  FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid()));

-- 10. Default alert rules
INSERT INTO public.alert_rules (name, source, metric, comparator, threshold, severity, description)
VALUES
  ('Monitored service offline', 'monitoring', 'check_down', 'eq', 1, 'critical', 'Raised when a monitoring check reports down.'),
  ('Server not running', 'servers', 'power_state', 'eq', 1, 'critical', 'Raised when a provisioned cloud server is not in a running state.'),
  ('Hosting disk usage high', 'hosting', 'disk_percent', 'gt', 85, 'warning', 'Hosting account disk usage above threshold.'),
  ('Storage capacity high', 'storage', 'storage_percent', 'gt', 85, 'warning', 'Cloud storage or NAS usage above threshold.'),
  ('Backup failure', 'backups', 'backup_failed', 'eq', 1, 'critical', 'Last backup run for a schedule failed.'),
  ('Provisioning failure', 'provisioning', 'provision_failed', 'eq', 1, 'critical', 'A provisioning plan or deployment ended in failure.'),
  ('Integration / automation failure', 'automation', 'automation_failed', 'eq', 1, 'warning', 'A scheduled automation run reported an error.'),
  ('VoIP balance low', 'voip', 'balance', 'lt', 5, 'warning', 'VoIP account balance below threshold.')
ON CONFLICT DO NOTHING;