CREATE TABLE IF NOT EXISTS public.server_action_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.cloud_servers(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('rebuild','restore_snapshot','install_app')),
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','rejected')),
  requested_by uuid NOT NULL,
  decided_by uuid,
  decided_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS server_action_requests_status_idx ON public.server_action_requests (status, created_at DESC);
GRANT SELECT ON public.server_action_requests TO authenticated;
GRANT ALL ON public.server_action_requests TO service_role;
ALTER TABLE public.server_action_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view server action requests" ON public.server_action_requests
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
