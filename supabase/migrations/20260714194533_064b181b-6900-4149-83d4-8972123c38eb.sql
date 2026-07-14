-- 1. Auto-grant master_admin to built-in admin emails on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE user_count int; is_builtin boolean;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name',
      INITCAP(REPLACE(SPLIT_PART(NEW.email, '@', 1), '.', ' ')))
  ) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  is_builtin := lower(NEW.email) IN ('[email protected]', '[email protected]');
  SELECT COUNT(*) INTO user_count FROM auth.users;

  IF is_builtin OR user_count <= 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'master_admin')
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'read_only')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

-- 2. Retroactively promote built-in admin emails already in auth.users
INSERT INTO public.profiles (id, email, full_name)
SELECT u.id, u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', INITCAP(REPLACE(SPLIT_PART(u.email, '@', 1), '.', ' ')))
FROM auth.users u
WHERE lower(u.email) IN ('[email protected]', '[email protected]')
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'master_admin'::app_role
FROM auth.users u
WHERE lower(u.email) IN ('[email protected]', '[email protected]')
ON CONFLICT (user_id, role) DO NOTHING;

-- 3. Ensure current session user (anyone signed in with zero roles) can bootstrap
-- Not applied automatically — safer to require the sign-in path above.