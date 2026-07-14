-- VoIP accounts (one per phone number)
CREATE TABLE public.voip_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  account_number text,
  voip_number text NOT NULL,
  dandemutande_account text,
  sip_username text,
  sip_password_credential_id uuid REFERENCES public.credentials(id) ON DELETE SET NULL,
  extensions text[] NOT NULL DEFAULT '{}',
  balance_usd numeric(12,2) NOT NULL DEFAULT 0,
  balance_updated_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  low_balance_threshold_usd numeric(12,2) NOT NULL DEFAULT 5,
  last_successful_recharge_at timestamptz,
  last_synced_at timestamptz,
  notes text,
  tags text[] NOT NULL DEFAULT '{}',
  created_by uuid,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (voip_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voip_accounts TO authenticated;
GRANT ALL ON public.voip_accounts TO service_role;
ALTER TABLE public.voip_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "voip staff read" ON public.voip_accounts FOR SELECT TO authenticated
USING (
  public.is_master_admin(auth.uid())
  OR public.has_role(auth.uid(),'operations_manager')
  OR public.has_role(auth.uid(),'cloud_engineer')
  OR public.has_role(auth.uid(),'technical_support')
  OR public.has_role(auth.uid(),'finance')
  OR public.has_role(auth.uid(),'account_manager')
  OR public.has_role(auth.uid(),'sales')
  OR public.has_role(auth.uid(),'noc')
  OR customer_id = public.portal_customer_id(auth.uid())
);
CREATE POLICY "voip staff write" ON public.voip_accounts FOR ALL TO authenticated
USING (
  public.is_master_admin(auth.uid())
  OR public.has_role(auth.uid(),'operations_manager')
  OR public.has_role(auth.uid(),'cloud_engineer')
  OR public.has_role(auth.uid(),'technical_support')
  OR public.has_role(auth.uid(),'finance')
)
WITH CHECK (
  public.is_master_admin(auth.uid())
  OR public.has_role(auth.uid(),'operations_manager')
  OR public.has_role(auth.uid(),'cloud_engineer')
  OR public.has_role(auth.uid(),'technical_support')
  OR public.has_role(auth.uid(),'finance')
);

CREATE TRIGGER voip_accounts_fill_acct BEFORE INSERT ON public.voip_accounts
FOR EACH ROW EXECUTE FUNCTION public.fill_account_number_from_customer();
CREATE TRIGGER voip_accounts_updated BEFORE UPDATE ON public.voip_accounts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX voip_accounts_customer_idx ON public.voip_accounts(customer_id);

-- Recharges
CREATE TABLE public.voip_recharges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voip_account_id uuid NOT NULL REFERENCES public.voip_accounts(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  amount_usd numeric(12,2) NOT NULL,
  payment_reference text,
  payment_method text,
  pop_url text,
  receipt_number text,
  status text NOT NULL DEFAULT 'pending',
  email_status text NOT NULL DEFAULT 'not_sent',
  email_error text,
  verified_at timestamptz,
  balance_before numeric(12,2),
  balance_after numeric(12,2),
  requested_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voip_recharges TO authenticated;
GRANT ALL ON public.voip_recharges TO service_role;
ALTER TABLE public.voip_recharges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "voip recharge staff read" ON public.voip_recharges FOR SELECT TO authenticated
USING (
  public.is_master_admin(auth.uid())
  OR public.has_role(auth.uid(),'operations_manager')
  OR public.has_role(auth.uid(),'cloud_engineer')
  OR public.has_role(auth.uid(),'technical_support')
  OR public.has_role(auth.uid(),'finance')
  OR public.has_role(auth.uid(),'account_manager')
  OR public.has_role(auth.uid(),'sales')
  OR customer_id = public.portal_customer_id(auth.uid())
);
CREATE POLICY "voip recharge staff write" ON public.voip_recharges FOR ALL TO authenticated
USING (
  public.is_master_admin(auth.uid())
  OR public.has_role(auth.uid(),'operations_manager')
  OR public.has_role(auth.uid(),'cloud_engineer')
  OR public.has_role(auth.uid(),'technical_support')
  OR public.has_role(auth.uid(),'finance')
)
WITH CHECK (
  public.is_master_admin(auth.uid())
  OR public.has_role(auth.uid(),'operations_manager')
  OR public.has_role(auth.uid(),'cloud_engineer')
  OR public.has_role(auth.uid(),'technical_support')
  OR public.has_role(auth.uid(),'finance')
);
CREATE TRIGGER voip_recharges_updated BEFORE UPDATE ON public.voip_recharges
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX voip_recharges_account_idx ON public.voip_recharges(voip_account_id);

-- Sync log
CREATE TABLE public.voip_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voip_account_id uuid REFERENCES public.voip_accounts(id) ON DELETE CASCADE,
  status text NOT NULL,
  source text NOT NULL DEFAULT 'firecrawl',
  extracted jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voip_sync_log TO authenticated;
GRANT ALL ON public.voip_sync_log TO service_role;
ALTER TABLE public.voip_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "voip sync staff read" ON public.voip_sync_log FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid()));
CREATE POLICY "voip sync staff write" ON public.voip_sync_log FOR ALL TO authenticated
USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));