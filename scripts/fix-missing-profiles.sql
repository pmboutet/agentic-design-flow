-- ============================================================================
-- Script de correction: Créer les profils manquants
-- ============================================================================
-- Ce script crée les profils manquants pour les utilisateurs authentifiés
-- qui n'ont pas encore de profil dans la table profiles
--
-- Usage: psql $DATABASE_URL -f scripts/fix-missing-profiles.sql

\echo '===================================================================='
\echo 'CORRECTION: Création des profils manquants'
\echo '===================================================================='
\echo ''

-- ============================================================================
-- 1. Afficher les utilisateurs sans profil
-- ============================================================================
\echo '1. Utilisateurs authentifiés SANS profil:'
\echo '--------------------------------------------------------------------'

SELECT
  u.id AS "Auth ID",
  u.email AS "Email",
  u.created_at AS "Created At"
FROM auth.users u
LEFT JOIN public.profiles p ON p.auth_id = u.id
WHERE p.id IS NULL
ORDER BY u.created_at;

\echo ''

-- ============================================================================
-- 2. Créer les profils manquants
-- ============================================================================
\echo '2. Création des profils manquants...'
\echo '--------------------------------------------------------------------'

-- Insérer les profils manquants avec rôle 'participant' par défaut
INSERT INTO public.profiles (
  auth_id,
  email,
  full_name,
  first_name,
  last_name,
  role,
  is_active,
  created_at,
  updated_at
)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', u.email),
  COALESCE(u.raw_user_meta_data->>'first_name', split_part(u.email, '@', 1)),
  COALESCE(u.raw_user_meta_data->>'last_name', ''),
  'participant', -- Rôle par défaut
  true,
  NOW(),
  NOW()
FROM auth.users u
LEFT JOIN public.profiles p ON p.auth_id = u.id
WHERE p.id IS NULL
ON CONFLICT (email) DO NOTHING;

\echo '   ✓ Profils créés'
\echo ''

-- ============================================================================
-- 3. Vérifier les profils créés
-- ============================================================================
\echo '3. Profils récemment créés:'
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
WHERE p.created_at > NOW() - INTERVAL '5 minutes'
ORDER BY p.created_at DESC;

\echo ''

-- ============================================================================
-- 4. Nettoyer les profils orphelins (optionnel)
-- ============================================================================
\echo '4. Profils orphelins détectés:'
\echo '--------------------------------------------------------------------'

SELECT
  p.id AS "Profile ID",
  p.email AS "Email",
  p.auth_id AS "Auth ID (null)",
  p.role AS "Role"
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.auth_id
WHERE u.id IS NULL;

\echo ''
\echo 'IMPORTANT: Les profils orphelins ci-dessus ne sont PAS supprimés.'
\echo 'Pour les supprimer, exécutez manuellement:'
\echo '  DELETE FROM public.profiles WHERE auth_id IS NULL OR auth_id NOT IN (SELECT id FROM auth.users);'
\echo ''

-- ============================================================================
-- 5. Statistiques finales
-- ============================================================================
\echo '5. Statistiques après correction:'
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
WHERE u.id IS NULL;

\echo ''
\echo '===================================================================='
\echo 'CORRECTION TERMINÉE'
\echo '===================================================================='
\echo ''
\echo 'NOTE: Tous les profils ont été créés avec le rôle "participant".'
\echo 'Pour changer le rôle d''un utilisateur, utilisez:'
\echo '  UPDATE public.profiles SET role = '\''full_admin'\'' WHERE email = '\''email@example.com'\'';'
\echo ''
\echo '===================================================================='
