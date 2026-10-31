ALTER TABLE public.personal_assistant_settings ADD COLUMN IF NOT EXISTS report_email text, ADD COLUMN IF NOT EXISTS daily_report_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE public.personal_assistant_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  task_id uuid,
  kind text NOT NULL CHECK (kind IN ('email','quotation','follow_up')),
  title text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','rejected','failed')),
  approval_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  result text,
  error text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.personal_assistant_actions TO authenticated;
GRANT ALL ON public.personal_assistant_actions TO service_role;
ALTER TABLE public.personal_assistant_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own actions read" ON public.personal_assistant_actions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own actions reject" ON public.personal_assistant_actions FOR UPDATE TO authenticated USING (user_id = auth.uid() AND status = 'pending') WITH CHECK (user_id = auth.uid() AND status = 'rejected');

CREATE TABLE public.personal_assistant_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  report_date date NOT NULL,
  status text NOT NULL DEFAULT 'sending',
  message_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, report_date)
);
GRANT SELECT ON public.personal_assistant_reports TO authenticated;
GRANT ALL ON public.personal_assistant_reports TO service_role;
ALTER TABLE public.personal_assistant_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own reports read" ON public.personal_assistant_reports FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.invoke_assistant_daily_reports() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE request_id bigint; credential text;
BEGIN
 SELECT callback_secret INTO credential FROM public.finance_statement_schedule WHERE id;
 IF credential IS NULL THEN RETURN NULL; END IF;
 SELECT net.http_post(url:='https://project--59eb73e4-1723-4e95-84d7-b933c19c996d.lovable.app/api/public/hooks/assistant-daily-report',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || credential),body:='{}'::jsonb,timeout_milliseconds:=300000) INTO request_id;
 RETURN request_id;
END $$;
REVOKE ALL ON FUNCTION public.invoke_assistant_daily_reports() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_assistant_daily_reports() TO service_role;