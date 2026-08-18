CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  contact_name text,
  title text,
  email text,
  phone text,
  source text DEFAULT 'manual',
  status text NOT NULL DEFAULT 'new',
  interest text,
  estimated_value numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  assigned_to uuid,
  next_follow_up date,
  notes text,
  converted_customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  converted_at timestamptz,
  lost_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view leads" ON public.leads FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "Staff can manage leads" ON public.leads FOR ALL TO authenticated USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));
CREATE TRIGGER leads_updated BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX leads_status_idx ON public.leads(status);

CREATE TABLE public.service_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  account_number text,
  service_type text NOT NULL DEFAULT 'general',
  task_type text NOT NULL DEFAULT 'deployment',
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'pending',
  assigned_to uuid,
  requested_by uuid,
  due_date date,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  completion_notes text,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  catalog_id uuid REFERENCES public.service_catalog(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_tasks TO authenticated;
GRANT ALL ON public.service_tasks TO service_role;
ALTER TABLE public.service_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view service tasks" ON public.service_tasks FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "Staff can manage service tasks" ON public.service_tasks FOR ALL TO authenticated USING (public.has_any_role(auth.uid())) WITH CHECK (public.has_any_role(auth.uid()));
CREATE TRIGGER service_tasks_updated BEFORE UPDATE ON public.service_tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER service_tasks_fill_acct BEFORE INSERT ON public.service_tasks FOR EACH ROW EXECUTE FUNCTION public.fill_account_number_from_customer();
CREATE INDEX service_tasks_customer_idx ON public.service_tasks(customer_id);
CREATE INDEX service_tasks_assignee_idx ON public.service_tasks(assigned_to);