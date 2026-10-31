CREATE TABLE public.finance_statement_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL REFERENCES public.customers(id), period text NOT NULL, statement_date date NOT NULL, recipient text, status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','sent','blocked','failed')), message_id uuid, error text, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, UNIQUE(customer_id,period)
);
GRANT SELECT ON public.finance_statement_deliveries TO authenticated;
GRANT ALL ON public.finance_statement_deliveries TO service_role;
ALTER TABLE public.finance_statement_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_statement_read ON public.finance_statement_deliveries FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'master_admin'));
CREATE TABLE public.finance_statement_schedule (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), enabled boolean NOT NULL DEFAULT true, callback_secret text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.finance_statement_schedule TO service_role;
ALTER TABLE public.finance_statement_schedule ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.configure_finance_statement_schedule(secret_value text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF length(secret_value)<32 THEN RAISE EXCEPTION 'Invalid schedule credential'; END IF;
 INSERT INTO public.finance_statement_schedule(id,callback_secret) VALUES(true,secret_value) ON CONFLICT(id) DO UPDATE SET callback_secret=excluded.callback_secret,updated_at=now();
END $$;
REVOKE ALL ON FUNCTION public.configure_finance_statement_schedule(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.configure_finance_statement_schedule(text) TO service_role;
CREATE OR REPLACE FUNCTION public.finance_statement_schedule_status() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.finance_statement_schedule WHERE id AND enabled) AND (public.has_role(auth.uid(),'finance') OR public.has_role(auth.uid(),'master_admin'))
$$;
REVOKE ALL ON FUNCTION public.finance_statement_schedule_status() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_statement_schedule_status() TO authenticated,service_role;