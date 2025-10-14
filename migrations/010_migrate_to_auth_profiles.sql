BEGIN;

-- Step 0: Create the update_updated_at_column function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Step 1: Rename the users table to profiles
ALTER TABLE public.users RENAME TO profiles;

-- Step 2: Add auth_id column that will reference auth.users
ALTER TABLE public.profiles
  ADD COLUMN auth_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Step 3: Drop the password_hash column (no longer needed with Supabase Auth)
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS password_hash;

-- Step 4: Rename indexes and constraints
ALTER INDEX IF EXISTS users_pkey RENAME TO profiles_pkey;
ALTER INDEX IF EXISTS users_email_key RENAME TO profiles_email_key;

-- Step 5: Create function to auto-create profile when user signs up
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

-- Step 6: Create trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Step 7: Update trigger names for profiles table
DROP TRIGGER IF EXISTS update_users_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;

-- //@UNDO
BEGIN;

-- Revert trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Revert trigger rename
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Revert indexes
ALTER INDEX IF EXISTS profiles_pkey RENAME TO users_pkey;
ALTER INDEX IF EXISTS profiles_email_key RENAME TO users_email_key;

-- Revert columns
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS auth_id,
  ADD COLUMN password_hash VARCHAR;

-- Revert table rename
ALTER TABLE public.profiles RENAME TO users;

COMMIT;

