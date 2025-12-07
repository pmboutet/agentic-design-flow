-- ============================================================================
-- MIGRATION 074: Fix Profiles RLS for User Signup + Update Role Enum
-- ============================================================================
--
-- Problem 1: When a new user signs up via Supabase Auth, the handle_new_user()
-- trigger tries to INSERT a profile record. However, no RLS policy allows
-- this INSERT operation:
-- - "Full admins can manage all profiles" requires is_full_admin() which
--   fails because the user has no profile yet (chicken-and-egg problem)
-- - No service_role bypass policy exists for profiles
--
-- Problem 2: The profile_role enum was created with old role values and doesn't
-- include the new roles (client_admin, manager) added in the role refactor.
--
-- Solution:
-- 1. Add a service_role bypass policy to allow the trigger function to insert
-- 2. Update the profile_role enum to include new roles

-- ============================================================================
-- PART 1: Update profile_role enum with new role values (must be outside transaction)
-- ============================================================================

-- Add new enum values (client_admin, manager) if they don't exist
-- Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction
DO $$
BEGIN
  -- Add 'client_admin' if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.profile_role'::regtype
    AND enumlabel = 'client_admin'
  ) THEN
    ALTER TYPE public.profile_role ADD VALUE 'client_admin';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    NULL; -- Value already exists, ignore
END
$$;

DO $$
BEGIN
  -- Add 'manager' if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.profile_role'::regtype
    AND enumlabel = 'manager'
  ) THEN
    ALTER TYPE public.profile_role ADD VALUE 'manager';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    NULL; -- Value already exists, ignore
END
$$;

-- ============================================================================
-- PART 2: Fix RLS for service_role (in transaction)
-- ============================================================================
BEGIN;

-- Step 1: Grant permissions to service_role
GRANT ALL ON public.profiles TO service_role;

-- Step 2: Add service_role bypass policy for profiles
-- This allows the handle_new_user() trigger to insert profiles during signup
DROP POLICY IF EXISTS "Service role full access to profiles" ON public.profiles;
CREATE POLICY "Service role full access to profiles"
  ON public.profiles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- PART 3: Update helper functions to use new role values
-- ============================================================================

-- Update is_full_admin to include client_admin for backward compatibility
CREATE OR REPLACE FUNCTION public.is_full_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE auth_id = auth.uid()
    AND role::text IN ('admin', 'full_admin', 'client_admin')
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update is_moderator_or_facilitator to include manager role
CREATE OR REPLACE FUNCTION public.is_moderator_or_facilitator()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE auth_id = auth.uid()
    AND role::text IN ('moderator', 'facilitator', 'manager')
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

-- //@UNDO
BEGIN;

-- Revert helper functions
CREATE OR REPLACE FUNCTION public.is_full_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE auth_id = auth.uid()
    AND role IN ('admin', 'full_admin')
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_moderator_or_facilitator()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE auth_id = auth.uid()
    AND role IN ('moderator', 'facilitator')
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop service_role policy
DROP POLICY IF EXISTS "Service role full access to profiles" ON public.profiles;
REVOKE ALL ON public.profiles FROM service_role;

-- Note: Cannot remove enum values in PostgreSQL, so client_admin and manager
-- will remain in the enum even after rollback

COMMIT;
