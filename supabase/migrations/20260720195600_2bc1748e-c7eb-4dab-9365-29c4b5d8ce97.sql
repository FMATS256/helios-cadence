
-- Service catalog
CREATE TABLE public.service_catalog (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  description text,
  unit_price numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  billing_cycle text NOT NULL DEFAULT 'monthly',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_catalog TO authenticated;
GRANT ALL ON public.service_catalog TO service_role;
ALTER TABLE public.service_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalog read staff" ON public.service_catalog FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));
CREATE POLICY "catalog write privileged" ON public.service_catalog FOR ALL TO authenticated
  USING (
    public.is_master_admin(auth.uid())
    OR public.has_role(auth.uid(),'operations_manager')
    OR public.has_role(auth.uid(),'finance')
  )
  WITH CHECK (
    public.is_master_admin(auth.uid())
    OR public.has_role(auth.uid(),'operations_manager')
    OR public.has_role(auth.uid(),'finance')
  );

CREATE TRIGGER trg_service_catalog_updated
  BEFORE UPDATE ON public.service_catalog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Customer <-> catalog assignments
CREATE TABLE public.customer_services (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  catalog_id uuid NOT NULL REFERENCES public.service_catalog(id) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  billing_cycle text NOT NULL DEFAULT 'monthly',
  status text NOT NULL DEFAULT 'active',
  started_on date NOT NULL DEFAULT current_date,
  next_renewal date,
  notes text,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  assigned_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_services TO authenticated;
GRANT ALL ON public.customer_services TO service_role;
ALTER TABLE public.customer_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cust_services read staff" ON public.customer_services FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));
CREATE POLICY "cust_services write privileged" ON public.customer_services FOR ALL TO authenticated
  USING (
    public.is_master_admin(auth.uid())
    OR public.has_role(auth.uid(),'operations_manager')
    OR public.has_role(auth.uid(),'finance')
    OR public.has_role(auth.uid(),'sales')
    OR public.has_role(auth.uid(),'account_manager')
  )
  WITH CHECK (
    public.is_master_admin(auth.uid())
    OR public.has_role(auth.uid(),'operations_manager')
    OR public.has_role(auth.uid(),'finance')
    OR public.has_role(auth.uid(),'sales')
    OR public.has_role(auth.uid(),'account_manager')
  );

CREATE INDEX idx_cust_services_customer ON public.customer_services(customer_id);
CREATE INDEX idx_cust_services_catalog ON public.customer_services(catalog_id);

CREATE TRIGGER trg_customer_services_updated
  BEFORE UPDATE ON public.customer_services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed a small starter catalog
INSERT INTO public.service_catalog (code, name, category, description, unit_price, billing_cycle) VALUES
  ('STARLINK-RES', 'Starlink Residential', 'connectivity', 'Residential Starlink subscription', 89, 'monthly'),
  ('STARLINK-BIZ', 'Starlink Business', 'connectivity', 'Business Starlink subscription', 187, 'monthly'),
  ('M365-BUS-STD', 'Microsoft 365 Business Standard', 'productivity', 'Per-user M365 Business Standard licence', 12.50, 'monthly'),
  ('WEB-HOST-SM',  'Web Hosting — Small', 'hosting', '5 GB cPanel hosting with SSL', 8, 'monthly'),
  ('VPS-STARTER',  'Managed VPS — Starter', 'cloud', '2 vCPU / 4 GB / 60 GB managed VPS', 25, 'monthly'),
  ('BACKUP-100GB', 'Cloud Backup 100 GB', 'backup', 'Encrypted managed cloud backup', 15, 'monthly'),
  ('SOC-BASIC',    'SOC Monitoring — Basic', 'security', '24/7 SOC monitoring, up to 25 endpoints', 250, 'monthly'),
  ('SUPPORT-RETAINER', 'Support Retainer — 10h', 'support', '10 hours of technical support per month', 400, 'monthly')
ON CONFLICT (code) DO NOTHING;
