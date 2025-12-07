-- ============================================================================
-- MIGRATION 076: Fix handle_new_user trigger to bypass RLS
-- ============================================================================
--
-- Problem: The handle_new_user() trigger function has SECURITY DEFINER but
-- this doesn't automatically bypass RLS policies. When a new user signs up,
-- the trigger fails because no INSERT policy matches.
--
-- Solution: Recreate the function with SET row_security = off to bypass RLS
-- during the INSERT operation.
--

BEGIN;

-- Recreate handle_new_user function with RLS bypass
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  INSERT INTO public.profiles (auth_id, email, first_name, last_name, full_name, role, is_active)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'firstName'),
    COALESCE(new.raw_user_meta_data->>'last_name', new.raw_user_meta_data->>'lastName'),
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'fullName'),
    COALESCE(new.raw_user_meta_data->>'role', 'participant'),
    true
  );
  RETURN new;
EXCEPTION
  WHEN unique_violation THEN
    -- Profile already exists (e.g., created by admin), just return
    RETURN new;
  WHEN OTHERS THEN
    -- Log the error but don't fail the signup
    RAISE WARNING 'handle_new_user: Failed to create profile for user %: %', new.id, SQLERRM;
    RETURN new;
END;
$$;

-- Ensure the trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMIT;

-- //@UNDO
BEGIN;

-- Revert to original function without RLS bypass
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (auth_id, email, first_name, last_name, full_name, role, is_active)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'firstName'),
    COALESCE(new.raw_user_meta_data->>'last_name', new.raw_user_meta_data->>'lastName'),
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'fullName'),
    COALESCE(new.raw_user_meta_data->>'role', 'participant'),
    true
  );
  RETURN new;
END;
$$;

COMMIT;
