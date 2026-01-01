-- Add description field to project_members table for project-specific user descriptions
-- This takes priority over profiles.description when building AI context

BEGIN;

ALTER TABLE public.project_members
  ADD COLUMN IF NOT EXISTS description TEXT;

COMMIT;

-- //@UNDO
-- BEGIN;
-- ALTER TABLE public.project_members
--   DROP COLUMN IF EXISTS description;
-- COMMIT;
