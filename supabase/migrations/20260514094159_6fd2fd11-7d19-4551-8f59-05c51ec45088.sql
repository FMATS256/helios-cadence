
CREATE TABLE public.client_phones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Mobile',
  number text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.client_phones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view own phones" ON public.client_phones FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert own phones" ON public.client_phones FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own phones" ON public.client_phones FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete own phones" ON public.client_phones FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_client_phones_client ON public.client_phones(client_id);

CREATE TABLE public.client_systems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  system_type text,
  system_size text,
  inverter text,
  battery text,
  panels text,
  value numeric NOT NULL DEFAULT 0,
  installed_date date,
  warranty text,
  status text NOT NULL DEFAULT 'Active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.client_systems ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view own systems" ON public.client_systems FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert own systems" ON public.client_systems FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own systems" ON public.client_systems FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete own systems" ON public.client_systems FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_client_systems_client ON public.client_systems(client_id);
CREATE TRIGGER trg_client_systems_updated BEFORE UPDATE ON public.client_systems
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.client_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  activity_type text NOT NULL DEFAULT 'Note',
  title text NOT NULL,
  notes text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.client_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view own activities" ON public.client_activities FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert own activities" ON public.client_activities FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own activities" ON public.client_activities FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete own activities" ON public.client_activities FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_client_activities_client ON public.client_activities(client_id, occurred_at DESC);
