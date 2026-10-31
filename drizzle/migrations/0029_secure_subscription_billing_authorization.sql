CREATE OR REPLACE FUNCTION public.bill_subscription_period(p_subscription_id uuid,p_issue boolean DEFAULT true,p_due_days integer DEFAULT 14) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.subscriptions%ROWTYPE; inv public.invoices%ROWTYPE; today date:=(now() AT TIME ZONE 'Africa/Harare')::date; next_date date; sku text; coverage text;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' AND NOT coalesce(public.is_billing_staff(auth.uid()),false) AND NOT (coalesce(auth.role(),'')='' AND session_user IN ('postgres','supabase_admin')) THEN RAISE EXCEPTION 'Finance permission required'; END IF;
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