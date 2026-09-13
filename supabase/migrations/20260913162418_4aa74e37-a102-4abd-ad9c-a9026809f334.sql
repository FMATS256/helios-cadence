CREATE TABLE public.chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('asset','liability','equity','income','expense')),
  category text,
  normal_balance text NOT NULL DEFAULT 'debit' CHECK (normal_balance IN ('debit','credit')),
  parent_code text,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chart_of_accounts TO authenticated;
GRANT ALL ON public.chart_of_accounts TO service_role;
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view accounts" ON public.chart_of_accounts FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "Finance can manage accounts" ON public.chart_of_accounts FOR ALL TO authenticated
  USING (public.is_master_admin(auth.uid()) OR public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'operations_manager'))
  WITH CHECK (public.is_master_admin(auth.uid()) OR public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'operations_manager'));
CREATE TRIGGER set_coa_updated_at BEFORE UPDATE ON public.chart_of_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_no bigserial,
  entry_date date NOT NULL DEFAULT current_date,
  memo text,
  source_type text NOT NULL DEFAULT 'manual',
  source_id uuid,
  source_ref text,
  currency text NOT NULL DEFAULT 'USD',
  fx_rate numeric NOT NULL DEFAULT 1,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  total_debit numeric NOT NULL DEFAULT 0,
  total_credit numeric NOT NULL DEFAULT 0,
  reverses_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX journal_entries_source_uniq ON public.journal_entries (source_type, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX journal_entries_date_idx ON public.journal_entries (entry_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entries TO authenticated;
GRANT ALL ON public.journal_entries TO service_role;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view journal entries" ON public.journal_entries FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "Finance can manage journal entries" ON public.journal_entries FOR ALL TO authenticated
  USING (public.is_master_admin(auth.uid()) OR public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'operations_manager'))
  WITH CHECK (public.is_master_admin(auth.uid()) OR public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'operations_manager'));
CREATE TRIGGER set_je_updated_at BEFORE UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_code text NOT NULL,
  account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  debit numeric NOT NULL DEFAULT 0,
  credit numeric NOT NULL DEFAULT 0,
  description text,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX journal_lines_entry_idx ON public.journal_lines (entry_id);
CREATE INDEX journal_lines_account_idx ON public.journal_lines (account_code);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_lines TO authenticated;
GRANT ALL ON public.journal_lines TO service_role;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view journal lines" ON public.journal_lines FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "Finance can manage journal lines" ON public.journal_lines FOR ALL TO authenticated
  USING (public.is_master_admin(auth.uid()) OR public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'operations_manager'))
  WITH CHECK (public.is_master_admin(auth.uid()) OR public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'operations_manager'));

INSERT INTO public.chart_of_accounts (code, name, type, category, normal_balance, is_system, description) VALUES
('1000','Cash on Hand','asset','Current Assets','debit',true,'Petty cash and till floats'),
('1010','Bank Accounts','asset','Current Assets','debit',true,'Operating bank accounts'),
('1090','Cash Clearing','asset','Current Assets','debit',true,'Suspense for deposits, withdrawals and transfers'),
('1100','Accounts Receivable','asset','Current Assets','debit',true,'Amounts invoiced to customers and not yet paid'),
('1200','Inventory','asset','Current Assets','debit',true,'Hardware and consumable stock on hand'),
('1500','Fixed Assets','asset','Non-current Assets','debit',false,'Equipment, vehicles and infrastructure'),
('2000','Accounts Payable','liability','Current Liabilities','credit',true,'Amounts owed to suppliers'),
('2100','Customer Credits','liability','Current Liabilities','credit',true,'Credit notes and deposits held for customers'),
('2200','Tax Payable','liability','Current Liabilities','credit',true,'VAT and other taxes collected'),
('3000','Share Capital','equity','Equity','credit',false,'Owner and shareholder capital'),
('3900','Retained Earnings','equity','Equity','credit',true,'Accumulated profit carried forward'),
('4000','Service Revenue','income','Revenue','credit',true,'Recurring and once-off service billing'),
('4100','Hardware Sales','income','Revenue','credit',true,'Point of sale and hardware supply'),
('4200','Other Income','income','Revenue','credit',false,'Miscellaneous income'),
('4900','Refunds & Credits','income','Revenue','debit',true,'Contra revenue for refunds and credit notes'),
('5000','Cost of Sales','expense','Cost of Sales','debit',true,'Provider, upstream and hardware purchase costs'),
('6100','Salaries & Wages','expense','Operating Expenses','debit',false,'Staff costs'),
('6200','Rent & Utilities','expense','Operating Expenses','debit',false,'Premises, power and water'),
('6250','Internet & Connectivity','expense','Operating Expenses','debit',false,'Upstream links and data'),
('6300','Marketing & Sales','expense','Operating Expenses','debit',false,'Advertising and promotion'),
('6400','Travel & Transport','expense','Operating Expenses','debit',false,'Fuel, vehicle and travel costs'),
('6450','Repairs & Maintenance','expense','Operating Expenses','debit',false,'Equipment and premises upkeep'),
('6500','Bank & Finance Charges','expense','Operating Expenses','debit',false,'Bank fees and interest'),
('6550','Software & Licenses','expense','Operating Expenses','debit',false,'Subscriptions and licensing'),
('6600','Professional Fees','expense','Operating Expenses','debit',false,'Legal, audit and consulting'),
('6900','Other Operating Expenses','expense','Operating Expenses','debit',true,'Uncategorised operating spend');

UPDATE public.journal_lines l SET account_id = a.id FROM public.chart_of_accounts a WHERE a.code = l.account_code;