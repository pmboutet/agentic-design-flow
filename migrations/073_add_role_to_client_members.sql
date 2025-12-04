BEGIN;

-- ============================================================================
-- MIGRATION 073: Add Role to Client Members + Fix RLS Permissions
-- ============================================================================
--
-- This migration adds a role column to the client_members table to support
-- different roles per client for each user. This enables:
-- - Full Admin: All access across all clients/projects
-- - Client Admin: Manages all projects and users for their assigned client
-- - Facilitator: Manages projects, can create/update/add contacts
-- - Manager: Manages clients, can create/update/add contacts
-- - Participant: Basic user role (replaces "user" to avoid confusion)
--
-- Users can now have different roles in different clients.

-- Step 1: Add role column to client_members table
ALTER TABLE public.client_members
  ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'participant';

-- Step 2: Create index for faster role-based lookups
CREATE INDEX IF NOT EXISTS client_members_role_idx
  ON public.client_members (role);

-- Step 3: Create index for user-client-role lookups
CREATE INDEX IF NOT EXISTS client_members_user_role_idx
  ON public.client_members (user_id, role);

-- Step 4: Grant permissions to authenticated and service_role
GRANT ALL ON public.client_members TO authenticated;
GRANT ALL ON public.client_members TO service_role;

-- Step 5: Drop existing RLS policies and recreate with new roles
DROP POLICY IF EXISTS "Users can view accessible client members" ON public.client_members;
DROP POLICY IF EXISTS "Admins can manage client members" ON public.client_members;
DROP POLICY IF EXISTS "Users can view own client memberships" ON public.client_members;
DROP POLICY IF EXISTS "Service role full access to client_members" ON public.client_members;

-- Step 6: Service role bypass for admin API operations
CREATE POLICY "Service role full access to client_members"
  ON public.client_members FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Step 7: Users can view client memberships for clients they have access to
CREATE POLICY "Users can view accessible client members"
  ON public.client_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_id = auth.uid()
      AND (
        role IN ('full_admin', 'admin', 'client_admin', 'facilitator', 'manager')
        OR client_id = client_members.client_id
        OR id = client_members.user_id
      )
    )
  );

-- Step 8: Admins and managers can manage client memberships
CREATE POLICY "Admins can manage client members"
  ON public.client_members FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_id = auth.uid()
      AND role IN ('full_admin', 'admin', 'client_admin', 'facilitator', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_id = auth.uid()
      AND role IN ('full_admin', 'admin', 'client_admin', 'facilitator', 'manager')
    )
  );

-- Step 9: Users can view their own client memberships
CREATE POLICY "Users can view own client memberships"
  ON public.client_members FOR SELECT
  TO authenticated
  USING (
    user_id IN (
      SELECT id FROM public.profiles WHERE auth_id = auth.uid()
    )
  );

COMMIT;

-- //@UNDO
BEGIN;

-- Drop new policies
DROP POLICY IF EXISTS "Service role full access to client_members" ON public.client_members;
DROP POLICY IF EXISTS "Users can view accessible client members" ON public.client_members;
DROP POLICY IF EXISTS "Admins can manage client members" ON public.client_members;
DROP POLICY IF EXISTS "Users can view own client memberships" ON public.client_members;

-- Drop indexes
DROP INDEX IF EXISTS client_members_user_role_idx;
DROP INDEX IF EXISTS client_members_role_idx;

-- Remove role column
ALTER TABLE public.client_members DROP COLUMN IF EXISTS role;

-- Recreate original policies
CREATE POLICY "Users can view accessible client members"
  ON public.client_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_id = auth.uid()
      AND (
        role IN ('full_admin', 'admin')
        OR (
          id IN (
            SELECT user_id FROM public.project_members pm
            INNER JOIN public.projects p ON p.id = pm.project_id
            WHERE p.client_id = client_members.client_id
          )
        )
      )
    )
  );

CREATE POLICY "Admins can manage client members"
  ON public.client_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_id = auth.uid()
      AND role IN ('full_admin', 'admin')
    )
  );

CREATE POLICY "Users can view own client memberships"
  ON public.client_members FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM public.profiles WHERE auth_id = auth.uid()
    )
  );

COMMIT;
