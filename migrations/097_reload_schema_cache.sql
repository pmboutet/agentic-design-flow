-- Migration 097: Force PostgREST to reload schema cache
-- This ensures all new RPC functions are available

BEGIN;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

COMMIT;
