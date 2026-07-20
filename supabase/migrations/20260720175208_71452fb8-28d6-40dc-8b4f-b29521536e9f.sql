
-- ============ Backup & DR ============
CREATE TABLE public.server_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.cloud_servers(id) ON DELETE CASCADE,
  provider text,
  provider_snapshot_id text,
  kind text NOT NULL DEFAULT 'snapshot',         -- snapshot | full | incremental | manual
  status text NOT NULL DEFAULT 'pending',        -- pending | in_progress | completed | failed | expired | restored
  size_gb numeric,
  taken_at timestamptz,
  expires_at timestamptz,
  notes text,
  error text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.server_backups TO authenticated;
GRANT ALL ON public.server_backups TO service_role;
ALTER TABLE public.server_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read backups" ON public.server_backups FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));
CREATE POLICY "Staff write backups" ON public.server_backups FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));

CREATE INDEX server_backups_server_idx ON public.server_backups(server_id);
CREATE INDEX server_backups_expires_idx ON public.server_backups(expires_at) WHERE status='completed';

CREATE TRIGGER trg_server_backups_updated
BEFORE UPDATE ON public.server_backups
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE public.backup_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.cloud_servers(id) ON DELETE CASCADE,
  frequency text NOT NULL DEFAULT 'daily',       -- hourly | daily | weekly | monthly
  retention_days integer NOT NULL DEFAULT 7,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_run_at timestamptz,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(server_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.backup_schedules TO authenticated;
GRANT ALL ON public.backup_schedules TO service_role;
ALTER TABLE public.backup_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read schedules" ON public.backup_schedules FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));
CREATE POLICY "Staff write schedules" ON public.backup_schedules FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));

CREATE INDEX backup_schedules_due_idx ON public.backup_schedules(next_run_at) WHERE enabled;

CREATE TRIGGER trg_backup_schedules_updated
BEFORE UPDATE ON public.backup_schedules
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============ Budget alerts ============
CREATE TABLE public.customer_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  monthly_cap_usd numeric NOT NULL DEFAULT 0,
  alert_threshold_pct integer NOT NULL DEFAULT 80,   -- notify at % of cap
  notify_user_id uuid REFERENCES auth.users(id),     -- optional staff to notify
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(customer_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_budgets TO authenticated;
GRANT ALL ON public.customer_budgets TO service_role;
ALTER TABLE public.customer_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read budgets" ON public.customer_budgets FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));
CREATE POLICY "Staff write budgets" ON public.customer_budgets FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));

CREATE TRIGGER trg_customer_budgets_updated
BEFORE UPDATE ON public.customer_budgets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE public.budget_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  month date NOT NULL,                             -- first day of month
  level text NOT NULL,                             -- warning | breach
  spend_usd numeric NOT NULL,
  cap_usd numeric NOT NULL,
  pct numeric NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(customer_id, month, level)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_alerts TO authenticated;
GRANT ALL ON public.budget_alerts TO service_role;
ALTER TABLE public.budget_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read alerts" ON public.budget_alerts FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));
CREATE POLICY "Staff write alerts" ON public.budget_alerts FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));

CREATE INDEX budget_alerts_customer_month_idx ON public.budget_alerts(customer_id, month);
