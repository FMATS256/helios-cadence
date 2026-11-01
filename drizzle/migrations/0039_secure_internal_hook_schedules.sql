-- lovable-cron-fallback-reviewed: existing 5-minute server down-alert monitoring cadence preserved; only adds the credential and correct app address
CREATE OR REPLACE FUNCTION public.invoke_internal_hook(hook text) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE request_id bigint; credential text;
BEGIN
 IF hook !~ '^[a-z0-9-]+$' THEN RAISE EXCEPTION 'Invalid hook'; END IF;
 SELECT callback_secret INTO credential FROM public.finance_statement_schedule WHERE id;
 IF credential IS NULL THEN RETURN NULL; END IF;
 SELECT net.http_post(url:='https://project--59eb73e4-1723-4e95-84d7-b933c19c996d.lovable.app/api/public/hooks/' || hook,
   headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || credential),
   body:='{}'::jsonb, timeout_milliseconds:=120000) INTO request_id;
 RETURN request_id;
END $$;
REVOKE ALL ON FUNCTION public.invoke_internal_hook(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_internal_hook(text) TO service_role;

DO $$
DECLARE jid int;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname IN ('imt-monitoring-tick','imt-reminders-tick') LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
  PERFORM cron.schedule('imt-monitoring-tick', '*/5 * * * *', $c$SELECT public.invoke_internal_hook('monitoring-tick')$c$);
  PERFORM cron.schedule('imt-reminders-tick', '0 7 * * *', $c$SELECT public.invoke_internal_hook('reminders-tick')$c$);
END $$;