
-- Connections (org-wide; expected to hold 1 active row)
CREATE TABLE public.zoho_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region text NOT NULL DEFAULT 'com',
  organization_id text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  scope text,
  connected_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.zoho_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity text NOT NULL,
  status text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  records_synced integer DEFAULT 0,
  error text,
  triggered_by uuid
);

-- Generic entity mirror tables. Raw JSON preserved.
CREATE TABLE public.zoho_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_id text UNIQUE NOT NULL,
  display_name text,
  company_name text,
  email text,
  phone text,
  mobile text,
  status text,
  outstanding numeric DEFAULT 0,
  unused_credits numeric DEFAULT 0,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.zoho_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_id text UNIQUE NOT NULL,
  invoice_number text,
  customer_zoho_id text,
  customer_name text,
  status text,
  date date,
  due_date date,
  total numeric DEFAULT 0,
  balance numeric DEFAULT 0,
  currency_code text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.zoho_sales_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_id text UNIQUE NOT NULL,
  salesorder_number text,
  customer_zoho_id text,
  customer_name text,
  status text,
  date date,
  total numeric DEFAULT 0,
  currency_code text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.zoho_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_id text UNIQUE NOT NULL,
  estimate_number text,
  customer_zoho_id text,
  customer_name text,
  status text,
  date date,
  expiry_date date,
  total numeric DEFAULT 0,
  currency_code text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.zoho_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_id text UNIQUE NOT NULL,
  payment_number text,
  customer_zoho_id text,
  customer_name text,
  payment_mode text,
  amount numeric DEFAULT 0,
  date date,
  reference_number text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.zoho_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_id text UNIQUE NOT NULL,
  name text,
  sku text,
  rate numeric DEFAULT 0,
  unit text,
  status text,
  description text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.zoho_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_id text UNIQUE NOT NULL,
  account_name text,
  vendor_zoho_id text,
  vendor_name text,
  date date,
  amount numeric DEFAULT 0,
  status text,
  description text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.zoho_credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_id text UNIQUE NOT NULL,
  creditnote_number text,
  customer_zoho_id text,
  customer_name text,
  status text,
  date date,
  total numeric DEFAULT 0,
  balance numeric DEFAULT 0,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.zoho_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_id text UNIQUE NOT NULL,
  vendor_name text,
  company_name text,
  email text,
  phone text,
  status text,
  outstanding_payable numeric DEFAULT 0,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.zoho_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_id text UNIQUE NOT NULL,
  name text,
  currency_code text,
  country text,
  email text,
  fiscal_year_start_month integer,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.zoho_taxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_id text UNIQUE NOT NULL,
  tax_name text,
  tax_percentage numeric DEFAULT 0,
  tax_type text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on all
ALTER TABLE public.zoho_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zoho_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zoho_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zoho_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zoho_sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zoho_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zoho_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zoho_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zoho_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zoho_credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zoho_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zoho_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zoho_taxes ENABLE ROW LEVEL SECURITY;

-- SELECT policies: all authenticated users (org-wide visibility)
-- Writes are done via service role (admin client) only — no policies needed for that.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'zoho_connections','zoho_sync_logs','zoho_customers','zoho_invoices',
    'zoho_sales_orders','zoho_estimates','zoho_payments','zoho_items',
    'zoho_expenses','zoho_credit_notes','zoho_vendors','zoho_organizations','zoho_taxes'
  ])
  LOOP
    EXECUTE format('CREATE POLICY "auth read %1$s" ON public.%1$s FOR SELECT TO authenticated USING (true);', t);
  END LOOP;
END $$;

-- updated_at trigger on connections
CREATE TRIGGER set_zoho_connections_updated_at
BEFORE UPDATE ON public.zoho_connections
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helpful indexes
CREATE INDEX zoho_invoices_customer_idx ON public.zoho_invoices(customer_zoho_id);
CREATE INDEX zoho_payments_customer_idx ON public.zoho_payments(customer_zoho_id);
CREATE INDEX zoho_sync_logs_started_idx ON public.zoho_sync_logs(started_at DESC);
