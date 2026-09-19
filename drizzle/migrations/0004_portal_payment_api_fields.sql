ALTER TABLE public.payment_submissions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS external_status text,
  ADD COLUMN IF NOT EXISTS external_payload jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS payment_submissions_source_external_id_key
  ON public.payment_submissions (source, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_submissions_external_id_idx
  ON public.payment_submissions (external_id);