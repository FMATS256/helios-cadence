CREATE EXTENSION IF NOT EXISTS pg_cron;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS paid_months integer;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS billing_anchor date;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_paid_months_range CHECK (paid_months IS NULL OR paid_months BETWEEN 1 AND 120);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES public.subscriptions(id);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS subscription_period_start date;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_subscription_period_unique ON public.invoices(subscription_id, subscription_period_start) WHERE subscription_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.subscription_cycle_months(p_cycle text) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE lower(coalesce(p_cycle,'monthly')) WHEN 'monthly' THEN 1 WHEN 'quarterly' THEN 3 WHEN 'semiannual' THEN 6 WHEN 'semiannually' THEN 6 WHEN 'half_yearly' THEN 6 WHEN 'annual' THEN 12 WHEN 'annually' THEN 12 WHEN 'yearly' THEN 12 ELSE 0 END;
$$;
CREATE OR REPLACE FUNCTION public.subscription_anchor_date(p_anchor date,p_months integer) RETURNS date LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT (p_anchor + make_interval(months => p_months))::date;
$$;
CREATE OR REPLACE FUNCTION public.subscription_next_date(p_anchor date,p_after date,p_cycle text) RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE m integer := public.subscription_cycle_months(p_cycle); n integer; d date; step_days integer;
BEGIN
 IF m>0 THEN
  n := greatest(0, (extract(year FROM p_after)::integer-extract(year FROM p_anchor)::integer)*12 + extract(month FROM p_after)::integer-extract(month FROM p_anchor)::integer);
  n := (n/m)*m;
  d := public.subscription_anchor_date(p_anchor,n);
  IF d<=p_after THEN d:=public.subscription_anchor_date(p_anchor,n+m); END IF;
  RETURN d;
 END IF;
 step_days:=CASE lower(p_cycle) WHEN 'weekly' THEN 7 WHEN 'daily' THEN 1 ELSE NULL END;
 IF step_days IS NULL THEN RETURN NULL; END IF;
 RETURN p_anchor + (greatest(0,(p_after-p_anchor)/step_days)+1)*step_days;
