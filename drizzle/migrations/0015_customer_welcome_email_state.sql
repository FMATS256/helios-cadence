ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS welcome_email_status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS welcome_email_error text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS welcome_email_message_id uuid;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS welcome_email_attempted_at timestamptz;
COMMENT ON COLUMN public.customers.welcome_email_status IS 'One-event welcome email state: pending, sending, sent, failed, blocked. Failed messages remain retryable in the inbox; sending is not retried automatically to avoid duplicates.';
CREATE OR REPLACE FUNCTION public.claim_customer_welcome(p_customer_id uuid) RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$
 WITH claimed AS (UPDATE public.customers SET welcome_email_status='sending',welcome_email_attempted_at=now() WHERE id=p_customer_id AND welcome_email_status='pending' RETURNING id) SELECT EXISTS(SELECT 1 FROM claimed);
$$;
REVOKE ALL ON FUNCTION public.claim_customer_welcome(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_customer_welcome(uuid) TO service_role;