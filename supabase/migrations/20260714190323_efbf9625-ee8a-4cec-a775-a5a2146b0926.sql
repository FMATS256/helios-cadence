ALTER TABLE public.cloud_servers
  ADD COLUMN IF NOT EXISTS handed_over_at timestamptz,
  ADD COLUMN IF NOT EXISTS handed_over_by uuid,
  ADD COLUMN IF NOT EXISTS handed_over_to_email text;