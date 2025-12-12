-- Migration: Set REPLICA IDENTITY FULL for messages table
-- Required for Supabase Realtime filtered subscriptions to work correctly
-- Without this, filtered postgres_changes events won't be delivered

-- Set REPLICA IDENTITY FULL to enable filtering on conversation_thread_id
ALTER TABLE messages REPLICA IDENTITY FULL;

-- Also set for conversation_threads in case we need filtered subscriptions there
ALTER TABLE conversation_threads REPLICA IDENTITY FULL;
