
CREATE TABLE public.workspace_ssh_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.cloud_workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  public_key TEXT NOT NULL,
  fingerprint TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX workspace_ssh_keys_workspace_idx ON public.workspace_ssh_keys(workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_ssh_keys TO authenticated;
GRANT ALL ON public.workspace_ssh_keys TO service_role;

ALTER TABLE public.workspace_ssh_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can view ssh keys"
  ON public.workspace_ssh_keys FOR SELECT TO authenticated
  USING (public.has_workspace_role(auth.uid(), workspace_id, 'viewer') OR public.has_any_role(auth.uid()));

CREATE POLICY "developers can add ssh keys"
  ON public.workspace_ssh_keys FOR INSERT TO authenticated
  WITH CHECK (public.has_workspace_role(auth.uid(), workspace_id, 'developer') OR public.has_any_role(auth.uid()));

CREATE POLICY "admins can delete ssh keys"
  ON public.workspace_ssh_keys FOR DELETE TO authenticated
  USING (public.has_workspace_role(auth.uid(), workspace_id, 'admin') OR public.has_any_role(auth.uid()));
