CREATE TABLE public.starlink_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  account_number text NOT NULL,
  starlink_account_number text,
  kit_serial text,
  terminal_id text,
  service_address text,
  plan_type text NOT NULL DEFAULT 'residential',
  monthly_price numeric NOT NULL DEFAULT 89,
  balance_usd numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  last_checked_at timestamptz,
  provider_payload jsonb DEFAULT '{}'::jsonb,
  notes text,
  archived_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.starlink_accounts TO authenticated;
GRANT ALL ON public.starlink_accounts TO service_role;
ALTER TABLE public.starlink_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read starlink accounts" ON public.starlink_accounts FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "staff write starlink accounts" ON public.starlink_accounts FOR ALL TO authenticated USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));
CREATE POLICY "portal read own starlink accounts" ON public.starlink_accounts FOR SELECT TO authenticated USING (customer_id = public.portal_customer_id(auth.uid()));
CREATE INDEX starlink_accounts_customer_idx ON public.starlink_accounts(customer_id);
CREATE INDEX starlink_accounts_account_number_idx ON public.starlink_accounts(account_number);
CREATE INDEX starlink_accounts_lookup_idx ON public.starlink_accounts(starlink_account_number, kit_serial, terminal_id);
CREATE TRIGGER update_starlink_accounts_updated_at BEFORE UPDATE ON public.starlink_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.starlink_recharges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  starlink_account_id uuid NOT NULL REFERENCES public.starlink_accounts(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  account_number text NOT NULL,
  customer_charge_usd numeric NOT NULL DEFAULT 89,
  external_payout_usd numeric NOT NULL DEFAULT 77,
  margin_usd numeric NOT NULL DEFAULT 12,
  currency text NOT NULL DEFAULT 'USD',
  payment_reference text,
  payment_method text DEFAULT 'cash',
  external_company text NOT NULL DEFAULT 'External Starlink recharge partner',
  external_status text NOT NULL DEFAULT 'pending',
  status text NOT NULL DEFAULT 'submitted',
  requested_by uuid DEFAULT auth.uid(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.starlink_recharges TO authenticated;
GRANT ALL ON public.starlink_recharges TO service_role;
ALTER TABLE public.starlink_recharges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read starlink recharges" ON public.starlink_recharges FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "staff write starlink recharges" ON public.starlink_recharges FOR ALL TO authenticated USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));
CREATE POLICY "portal read own starlink recharges" ON public.starlink_recharges FOR SELECT TO authenticated USING (customer_id = public.portal_customer_id(auth.uid()));
CREATE INDEX starlink_recharges_account_idx ON public.starlink_recharges(starlink_account_id);
CREATE INDEX starlink_recharges_customer_idx ON public.starlink_recharges(customer_id);
CREATE TRIGGER update_starlink_recharges_updated_at BEFORE UPDATE ON public.starlink_recharges FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();