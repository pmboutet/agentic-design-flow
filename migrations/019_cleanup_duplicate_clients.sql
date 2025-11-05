BEGIN;

-- ============================================================================
-- CLEANUP: Remove duplicate clients and add unique constraint
-- ============================================================================
-- 
-- Problem: Multiple clients can be created with the same name/email because
-- there's no UNIQUE constraint. This migration:
-- 1. Identifies duplicate clients (same name AND email)
-- 2. Keeps the oldest one (lowest id or earliest created_at)
-- 3. Reassigns all related projects and users to the kept client
-- 4. Deletes duplicate clients
-- 5. Adds UNIQUE constraint on name to prevent future duplicates
--

-- Step 1: Create a temporary table to identify duplicates and the one to keep
CREATE TEMP TABLE duplicate_clients_analysis AS
SELECT 
    name,
    email,
    array_agg(id ORDER BY created_at ASC, id ASC) as client_ids,
    (array_agg(id ORDER BY created_at ASC, id ASC))[1] as keep_id
FROM public.clients
WHERE name IS NOT NULL
GROUP BY name, email
HAVING COUNT(*) > 1;

-- Step 2: For each group of duplicates, reassign projects and users to the kept client
DO $$
DECLARE
    dup RECORD;
    project_count INTEGER;
    user_count INTEGER;
BEGIN
    FOR dup IN SELECT * FROM duplicate_clients_analysis LOOP
        -- Reassign projects
        UPDATE public.projects
        SET client_id = dup.keep_id
        WHERE client_id = ANY(dup.client_ids[2:array_length(dup.client_ids, 1)])
            AND client_id != dup.keep_id;
        
        GET DIAGNOSTICS project_count = ROW_COUNT;
        
        -- Reassign users (profiles)
        UPDATE public.profiles
        SET client_id = dup.keep_id
        WHERE client_id = ANY(dup.client_ids[2:array_length(dup.client_ids, 1)])
            AND client_id != dup.keep_id;
        
        GET DIAGNOSTICS user_count = ROW_COUNT;
        
        RAISE NOTICE 'Duplicates for % (%): Kept client %, reassigned % projects and % users',
            dup.name, dup.email, dup.keep_id, project_count, user_count;
    END LOOP;
END $$;

-- Step 3: Delete duplicate clients (keep the first one, delete the rest)
DELETE FROM public.clients
WHERE id IN (
    SELECT unnest(client_ids[2:array_length(client_ids, 1)])
    FROM duplicate_clients_analysis
);

-- Step 4: Add UNIQUE constraint on name to prevent future duplicates
-- First, check if there are any remaining duplicates (edge case)
DO $$
DECLARE
    remaining_dups INTEGER;
BEGIN
    SELECT COUNT(*) INTO remaining_dups
    FROM (
        SELECT name, COUNT(*) as cnt
        FROM public.clients
        WHERE name IS NOT NULL
        GROUP BY name
        HAVING COUNT(*) > 1
    ) dup_check;
    
    IF remaining_dups > 0 THEN
        RAISE EXCEPTION 'Cannot add unique constraint: % duplicate client names still exist', remaining_dups;
    END IF;
END $$;

-- Add the unique constraint (this will also create an index automatically)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'clients_name_unique' 
        AND conrelid = 'public.clients'::regclass
    ) THEN
        ALTER TABLE public.clients ADD CONSTRAINT clients_name_unique UNIQUE (name);
    END IF;
END $$;

-- Clean up temp table
DROP TABLE IF EXISTS duplicate_clients_analysis;

COMMIT;

