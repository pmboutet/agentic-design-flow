-- Migration: Enable Supabase Realtime for messages table
-- This enables real-time message synchronization for shared threads
-- (collaborative, group_reporter, consultant conversation modes)

-- Note: messages table is already part of supabase_realtime publication
-- This migration is a no-op but documents the requirement

-- Check if messages table is in the publication (for reference)
-- SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- If not already added (idempotent check):
DO $$
BEGIN
  -- Try to add messages if not already there
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
    RAISE NOTICE 'Added messages table to supabase_realtime publication';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'messages table already in supabase_realtime publication';
  END;

  -- Try to add conversation_threads if not already there
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversation_threads;
    RAISE NOTICE 'Added conversation_threads table to supabase_realtime publication';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'conversation_threads table already in supabase_realtime publication';
  END;
END $$;
