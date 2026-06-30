
-- ============================================================
-- 1. DROP LEGACY SOLAR CRM SCHEMA
-- ============================================================
DROP TABLE IF EXISTS public.client_activities CASCADE;
DROP TABLE IF EXISTS public.client_phones CASCADE;
DROP TABLE IF EXISTS public.client_systems CASCADE;
DROP TABLE IF EXISTS public.clients CASCADE;
DROP TABLE IF EXISTS public.installations CASCADE;
DROP TABLE IF EXISTS public.invoices CASCADE;
DROP TABLE IF EXISTS public.leads CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.quotes CASCADE;
DROP TABLE IF EXISTS public.tasks CASCADE;
DROP TABLE IF EXISTS public.zoho_connections CASCADE;
DROP TABLE IF EXISTS public.zoho_credit_notes CASCADE;
DROP TABLE IF EXISTS public.zoho_customers CASCADE;
DROP TABLE IF EXISTS public.zoho_estimates CASCADE;
DROP TABLE IF EXISTS public.zoho_expenses CASCADE;
DROP TABLE IF EXISTS public.zoho_invoices CASCADE;
DROP TABLE IF EXISTS public.zoho_items CASCADE;
DROP TABLE IF EXISTS public.zoho_organizations CASCADE;
DROP TABLE IF EXISTS public.zoho_payments CASCADE;
DROP TABLE IF EXISTS public.zoho_sales_orders CASCADE;
DROP TABLE IF EXISTS public.zoho_sync_logs CASCADE;
DROP TABLE IF EXISTS public.zoho_taxes CASCADE;
DROP TABLE IF EXISTS public.zoho_vendors CASCADE;

-- ============================================================
-- 2. ROLES (separate from profiles for security)
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM (
    'master_admin','operations_manager','finance','sales','account_manager',
    'technical_support','cloud_engineer','cyber_security','noc','inventory',
    'procurement','customer_success','read_only','custom'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  granted_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_master_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'master_admin')
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

CREATE POLICY "user_roles self read" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_master_admin(auth.uid()));
CREATE POLICY "user_roles admin manage" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_master_admin(auth.uid()))
  WITH CHECK (public.is_master_admin(auth.uid()));

-- Auto-promote the very first user to master_admin, also create profile
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE user_count int;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name',
      INITCAP(REPLACE(SPLIT_PART(NEW.email, '@', 1), '.', ' ')))
  ) ON CONFLICT (id) DO NOTHING;

  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count <= 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'master_admin')
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'read_only')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Profiles: extend
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

DROP POLICY IF EXISTS "Master admins can read all profiles" ON public.profiles;
CREATE POLICY "Master admins can read all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_master_admin(auth.uid()));

DROP POLICY IF EXISTS "Master admins can update profiles" ON public.profiles;
CREATE POLICY "Master admins can update profiles" ON public.profiles
  FOR UPDATE TO authenticated USING (public.is_master_admin(auth.uid()))
  WITH CHECK (public.is_master_admin(auth.uid()));

-- ============================================================
-- 3. CUSTOMERS — auto M0001 numbering
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS public.customer_account_seq START 1;

CREATE OR REPLACE FUNCTION public.gen_customer_account_number()
RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT 'M' || LPAD(nextval('public.customer_account_seq')::text, 4, '0')
$$;

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_number text UNIQUE NOT NULL DEFAULT public.gen_customer_account_number(),
  company_name text NOT NULL,
  industry text,
  status text NOT NULL DEFAULT 'active',
  tags text[] NOT NULL DEFAULT '{}',
  website text,
  primary_email text,
  primary_phone text,
  billing_address text,
  account_manager_id uuid REFERENCES auth.users(id),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE OR REPLACE FUNCTION public.prevent_account_number_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.account_number IS DISTINCT FROM OLD.account_number THEN
    RAISE EXCEPTION 'account_number is immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER customers_lock_account_number
BEFORE UPDATE ON public.customers FOR EACH ROW
EXECUTE FUNCTION public.prevent_account_number_change();

CREATE TRIGGER customers_set_updated_at BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers read for any role" ON public.customers
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "customers write for staff" ON public.customers
  FOR INSERT TO authenticated WITH CHECK (
    public.is_master_admin(auth.uid())
    OR public.has_role(auth.uid(),'operations_manager')
    OR public.has_role(auth.uid(),'sales')
    OR public.has_role(auth.uid(),'account_manager')
  );
CREATE POLICY "customers update for staff" ON public.customers
  FOR UPDATE TO authenticated USING (
    public.is_master_admin(auth.uid())
    OR public.has_role(auth.uid(),'operations_manager')
    OR public.has_role(auth.uid(),'sales')
    OR public.has_role(auth.uid(),'account_manager')
  );
