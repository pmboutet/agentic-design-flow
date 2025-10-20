-- Migration 016: Convert public.profiles.role to ENUM type
-- Normalize profile roles using a dedicated enum type for consistency across policies

-- 1. Create the enum type to hold allowed profile roles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'profile_role') THEN
    CREATE TYPE public.profile_role AS ENUM (
      'full_admin',
      'admin',
      'moderator',
      'facilitator',
      'participant',
      'sponsor',
      'observer',
      'guest'
    );
  END IF;
END
$$;

-- 2. Clean up any unexpected role values before casting to the new enum
UPDATE public.profiles
SET role = 'participant'
WHERE role IS NULL
   OR role NOT IN (
     'full_admin',
     'admin',
     'moderator',
     'facilitator',
     'participant',
     'sponsor',
     'observer',
     'guest'
   );

-- 3. Convert the column to the enum type and set a sensible default
ALTER TABLE public.profiles
  ALTER COLUMN role DROP DEFAULT,
  ALTER COLUMN role TYPE public.profile_role USING role::public.profile_role,
  ALTER COLUMN role SET DEFAULT 'participant';
