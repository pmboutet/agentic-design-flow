-- ============================================================================
-- Script de vérification et correction de get_ask_session_by_token
-- ============================================================================
-- Ce script vérifie si la fonction a le correctif de la migration 034
-- et l'applique si nécessaire.
--
-- À exécuter dans Supabase SQL Editor pour corriger le problème en production
-- ============================================================================

BEGIN;

-- 1. Vérifier la définition actuelle de la fonction
DO $$
DECLARE
  v_function_def TEXT;
  v_has_fix BOOLEAN := FALSE;
BEGIN
  -- Récupérer la définition de la fonction
  SELECT pg_get_functiondef(oid) INTO v_function_def
  FROM pg_proc
  WHERE proname = 'get_ask_session_by_token'
    AND pronamespace = 'public'::regnamespace;
  
  -- Vérifier si le correctif est présent (chercher "a.id AS ask_session_id")
  IF v_function_def LIKE '%a.id AS ask_session_id%' THEN
    v_has_fix := TRUE;
    RAISE NOTICE '✅ La fonction a déjà le correctif (migration 034 appliquée)';
  ELSE
    RAISE NOTICE '⚠️  La fonction n''a pas le correctif, application du correctif...';
  END IF;
  
  -- Afficher un extrait de la définition pour diagnostic
  RAISE NOTICE 'Définition actuelle (extrait): %', substring(v_function_def, 1, 200);
END $$;

-- 2. Appliquer le correctif de la migration 034
-- (Même si la fonction a déjà le correctif, cette commande est idempotente)
CREATE OR REPLACE FUNCTION public.get_ask_session_by_token(
  p_token VARCHAR(255)
)
RETURNS TABLE (
  ask_session_id UUID,
  ask_key VARCHAR(255),
  name TEXT,
  question TEXT,
  description TEXT,
  status VARCHAR(50),
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  is_anonymous BOOLEAN,
  max_participants INTEGER,
  delivery_mode VARCHAR(50),
  audience_scope VARCHAR(50),
  response_mode VARCHAR(50),
  project_id UUID,
  challenge_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
DECLARE
  v_participant_id UUID;
  v_ask_session_id UUID;
BEGIN
  -- First, verify token exists and get participant
  SELECT id, ask_session_id INTO v_participant_id, v_ask_session_id
  FROM public.ask_participants
  WHERE invite_token = p_token
  LIMIT 1;
  
  -- If token not found, return empty result
  IF v_participant_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Return ASK session data (bypasses RLS due to SECURITY DEFINER)
  -- Fix: Use explicit alias 'a.id AS ask_session_id' to avoid ambiguity
  RETURN QUERY
  SELECT 
    a.id AS ask_session_id,  -- ✅ CORRECTIF: Alias explicite pour éviter l'ambiguïté
    a.ask_key,
    a.name,
    a.question,
    a.description,
    a.status,
    a.start_date,
    a.end_date,
    a.is_anonymous,
    a.max_participants,
    a.delivery_mode,
    a.audience_scope,
    a.response_mode,
    a.project_id,
    a.challenge_id,
    a.created_by,
    a.created_at,
    a.updated_at
  FROM public.ask_sessions a
  WHERE a.id = v_ask_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Mettre à jour le commentaire
COMMENT ON FUNCTION public.get_ask_session_by_token(VARCHAR) IS 
  'Returns ASK session data for a valid invite token. Fixed ambiguous column reference (migration 034).';

-- 4. Vérification finale
DO $$
DECLARE
  v_function_def TEXT;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_function_def
  FROM pg_proc
  WHERE proname = 'get_ask_session_by_token'
    AND pronamespace = 'public'::regnamespace;
  
  IF v_function_def LIKE '%a.id AS ask_session_id%' THEN
    RAISE NOTICE '✅ Vérification: Le correctif est maintenant appliqué';
  ELSE
    RAISE WARNING '⚠️  Vérification: Le correctif pourrait ne pas être présent';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- TEST (optionnel - décommenter pour tester)
-- ============================================================================
-- Remplacez 'YOUR_TEST_TOKEN' par un token valide pour tester
-- 
-- SELECT * FROM public.get_ask_session_by_token('YOUR_TEST_TOKEN');
-- ============================================================================

