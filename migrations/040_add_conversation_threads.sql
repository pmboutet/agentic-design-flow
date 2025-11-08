-- Migration 040: Add conversation threads for isolated conversations

BEGIN;

-- Create conversation_threads table
CREATE TABLE IF NOT EXISTS public.conversation_threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ask_session_id UUID NOT NULL REFERENCES public.ask_sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_shared BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create unique index to prevent duplicate threads
-- For shared threads: one per ask_session (user_id is NULL)
-- For individual threads: one per (ask_session_id, user_id)
CREATE UNIQUE INDEX IF NOT EXISTS conversation_threads_unique_idx 
  ON public.conversation_threads (ask_session_id, user_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_conversation_threads_ask_session 
  ON public.conversation_threads (ask_session_id);

CREATE INDEX IF NOT EXISTS idx_conversation_threads_user 
  ON public.conversation_threads (user_id) 
  WHERE user_id IS NOT NULL;

-- Add conversation_thread_id to messages table
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS conversation_thread_id UUID REFERENCES public.conversation_threads(id) ON DELETE SET NULL;

-- Create index for faster message filtering by thread
CREATE INDEX IF NOT EXISTS idx_messages_conversation_thread 
  ON public.messages (conversation_thread_id) 
  WHERE conversation_thread_id IS NOT NULL;

-- Add conversation_thread_id to insights table
ALTER TABLE public.insights
  ADD COLUMN IF NOT EXISTS conversation_thread_id UUID REFERENCES public.conversation_threads(id) ON DELETE SET NULL;

-- Create index for faster insight filtering by thread
CREATE INDEX IF NOT EXISTS idx_insights_conversation_thread 
  ON public.insights (conversation_thread_id) 
  WHERE conversation_thread_id IS NOT NULL;

-- Create shared threads for all existing ASK sessions
-- This ensures backward compatibility
INSERT INTO public.conversation_threads (ask_session_id, user_id, is_shared, created_at)
SELECT DISTINCT 
  id::uuid as ask_session_id,
  NULL::uuid as user_id,
  true as is_shared,
  created_at
FROM public.ask_sessions
ON CONFLICT (ask_session_id, user_id) DO NOTHING;

-- Associate all existing messages with the shared thread of their ASK session
UPDATE public.messages m
SET conversation_thread_id = ct.id
FROM public.conversation_threads ct
WHERE m.ask_session_id = ct.ask_session_id
  AND ct.is_shared = true
  AND ct.user_id IS NULL
  AND m.conversation_thread_id IS NULL;

-- Associate all existing insights with the shared thread of their ASK session
UPDATE public.insights i
SET conversation_thread_id = ct.id
FROM public.conversation_threads ct
WHERE i.ask_session_id = ct.ask_session_id
  AND ct.is_shared = true
  AND ct.user_id IS NULL
  AND i.conversation_thread_id IS NULL;

COMMIT;

-- //@UNDO
BEGIN;

-- Remove conversation_thread_id from insights
ALTER TABLE public.insights
  DROP COLUMN IF EXISTS conversation_thread_id;

-- Remove conversation_thread_id from messages
ALTER TABLE public.messages
  DROP COLUMN IF EXISTS conversation_thread_id;

-- Drop indexes
DROP INDEX IF EXISTS public.idx_insights_conversation_thread;
DROP INDEX IF EXISTS public.idx_messages_conversation_thread;
DROP INDEX IF EXISTS public.idx_conversation_threads_user;
DROP INDEX IF EXISTS public.idx_conversation_threads_ask_session;
DROP INDEX IF EXISTS public.conversation_threads_unique_idx;

-- Drop conversation_threads table
DROP TABLE IF EXISTS public.conversation_threads CASCADE;

COMMIT;

