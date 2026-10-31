CREATE OR REPLACE FUNCTION public.invoke_monthly_finance_statements() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE request_id bigint; credential text;
BEGIN
 SELECT callback_secret INTO credential FROM public.finance_statement_schedule WHERE id AND enabled;
 IF credential IS NULL THEN RETURN NULL; END IF;
 SELECT net.http_post(url:='https://project--59eb73e4-1723-4e95-84d7-b933c19c996d.lovable.app/api/public/hooks/finance-statements',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || credential),body:='{}'::jsonb,timeout_milliseconds:=300000) INTO request_id;
 RETURN request_id;
END $$;
REVOKE ALL ON FUNCTION public.invoke_monthly_finance_statements() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_monthly_finance_statements() TO service_role;