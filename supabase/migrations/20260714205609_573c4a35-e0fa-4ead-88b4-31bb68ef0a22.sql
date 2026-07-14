DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payments' AND column_name='created_by') THEN
    ALTER TABLE public.payments ALTER COLUMN created_by SET DEFAULT auth.uid();
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscriptions' AND column_name='created_by') THEN
    ALTER TABLE public.subscriptions ALTER COLUMN created_by SET DEFAULT auth.uid();
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cloud_services' AND column_name='created_by') THEN
    ALTER TABLE public.cloud_services ALTER COLUMN created_by SET DEFAULT auth.uid();
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='quotes' AND column_name='created_by') THEN
    ALTER TABLE public.quotes ALTER COLUMN created_by SET DEFAULT auth.uid();
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inventory_items' AND column_name='created_by') THEN
    ALTER TABLE public.inventory_items ALTER COLUMN created_by SET DEFAULT auth.uid();
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='monitoring_checks' AND column_name='created_by') THEN
    ALTER TABLE public.monitoring_checks ALTER COLUMN created_by SET DEFAULT auth.uid();
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='kb_articles' AND column_name='author_id') THEN
    ALTER TABLE public.kb_articles ALTER COLUMN author_id SET DEFAULT auth.uid();
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tickets' AND column_name='created_by') THEN
    ALTER TABLE public.tickets ALTER COLUMN created_by SET DEFAULT auth.uid();
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='created_by') THEN
    ALTER TABLE public.projects ALTER COLUMN created_by SET DEFAULT auth.uid();
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='assets' AND column_name='created_by') THEN
    ALTER TABLE public.assets ALTER COLUMN created_by SET DEFAULT auth.uid();
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='credentials' AND column_name='created_by') THEN
    ALTER TABLE public.credentials ALTER COLUMN created_by SET DEFAULT auth.uid();
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='invoices' AND column_name='created_by') THEN
    ALTER TABLE public.invoices ALTER COLUMN created_by SET DEFAULT auth.uid();
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='customers' AND column_name='created_by') THEN
    ALTER TABLE public.customers ALTER COLUMN created_by SET DEFAULT auth.uid();
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='customer_notes' AND column_name='created_by') THEN
    ALTER TABLE public.customer_notes ALTER COLUMN created_by SET DEFAULT auth.uid();
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='customer_contacts' AND column_name='created_by') THEN
    ALTER TABLE public.customer_contacts ALTER COLUMN created_by SET DEFAULT auth.uid();
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='customer_branches' AND column_name='created_by') THEN
    ALTER TABLE public.customer_branches ALTER COLUMN created_by SET DEFAULT auth.uid();
  END IF;
END $$;