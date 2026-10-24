CREATE OR REPLACE FUNCTION public.sync_invoice_line_totals() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE target uuid; subtotal_value numeric; tax_value numeric; BEGIN
 FOR target IN SELECT DISTINCT v FROM unnest(ARRAY[CASE WHEN TG_OP<>'INSERT' THEN OLD.invoice_id END,CASE WHEN TG_OP<>'DELETE' THEN NEW.invoice_id END]) v WHERE v IS NOT NULL LOOP
 SELECT COALESCE(sum(round(quantity*unit_price,2)),0),COALESCE(sum(round(round(quantity*unit_price,2)*tax_rate/100,2)),0) INTO subtotal_value,tax_value FROM public.invoice_line_items WHERE invoice_id=target;
 UPDATE public.invoices SET subtotal=subtotal_value,tax=tax_value,total=subtotal_value+tax_value WHERE id=target;
 PERFORM public.recompute_invoice_status(target);
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END $$;
CREATE TRIGGER invoice_lines_totals_after AFTER INSERT OR UPDATE OR DELETE ON public.invoice_line_items FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_line_totals();
CREATE OR REPLACE FUNCTION public.guard_paid_invoice_amounts() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ DECLARE target uuid; BEGIN
 target:=CASE WHEN TG_OP='INSERT' THEN NEW.invoice_id ELSE OLD.invoice_id END;
 IF EXISTS(SELECT 1 FROM public.invoices WHERE id=target AND (amount_paid>0 OR status IN ('paid','void'))) AND (TG_OP IN ('INSERT','DELETE') OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id OR NEW.quantity IS DISTINCT FROM OLD.quantity OR NEW.unit_price IS DISTINCT FROM OLD.unit_price OR NEW.tax_rate IS DISTINCT FROM OLD.tax_rate) THEN RAISE EXCEPTION 'Paid or void invoice amounts are locked; Finance must reverse and reissue'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END $$;
CREATE TRIGGER invoice_paid_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_line_items FOR EACH ROW EXECUTE FUNCTION public.guard_paid_invoice_amounts();
REVOKE ALL ON FUNCTION public.sync_invoice_line_totals(),public.guard_paid_invoice_amounts() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_invoice_line_totals(),public.guard_paid_invoice_amounts() TO service_role;