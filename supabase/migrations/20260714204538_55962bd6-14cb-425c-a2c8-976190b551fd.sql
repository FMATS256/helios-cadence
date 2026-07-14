CREATE OR REPLACE FUNCTION public.sync_subscription_from_cloud_service()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  service_plan text;
  service_amount numeric;
  service_cycle text;
  service_started date;
  existing_id uuid;
BEGIN
  service_plan := COALESCE(NULLIF(NEW.service_name, ''), NULLIF(NEW.plan, ''), 'Cloud service');
  service_amount := COALESCE(NEW.monthly_cost, 0);
  service_cycle := 'monthly';
  service_started := COALESCE(NEW.created_at::date, CURRENT_DATE);

  SELECT id INTO existing_id
  FROM public.subscriptions
  WHERE customer_id = NEW.customer_id
    AND plan_name = service_plan
    AND COALESCE(description, '') = COALESCE(NEW.vendor, NEW.service_type, '')
  ORDER BY created_at DESC
  LIMIT 1;

  IF NEW.archived_at IS NOT NULL OR NEW.status IN ('cancelled', 'suspended') THEN
    IF existing_id IS NOT NULL THEN
      UPDATE public.subscriptions
      SET status = CASE WHEN NEW.status = 'cancelled' THEN 'cancelled' ELSE 'paused' END,
          next_renewal = NEW.renewal_date,
          notes = COALESCE(NEW.notes, notes),
          updated_at = now()
      WHERE id = existing_id;
    END IF;
    RETURN NEW;
  END IF;

  IF existing_id IS NULL THEN
    INSERT INTO public.subscriptions (
      customer_id,
      account_number,
      plan_name,
      description,
      amount,
      currency,
      billing_cycle,
      status,
      started_on,
      next_renewal,
      auto_renew,
      notes,
      created_by
    ) VALUES (
      NEW.customer_id,
      NEW.account_number,
      service_plan,
      COALESCE(NEW.vendor, NEW.service_type),
      service_amount,
      'USD',
      service_cycle,
      'active',
      service_started,
      NEW.renewal_date,
      true,
      NEW.notes,
      NEW.created_by
    );
  ELSE
    UPDATE public.subscriptions
    SET account_number = NEW.account_number,
        description = COALESCE(NEW.vendor, NEW.service_type),
        amount = service_amount,
        currency = 'USD',
        billing_cycle = service_cycle,
        status = CASE WHEN NEW.status = 'active' THEN 'active' WHEN NEW.status = 'trial' THEN 'active' ELSE status END,
        next_renewal = NEW.renewal_date,
        auto_renew = true,
        notes = NEW.notes,
        updated_at = now()
    WHERE id = existing_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cloud_services_sync_subscription ON public.cloud_services;
CREATE TRIGGER cloud_services_sync_subscription
AFTER INSERT OR UPDATE OF service_name, vendor, plan, monthly_cost, status, renewal_date, notes, archived_at, customer_id, account_number
ON public.cloud_services
FOR EACH ROW
EXECUTE FUNCTION public.sync_subscription_from_cloud_service();