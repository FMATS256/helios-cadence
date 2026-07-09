
-- Portal linkage on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.portal_customer_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT customer_id FROM public.profiles WHERE id=_user_id
$$;

-- ============ Billing: line items ============
CREATE TABLE IF NOT EXISTS public.invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  tax_rate numeric NOT NULL DEFAULT 0,
  line_total numeric GENERATED ALWAYS AS (quantity*unit_price*(1+tax_rate/100)) STORED,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.invoice_line_items TO authenticated;
GRANT ALL ON public.invoice_line_items TO service_role;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage inv items" ON public.invoice_line_items FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));
CREATE POLICY "portal read own inv items" ON public.invoice_line_items FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.invoices i WHERE i.id=invoice_id AND i.customer_id=public.portal_customer_id(auth.uid())));

CREATE TABLE IF NOT EXISTS public.quote_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  tax_rate numeric NOT NULL DEFAULT 0,
  line_total numeric GENERATED ALWAYS AS (quantity*unit_price*(1+tax_rate/100)) STORED,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.quote_line_items TO authenticated;
GRANT ALL ON public.quote_line_items TO service_role;
ALTER TABLE public.quote_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage q items" ON public.quote_line_items FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));

-- ============ Payment allocations ============
CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alloc_inv ON public.payment_allocations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_alloc_pay ON public.payment_allocations(payment_id);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.payment_allocations TO authenticated;
GRANT ALL ON public.payment_allocations TO service_role;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage allocs" ON public.payment_allocations FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));

CREATE OR REPLACE FUNCTION public.recompute_invoice_status(_invoice_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inv_total numeric; paid_sum numeric;
BEGIN
  SELECT total INTO inv_total FROM public.invoices WHERE id=_invoice_id;
  SELECT COALESCE(SUM(amount),0) INTO paid_sum FROM public.payment_allocations WHERE invoice_id=_invoice_id;
  UPDATE public.invoices SET
    status = CASE
      WHEN inv_total > 0 AND paid_sum >= inv_total THEN 'paid'
      WHEN paid_sum > 0 THEN 'partial'
      WHEN status IN ('paid','partial') THEN 'sent'
      ELSE status
    END,
    paid_at = CASE WHEN inv_total > 0 AND paid_sum >= inv_total THEN COALESCE(paid_at, now()) ELSE NULL END
  WHERE id=_invoice_id;
END $$;

CREATE OR REPLACE FUNCTION public.trg_alloc_after() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.recompute_invoice_status(COALESCE(NEW.invoice_id, OLD.invoice_id));
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS alloc_recompute ON public.payment_allocations;
CREATE TRIGGER alloc_recompute AFTER INSERT OR UPDATE OR DELETE ON public.payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.trg_alloc_after();

-- ============ Monitoring history & incidents ============
CREATE TABLE IF NOT EXISTS public.monitoring_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id uuid NOT NULL REFERENCES public.monitoring_checks(id) ON DELETE CASCADE,
  checked_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL,
  response_ms int,
  error text
);
CREATE INDEX IF NOT EXISTS idx_mres_check_time ON public.monitoring_results(check_id, checked_at DESC);
GRANT SELECT,INSERT ON public.monitoring_results TO authenticated;
GRANT ALL ON public.monitoring_results TO service_role;
ALTER TABLE public.monitoring_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read results" ON public.monitoring_results FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "staff insert results" ON public.monitoring_results FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid()));

CREATE TABLE IF NOT EXISTS public.monitoring_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id uuid NOT NULL REFERENCES public.monitoring_checks(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  last_error text,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_minc_open ON public.monitoring_incidents(check_id) WHERE ended_at IS NULL;
GRANT SELECT,INSERT,UPDATE ON public.monitoring_incidents TO authenticated;
GRANT ALL ON public.monitoring_incidents TO service_role;
ALTER TABLE public.monitoring_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage incidents" ON public.monitoring_incidents FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));

-- ============ Asset lifecycle ============
CREATE TABLE IF NOT EXISTS public.asset_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ale_asset ON public.asset_lifecycle_events(asset_id, occurred_at DESC);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.asset_lifecycle_events TO authenticated;
GRANT ALL ON public.asset_lifecycle_events TO service_role;
ALTER TABLE public.asset_lifecycle_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage lifecycle" ON public.asset_lifecycle_events FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));
CREATE POLICY "portal read own lifecycle" ON public.asset_lifecycle_events FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.assets a WHERE a.id=asset_id AND a.customer_id=public.portal_customer_id(auth.uid())));

-- ============ Portal read policies on existing tables ============
DROP POLICY IF EXISTS "portal read own tickets" ON public.tickets;
CREATE POLICY "portal read own tickets" ON public.tickets FOR SELECT TO authenticated
  USING (customer_id = public.portal_customer_id(auth.uid()));
DROP POLICY IF EXISTS "portal create own tickets" ON public.tickets;
CREATE POLICY "portal create own tickets" ON public.tickets FOR INSERT TO authenticated
  WITH CHECK (customer_id = public.portal_customer_id(auth.uid()));

DROP POLICY IF EXISTS "portal read own invoices" ON public.invoices;
CREATE POLICY "portal read own invoices" ON public.invoices FOR SELECT TO authenticated
  USING (customer_id = public.portal_customer_id(auth.uid()));

DROP POLICY IF EXISTS "portal read own assets" ON public.assets;
CREATE POLICY "portal read own assets" ON public.assets FOR SELECT TO authenticated
  USING (customer_id = public.portal_customer_id(auth.uid()));

DROP POLICY IF EXISTS "portal read own cloud" ON public.cloud_services;
CREATE POLICY "portal read own cloud" ON public.cloud_services FOR SELECT TO authenticated
  USING (customer_id = public.portal_customer_id(auth.uid()));

DROP POLICY IF EXISTS "portal read own payments" ON public.payments;
CREATE POLICY "portal read own payments" ON public.payments FOR SELECT TO authenticated
  USING (customer_id = public.portal_customer_id(auth.uid()));

DROP POLICY IF EXISTS "portal read own customer" ON public.customers;
CREATE POLICY "portal read own customer" ON public.customers FOR SELECT TO authenticated
  USING (id = public.portal_customer_id(auth.uid()));

-- ============ Notifications insert (staff can create) ============
DROP POLICY IF EXISTS "staff insert notifications" ON public.notifications;
CREATE POLICY "staff insert notifications" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid()) OR user_id = auth.uid());

-- ============ Ticket change notification trigger ============
CREATE OR REPLACE FUNCTION public.notify_ticket_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE portal_uid uuid; tnum text;
BEGIN
  tnum := COALESCE(NEW.ticket_number, '');
  IF TG_OP='UPDATE' AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) THEN
    SELECT id INTO portal_uid FROM public.profiles WHERE customer_id=NEW.customer_id LIMIT 1;
    IF portal_uid IS NOT NULL AND OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.notifications(user_id,kind,title,body,link)
      VALUES (portal_uid,'ticket_update','Ticket '||tnum||' updated','Status changed to '||NEW.status,'/portal/tickets');
    END IF;
    IF NEW.assigned_to IS NOT NULL AND (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) THEN
      INSERT INTO public.notifications(user_id,kind,title,body,link)
      VALUES (NEW.assigned_to,'ticket_assigned','Ticket '||tnum||' assigned to you',NEW.subject,'/tickets/'||NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tickets_notify ON public.tickets;
CREATE TRIGGER tickets_notify AFTER UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.notify_ticket_change();
