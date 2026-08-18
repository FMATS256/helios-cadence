CREATE TABLE public.geo_locations (
  id uuid primary key default gen_random_uuid(),
  query text not null unique,
  lat double precision,
  lng double precision,
  display_name text,
  provider text not null default 'nominatim',
  resolved_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.geo_locations TO authenticated;
GRANT ALL ON public.geo_locations TO service_role;
ALTER TABLE public.geo_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "geo_locations_read" ON public.geo_locations FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "geo_locations_write" ON public.geo_locations FOR ALL TO authenticated USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));