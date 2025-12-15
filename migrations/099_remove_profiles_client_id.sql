-- Migration: Remove profiles.client_id and use only client_members
-- This simplifies the architecture by having a single source of truth for user-client relationships

-- Step 1: Migrate existing client_id relationships to client_members
-- Only insert if the relationship doesn't already exist
INSERT INTO client_members (user_id, client_id, role, created_at, updated_at)
SELECT
  p.id as user_id,
  p.client_id as client_id,
  CASE
    WHEN p.role IN ('full_admin', 'client_admin') THEN 'admin'
    WHEN p.role = 'manager' THEN 'manager'
    ELSE 'member'
  END as role,
  NOW() as created_at,
  NOW() as updated_at
FROM profiles p
WHERE p.client_id IS NOT NULL
  AND p.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM client_members cm
    WHERE cm.user_id = p.id AND cm.client_id = p.client_id
  );

-- Step 2: Drop the RLS policy that depends on profiles.client_id
DROP POLICY IF EXISTS "Users can view accessible client members" ON client_members;

-- Step 3: Recreate the policy using client_members instead of profiles.client_id
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
      -- Users can view memberships for clients they belong to
      OR EXISTS (
        SELECT 1 FROM client_members cm2
        WHERE cm2.user_id = profiles.id
        AND cm2.client_id = client_members.client_id
      )
    )
  )
);

-- Step 4: Drop the foreign key constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS users_client_id_fkey;

-- Step 5: Remove the client_id column from profiles
ALTER TABLE profiles DROP COLUMN IF EXISTS client_id;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
