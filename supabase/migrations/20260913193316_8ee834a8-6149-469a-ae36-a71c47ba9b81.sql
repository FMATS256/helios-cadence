CREATE TABLE public.server_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  server_id uuid NOT NULL REFERENCES public.cloud_servers(id) ON DELETE CASCADE,
  sampled_at timestamptz NOT NULL DEFAULT now(),
  reachable boolean NOT NULL DEFAULT true,
  latency_ms integer,
  cpu_percent numeric,
  ram_percent numeric,
  disk_percent numeric,
  traffic_gb numeric,
  power_state text,
  status text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.server_metrics TO authenticated;
GRANT ALL ON public.server_metrics TO service_role;
ALTER TABLE public.server_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view server metrics" ON public.server_metrics
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE INDEX server_metrics_server_time_idx ON public.server_metrics (server_id, sampled_at DESC);

CREATE TABLE public.server_cost_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  server_id uuid NOT NULL REFERENCES public.cloud_servers(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  provider_cost_usd numeric NOT NULL DEFAULT 0,
  selling_price_usd numeric NOT NULL DEFAULT 0,
  hours numeric,
  source text NOT NULL DEFAULT 'accrual',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (server_id, period_start, source)
);
GRANT SELECT ON public.server_cost_entries TO authenticated;
GRANT ALL ON public.server_cost_entries TO service_role;
ALTER TABLE public.server_cost_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view server costs" ON public.server_cost_entries
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE INDEX server_cost_entries_server_idx ON public.server_cost_entries (server_id, period_start DESC);
CREATE TRIGGER server_cost_entries_updated BEFORE UPDATE ON public.server_cost_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();