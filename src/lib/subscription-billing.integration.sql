-- Run through the privileged database query tool; all fixtures roll back.
BEGIN;
DO $$
DECLARE customer public.customers%ROWTYPE; sid uuid; result jsonb; actual date; count_invoices integer;
BEGIN
 SELECT * INTO customer FROM public.customers WHERE archived_at IS NULL LIMIT 1;
 IF customer.id IS NULL THEN RAISE EXCEPTION 'An existing account is required'; END IF;
 IF public.subscription_anchor_date('2026-10-31',3)<>'2027-01-31'::date THEN RAISE EXCEPTION 'Paid months not respected'; END IF;
 IF public.subscription_next_date('2026-01-31','2026-02-28','monthly')<>'2026-03-31'::date THEN RAISE EXCEPTION 'Billing day drift'; END IF;
 INSERT INTO public.subscriptions(customer_id,account_number,plan_name,amount,billing_cycle,created_at,paid_months)
 VALUES(customer.id,customer.account_number,'Billing verification rollback',6,'monthly','2026-10-28 12:00:00+00',3) RETURNING id,next_renewal INTO sid,actual;
 IF actual<>'2027-01-28'::date THEN RAISE EXCEPTION 'Prepaid expiry incorrect'; END IF;
 result:=public.bill_subscription_period(sid);
 IF NOT (result->>'skipped')::boolean THEN RAISE EXCEPTION 'Prepaid period billed early'; END IF;
 UPDATE public.subscriptions SET next_renewal=(now() AT TIME ZONE 'Africa/Harare')::date WHERE id=sid;
 result:=public.bill_subscription_period(sid);
 IF (result->>'skipped')::boolean THEN RAISE EXCEPTION 'Due invoice not generated'; END IF;
 SELECT count(*) INTO count_invoices FROM public.invoices i JOIN public.invoice_line_items l ON l.invoice_id=i.id WHERE i.subscription_id=sid AND i.total=6 AND i.tax=0 AND l.item_code IS NOT NULL AND l.billing_period_start IS NOT NULL AND l.billing_period_end>=l.billing_period_start;
 IF count_invoices<>1 THEN RAISE EXCEPTION 'Invoice amount, SKU or period incorrect'; END IF;
 result:=public.bill_subscription_period(sid);
 IF NOT (result->>'skipped')::boolean THEN RAISE EXCEPTION 'Duplicate invoice allowed'; END IF;
 PERFORM set_config('request.jwt.claims','{"role":"authenticated"}',true);
 BEGIN
  PERFORM public.bill_subscription_period(sid);
  RAISE EXCEPTION 'Unauthorized billing permitted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'Finance permission required' THEN RAISE; END IF;
 END;
END;
$$;
ROLLBACK;