BEGIN;

-- ============================================================================
-- MIGRATION 020: Add Job Titles at Three Levels
-- ============================================================================
-- 
-- This migration adds job title/description fields at three levels:
-- 1. Global level: job_title in profiles table (user's primary job)
-- 2. Client-specific level: client_members table with job_title
-- 3. Project-specific level: job_title in project_members table
--
-- This allows users to have different job descriptions for different contexts,
-- enabling better AI-powered participant assignment for ASK sessions.

-- Step 1: Add job_title column to profiles table (global job)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS job_title VARCHAR(255);

-- Step 2: Create client_members table (similar to project_members)
CREATE TABLE IF NOT EXISTS public.client_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  job_title VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS client_members_client_user_idx
  ON public.client_members (client_id, user_id);

-- Step 3: Add job_title column to project_members table (project-specific job)
ALTER TABLE public.project_members
  ADD COLUMN IF NOT EXISTS job_title VARCHAR(255);

-- Step 4: Create updated_at trigger for client_members
CREATE OR REPLACE FUNCTION update_client_members_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_client_members_updated_at ON public.client_members;
CREATE TRIGGER update_client_members_updated_at
  BEFORE UPDATE ON public.client_members
  FOR EACH ROW EXECUTE FUNCTION update_client_members_updated_at();

-- Step 5: Enable RLS on client_members
ALTER TABLE public.client_members ENABLE ROW LEVEL SECURITY;

-- Step 6: Create RLS policies for client_members
-- Users can view client memberships for clients they have access to
CREATE POLICY "Users can view accessible client members"
  ON public.client_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_id = auth.uid()
      AND (
        role IN ('full_admin', 'project_admin')
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

-- Admins can manage all client memberships
CREATE POLICY "Admins can manage client members"
  ON public.client_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_id = auth.uid()
      AND role IN ('full_admin', 'project_admin')
    )
  );

-- Users can view their own client memberships
CREATE POLICY "Users can view own client memberships"
  ON public.client_members FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM public.profiles WHERE auth_id = auth.uid()
    )
  );

COMMIT;

-- //@UNDO
BEGIN;

-- Drop RLS policies
DROP POLICY IF EXISTS "Users can view accessible client members" ON public.client_members;
DROP POLICY IF EXISTS "Admins can manage client members" ON public.client_members;
DROP POLICY IF EXISTS "Users can view own client memberships" ON public.client_members;

-- Disable RLS
ALTER TABLE public.client_members DISABLE ROW LEVEL SECURITY;

-- Drop trigger and function
DROP TRIGGER IF EXISTS update_client_members_updated_at ON public.client_members;
DROP FUNCTION IF EXISTS update_client_members_updated_at();

-- Drop columns and table
ALTER TABLE public.project_members DROP COLUMN IF EXISTS job_title;
DROP TABLE IF EXISTS public.client_members CASCADE;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS job_title;

COMMIT;

