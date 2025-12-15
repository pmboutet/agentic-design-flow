-- Migration: Fix infinite recursion in client_members RLS policy
-- The policy created in 099 causes infinite recursion because it checks client_members
-- to determine if you can read client_members

-- Step 1: Drop the problematic policy
DROP POLICY IF EXISTS "Users can view accessible client members" ON client_members;

-- Step 2: Create a simpler policy that doesn't cause recursion
-- Use a SECURITY DEFINER function to check membership without triggering RLS
CREATE OR REPLACE FUNCTION public.user_belongs_to_client(p_user_id uuid, p_client_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM client_members
    WHERE user_id = p_user_id AND client_id = p_client_id
  );
$$;

-- Step 3: Recreate the policy using the security definer function
CREATE POLICY "Users can view accessible client members" ON client_members
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.auth_id = auth.uid()
    AND (
      -- Admins, facilitators, managers can view all
      profiles.role IN ('full_admin', 'admin', 'client_admin', 'facilitator', 'manager')
      -- Users can view their own memberships
      OR profiles.id = client_members.user_id
      -- Users can view memberships for clients they belong to (using SECURITY DEFINER function)
      OR public.user_belongs_to_client(profiles.id, client_members.client_id)
    )
  )
);

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
