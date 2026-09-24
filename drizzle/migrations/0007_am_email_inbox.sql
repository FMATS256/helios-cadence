-- Account Manager email inbox: enquiries and threaded messages

CREATE TABLE public.email_enquiries (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  customer_id uuid references public.customers(id) on delete set null,
  contact_email text not null,
  contact_name text,
  subject text not null default '(no subject)',
  status text not null default 'open' check (status in ('open','awaiting_customer','closed')),
  assigned_am_id uuid references public.profiles(id) on delete set null,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz,
  message_count int not null default 0,
  last_message_at timestamptz default now(),
  last_inbound_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE TABLE public.email_messages (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.email_enquiries(id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound')),
  from_address text not null,
  to_address text not null,
  cc_address text,
  subject text not null default '(no subject)',
  body_html text,
  body_text text,
  message_id text unique,
  in_reply_to text,
  references_header text,
  resend_email_id text,
  delivery_status text not null default 'received' check (delivery_status in ('received','queued','sent','delivered','failed')),
  delivery_error text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

CREATE TABLE public.email_message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.email_messages(id) on delete cascade,
  filename text not null,
  content_type text,
  size_bytes bigint,
  attachment_id text,
  created_at timestamptz not null default now()
);

CREATE INDEX idx_email_enquiries_am ON public.email_enquiries(assigned_am_id);
CREATE INDEX idx_email_enquiries_customer ON public.email_enquiries(customer_id);
CREATE INDEX idx_email_enquiries_status ON public.email_enquiries(status);
CREATE INDEX idx_email_messages_enquiry ON public.email_messages(enquiry_id, created_at);
CREATE INDEX idx_email_messages_in_reply ON public.email_messages(message_id);
CREATE INDEX idx_email_enquiries_contact ON public.email_enquiries(lower(contact_email));

ALTER TABLE public.email_enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_message_attachments ENABLE ROW LEVEL SECURITY;

-- AMs see enquiries assigned to them or on customers they own; admins/finance see all.
CREATE POLICY "enquiries_select_scoped" ON public.email_enquiries
FOR SELECT TO authenticated
USING (
  assigned_am_id = auth.uid()
  OR customer_id IN (SELECT id FROM public.customers WHERE account_manager_id = auth.uid())
  OR public.has_role(auth.uid(), 'master_admin')
  OR public.has_role(auth.uid(), 'operations_manager')
);

CREATE POLICY "enquiries_insert_staff" ON public.email_enquiries
FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'master_admin')
  OR public.has_role(auth.uid(), 'operations_manager')
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('key_account_manager','corporate_account_manager','customer_account_manager','account_manager'))
  OR public.has_role(auth.uid(), 'finance')
);

CREATE POLICY "enquiries_update_staff" ON public.email_enquiries
FOR UPDATE TO authenticated
USING (
  assigned_am_id = auth.uid()
  OR public.has_role(auth.uid(), 'master_admin')
  OR public.has_role(auth.uid(), 'operations_manager')
)
WITH CHECK (
  assigned_am_id = auth.uid()
  OR public.has_role(auth.uid(), 'master_admin')
  OR public.has_role(auth.uid(), 'operations_manager')
);

CREATE POLICY "messages_select_scoped" ON public.email_messages
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.email_enquiries e
    WHERE e.id = email_messages.enquiry_id
      AND (
        e.assigned_am_id = auth.uid()
        OR e.customer_id IN (SELECT id FROM public.customers WHERE account_manager_id = auth.uid())
        OR public.has_role(auth.uid(), 'master_admin')
        OR public.has_role(auth.uid(), 'operations_manager')
      )
  )
);

CREATE POLICY "messages_insert_staff" ON public.email_messages
FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.email_enquiries e
    WHERE e.id = email_messages.enquiry_id
      AND (
        e.assigned_am_id = auth.uid()
        OR public.has_role(auth.uid(), 'master_admin')
        OR public.has_role(auth.uid(), 'operations_manager')
      )
  )
);

CREATE POLICY "attachments_select_scoped" ON public.email_message_attachments
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.email_messages m
    JOIN public.email_enquiries e ON e.id = m.enquiry_id
    WHERE m.id = email_message_attachments.message_id
      AND (
        e.assigned_am_id = auth.uid()
        OR e.customer_id IN (SELECT id FROM public.customers WHERE account_manager_id = auth.uid())
        OR public.has_role(auth.uid(), 'master_admin')
        OR public.has_role(auth.uid(), 'operations_manager')
      )
  )
);

GRANT SELECT, INSERT, UPDATE ON public.email_enquiries TO authenticated;
GRANT SELECT, INSERT ON public.email_messages TO authenticated;
GRANT SELECT ON public.email_message_attachments TO authenticated;
GRANT ALL ON public.email_enquiries, public.email_messages, public.email_message_attachments TO service_role;

-- Unique enquiry reference generator: IMTQSD##### (skips taken numbers).
CREATE OR REPLACE FUNCTION public.next_enquiry_reference()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
  ref text;
BEGIN
  SELECT COALESCE(max(substring(reference from '[0-9]+$')::int), 10000) + 1 INTO n
  FROM public.email_enquiries WHERE reference ~ '^IMTQSD[0-9]{5}$';
  IF n < 10000 THEN n := 10000; END IF;
  LOOP
    ref := 'IMTQSD' || lpad(n::text, 5, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.email_enquiries WHERE reference = ref);
    n := n + 1;
  END LOOP;
  RETURN ref;
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_enquiry_reference() TO authenticated, service_role;