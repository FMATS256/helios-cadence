ALTER TABLE public.quotes
  ALTER COLUMN customer_id DROP NOT NULL,
  ALTER COLUMN account_number DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS walkin_name text,
  ADD COLUMN IF NOT EXISTS walkin_email text,
  ADD COLUMN IF NOT EXISTS walkin_phone text,
  ADD COLUMN IF NOT EXISTS walkin_address text;