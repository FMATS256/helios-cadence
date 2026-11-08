CREATE OR REPLACE FUNCTION public.record_counter_licence_payment(
  p_vendor text, p_customer_id uuid, p_license_id uuid, p_tenant_id uuid, p_product text,
  p_order_type text, p_quantity int, p_term_months int, p_existing_serial text, p_expiry date, p_notes text,
  p_amount numeric, p_currency text, p_method text, p_reference text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); sub uuid; ord uuid;
BEGIN
  IF uid IS NULL OR NOT public.can_manage_sophos(uid) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF NOT public.can_see_customer(uid, p_customer_id) THEN RAISE EXCEPTION 'You do not manage this client'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Enter the amount received'; END IF;
  IF p_method NOT IN ('cash','bank_transfer','ecocash','innbucks','omari','card') THEN RAISE EXCEPTION 'Unknown payment method'; END IF;
  IF p_method <> 'cash' AND coalesce(btrim(p_reference),'') = '' THEN RAISE EXCEPTION 'A payment reference is required for non-cash payments'; END IF;
  IF p_quantity IS NULL OR p_quantity < 1 THEN RAISE EXCEPTION 'Seats must be at least 1'; END IF;

  INSERT INTO public.payment_submissions(customer_id, amount, currency, method, reference, notes, status, submitted_by, source)
  VALUES (p_customer_id, p_amount, coalesce(p_currency,'USD'), p_method, nullif(btrim(p_reference),''),
    format('Counter payment for %s %s (%s x%s). Collected by account manager; awaiting Finance reconciliation.', p_vendor, p_product, p_order_type, p_quantity),
    'pending', uid, 'counter')
  RETURNING id INTO sub;

  INSERT INTO public.vendor_license_orders(vendor, customer_id, tenant_id, license_id, product, order_type, quantity, term_months,
    existing_serial, expiry_date, unit_price, notes, status, requested_by, approved_by, approved_at, payment_submission_id)
  VALUES (p_vendor, p_customer_id, p_tenant_id, p_license_id, p_product, p_order_type, p_quantity, coalesce(p_term_months,12),
    p_existing_serial, p_expiry, round(p_amount / p_quantity, 2), p_notes, 'approved', uid, uid, now(), sub)
  RETURNING id INTO ord;

  INSERT INTO public.payment_submission_events(submission_id, actor_id, action, notes)
  VALUES (sub, uid, 'counter_recorded', 'Licence order ' || ord || ' released to NOC on payment received');

  RETURN jsonb_build_object('submission_id', sub, 'order_id', ord);
END $$;
REVOKE ALL ON FUNCTION public.record_counter_licence_payment FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_counter_licence_payment TO authenticated;