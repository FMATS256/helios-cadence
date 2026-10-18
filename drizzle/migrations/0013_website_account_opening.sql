ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS client_category text;
COMMENT ON COLUMN public.customers.client_category IS 'Website routing category; legacy account_type remains personal or corporate for existing workflows.';
CREATE TABLE public.website_account_applications (
  external_id text PRIMARY KEY,
  fingerprint text NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.website_account_applications TO service_role;
ALTER TABLE public.website_account_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY website_applications_service ON public.website_account_applications TO service_role USING (true) WITH CHECK (true);
CREATE OR REPLACE FUNCTION public.open_website_account(p_application jsonb, p_fingerprint text, p_preferred_roles text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_existing public.website_account_applications%ROWTYPE;
  v_customer public.customers%ROWTYPE;
  v_manager record;
  v_category text := p_application->>'category';
  v_replayed boolean := false;
BEGIN
  IF v_category IS NULL OR v_category NOT IN ('personal','company','corporate','key_account') OR coalesce(length(trim(p_application->>'external_id')),0) = 0 THEN
    RAISE EXCEPTION 'INVALID_APPLICATION';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('imt.website.account.opening', 0));
  SELECT * INTO v_existing FROM public.website_account_applications WHERE external_id = p_application->>'external_id';
  IF FOUND THEN
    IF v_existing.fingerprint <> p_fingerprint THEN RAISE EXCEPTION 'APPLICATION_CONFLICT'; END IF;
    SELECT * INTO STRICT v_customer FROM public.customers WHERE id = v_existing.customer_id;
    v_replayed := true;
    SELECT p.id, p.full_name, p.email, r.role::text AS role INTO v_manager
      FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.id
      WHERE p.id=v_customer.account_manager_id AND r.role::text = ANY(p_preferred_roles)
      ORDER BY array_position(p_preferred_roles,r.role::text) LIMIT 1;
  ELSE
    SELECT p.id, p.full_name, p.email, r.role::text AS role INTO v_manager
    FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.id
    WHERE coalesce(p.status,'active')='active' AND p.archived_at IS NULL
      AND r.role::text = ANY(p_preferred_roles)
    ORDER BY array_position(p_preferred_roles,r.role::text),
      (SELECT count(*) FROM public.customers c WHERE c.account_manager_id=p.id AND c.archived_at IS NULL), p.id
    LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'NO_ACTIVE_MANAGER'; END IF;
    INSERT INTO public.customers (company_name,account_type,client_category,primary_email,primary_phone,industry,billing_address,account_manager_id,status,created_by)
    VALUES (p_application->>'name',CASE WHEN v_category='personal' THEN 'personal' ELSE 'corporate' END,v_category,
      p_application->>'email',p_application->>'phone',nullif(p_application->>'industry',''),nullif(p_application->>'billing_address',''),v_manager.id,'active',NULL)
    RETURNING * INTO v_customer;
    INSERT INTO public.customer_contacts (customer_id,account_number,name,email,phone,is_primary)
    VALUES(v_customer.id,v_customer.account_number,p_application->>'contact_name',v_customer.primary_email,v_customer.primary_phone,true);
    INSERT INTO public.website_account_applications(external_id,fingerprint,customer_id)
    VALUES(p_application->>'external_id',p_fingerprint,v_customer.id);
  END IF;
  RETURN jsonb_build_object('replayed',v_replayed,'account_number',v_customer.account_number,'name',v_customer.company_name,
    'category',v_customer.client_category,'account_manager',jsonb_build_object('name',v_manager.full_name,'email',v_manager.email,'role',v_manager.role));
END;
$$;
REVOKE ALL ON FUNCTION public.open_website_account(jsonb,text,text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_website_account(jsonb,text,text[]) TO service_role;