CREATE POLICY "customers delete master only" ON public.customers
  FOR DELETE TO authenticated USING (public.is_master_admin(auth.uid()));

-- ---------- Customer sub-tables ----------
CREATE TABLE public.customer_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  account_number text NOT NULL,
  name text NOT NULL,
  role text,
  contact_type text NOT NULL DEFAULT 'general',
  email text,
  phone text,
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE TRIGGER customer_contacts_updated BEFORE UPDATE ON public.customer_contacts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_contacts TO authenticated;
GRANT ALL ON public.customer_contacts TO service_role;
ALTER TABLE public.customer_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contacts read" ON public.customer_contacts FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "contacts write" ON public.customer_contacts FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));

CREATE TABLE public.customer_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  account_number text NOT NULL,
  name text NOT NULL,
  address text,
  city text,
  country text,
  is_headquarters boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE TRIGGER customer_branches_updated BEFORE UPDATE ON public.customer_branches
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_branches TO authenticated;
GRANT ALL ON public.customer_branches TO service_role;
ALTER TABLE public.customer_branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "branches read" ON public.customer_branches FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "branches write" ON public.customer_branches FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));

CREATE TABLE public.customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  account_number text NOT NULL,
  body text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  author_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_notes TO authenticated;
GRANT ALL ON public.customer_notes TO service_role;
ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notes read" ON public.customer_notes FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "notes write" ON public.customer_notes FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));

CREATE TABLE public.customer_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  account_number text NOT NULL,
  event_type text NOT NULL,
  title text NOT NULL,
  description text,
  actor_id uuid REFERENCES auth.users(id),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.customer_timeline TO authenticated;
GRANT ALL ON public.customer_timeline TO service_role;
ALTER TABLE public.customer_timeline ENABLE ROW LEVEL SECURITY;
CREATE POLICY "timeline read" ON public.customer_timeline FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "timeline insert" ON public.customer_timeline FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid()));

-- Auto-fill account_number from parent customer
CREATE OR REPLACE FUNCTION public.fill_account_number_from_customer()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.account_number IS NULL OR NEW.account_number = '' THEN
    SELECT account_number INTO NEW.account_number FROM public.customers WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER ccontacts_fill_acct BEFORE INSERT ON public.customer_contacts FOR EACH ROW EXECUTE FUNCTION public.fill_account_number_from_customer();
CREATE TRIGGER cbranches_fill_acct BEFORE INSERT ON public.customer_branches FOR EACH ROW EXECUTE FUNCTION public.fill_account_number_from_customer();
CREATE TRIGGER cnotes_fill_acct BEFORE INSERT ON public.customer_notes FOR EACH ROW EXECUTE FUNCTION public.fill_account_number_from_customer();
CREATE TRIGGER ctimeline_fill_acct BEFORE INSERT ON public.customer_timeline FOR EACH ROW EXECUTE FUNCTION public.fill_account_number_from_customer();

-- ============================================================
-- 4. SUPPORT TICKETS
-- ============================================================
CREATE TABLE public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text UNIQUE NOT NULL DEFAULT 'T' || LPAD(nextval('public.customer_account_seq')::text, 5, '0'),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  account_number text NOT NULL,
  subject text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'normal',
  category text,
  assigned_to uuid REFERENCES auth.users(id),
  assigned_team text,
  sla_due_at timestamptz,
  resolved_at timestamptz,
  resolution_notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
-- separate sequence for ticket numbers so we don't burn customer seq
DROP TABLE public.tickets;
CREATE SEQUENCE IF NOT EXISTS public.ticket_number_seq START 1;
CREATE TABLE public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text UNIQUE NOT NULL DEFAULT 'T' || LPAD(nextval('public.ticket_number_seq')::text, 5, '0'),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  account_number text NOT NULL,
  subject text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'normal',
  category text,
  assigned_to uuid REFERENCES auth.users(id),
  assigned_team text,
  sla_due_at timestamptz,
  resolved_at timestamptz,
  resolution_notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE TRIGGER tickets_updated BEFORE UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tickets_fill_acct BEFORE INSERT ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.fill_account_number_from_customer();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tickets TO authenticated;
GRANT ALL ON public.tickets TO service_role;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tickets read" ON public.tickets FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "tickets write" ON public.tickets FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));

CREATE TABLE public.ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id),
  body text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  attachments jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_messages TO authenticated;
GRANT ALL ON public.ticket_messages TO service_role;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tmsg read" ON public.ticket_messages FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "tmsg write" ON public.ticket_messages FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));

