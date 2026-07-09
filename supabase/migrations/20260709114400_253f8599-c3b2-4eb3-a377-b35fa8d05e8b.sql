CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotent: drop jobs by name if they already exist, then reschedule.
DO $$
DECLARE
  base_url text := 'https://project--rqdfyawjhgwptbmpiqtr.lovable.app';
  jid int;
BEGIN
  FOR jid IN
    SELECT jobid FROM cron.job WHERE jobname IN ('imt-monitoring-tick', 'imt-reminders-tick')
  LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;

  PERFORM cron.schedule(
    'imt-monitoring-tick',
    '*/5 * * * *',
    format($f$SELECT net.http_post(url:='%s/api/public/hooks/monitoring-tick', headers:='{"Content-Type":"application/json"}'::jsonb, body:='{}'::jsonb) as request_id;$f$, base_url)
  );

  PERFORM cron.schedule(
    'imt-reminders-tick',
    '0 7 * * *',
    format($f$SELECT net.http_post(url:='%s/api/public/hooks/reminders-tick', headers:='{"Content-Type":"application/json"}'::jsonb, body:='{}'::jsonb) as request_id;$f$, base_url)
  );
END $$;