CREATE SEQUENCE IF NOT EXISTS public.quote_item_code_seq START 1001;
GRANT USAGE ON SEQUENCE public.quote_item_code_seq TO authenticated, service_role;
ALTER TABLE public.quote_line_items ADD COLUMN IF NOT EXISTS item_code text;
CREATE OR REPLACE FUNCTION public.set_quote_item_code() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.item_code IS NULL OR btrim(NEW.item_code) = '' THEN
    NEW.item_code := 'ITM-' || lpad(nextval('public.quote_item_code_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_quote_item_code ON public.quote_line_items;
CREATE TRIGGER trg_quote_item_code BEFORE INSERT OR UPDATE ON public.quote_line_items FOR EACH ROW EXECUTE FUNCTION public.set_quote_item_code();
UPDATE public.quote_line_items q SET item_code = 'ITM-' || lpad(nextval('public.quote_item_code_seq')::text, 5, '0')
FROM (SELECT id FROM public.quote_line_items WHERE item_code IS NULL ORDER BY created_at, position) s WHERE q.id = s.id;