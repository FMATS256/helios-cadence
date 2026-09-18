-- 1. Link expenses to a job (work order)
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS service_task_id uuid REFERENCES public.service_tasks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS expenses_service_task_id_idx ON public.expenses(service_task_id);
CREATE INDEX IF NOT EXISTS expenses_customer_id_idx ON public.expenses(customer_id);

-- 2. Recurring payment schedules (installment plans) per customer
CREATE TABLE IF NOT EXISTS public.payment_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  title text NOT NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  installment_count integer NOT NULL DEFAULT 1,
  frequency text NOT NULL DEFAULT 'monthly',
  start_date date NOT NULL DEFAULT (now()::date),
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_schedule_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.payment_schedules(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  due_date date NOT NULL,
  amount_due numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'due',
  paid_at timestamptz,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_schedules_customer_idx ON public.payment_schedules(customer_id);
CREATE INDEX IF NOT EXISTS psi_schedule_idx ON public.payment_schedule_installments(schedule_id);
CREATE INDEX IF NOT EXISTS psi_customer_due_idx ON public.payment_schedule_installments(customer_id, due_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_schedules TO authenticated;
GRANT ALL ON public.payment_schedules TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_schedule_installments TO authenticated;
GRANT ALL ON public.payment_schedule_installments TO service_role;

ALTER TABLE public.payment_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_schedule_installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedules staff read" ON public.payment_schedules
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "schedules billing write" ON public.payment_schedules
  FOR ALL TO authenticated
  USING (public.is_billing_staff(auth.uid()))
  WITH CHECK (public.is_billing_staff(auth.uid()));

CREATE POLICY "installments staff read" ON public.payment_schedule_installments
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
CREATE POLICY "installments billing write" ON public.payment_schedule_installments
  FOR ALL TO authenticated
  USING (public.is_billing_staff(auth.uid()))
  WITH CHECK (public.is_billing_staff(auth.uid()));

CREATE TRIGGER payment_schedules_updated_at BEFORE UPDATE ON public.payment_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER psi_updated_at BEFORE UPDATE ON public.payment_schedule_installments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();