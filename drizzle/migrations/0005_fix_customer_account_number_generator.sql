-- Make account number generation collision-proof: always one past the highest
-- existing account number, never below M10458 for the next new customer.
CREATE OR REPLACE FUNCTION public.gen_customer_account_number()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'M' || GREATEST(
    COALESCE((SELECT max(NULLIF(regexp_replace(account_number, '[^0-9]', '', 'g'), '')::int) FROM public.customers), 10457) + 1,
    nextval('public.customer_account_seq'),
    10458
  )::text
$$;

-- Bring the sequence in line so it never lags behind real data again.
SELECT setval('public.customer_account_seq', GREATEST(
  COALESCE((SELECT max(NULLIF(regexp_replace(account_number, '[^0-9]', '', 'g'), '')::int) FROM public.customers), 10457),
  10457
));