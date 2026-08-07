ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS studio_document_id text,
  ADD COLUMN IF NOT EXISTS studio_pdf_url text,
  ADD COLUMN IF NOT EXISTS studio_status text,
  ADD COLUMN IF NOT EXISTS studio_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS studio_error text,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

CREATE INDEX IF NOT EXISTS quotes_studio_document_id_idx ON public.quotes (studio_document_id);