END;
$$;
UPDATE public.subscriptions SET billing_anchor=(created_at AT TIME ZONE 'Africa/Harare')::date;
UPDATE public.subscriptions SET next_renewal=public.subscription_next_date(billing_anchor,coalesce(next_renewal-1,billing_anchor),billing_cycle) WHERE public.subscription_cycle_months(billing_cycle)>0 OR lower(billing_cycle) IN ('weekly','daily');
CREATE OR REPLACE FUNCTION public.set_subscription_billing_schedule() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE first_date date;
BEGIN
 IF TG_OP='INSERT' THEN NEW.billing_anchor:=(NEW.created_at AT TIME ZONE 'Africa/Harare')::date;
 ELSE NEW.billing_anchor:=OLD.billing_anchor; END IF;
 IF TG_OP='INSERT' OR NEW.paid_months IS DISTINCT FROM OLD.paid_months THEN
  first_date:=CASE WHEN NEW.paid_months IS NOT NULL THEN public.subscription_anchor_date(NEW.billing_anchor,NEW.paid_months) ELSE public.subscription_next_date(NEW.billing_anchor,NEW.billing_anchor,NEW.billing_cycle) END;
  IF first_date IS NOT NULL THEN NEW.next_renewal:=greatest(first_date,NEW.next_renewal); END IF;
 ELSIF NEW.billing_cycle IS DISTINCT FROM OLD.billing_cycle THEN
  NEW.next_renewal:=public.subscription_next_date(NEW.billing_anchor,greatest(NEW.billing_anchor,coalesce(NEW.next_renewal-1,NEW.billing_anchor)),NEW.billing_cycle);
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER subscriptions_billing_schedule BEFORE INSERT OR UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_subscription_billing_schedule();
CREATE OR REPLACE FUNCTION public.bill_subscription_period(p_subscription_id uuid,p_issue boolean DEFAULT true,p_due_days integer DEFAULT 14) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.subscriptions%ROWTYPE; inv public.invoices%ROWTYPE; today date:=(now() AT TIME ZONE 'Africa/Harare')::date; next_date date; sku text; coverage text;
BEGIN
 IF current_user NOT IN ('postgres','supabase_admin','service_role') AND coalesce(auth.role(),'')<>'service_role' AND NOT coalesce(public.is_billing_staff(auth.uid()),false) THEN RAISE EXCEPTION 'Finance permission required'; END IF;
 IF p_due_days<0 OR p_due_days>365 THEN RAISE EXCEPTION 'Invalid payment terms'; END IF;
 SELECT * INTO s FROM public.subscriptions WHERE id=p_subscription_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Subscription not found'; END IF;
 IF s.status<>'active' OR NOT s.auto_renew OR s.amount<=0 OR s.next_renewal IS NULL OR s.next_renewal>today OR NOT EXISTS(SELECT 1 FROM public.customers WHERE id=s.customer_id AND archived_at IS NULL) THEN RETURN jsonb_build_object('skipped',true); END IF;
 next_date:=public.subscription_next_date(s.billing_anchor,s.next_renewal,s.billing_cycle);
 IF next_date IS NULL THEN RETURN jsonb_build_object('skipped',true); END IF;
 SELECT * INTO inv FROM public.invoices WHERE subscription_id=s.id AND subscription_period_start=s.next_renewal;
 IF FOUND THEN
  UPDATE public.subscriptions SET next_renewal=next_date WHERE id=s.id;
  RETURN jsonb_build_object('skipped',true,'invoice_id',inv.id);
 END IF;
 SELECT min(code) INTO sku FROM public.service_catalog WHERE lower(trim(name))=lower(trim(s.plan_name)) HAVING count(DISTINCT code)=1;
 sku:=coalesce(sku,'SUB-'||upper(substr(replace(s.id::text,'-',''),1,12)));
 SELECT string_agg(concat_ws(' ',asset_type,make,model,CASE WHEN serial_number IS NOT NULL THEN 'S/N '||serial_number END),'; ') INTO coverage FROM public.assets WHERE subscription_id=s.id AND archived_at IS NULL;
 INSERT INTO public.invoices(customer_id,account_number,currency,issue_date,due_date,subtotal,tax,total,status,notes,created_by,subscription_id,subscription_period_start)
 VALUES(s.customer_id,s.account_number,s.currency,today,today+p_due_days,s.amount,0,s.amount,CASE WHEN p_issue THEN 'sent' ELSE 'draft' END,'Recurring billing — '||s.plan_name||' [subscription:'||s.id||']',auth.uid(),s.id,s.next_renewal) RETURNING * INTO inv;
 INSERT INTO public.invoice_line_items(invoice_id,description,quantity,unit_price,tax_rate,position,item_code,billing_period_start,billing_period_end)
 VALUES(inv.id,s.plan_name||coalesce(' — '||s.description,'')||' ('||s.billing_cycle||')'||coalesce(' · Covers: '||coverage,''),1,s.amount,0,0,sku,s.next_renewal,next_date-1);
 UPDATE public.subscriptions SET next_renewal=next_date WHERE id=s.id;
 INSERT INTO public.notifications(user_id,kind,title,body,link)
 SELECT DISTINCT user_id,'invoice_generated','Recurring invoice generated',inv.invoice_number||' · '||s.account_number||' · '||s.plan_name,'/billing' FROM public.user_roles WHERE role IN ('finance','master_admin','operations_manager');
 RETURN jsonb_build_object('skipped',false,'invoice_id',inv.id,'invoice_number',inv.invoice_number,'total',s.amount,'currency',s.currency,'period_start',s.next_renewal,'next_renewal',next_date);
END;
$$;
REVOKE ALL ON FUNCTION public.bill_subscription_period(uuid,boolean,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bill_subscription_period(uuid,boolean,integer) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.run_subscription_auto_billing() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record; result jsonb; made integer:=0; failed jsonb:='[]'::jsonb;
BEGIN
 FOR s IN SELECT id FROM public.subscriptions WHERE status='active' AND auto_renew AND amount>0 AND next_renewal<=(now() AT TIME ZONE 'Africa/Harare')::date ORDER BY next_renewal,id LIMIT 500 LOOP
  BEGIN
   result:=public.bill_subscription_period(s.id,true,14);
   IF NOT (result->>'skipped')::boolean THEN made:=made+1; END IF;
  EXCEPTION WHEN OTHERS THEN failed:=failed||jsonb_build_array(jsonb_build_object('subscription_id',s.id,'error',SQLERRM)); END;
 END LOOP;
 IF jsonb_array_length(failed)>0 THEN RAISE WARNING 'Subscription auto billing failures: %',failed; END IF;
 RETURN jsonb_build_object('created',made,'errors',failed);
END;
$$;
REVOKE ALL ON FUNCTION public.run_subscription_auto_billing() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.run_subscription_auto_billing() TO service_role;
COMMENT ON FUNCTION public.run_subscription_auto_billing() IS 'Daily creation-date anchored recurring invoices; atomic invoice lines and next renewal; no payment approval or email delivery.';