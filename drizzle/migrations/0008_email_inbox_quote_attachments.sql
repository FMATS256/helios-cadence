ALTER TABLE public.email_enquiries
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.email_message_attachments
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_email_enquiries_archived ON public.email_enquiries(archived_at);
CREATE INDEX IF NOT EXISTS idx_email_attachments_quote ON public.email_message_attachments(quote_id);