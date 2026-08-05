
ALTER TABLE public.starlink_recharges
  ADD COLUMN IF NOT EXISTS workflow_status text NOT NULL DEFAULT 'pending_finance',
  ADD COLUMN IF NOT EXISTS whatsapp_number text,
  ADD COLUMN IF NOT EXISTS whatsapp_message text,
  ADD COLUMN IF NOT EXISTS message_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS message_channel text,
  ADD COLUMN IF NOT EXISTS supplier_reply text,
  ADD COLUMN IF NOT EXISTS supplier_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS check_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_reason text;

CREATE INDEX IF NOT EXISTS starlink_recharges_workflow_idx ON public.starlink_recharges (workflow_status, next_check_at);

CREATE TABLE IF NOT EXISTS public.starlink_recharge_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recharge_id uuid NOT NULL REFERENCES public.starlink_recharges(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  note text,
  actor_id uuid,
  actor_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.starlink_recharge_events TO authenticated;
GRANT ALL ON public.starlink_recharge_events TO service_role;
ALTER TABLE public.starlink_recharge_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read starlink recharge events" ON public.starlink_recharge_events;
CREATE POLICY "Staff can read starlink recharge events"
  ON public.starlink_recharge_events FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));

CREATE INDEX IF NOT EXISTS starlink_recharge_events_recharge_idx ON public.starlink_recharge_events (recharge_id, created_at DESC);
