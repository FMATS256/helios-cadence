-- Backfill: assign master_admin to any existing auth user missing a role
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'master_admin'::app_role
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id);