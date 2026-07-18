
-- Phase 3 & 4 modules

-- Web Hosting accounts (cPanel etc)
CREATE TABLE public.web_hosting_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  account_number TEXT,
  domain TEXT NOT NULL,
  provider TEXT,
  control_panel TEXT DEFAULT 'cpanel',
  control_panel_url TEXT,
  username TEXT,
  plan TEXT,
  disk_quota_gb NUMERIC,
  bandwidth_gb NUMERIC,
  monthly_cost NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'active',
  renewal_date DATE,
  notes TEXT,
  archived_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.web_hosting_accounts TO authenticated;
GRANT ALL ON public.web_hosting_accounts TO service_role;
ALTER TABLE public.web_hosting_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage hosting" ON public.web_hosting_accounts FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));
CREATE TRIGGER trg_web_hosting_updated BEFORE UPDATE ON public.web_hosting_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Cloud Storage accounts
CREATE TABLE public.cloud_storage_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  account_number TEXT,
  name TEXT NOT NULL,
  provider TEXT,
  storage_tb NUMERIC,
  used_tb NUMERIC DEFAULT 0,
  access_url TEXT,
  monthly_cost NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'active',
  renewal_date DATE,
  notes TEXT,
  archived_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cloud_storage_accounts TO authenticated;
GRANT ALL ON public.cloud_storage_accounts TO service_role;
ALTER TABLE public.cloud_storage_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage cloud storage" ON public.cloud_storage_accounts FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));
CREATE TRIGGER trg_cloud_storage_updated BEFORE UPDATE ON public.cloud_storage_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Managed NAS accounts
CREATE TABLE public.managed_nas_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  account_number TEXT,
  name TEXT NOT NULL,
  vendor TEXT,
  model TEXT,
  serial_number TEXT,
  capacity_tb NUMERIC,
  raid_level TEXT,
  location TEXT,
  management_url TEXT,
  monthly_cost NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'active',
  renewal_date DATE,
  notes TEXT,
  archived_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.managed_nas_accounts TO authenticated;
GRANT ALL ON public.managed_nas_accounts TO service_role;
ALTER TABLE public.managed_nas_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage nas" ON public.managed_nas_accounts FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));
CREATE TRIGGER trg_nas_updated BEFORE UPDATE ON public.managed_nas_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Licenses (networking / cybersecurity)
CREATE TABLE public.licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  account_number TEXT,
  product TEXT NOT NULL,
  vendor TEXT,
  category TEXT,
  license_key TEXT,
  seats INT DEFAULT 1,
  purchase_date DATE,
  expiry_date DATE,
  cost NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'active',
  auto_renew BOOLEAN DEFAULT false,
  notes TEXT,
  archived_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.licenses TO authenticated;
GRANT ALL ON public.licenses TO service_role;
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage licenses" ON public.licenses FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));
CREATE TRIGGER trg_licenses_updated BEFORE UPDATE ON public.licenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Communications log
CREATE TABLE public.communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  account_number TEXT,
  channel TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'outbound',
  subject TEXT,
  body TEXT,
  recipient TEXT,
  sender TEXT,
  status TEXT DEFAULT 'sent',
  external_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communications TO authenticated;
GRANT ALL ON public.communications TO service_role;
ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage communications" ON public.communications FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));
CREATE TRIGGER trg_comms_updated BEFORE UPDATE ON public.communications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-suspend rules settings
INSERT INTO public.system_settings (key, value)
VALUES ('auto_suspend', '{"enabled": false, "grace_days": 7, "reactivate_on_payment": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;
