
-- ============ CLOUD SERVICES ============
CREATE TABLE public.cloud_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  account_number TEXT NOT NULL,
  service_type TEXT NOT NULL,
  service_name TEXT NOT NULL,
  vendor TEXT,
  plan TEXT,
  seats INT DEFAULT 0,
  monthly_cost NUMERIC(10,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  renewal_date DATE,
  admin_url TEXT,
  notes TEXT,
  archived_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cloud_services TO authenticated;
GRANT ALL ON public.cloud_services TO service_role;
ALTER TABLE public.cloud_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cloud_services auth read" ON public.cloud_services FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "cloud_services auth write" ON public.cloud_services FOR ALL TO authenticated USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));
CREATE TRIGGER cloud_services_updated BEFORE UPDATE ON public.cloud_services FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER cloud_services_fill_acct BEFORE INSERT ON public.cloud_services FOR EACH ROW EXECUTE FUNCTION public.fill_account_number_from_customer();

-- ============ ASSETS ============
CREATE TABLE public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  account_number TEXT,
  asset_tag TEXT,
  asset_type TEXT NOT NULL,
  make TEXT,
  model TEXT,
  serial_number TEXT,
  location TEXT,
  assigned_to TEXT,
  status TEXT NOT NULL DEFAULT 'in_service',
  purchase_date DATE,
  warranty_expires DATE,
  cost NUMERIC(10,2),
  notes TEXT,
  archived_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets TO authenticated;
GRANT ALL ON public.assets TO service_role;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assets auth read" ON public.assets FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "assets auth write" ON public.assets FOR ALL TO authenticated USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));
CREATE TRIGGER assets_updated BEFORE UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER assets_fill_acct BEFORE INSERT ON public.assets FOR EACH ROW EXECUTE FUNCTION public.fill_account_number_from_customer();

-- ============ MONITORING CHECKS ============
CREATE TABLE public.monitoring_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  account_number TEXT,
  name TEXT NOT NULL,
  check_type TEXT NOT NULL,
  target TEXT NOT NULL,
  interval_seconds INT NOT NULL DEFAULT 300,
  status TEXT NOT NULL DEFAULT 'unknown',
  last_checked_at TIMESTAMPTZ,
  last_response_ms INT,
  last_error TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  archived_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitoring_checks TO authenticated;
GRANT ALL ON public.monitoring_checks TO service_role;
ALTER TABLE public.monitoring_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "monitoring auth read" ON public.monitoring_checks FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "monitoring auth write" ON public.monitoring_checks FOR ALL TO authenticated USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));
CREATE TRIGGER monitoring_updated BEFORE UPDATE ON public.monitoring_checks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER monitoring_fill_acct BEFORE INSERT ON public.monitoring_checks FOR EACH ROW EXECUTE FUNCTION public.fill_account_number_from_customer();

-- ============ PROJECTS ============
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  account_number TEXT NOT NULL,
  project_code TEXT,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planning',
  priority TEXT NOT NULL DEFAULT 'medium',
  owner_id UUID REFERENCES auth.users(id),
  start_date DATE,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  budget NUMERIC(10,2),
  archived_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "projects auth read" ON public.projects FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "projects auth write" ON public.projects FOR ALL TO authenticated USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));
CREATE TRIGGER projects_updated BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER projects_fill_acct BEFORE INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION public.fill_account_number_from_customer();

-- ============ INVOICES ============
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 1000;
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE DEFAULT ('INV-' || LPAD(nextval('public.invoice_number_seq')::text, 5, '0')),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  account_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  currency TEXT NOT NULL DEFAULT 'USD',
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  archived_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices auth read" ON public.invoices FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "invoices auth write" ON public.invoices FOR ALL TO authenticated USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));
CREATE TRIGGER invoices_updated BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER invoices_fill_acct BEFORE INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.fill_account_number_from_customer();

-- ============ INVENTORY ============
CREATE TABLE public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  quantity INT NOT NULL DEFAULT 0,
  reorder_level INT NOT NULL DEFAULT 0,
  unit_cost NUMERIC(10,2) DEFAULT 0,
  location TEXT,
  supplier TEXT,
  archived_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory auth read" ON public.inventory_items FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "inventory auth write" ON public.inventory_items FOR ALL TO authenticated USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));
CREATE TRIGGER inventory_updated BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
