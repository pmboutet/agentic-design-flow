BEGIN;

-- ============================================================================
-- MIGRATION 073: Add Role to Client Members
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

-- Step 1: Create the client_role enum type
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'client_role') THEN
        CREATE TYPE client_role AS ENUM (
            'client_admin',
            'facilitator',
            'manager',
            'participant'
        );
    END IF;
END$$;

-- Step 2: Add role column to client_members table
ALTER TABLE public.client_members
  ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'participant';

-- Step 3: Create index for faster role-based lookups
CREATE INDEX IF NOT EXISTS client_members_role_idx
  ON public.client_members (role);

-- Step 4: Create index for user-client-role lookups
CREATE INDEX IF NOT EXISTS client_members_user_role_idx
  ON public.client_members (user_id, role);

-- Step 5: Update profiles role enum to include client_admin and remove duplicates
-- Note: We keep the existing enum but add client_admin if needed
-- The profiles.role is the GLOBAL role, while client_members.role is per-client
DO $$
BEGIN
    -- Check if client_admin exists in the enum, add if not
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumtypid = 'profile_role'::regtype
        AND enumlabel = 'client_admin'
    ) THEN
        ALTER TYPE profile_role ADD VALUE IF NOT EXISTS 'client_admin';
    END IF;
END$$;

COMMIT;

-- //@UNDO
BEGIN;

-- Drop indexes
DROP INDEX IF EXISTS client_members_user_role_idx;
DROP INDEX IF EXISTS client_members_role_idx;

-- Remove role column
ALTER TABLE public.client_members DROP COLUMN IF EXISTS role;

-- Note: Cannot easily remove enum values, leaving client_role type

COMMIT;
