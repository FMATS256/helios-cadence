CREATE TABLE public.sophos_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  tenant_name text NOT NULL,
  data_region text NOT NULL DEFAULT 'eu',
  admin_email text,
  sophos_tenant_id text,
  status text NOT NULL DEFAULT 'awaiting_api' CHECK (status IN ('awaiting_api','queued','provisioned','failed')),
  last_error text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id)
);
CREATE TABLE public.sophos_license_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.sophos_tenants(id) ON DELETE SET NULL,
  product text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  term_months integer NOT NULL DEFAULT 12 CHECK (term_months IN (1,12,24,36)),
  order_type text NOT NULL DEFAULT 'new' CHECK (order_type IN ('new','renewal','upgrade','add_seats')),
  existing_serial text,
  expiry_date date,
  notes text,
  status text NOT NULL DEFAULT 'awaiting_approval' CHECK (status IN ('awaiting_approval','approved','rejected','awaiting_api','fulfilled','failed')),
  requested_by uuid DEFAULT auth.uid(),
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.sophos_tenants TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sophos_license_orders TO authenticated;
GRANT ALL ON public.sophos_tenants TO service_role;
GRANT ALL ON public.sophos_license_orders TO service_role;
ALTER TABLE public.sophos_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sophos_license_orders ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_sophos(_uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_tech_staff(_uid) OR public.is_sales_staff(_uid) OR public.is_finance_staff(_uid)
    OR public.is_master_admin(_uid) OR public.has_role(_uid,'operations_manager')
$$;
CREATE OR REPLACE FUNCTION public.can_approve_sophos(_uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_finance_staff(_uid) OR public.is_master_admin(_uid) OR public.has_role(_uid,'operations_manager')
$$;

CREATE POLICY "staff read tenants" ON public.sophos_tenants FOR SELECT TO authenticated USING (public.can_manage_sophos(auth.uid()));
CREATE POLICY "staff add tenants" ON public.sophos_tenants FOR INSERT TO authenticated WITH CHECK (public.can_manage_sophos(auth.uid()) AND status = 'awaiting_api');
CREATE POLICY "staff update tenants" ON public.sophos_tenants FOR UPDATE TO authenticated USING (public.can_manage_sophos(auth.uid())) WITH CHECK (public.can_manage_sophos(auth.uid()));
CREATE POLICY "staff read orders" ON public.sophos_license_orders FOR SELECT TO authenticated USING (public.can_manage_sophos(auth.uid()));
CREATE POLICY "staff request orders" ON public.sophos_license_orders FOR INSERT TO authenticated WITH CHECK (public.can_manage_sophos(auth.uid()) AND status = 'awaiting_approval' AND requested_by = auth.uid());
CREATE POLICY "staff update orders" ON public.sophos_license_orders FOR UPDATE TO authenticated USING (public.can_manage_sophos(auth.uid())) WITH CHECK (public.can_manage_sophos(auth.uid()));

-- Approval guard: only Finance/admin approve, never their own request; fulfilment only via backend.
CREATE OR REPLACE FUNCTION public.guard_sophos_order() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF auth.uid() IS NULL THEN RETURN NEW; END IF; -- backend/service
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('approved','rejected') THEN
      IF OLD.status <> 'awaiting_approval' THEN RAISE EXCEPTION 'Only pending orders can be decided'; END IF;
      IF NOT public.can_approve_sophos(auth.uid()) THEN RAISE EXCEPTION 'Only Finance or administrators can approve licence orders'; END IF;
      IF OLD.requested_by = auth.uid() AND NOT public.is_master_admin(auth.uid()) THEN RAISE EXCEPTION 'You cannot approve your own request'; END IF;
      NEW.approved_by := auth.uid(); NEW.approved_at := now();
    ELSIF NEW.status = 'awaiting_api' THEN
      IF OLD.status <> 'approved' THEN RAISE EXCEPTION 'Order must be approved first'; END IF;
    ELSE
      RAISE EXCEPTION 'Status % is set by the Sophos integration only', NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_sophos_order BEFORE UPDATE ON public.sophos_license_orders FOR EACH ROW EXECUTE FUNCTION public.guard_sophos_order();

CREATE OR REPLACE FUNCTION public.guard_sophos_tenant() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF auth.uid() IS NOT NULL AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.sophos_tenant_id IS DISTINCT FROM OLD.sophos_tenant_id) THEN
    RAISE EXCEPTION 'Tenant status is set by the Sophos integration only';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_sophos_tenant BEFORE UPDATE ON public.sophos_tenants FOR EACH ROW EXECUTE FUNCTION public.guard_sophos_tenant();