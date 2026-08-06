
-- Web hosting: usage + sync + provisioning fields
ALTER TABLE public.web_hosting_accounts
  ADD COLUMN IF NOT EXISTS whm_server_id uuid,
  ADD COLUMN IF NOT EXISTS disk_used_mb numeric,
  ADD COLUMN IF NOT EXISTS bandwidth_used_mb numeric,
  ADD COLUMN IF NOT EXISTS email_accounts integer,
  ADD COLUMN IF NOT EXISTS databases_count integer,
  ADD COLUMN IF NOT EXISTS subdomains_count integer,
  ADD COLUMN IF NOT EXISTS addon_domains_count integer,
  ADD COLUMN IF NOT EXISTS ssl_status text,
  ADD COLUMN IF NOT EXISTS php_version text,
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS provisioning_status text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS suspend_reason text,
  ADD COLUMN IF NOT EXISTS last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_status text,
  ADD COLUMN IF NOT EXISTS sync_error text;

-- Cloud storage: lifecycle + sync fields
ALTER TABLE public.cloud_storage_accounts
  ADD COLUMN IF NOT EXISTS provisioning_status text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspend_reason text,
  ADD COLUMN IF NOT EXISTS connected_devices integer,
  ADD COLUMN IF NOT EXISTS last_backup_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_status text,
  ADD COLUMN IF NOT EXISTS sync_error text;

-- WHM / cPanel server registry
CREATE TABLE IF NOT EXISTS public.whm_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  hostname text NOT NULL,
  port integer NOT NULL DEFAULT 2087,
  api_user text NOT NULL DEFAULT 'root',
  token_secret_name text NOT NULL DEFAULT 'WHM_API_TOKEN',
  default_package text,
  nameservers text[],
  is_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  verified_at timestamptz,
  last_error text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whm_servers TO authenticated;
GRANT ALL ON public.whm_servers TO service_role;
ALTER TABLE public.whm_servers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read whm servers" ON public.whm_servers;
CREATE POLICY "Staff read whm servers" ON public.whm_servers
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY IF EXISTS "Admins manage whm servers" ON public.whm_servers;
CREATE POLICY "Admins manage whm servers" ON public.whm_servers
  FOR ALL TO authenticated
  USING (public.is_master_admin(auth.uid()) OR public.has_role(auth.uid(), 'operations_manager'))
  WITH CHECK (public.is_master_admin(auth.uid()) OR public.has_role(auth.uid(), 'operations_manager'));
DROP TRIGGER IF EXISTS trg_whm_servers_updated ON public.whm_servers;
CREATE TRIGGER trg_whm_servers_updated BEFORE UPDATE ON public.whm_servers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Service operations event log (hosting + storage lifecycle)
CREATE TABLE IF NOT EXISTS public.service_ops_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type text NOT NULL,
  entity_id uuid,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  account_number text,
  action text NOT NULL,
  status text NOT NULL DEFAULT 'success',
  message text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_service_ops_events_entity ON public.service_ops_events(entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_ops_events_customer ON public.service_ops_events(customer_id, created_at DESC);
GRANT SELECT ON public.service_ops_events TO authenticated;
GRANT ALL ON public.service_ops_events TO service_role;
ALTER TABLE public.service_ops_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read service ops events" ON public.service_ops_events;
CREATE POLICY "Staff read service ops events" ON public.service_ops_events
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));

ALTER TABLE public.web_hosting_accounts
  DROP CONSTRAINT IF EXISTS web_hosting_accounts_whm_server_id_fkey;
ALTER TABLE public.web_hosting_accounts
  ADD CONSTRAINT web_hosting_accounts_whm_server_id_fkey
  FOREIGN KEY (whm_server_id) REFERENCES public.whm_servers(id) ON DELETE SET NULL;
