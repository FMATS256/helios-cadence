SELECT setval('public.customer_account_seq', 10456, true);

CREATE OR REPLACE FUNCTION public.gen_customer_account_number()
 RETURNS text
 LANGUAGE sql
AS $function$
  SELECT 'M' || GREATEST(nextval('public.customer_account_seq'), 10457)::text
$function$;