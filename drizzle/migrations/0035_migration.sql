CREATE TABLE public.personal_assistant_email_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider_id text NOT NULL UNIQUE,
  subject text,
  status text NOT NULL DEFAULT 'processing',
  reply_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.personal_assistant_email_requests TO authenticated;
GRANT ALL ON public.personal_assistant_email_requests TO service_role;
ALTER TABLE public.personal_assistant_email_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own email requests read" ON public.personal_assistant_email_requests FOR SELECT TO authenticated USING (user_id = auth.uid());