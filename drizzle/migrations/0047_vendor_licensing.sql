CREATE TABLE public.vendor_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor text NOT NULL CHECK (vendor IN ('sophos','veeam','kaspersky','microsoft365','zoho')),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  tenant_name text NOT NULL,
  tenant_domain text,
  data_region text,
  admin_email text,
  external_id text,
  status text NOT NULL DEFAULT 'awaiting_api' CHECK (status IN ('awaiting_api','active','failed','suspended')),
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor, customer_id)
);
CREATE TABLE public.vendor_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor text NOT NULL CHECK (vendor IN ('sophos','veeam','kaspersky','microsoft365','zoho')),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.vendor_tenants(id) ON DELETE SET NULL,
  product text NOT NULL,
  seats integer NOT NULL DEFAULT 1 CHECK (seats > 0),
  license_key text,
  start_date date,
  expiry_date date,
  billing_cycle text NOT NULL DEFAULT 'annual' CHECK (billing_cycle IN ('monthly','annual','multi_year')),
  auto_renew boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','cancelled','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.vendor_license_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor text NOT NULL CHECK (vendor IN ('sophos','veeam','kaspersky','microsoft365','zoho')),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.vendor_tenants(id) ON DELETE SET NULL,
  license_id uuid REFERENCES public.vendor_licenses(id) ON DELETE SET NULL,
  order_type text NOT NULL DEFAULT 'new' CHECK (order_type IN ('new','renewal','upgrade','add_seats','reduce_seats','cancel')),
  product text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  term_months integer NOT NULL DEFAULT 12 CHECK (term_months IN (1,12,24,36)),
  existing_serial text,
  expiry_date date,
  unit_price numeric(12,2),
  notes text,
  status text NOT NULL DEFAULT 'awaiting_approval' CHECK (status IN ('awaiting_approval','approved','rejected','awaiting_api','fulfilled','failed')),
  fulfilled_license_key text,
  fulfilled_expiry date,
  requested_by uuid DEFAULT auth.uid(),
  approved_by uuid,
  approved_at timestamptz,
  fulfilled_by uuid,
  fulfilled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.vendor_tenants, public.vendor_licenses, public.vendor_license_orders TO authenticated;
GRANT ALL ON public.vendor_tenants, public.vendor_licenses, public.vendor_license_orders TO service_role;
ALTER TABLE public.vendor_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_license_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read" ON public.vendor_tenants FOR SELECT TO authenticated USING (public.can_manage_sophos(auth.uid()));
CREATE POLICY "staff add" ON public.vendor_tenants FOR INSERT TO authenticated WITH CHECK (public.can_manage_sophos(auth.uid()));
CREATE POLICY "staff edit" ON public.vendor_tenants FOR UPDATE TO authenticated USING (public.can_manage_sophos(auth.uid())) WITH CHECK (public.can_manage_sophos(auth.uid()));
CREATE POLICY "staff read" ON public.vendor_licenses FOR SELECT TO authenticated USING (public.can_manage_sophos(auth.uid()));
CREATE POLICY "approvers add" ON public.vendor_licenses FOR INSERT TO authenticated WITH CHECK (public.can_approve_sophos(auth.uid()));
CREATE POLICY "staff edit" ON public.vendor_licenses FOR UPDATE TO authenticated USING (public.can_manage_sophos(auth.uid())) WITH CHECK (public.can_manage_sophos(auth.uid()));
CREATE POLICY "staff read" ON public.vendor_license_orders FOR SELECT TO authenticated USING (public.can_manage_sophos(auth.uid()));
CREATE POLICY "staff request" ON public.vendor_license_orders FOR INSERT TO authenticated WITH CHECK (public.can_manage_sophos(auth.uid()) AND status = 'awaiting_approval' AND requested_by = auth.uid());
CREATE POLICY "staff edit" ON public.vendor_license_orders FOR UPDATE TO authenticated USING (public.can_manage_sophos(auth.uid())) WITH CHECK (public.can_manage_sophos(auth.uid()));

CREATE OR REPLACE FUNCTION public.guard_vendor_order() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lic uuid; months int;
BEGIN
  NEW.updated_at := now();
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF auth.uid() IS NOT NULL THEN
    IF NEW.status IN ('approved','rejected') THEN
      IF OLD.status <> 'awaiting_approval' THEN RAISE EXCEPTION 'Only pending orders can be decided'; END IF;
      IF NOT public.can_approve_sophos(auth.uid()) THEN RAISE EXCEPTION 'Only Finance or administrators can approve licence orders'; END IF;
      IF OLD.requested_by = auth.uid() AND NOT public.is_master_admin(auth.uid()) THEN RAISE EXCEPTION 'You cannot approve your own request'; END IF;
      NEW.approved_by := auth.uid(); NEW.approved_at := now();
    ELSIF NEW.status = 'awaiting_api' THEN
      IF OLD.status <> 'approved' THEN RAISE EXCEPTION 'Order must be approved first'; END IF;
    ELSIF NEW.status = 'fulfilled' THEN
      IF OLD.status NOT IN ('approved','awaiting_api') THEN RAISE EXCEPTION 'Order must be approved first'; END IF;
      IF NOT public.can_manage_sophos(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
    ELSE
      RAISE EXCEPTION 'Status % is set by the vendor integration only', NEW.status;
    END IF;
  END IF;
  IF NEW.status = 'fulfilled' THEN
    NEW.fulfilled_by := auth.uid(); NEW.fulfilled_at := now();
    months := NEW.term_months;
    IF NEW.license_id IS NOT NULL THEN
      UPDATE public.vendor_licenses SET
        seats = CASE WHEN NEW.order_type='add_seats' THEN seats + NEW.quantity
                     WHEN NEW.order_type='reduce_seats' THEN GREATEST(1, seats - NEW.quantity)
                     WHEN NEW.order_type IN ('renewal','upgrade') THEN NEW.quantity ELSE seats END,
        product = CASE WHEN NEW.order_type='upgrade' THEN NEW.product ELSE product END,
        expiry_date = CASE WHEN NEW.fulfilled_expiry IS NOT NULL THEN NEW.fulfilled_expiry
                           WHEN NEW.order_type='renewal' THEN (GREATEST(COALESCE(expiry_date, current_date), current_date) + make_interval(months => months))::date
                           ELSE expiry_date END,
        license_key = COALESCE(NEW.fulfilled_license_key, license_key),
        status = CASE WHEN NEW.order_type='cancel' THEN 'cancelled' ELSE 'active' END,
        updated_at = now()
      WHERE id = NEW.license_id;
    ELSE
      INSERT INTO public.vendor_licenses(vendor, customer_id, tenant_id, product, seats, license_key, start_date, expiry_date, billing_cycle)
      VALUES (NEW.vendor, NEW.customer_id, NEW.tenant_id, NEW.product, NEW.quantity, NEW.fulfilled_license_key, current_date,
        COALESCE(NEW.fulfilled_expiry, (current_date + make_interval(months => months))::date),
        CASE WHEN months = 1 THEN 'monthly' WHEN months = 12 THEN 'annual' ELSE 'multi_year' END)
      RETURNING id INTO lic;
      NEW.license_id := lic;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_vendor_order BEFORE UPDATE ON public.vendor_license_orders FOR EACH ROW EXECUTE FUNCTION public.guard_vendor_order();

COMMENT ON TABLE public.sophos_tenants IS 'DEPRECATED: replaced by vendor_tenants';
COMMENT ON TABLE public.sophos_license_orders IS 'DEPRECATED: replaced by vendor_license_orders';