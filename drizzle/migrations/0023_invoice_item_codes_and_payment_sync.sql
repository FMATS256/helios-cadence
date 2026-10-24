ALTER TABLE public.invoice_line_items ADD COLUMN IF NOT EXISTS item_code text;
ALTER TABLE public.invoice_line_items ADD COLUMN IF NOT EXISTS billing_period_start date;
ALTER TABLE public.invoice_line_items ADD COLUMN IF NOT EXISTS billing_period_end date;
UPDATE public.invoice_line_items l SET item_code=COALESCE((SELECT min(c.code) FROM public.service_catalog c WHERE lower(trim(c.name))=lower(trim(l.description)) HAVING count(DISTINCT c.code)=1),'SVC-'||upper(substr(replace(l.id::text,'-',''),1,12))) WHERE item_code IS NULL OR trim(item_code)='';
COMMENT ON COLUMN public.invoice_line_items.item_code IS 'Mandatory invoice SKU. Catalogue code when known; SVC-<line ID> is an internal identifier, not a provider SKU.';
CREATE OR REPLACE FUNCTION public.require_invoice_item_code() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF NEW.item_code IS NULL OR trim(NEW.item_code)='' THEN
 SELECT min(c.code) INTO NEW.item_code FROM public.service_catalog c WHERE lower(trim(c.name))=lower(trim(NEW.description)) HAVING count(DISTINCT c.code)=1;
 NEW.item_code:=COALESCE(NEW.item_code,'SVC-'||upper(substr(replace(NEW.id::text,'-',''),1,12)));
 END IF;
 NEW.item_code:=trim(NEW.item_code);
 IF NEW.billing_period_end IS NOT NULL AND NEW.billing_period_start IS NOT NULL AND NEW.billing_period_end<NEW.billing_period_start THEN RAISE EXCEPTION 'Billing period end cannot be before its start'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER invoice_item_code_required BEFORE INSERT OR UPDATE ON public.invoice_line_items FOR EACH ROW EXECUTE FUNCTION public.require_invoice_item_code();
ALTER TABLE public.invoice_line_items ADD CONSTRAINT invoice_line_item_code_present CHECK(item_code IS NOT NULL AND length(trim(item_code))>0);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS amount_paid numeric(14,2) NOT NULL DEFAULT 0;
UPDATE public.invoices i SET amount_paid=COALESCE((SELECT sum(a.amount) FROM public.payment_allocations a JOIN public.payments p ON p.id=a.payment_id WHERE a.invoice_id=i.id AND p.status='received' AND p.customer_id=i.customer_id AND p.currency=i.currency),0);
CREATE OR REPLACE FUNCTION public.recompute_invoice_status(_invoice_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE inv_total numeric; paid_sum numeric; inv_status text; BEGIN
 SELECT total,status INTO inv_total,inv_status FROM public.invoices WHERE id=_invoice_id FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT COALESCE(sum(a.amount),0) INTO paid_sum FROM public.payment_allocations a JOIN public.payments p ON p.id=a.payment_id JOIN public.invoices i ON i.id=a.invoice_id WHERE a.invoice_id=_invoice_id AND p.status='received' AND p.customer_id=i.customer_id AND p.currency=i.currency;
 UPDATE public.invoices SET amount_paid=round(paid_sum,2), status=CASE WHEN inv_status IN ('draft','void','cancelled') THEN inv_status WHEN inv_total>0 AND paid_sum>=inv_total THEN 'paid' WHEN paid_sum>0 THEN 'partial' WHEN inv_status IN ('paid','partial') THEN 'sent' ELSE inv_status END, paid_at=CASE WHEN inv_status NOT IN ('draft','void','cancelled') AND inv_total>0 AND paid_sum>=inv_total THEN COALESCE(paid_at,now()) ELSE NULL END WHERE id=_invoice_id;
 END $$;
CREATE OR REPLACE FUNCTION public.trg_alloc_after() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF TG_OP='DELETE' THEN PERFORM public.recompute_invoice_status(OLD.invoice_id); RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND OLD.invoice_id IS DISTINCT FROM NEW.invoice_id THEN PERFORM public.recompute_invoice_status(OLD.invoice_id); END IF;
 PERFORM public.recompute_invoice_status(NEW.invoice_id); RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.sync_payment_invoice_state() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE invoice_id uuid; BEGIN
 FOR invoice_id IN SELECT DISTINCT a.invoice_id FROM public.payment_allocations a WHERE a.payment_id=NEW.id LOOP PERFORM public.recompute_invoice_status(invoice_id); END LOOP; RETURN NEW; END $$;
CREATE TRIGGER payment_invoice_state_changed AFTER UPDATE OF status,currency,customer_id ON public.payments FOR EACH ROW EXECUTE FUNCTION public.sync_payment_invoice_state();
REVOKE ALL ON FUNCTION public.require_invoice_item_code(),public.sync_payment_invoice_state(),public.recompute_invoice_status(uuid),public.trg_alloc_after() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.require_invoice_item_code(),public.sync_payment_invoice_state(),public.recompute_invoice_status(uuid),public.trg_alloc_after() TO service_role;