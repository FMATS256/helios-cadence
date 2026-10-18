CREATE OR REPLACE FUNCTION public.alert_manager_on_account_creation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.account_manager_id IS NOT NULL THEN
    INSERT INTO public.notifications(user_id,kind,title,body,link)
    VALUES (NEW.account_manager_id,'account_assigned','New customer account assigned',
      NEW.company_name || ' (' || NEW.account_number || ') has been assigned to you.',
      '/customers/' || NEW.account_number);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.alert_manager_on_account_creation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER customers_alert_assigned_manager
AFTER INSERT ON public.customers FOR EACH ROW
EXECUTE FUNCTION public.alert_manager_on_account_creation();