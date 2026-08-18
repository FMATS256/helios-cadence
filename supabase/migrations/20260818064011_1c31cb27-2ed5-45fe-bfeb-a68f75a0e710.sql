
CREATE TABLE public.cash_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'cash',
  currency text not null default 'USD',
  opening_balance numeric not null default 0,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_accounts TO authenticated;
GRANT ALL ON public.cash_accounts TO service_role;
ALTER TABLE public.cash_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read cash accounts" ON public.cash_accounts FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "finance manage cash accounts" ON public.cash_accounts FOR ALL TO authenticated
  USING (public.is_master_admin(auth.uid()) OR public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'operations_manager'))
  WITH CHECK (public.is_master_admin(auth.uid()) OR public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'operations_manager'));

CREATE TABLE public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  category text not null default 'general',
  vendor text,
  description text not null,
  amount numeric not null default 0,
  currency text not null default 'USD',
  account_id uuid references public.cash_accounts(id) on delete set null,
  payment_method text not null default 'cash',
  reference text,
  status text not null default 'paid',
  customer_id uuid references public.customers(id) on delete set null,
  attachment_url text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE INDEX expenses_date_idx ON public.expenses (expense_date desc);
CREATE INDEX expenses_account_idx ON public.expenses (account_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read expenses" ON public.expenses FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "finance manage expenses" ON public.expenses FOR ALL TO authenticated
  USING (public.is_master_admin(auth.uid()) OR public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'operations_manager'))
  WITH CHECK (public.is_master_admin(auth.uid()) OR public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'operations_manager'));

CREATE TABLE public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.cash_accounts(id) on delete cascade,
  kind text not null default 'deposit',
  amount numeric not null default 0,
  currency text not null default 'USD',
  occurred_at timestamptz not null default now(),
  reference text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);
CREATE INDEX cash_movements_account_idx ON public.cash_movements (account_id, occurred_at desc);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_movements TO authenticated;
GRANT ALL ON public.cash_movements TO service_role;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read cash movements" ON public.cash_movements FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "finance manage cash movements" ON public.cash_movements FOR ALL TO authenticated
  USING (public.is_master_admin(auth.uid()) OR public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'operations_manager'))
  WITH CHECK (public.is_master_admin(auth.uid()) OR public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'operations_manager'));

CREATE TRIGGER set_cash_accounts_updated_at BEFORE UPDATE ON public.cash_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_expenses_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.cash_accounts (name, kind, currency, opening_balance, is_default)
VALUES ('Cash in Hand', 'cash', 'USD', 0, true), ('Main Bank Account', 'bank', 'USD', 0, false);
