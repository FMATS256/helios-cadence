ALTER TABLE public.quote_line_items ADD COLUMN IF NOT EXISTS billing_period_start date, ADD COLUMN IF NOT EXISTS billing_period_end date;
CREATE OR REPLACE FUNCTION public.convert_customer_quote(p_quote_id uuid, p_due_days integer DEFAULT 14) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q public.quotes%ROWTYPE; inv public.invoices%ROWTYPE; l record; gross numeric; target numeric; running numeric := 0; line_value numeric; n integer; idx integer := 0;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.is_sales_staff(auth.uid()) OR public.is_billing_staff(auth.uid())) THEN RAISE EXCEPTION 'Only Sales or Billing may convert quotations'; END IF;
 IF p_due_days IS NULL OR p_due_days < 0 OR p_due_days > 365 THEN RAISE EXCEPTION 'Payment terms must be between 0 and 365 days'; END IF;
 SELECT * INTO q FROM public.quotes WHERE id=p_quote_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Quotation not found'; END IF;
 IF q.customer_id IS NULL THEN RAISE EXCEPTION 'Attach this quotation to a customer before invoicing'; END IF;
 IF NOT public.is_billing_staff(auth.uid()) AND NOT public.manages_customer(auth.uid(),q.customer_id) THEN RAISE EXCEPTION 'This customer is not in your portfolio'; END IF;
 IF q.invoice_id IS NOT NULL THEN
  SELECT * INTO inv FROM public.invoices WHERE id=q.invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Linked invoice could not be found'; END IF;
  RETURN jsonb_build_object('invoice_id',inv.id,'invoice_number',inv.invoice_number,'already',true);
 END IF;
 IF q.status <> 'accepted' THEN RAISE EXCEPTION 'Only accepted quotations can be converted'; END IF;
 SELECT count(*),COALESCE(sum(round(quantity*unit_price,2)+round(round(quantity*unit_price,2)*tax_rate/100,2)),0) INTO n,gross FROM public.quote_line_items WHERE quote_id=q.id;
 IF n=0 OR gross<=0 OR q.amount<=0 THEN RAISE EXCEPTION 'Quotation needs valid priced line items'; END IF;
 IF EXISTS(SELECT 1 FROM public.quote_line_items WHERE quote_id=q.id AND (quantity<=0 OR unit_price<0 OR item_code IS NULL OR btrim(item_code)='' OR (billing_period_end IS NOT NULL AND billing_period_start IS NULL) OR billing_period_end<billing_period_start)) THEN RAISE EXCEPTION 'Complete item codes, quantities and service periods before conversion'; END IF;
 target:=round(q.amount,2);
 INSERT INTO public.invoices(customer_id,account_number,status,currency,issue_date,due_date,notes,created_by)
 VALUES(q.customer_id,q.account_number,'draft',q.currency,CURRENT_DATE,CURRENT_DATE+p_due_days,'Generated from '||COALESCE(q.quote_number,q.id::text)||'. Agreed quotation total retained; VAT is not added again.'||CASE WHEN q.notes IS NULL THEN '' ELSE E'\n'||q.notes END,auth.uid()) RETURNING * INTO inv;
 FOR l IN SELECT * FROM public.quote_line_items WHERE quote_id=q.id ORDER BY position,id LOOP
  idx:=idx+1;
  line_value:=CASE WHEN idx=n THEN target-running ELSE round((round(l.quantity*l.unit_price,2)+round(round(l.quantity*l.unit_price,2)*l.tax_rate/100,2))*target/gross,2) END;
  running:=running+line_value;
  INSERT INTO public.invoice_line_items(invoice_id,item_code,description,quantity,unit_price,tax_rate,position,billing_period_start,billing_period_end)
  VALUES(inv.id,l.item_code,l.description,l.quantity,line_value/l.quantity,0,l.position,l.billing_period_start,l.billing_period_end);
 END LOOP;
 SELECT * INTO inv FROM public.invoices WHERE id=inv.id;
 IF inv.total<>target THEN RAISE EXCEPTION 'Invoice total cannot match quotation accurately; Billing must review'; END IF;
 UPDATE public.quotes SET invoice_id=inv.id,converted_at=now() WHERE id=q.id;
 INSERT INTO public.customer_timeline(customer_id,account_number,event_type,title,module,entity_type,entity_id,actor_id)
 VALUES(q.customer_id,q.account_number,'quote_converted',COALESCE(q.quote_number,'Quotation')||' converted to '||inv.invoice_number,'quotes','quotes',q.id,auth.uid());
 RETURN jsonb_build_object('invoice_id',inv.id,'invoice_number',inv.invoice_number,'already',false);
END $$;
REVOKE ALL ON FUNCTION public.convert_customer_quote(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.convert_customer_quote(uuid,integer) TO authenticated;