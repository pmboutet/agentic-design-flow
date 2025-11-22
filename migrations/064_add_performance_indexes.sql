-- Migration 064: Add performance indexes for admin and authentication
-- These indexes significantly improve query performance on frequently accessed columns

BEGIN;

-- Index for authentication checks (used in requireAdmin() on every admin API call)
-- This is the most critical index for admin page performance
CREATE INDEX IF NOT EXISTS profiles_auth_id_idx ON public.profiles(auth_id);

-- Index for email lookups (used when creating users and email searches)
CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles(email);

-- Index for project membership queries by user
-- Improves performance when fetching user's project memberships
CREATE INDEX IF NOT EXISTS project_members_user_id_idx ON public.project_members(user_id);

-- Index for ask sessions by project
-- Speeds up queries filtering asks by project
CREATE INDEX IF NOT EXISTS ask_sessions_project_id_idx ON public.ask_sessions(project_id);

-- Index for ask participants by ask session
-- Improves performance when loading participant lists
CREATE INDEX IF NOT EXISTS ask_participants_ask_session_id_idx ON public.ask_participants(ask_session_id);

-- Index for conversation threads by ask session
-- Speeds up loading conversation history
CREATE INDEX IF NOT EXISTS conversation_threads_ask_session_id_idx ON public.conversation_threads(ask_session_id);

-- Composite index for active profiles (common filter)
-- Optimizes queries that filter by deleted_at IS NULL
CREATE INDEX IF NOT EXISTS profiles_active_idx ON public.profiles(deleted_at) WHERE deleted_at IS NULL;

-- Add comments to document the purpose of these indexes
COMMENT ON INDEX profiles_auth_id_idx IS 'Performance: Speeds up authentication checks in requireAdmin()';
COMMENT ON INDEX profiles_email_idx IS 'Performance: Speeds up email lookups during user creation and searches';
COMMENT ON INDEX project_members_user_id_idx IS 'Performance: Speeds up user membership queries';
COMMENT ON INDEX ask_sessions_project_id_idx IS 'Performance: Speeds up project-based ask queries';
COMMENT ON INDEX ask_participants_ask_session_id_idx IS 'Performance: Speeds up participant list loading';
COMMENT ON INDEX conversation_threads_ask_session_id_idx IS 'Performance: Speeds up conversation history loading';
COMMENT ON INDEX profiles_active_idx IS 'Performance: Partial index for active (non-deleted) profiles';

COMMIT;

-- //@UNDO
BEGIN;

DROP INDEX IF EXISTS public.profiles_auth_id_idx;
DROP INDEX IF EXISTS public.profiles_email_idx;
DROP INDEX IF EXISTS public.project_members_user_id_idx;
DROP INDEX IF EXISTS public.ask_sessions_project_id_idx;
DROP INDEX IF EXISTS public.ask_participants_ask_session_id_idx;
DROP INDEX IF EXISTS public.conversation_threads_ask_session_id_idx;
DROP INDEX IF EXISTS public.profiles_active_idx;

COMMIT;
