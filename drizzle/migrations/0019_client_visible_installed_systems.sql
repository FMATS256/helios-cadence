ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS client_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS site_name text,
  ADD COLUMN IF NOT EXISTS camera_count integer,
  ADD COLUMN IF NOT EXISTS channel_capacity integer,
  ADD COLUMN IF NOT EXISTS storage_capacity text,
  ADD COLUMN IF NOT EXISTS installed_on date,
  ADD COLUMN IF NOT EXISTS next_maintenance date,
  ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL;
DROP POLICY IF EXISTS "portal read own assets" ON public.assets;
CREATE POLICY "portal read own assets" ON public.assets FOR SELECT TO authenticated
  USING (customer_id = public.portal_customer_id(auth.uid()) AND client_visible AND archived_at IS NULL);