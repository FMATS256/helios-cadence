ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique ON public.profiles (lower(username)) WHERE username IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.portal_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message text NOT NULL CHECK (length(trim(message)) BETWEEN 1 AND 300),
  link_url text CHECK (link_url IS NULL OR link_url ~ '^https://'),
  link_label text,
  tone text NOT NULL DEFAULT 'info' CHECK (tone IN ('info','promo','warning')),
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_announcements TO authenticated;
GRANT ALL ON public.portal_announcements TO service_role;
ALTER TABLE public.portal_announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_announcements_read ON public.portal_announcements FOR SELECT TO authenticated USING (
  (active AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now())) OR public.is_master_admin(auth.uid()));
CREATE POLICY portal_announcements_admin_write ON public.portal_announcements FOR ALL TO authenticated
  USING (public.is_master_admin(auth.uid())) WITH CHECK (public.is_master_admin(auth.uid()));