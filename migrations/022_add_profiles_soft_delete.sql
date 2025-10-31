-- Migration: Add soft delete support for profiles
-- This adds a deleted_at column to mark users as deleted without actually removing them
-- Deleted users will be filtered out from queries but their data remains intact

BEGIN;

-- Add deleted_at column to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Create index for faster queries filtering deleted users
CREATE INDEX IF NOT EXISTS profiles_deleted_at_idx ON public.profiles(deleted_at)
  WHERE deleted_at IS NULL;

COMMIT;

