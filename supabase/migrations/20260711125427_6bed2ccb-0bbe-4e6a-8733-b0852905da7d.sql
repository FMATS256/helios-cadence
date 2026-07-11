
CREATE TABLE public.cloud_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  account_number text,
  provider text NOT NULL DEFAULT 'kamatera',
  provider_server_id text,
  name text NOT NULL,
  datacenter text,
  image text,
  cpu_type text,
  cpu_cores int,
  ram_mb int,
  disk_sizes_gb int[] DEFAULT '{}',
  networks jsonb DEFAULT '[]'::jsonb,
  public_ips text[] DEFAULT '{}',
  private_ips text[] DEFAULT '{}',
  power_state text DEFAULT 'unknown',
  status text NOT NULL DEFAULT 'pending',
  monthly_cost_usd numeric(12,2) DEFAULT 0,
  selling_price_usd numeric(12,2) DEFAULT 0,
  billing_cycle text DEFAULT 'monthly',
  ssh_key text,
  root_password_ref uuid,
  notes text,
  tags text[] DEFAULT '{}',
  provider_meta jsonb DEFAULT '{}'::jsonb,
  last_synced_at timestamptz,
  created_by uuid,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cloud_servers TO authenticated, anon;
GRANT ALL ON public.cloud_servers TO service_role;
ALTER TABLE public.cloud_servers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cloud_servers open read" ON public.cloud_servers FOR SELECT USING (true);
CREATE POLICY "cloud_servers open write" ON public.cloud_servers FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER cloud_servers_updated_at BEFORE UPDATE ON public.cloud_servers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.cloud_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid REFERENCES public.cloud_servers(id) ON DELETE CASCADE,
  operation_id text UNIQUE,
  provider_command_id text,
  action text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  progress int DEFAULT 0,
  request_payload jsonb DEFAULT '{}'::jsonb,
  provider_response jsonb DEFAULT '{}'::jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cloud_deployments TO authenticated, anon;
GRANT ALL ON public.cloud_deployments TO service_role;
ALTER TABLE public.cloud_deployments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cloud_deployments open read" ON public.cloud_deployments FOR SELECT USING (true);
CREATE POLICY "cloud_deployments open write" ON public.cloud_deployments FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER cloud_deployments_updated_at BEFORE UPDATE ON public.cloud_deployments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.cloud_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid REFERENCES public.cloud_servers(id) ON DELETE SET NULL,
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  detail jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.cloud_activity TO authenticated, anon;
GRANT ALL ON public.cloud_activity TO service_role;
ALTER TABLE public.cloud_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cloud_activity open read" ON public.cloud_activity FOR SELECT USING (true);
CREATE POLICY "cloud_activity open insert" ON public.cloud_activity FOR INSERT WITH CHECK (true);

CREATE INDEX cloud_servers_customer_idx ON public.cloud_servers(customer_id);
CREATE INDEX cloud_servers_provider_idx ON public.cloud_servers(provider, provider_server_id);
CREATE INDEX cloud_deployments_server_idx ON public.cloud_deployments(server_id);
CREATE INDEX cloud_activity_server_idx ON public.cloud_activity(server_id, created_at DESC);
