-- ============================================================================
-- Script de diagnostic: Authentification et RLS
-- ============================================================================
-- Ce script diagnostique les problèmes d'authentification et de Row Level Security
-- Usage: psql $DATABASE_URL -f scripts/diagnose-auth-rls.sql

\echo '===================================================================='
\echo 'DIAGNOSTIC: Authentification et Row Level Security (RLS)'
\echo '===================================================================='
\echo ''

-- ============================================================================
-- 1. Vérifier les politiques RLS sur la table profiles
-- ============================================================================
\echo '1. Politiques RLS actives sur la table profiles:'
\echo '--------------------------------------------------------------------'

SELECT
  policyname AS "Policy Name",
  cmd AS "Command",
  CASE
    WHEN permissive = 'PERMISSIVE' THEN 'Yes'
    ELSE 'No'
  END AS "Permissive",
  qual AS "USING Expression",
  with_check AS "WITH CHECK Expression"
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'profiles'
ORDER BY policyname;

\echo ''

-- ============================================================================
-- 2. Vérifier RLS est activé
-- ============================================================================
\echo '2. État du Row Level Security:'
\echo '--------------------------------------------------------------------'

SELECT
  schemaname AS "Schema",
  tablename AS "Table",
  CASE
    WHEN rowsecurity THEN 'ENABLED'
    ELSE 'DISABLED'
  END AS "RLS Status"
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'clients', 'projects', 'ask_sessions')
ORDER BY tablename;

\echo ''

-- ============================================================================
-- 3. Statistiques des profils
-- ============================================================================
\echo '3. Statistiques des profils:'
\echo '--------------------------------------------------------------------'

SELECT
  role AS "Role",
  is_active AS "Active",
  COUNT(*) AS "Count"
FROM public.profiles
GROUP BY role, is_active
ORDER BY role, is_active;

\echo ''

-- ============================================================================
-- 4. Vérifier la correspondance auth.users <-> profiles
-- ============================================================================
\echo '4. Correspondance entre auth.users et profiles:'
\echo '--------------------------------------------------------------------'

WITH auth_profile_check AS (
  SELECT
    u.id AS auth_id,
    u.email AS auth_email,
    u.created_at AS auth_created,
    p.id AS profile_id,
    p.email AS profile_email,
    p.auth_id AS profile_auth_id,
    p.role,
    p.is_active,
    CASE
      WHEN p.id IS NULL THEN 'MISSING PROFILE'
      WHEN p.auth_id != u.id THEN 'AUTH_ID MISMATCH'
      WHEN p.email != u.email THEN 'EMAIL MISMATCH'
      ELSE 'OK'
    END AS status
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.auth_id = u.id
)
SELECT
  status AS "Status",
  COUNT(*) AS "Count"
FROM auth_profile_check
GROUP BY status
ORDER BY status;

\echo ''

-- ============================================================================
-- 5. Lister les utilisateurs sans profil
-- ============================================================================
\echo '5. Utilisateurs authentifiés SANS profil (problème!):'
\echo '--------------------------------------------------------------------'

SELECT
  u.id AS "Auth ID",
  u.email AS "Email",
  u.created_at AS "Created At",
  u.email_confirmed_at AS "Email Confirmed"
FROM auth.users u
LEFT JOIN public.profiles p ON p.auth_id = u.id
WHERE p.id IS NULL
ORDER BY u.created_at DESC
LIMIT 10;

\echo ''

-- ============================================================================
-- 6. Lister les profils orphelins (sans auth.users)
-- ============================================================================
\echo '6. Profils SANS utilisateur auth (profils orphelins):'
\echo '--------------------------------------------------------------------'

SELECT
  p.id AS "Profile ID",
  p.email AS "Email",
  p.auth_id AS "Auth ID (référence)",
  p.role AS "Role",
  p.created_at AS "Created At"
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.auth_id
WHERE u.id IS NULL
ORDER BY p.created_at DESC
LIMIT 10;

\echo ''

-- ============================================================================
-- 7. Vérifier les fonctions helper RLS
-- ============================================================================
\echo '7. Fonctions helper pour RLS:'
\echo '--------------------------------------------------------------------'

SELECT
  routine_name AS "Function Name",
  routine_type AS "Type",
  security_type AS "Security"
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'is_full_admin',
    'is_moderator_or_facilitator',
    'current_user_id',
    'has_project_access',
    'has_client_access',
    'is_ask_participant'
  )
ORDER BY routine_name;

\echo ''

-- ============================================================================
-- 8. Profils récemment créés
-- ============================================================================
\echo '8. 5 derniers profils créés:'
\echo '--------------------------------------------------------------------'

SELECT
  p.email AS "Email",
  p.role AS "Role",
  p.is_active AS "Active",
  p.created_at AS "Created At",
  CASE
    WHEN u.id IS NOT NULL THEN 'Yes'
    ELSE 'No'
  END AS "Has Auth User"
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.auth_id
ORDER BY p.created_at DESC
LIMIT 5;

\echo ''

-- ============================================================================
-- 9. Compter les permissions manquantes possibles
-- ============================================================================
\echo '9. Analyse des permissions:'
\echo '--------------------------------------------------------------------'

SELECT
  'Total auth users' AS "Metric",
  COUNT(*)::TEXT AS "Value"
FROM auth.users
UNION ALL
SELECT
  'Total profiles' AS "Metric",
  COUNT(*)::TEXT AS "Value"
FROM public.profiles
UNION ALL
SELECT
  'Users without profile' AS "Metric",
  COUNT(*)::TEXT AS "Value"
FROM auth.users u
LEFT JOIN public.profiles p ON p.auth_id = u.id
WHERE p.id IS NULL
UNION ALL
SELECT
  'Orphan profiles' AS "Metric",
  COUNT(*)::TEXT AS "Value"
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.auth_id
WHERE u.id IS NULL
UNION ALL
SELECT
  'Active full_admins' AS "Metric",
  COUNT(*)::TEXT AS "Value"
FROM public.profiles
WHERE role = 'full_admin' AND is_active = true;

\echo ''
\echo '===================================================================='
\echo 'FIN DU DIAGNOSTIC'
\echo '===================================================================='
\echo ''
\echo 'ACTIONS RECOMMANDÉES:'
\echo ''
\echo '1. Si "Users without profile" > 0:'
\echo '   → Créer les profils manquants pour ces utilisateurs'
\echo ''
\echo '2. Si "Orphan profiles" > 0:'
\echo '   → Nettoyer ou associer ces profils à des utilisateurs auth'
\echo ''
\echo '3. Si RLS Status = DISABLED:'
\echo '   → Exécuter la migration 014_enable_rls_security.sql'
\echo ''
\echo '4. Si politiques RLS manquantes:'
\echo '   → Réexécuter les migrations 011 et 014'
\echo ''
\echo '===================================================================='
