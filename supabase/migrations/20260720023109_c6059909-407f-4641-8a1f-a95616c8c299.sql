
-- Workspace roles
DO $$ BEGIN
  CREATE TYPE public.workspace_role AS ENUM ('owner','admin','developer','viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Workspaces
CREATE TABLE IF NOT EXISTS public.cloud_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  slug text NOT NULL,
  workspace_key text NOT NULL,
  name text NOT NULL,
  branding jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug, workspace_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS cloud_workspaces_customer_id_key ON public.cloud_workspaces(customer_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cloud_workspaces TO authenticated;
GRANT ALL ON public.cloud_workspaces TO service_role;
ALTER TABLE public.cloud_workspaces ENABLE ROW LEVEL SECURITY;

-- Members
CREATE TABLE IF NOT EXISTS public.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.cloud_workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.workspace_role NOT NULL DEFAULT 'viewer',
  invited_by uuid REFERENCES auth.users(id),
  invited_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  UNIQUE (workspace_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO authenticated;
GRANT ALL ON public.workspace_members TO service_role;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- Invitations
CREATE TABLE IF NOT EXISTS public.workspace_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.cloud_workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.workspace_role NOT NULL DEFAULT 'viewer',
  token text NOT NULL UNIQUE,
  invited_by uuid REFERENCES auth.users(id),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_invitations TO authenticated;
GRANT ALL ON public.workspace_invitations TO service_role;
ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;

-- Server ↔ workspace link
CREATE TABLE IF NOT EXISTS public.workspace_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.cloud_workspaces(id) ON DELETE CASCADE,
  server_id uuid NOT NULL REFERENCES public.cloud_servers(id) ON DELETE CASCADE,
  display_name text,
  customer_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (server_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_servers TO authenticated;
GRANT ALL ON public.workspace_servers TO service_role;
ALTER TABLE public.workspace_servers ENABLE ROW LEVEL SECURITY;

-- Audit log
CREATE TABLE IF NOT EXISTS public.workspace_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.cloud_workspaces(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id),
  actor_kind text NOT NULL DEFAULT 'customer',  -- customer | staff_override | system
  action text NOT NULL,
  resource_kind text,
  resource_id text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workspace_audit_log_ws_created_idx ON public.workspace_audit_log(workspace_id, created_at DESC);
GRANT SELECT, INSERT ON public.workspace_audit_log TO authenticated;
GRANT ALL ON public.workspace_audit_log TO service_role;
ALTER TABLE public.workspace_audit_log ENABLE ROW LEVEL SECURITY;

-- Membership / role helpers (security definer)
CREATE OR REPLACE FUNCTION public.is_workspace_member(_user uuid, _workspace uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members WHERE user_id = _user AND workspace_id = _workspace)
$$;

CREATE OR REPLACE FUNCTION public.workspace_role_of(_user uuid, _workspace uuid)
RETURNS public.workspace_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.workspace_members WHERE user_id = _user AND workspace_id = _workspace LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.has_workspace_role(_user uuid, _workspace uuid, _min public.workspace_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH r AS (SELECT role FROM public.workspace_members WHERE user_id=_user AND workspace_id=_workspace),
       ranks AS (
         SELECT unnest(ARRAY['viewer','developer','admin','owner']::public.workspace_role[]) AS role, generate_series(1,4) AS rank
       )
  SELECT COALESCE(
    (SELECT (SELECT rank FROM ranks WHERE role=r.role) >= (SELECT rank FROM ranks WHERE role=_min) FROM r),
    false
  ) OR public.has_any_role(_user)
$$;

-- Update trigger
DROP TRIGGER IF EXISTS trg_cloud_workspaces_updated ON public.cloud_workspaces;
CREATE TRIGGER trg_cloud_workspaces_updated BEFORE UPDATE ON public.cloud_workspaces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS policies
-- cloud_workspaces: members can read; staff can do anything
DROP POLICY IF EXISTS "workspaces_read" ON public.cloud_workspaces;
CREATE POLICY "workspaces_read" ON public.cloud_workspaces FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), id) OR public.has_any_role(auth.uid()));
DROP POLICY IF EXISTS "workspaces_staff_write" ON public.cloud_workspaces;
CREATE POLICY "workspaces_staff_write" ON public.cloud_workspaces FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));

-- workspace_members
DROP POLICY IF EXISTS "members_read" ON public.workspace_members;
CREATE POLICY "members_read" ON public.workspace_members FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.has_any_role(auth.uid()));
DROP POLICY IF EXISTS "members_admin_write" ON public.workspace_members;
CREATE POLICY "members_admin_write" ON public.workspace_members FOR ALL TO authenticated
  USING (public.has_workspace_role(auth.uid(), workspace_id, 'admin'))
  WITH CHECK (public.has_workspace_role(auth.uid(), workspace_id, 'admin'));

-- workspace_invitations
DROP POLICY IF EXISTS "invites_admin_all" ON public.workspace_invitations;
CREATE POLICY "invites_admin_all" ON public.workspace_invitations FOR ALL TO authenticated
  USING (public.has_workspace_role(auth.uid(), workspace_id, 'admin'))
  WITH CHECK (public.has_workspace_role(auth.uid(), workspace_id, 'admin'));

-- workspace_servers
DROP POLICY IF EXISTS "ws_servers_read" ON public.workspace_servers;
CREATE POLICY "ws_servers_read" ON public.workspace_servers FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id) OR public.has_any_role(auth.uid()));
DROP POLICY IF EXISTS "ws_servers_staff_write" ON public.workspace_servers;
CREATE POLICY "ws_servers_staff_write" ON public.workspace_servers FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));

-- workspace_audit_log
DROP POLICY IF EXISTS "audit_read" ON public.workspace_audit_log;
CREATE POLICY "audit_read" ON public.workspace_audit_log FOR SELECT TO authenticated
  USING (public.has_workspace_role(auth.uid(), workspace_id, 'admin') OR public.has_any_role(auth.uid()));
DROP POLICY IF EXISTS "audit_insert" ON public.workspace_audit_log;
CREATE POLICY "audit_insert" ON public.workspace_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id) OR public.has_any_role(auth.uid()));

-- Also allow workspace members to read the cloud_servers rows their workspace owns
DROP POLICY IF EXISTS "cloud_servers_workspace_read" ON public.cloud_servers;
CREATE POLICY "cloud_servers_workspace_read" ON public.cloud_servers FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_servers ws
      WHERE ws.server_id = cloud_servers.id
      AND public.is_workspace_member(auth.uid(), ws.workspace_id)
    )
  );