-- ============================================================
-- 5. CREDENTIAL VAULT (encrypted)
-- ============================================================
CREATE TABLE public.credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  account_number text,
  name text NOT NULL,
  credential_type text NOT NULL,
  username text,
  url text,
  notes text,
  -- encrypted ciphertext (AES-256-GCM), base64
  ciphertext text NOT NULL,
  iv text NOT NULL,
  auth_tag text NOT NULL,
  key_id text NOT NULL DEFAULT 'v1',
  expires_at timestamptz,
  owner_id uuid REFERENCES auth.users(id),
  linked_asset text,
  tags text[] NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE TRIGGER credentials_updated BEFORE UPDATE ON public.credentials
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE FUNCTION public.fill_cred_account_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.customer_id IS NOT NULL AND (NEW.account_number IS NULL OR NEW.account_number = '') THEN
    SELECT account_number INTO NEW.account_number FROM public.customers WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER credentials_fill_acct BEFORE INSERT ON public.credentials FOR EACH ROW EXECUTE FUNCTION public.fill_cred_account_number();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credentials TO authenticated;
GRANT ALL ON public.credentials TO service_role;
ALTER TABLE public.credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cred read for trusted" ON public.credentials FOR SELECT TO authenticated USING (
  public.is_master_admin(auth.uid())
  OR public.has_role(auth.uid(),'technical_support')
  OR public.has_role(auth.uid(),'cloud_engineer')
  OR public.has_role(auth.uid(),'cyber_security')
  OR public.has_role(auth.uid(),'noc')
  OR public.has_role(auth.uid(),'operations_manager')
);
CREATE POLICY "cred write for trusted" ON public.credentials FOR ALL TO authenticated USING (
  public.is_master_admin(auth.uid())
  OR public.has_role(auth.uid(),'technical_support')
  OR public.has_role(auth.uid(),'cloud_engineer')
  OR public.has_role(auth.uid(),'cyber_security')
) WITH CHECK (
  public.is_master_admin(auth.uid())
  OR public.has_role(auth.uid(),'technical_support')
  OR public.has_role(auth.uid(),'cloud_engineer')
  OR public.has_role(auth.uid(),'cyber_security')
);

CREATE TABLE public.credential_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id uuid NOT NULL REFERENCES public.credentials(id) ON DELETE CASCADE,
  ciphertext text NOT NULL,
  iv text NOT NULL,
  auth_tag text NOT NULL,
  key_id text NOT NULL,
  changed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.credential_versions TO authenticated;
GRANT ALL ON public.credential_versions TO service_role;
ALTER TABLE public.credential_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credver read" ON public.credential_versions FOR SELECT TO authenticated USING (public.is_master_admin(auth.uid()));
CREATE POLICY "credver insert" ON public.credential_versions FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid()));

CREATE TABLE public.credential_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id uuid NOT NULL REFERENCES public.credentials(id) ON DELETE CASCADE,
  accessed_by uuid REFERENCES auth.users(id),
  action text NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.credential_access_log TO authenticated;
GRANT ALL ON public.credential_access_log TO service_role;
ALTER TABLE public.credential_access_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credlog read admin" ON public.credential_access_log FOR SELECT TO authenticated USING (public.is_master_admin(auth.uid()) OR accessed_by = auth.uid());
CREATE POLICY "credlog insert" ON public.credential_access_log FOR INSERT TO authenticated WITH CHECK (accessed_by = auth.uid());

-- ============================================================
-- 6. AUDIT LOG
-- ============================================================
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id),
  actor_email text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  account_number text,
  old_value jsonb,
  new_value jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit read admin" ON public.audit_log FOR SELECT TO authenticated USING (public.is_master_admin(auth.uid()));
CREATE POLICY "audit insert any" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================
-- 7. NOTIFICATIONS
-- ============================================================
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif own" ON public.notifications FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 8. SYSTEM SETTINGS
-- ============================================================
CREATE TABLE public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);
CREATE TRIGGER sys_settings_updated BEFORE UPDATE ON public.system_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
GRANT SELECT ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sys read" ON public.system_settings FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "sys write admin" ON public.system_settings FOR ALL TO authenticated
  USING (public.is_master_admin(auth.uid())) WITH CHECK (public.is_master_admin(auth.uid()));

-- ============================================================
-- 9. Helpful indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_customers_account_number ON public.customers(account_number);
CREATE INDEX IF NOT EXISTS idx_customers_company ON public.customers USING gin (to_tsvector('simple', company_name));
CREATE INDEX IF NOT EXISTS idx_tickets_customer ON public.tickets(customer_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);
CREATE INDEX IF NOT EXISTS idx_credentials_customer ON public.credentials(customer_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_log(created_at DESC);
