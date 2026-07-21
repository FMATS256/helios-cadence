
-- Email Studio tables

CREATE TABLE public.email_theme (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  brand_name text NOT NULL DEFAULT 'IMT Solutions',
  tagline text NOT NULL DEFAULT 'Cloud · Cybersecurity · Managed IT',
  logo_url text,
  color_primary text NOT NULL DEFAULT '#0F9F87',
  color_accent text NOT NULL DEFAULT '#0B806D',
  color_ink text NOT NULL DEFAULT '#0B1220',
  color_body text NOT NULL DEFAULT '#3B4658',
  color_background text NOT NULL DEFAULT '#F4F5F7',
  font_family text NOT NULL DEFAULT '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  support_email text NOT NULL DEFAULT 'support@imtsolutions.co.zw',
  support_phone text NOT NULL DEFAULT '+263 (0) 8677 000 000',
  address text NOT NULL DEFAULT 'IMT Solutions, Harare, Zimbabwe',
  site_url text NOT NULL DEFAULT 'https://management.imtsolutions.co.zw',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT, INSERT, UPDATE ON public.email_theme TO authenticated;
GRANT ALL ON public.email_theme TO service_role;
ALTER TABLE public.email_theme ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_theme master_admin all" ON public.email_theme FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'));

INSERT INTO public.email_theme (singleton) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  subject text,
  preview_text text,
  from_name text,
  mode text NOT NULL DEFAULT 'code' CHECK (mode IN ('code','unlayer','html')),
  unlayer_design jsonb,
  html_content text,
  sample_data jsonb,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_templates TO authenticated;
GRANT ALL ON public.email_templates TO service_role;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_templates master_admin all" ON public.email_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'));

CREATE TRIGGER trg_email_templates_updated
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.email_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.email_templates(id) ON DELETE CASCADE,
  template_name text NOT NULL,
  subject text,
  mode text NOT NULL,
  unlayer_design jsonb,
  html_content text,
  sample_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text
);

GRANT SELECT, INSERT, DELETE ON public.email_template_versions TO authenticated;
GRANT ALL ON public.email_template_versions TO service_role;
ALTER TABLE public.email_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_template_versions master_admin all" ON public.email_template_versions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'));

CREATE INDEX idx_email_template_versions_template ON public.email_template_versions(template_id, created_at DESC);
