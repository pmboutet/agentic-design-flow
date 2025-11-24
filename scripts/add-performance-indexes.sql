-- ============================================================================
-- Performance Indexes pour optimiser les requêtes d'authentification
-- ============================================================================
-- Ce script ajoute des index pour améliorer les performances des lookups
-- d'authentification et de profil utilisateur
--
-- Usage: psql $DATABASE_URL -f scripts/add-performance-indexes.sql

\echo '===================================================================='
\echo 'AJOUT DES INDEX DE PERFORMANCE'
\echo '===================================================================='
\echo ''

-- ============================================================================
-- 1. Index sur profiles.auth_id (critique pour l'authentification)
-- ============================================================================
\echo '1. Création de l''index sur profiles.auth_id...'

CREATE INDEX IF NOT EXISTS idx_profiles_auth_id
  ON public.profiles(auth_id);

\echo '   ✓ Index idx_profiles_auth_id créé'
\echo ''

-- ============================================================================
-- 2. Index sur profiles.client_id (pour les jointures)
-- ============================================================================
\echo '2. Création de l''index sur profiles.client_id...'

CREATE INDEX IF NOT EXISTS idx_profiles_client_id
  ON public.profiles(client_id);

\echo '   ✓ Index idx_profiles_client_id créé'
\echo ''

-- ============================================================================
-- 3. Index sur profiles.email (pour les recherches par email)
-- ============================================================================
\echo '3. Création de l''index sur profiles.email...'

CREATE INDEX IF NOT EXISTS idx_profiles_email
  ON public.profiles(email);

\echo '   ✓ Index idx_profiles_email créé'
\echo ''

-- ============================================================================
-- 4. Index sur profiles.role et is_active (pour les vérifications RLS)
-- ============================================================================
\echo '4. Création de l''index composite sur role et is_active...'

CREATE INDEX IF NOT EXISTS idx_profiles_role_active
  ON public.profiles(role, is_active);

\echo '   ✓ Index idx_profiles_role_active créé'
\echo ''

-- ============================================================================
-- 5. Index sur ask_participants pour les lookups rapides
-- ============================================================================
\echo '5. Création des index sur ask_participants...'

CREATE INDEX IF NOT EXISTS idx_ask_participants_user_id
  ON public.ask_participants(user_id);

CREATE INDEX IF NOT EXISTS idx_ask_participants_ask_session_id
  ON public.ask_participants(ask_session_id);

CREATE INDEX IF NOT EXISTS idx_ask_participants_composite
  ON public.ask_participants(ask_session_id, user_id);

\echo '   ✓ Index sur ask_participants créés'
\echo ''

-- ============================================================================
-- 6. Index sur project_members pour les lookups rapides
-- ============================================================================
\echo '6. Création des index sur project_members...'

CREATE INDEX IF NOT EXISTS idx_project_members_user_id
  ON public.project_members(user_id);

CREATE INDEX IF NOT EXISTS idx_project_members_project_id
  ON public.project_members(project_id);

CREATE INDEX IF NOT EXISTS idx_project_members_composite
  ON public.project_members(project_id, user_id);

\echo '   ✓ Index sur project_members créés'
\echo ''

-- ============================================================================
-- 7. Analyser les tables pour mettre à jour les statistiques
-- ============================================================================
\echo '7. Mise à jour des statistiques des tables...'

ANALYZE public.profiles;
ANALYZE public.clients;
ANALYZE public.ask_participants;
ANALYZE public.project_members;

\echo '   ✓ Statistiques mises à jour'
\echo ''

-- ============================================================================
-- 8. Afficher les index créés
-- ============================================================================
\echo '8. Index sur la table profiles:'
\echo '--------------------------------------------------------------------'

SELECT
  indexname AS "Index Name",
  indexdef AS "Index Definition"
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'profiles'
ORDER BY indexname;

\echo ''
\echo '===================================================================='
\echo 'INDEX DE PERFORMANCE CRÉÉS AVEC SUCCÈS'
\echo '===================================================================='
\echo ''
\echo 'Les index suivants ont été ajoutés:'
\echo '  - idx_profiles_auth_id (critique pour auth)'
\echo '  - idx_profiles_client_id (pour jointures)'
\echo '  - idx_profiles_email (pour recherches)'
\echo '  - idx_profiles_role_active (pour RLS)'
\echo '  - idx_ask_participants_* (3 index)'
\echo '  - idx_project_members_* (3 index)'
\echo ''
\echo 'Impact attendu:'
\echo '  - Fetch du profil: 8000ms → 100-500ms'
\echo '  - Lookups RLS: Plus rapides'
\echo '  - Jointures: Plus performantes'
\echo ''
\echo '===================================================================='
