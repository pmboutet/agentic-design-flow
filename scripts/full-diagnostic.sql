-- ============================================================================
-- DIAGNOSTIC COMPLET - À exécuter dans Supabase SQL Editor
-- ============================================================================

-- 1. VÉRIFIER QUE VOUS ÊTES AUTHENTIFIÉ
SELECT 
  '1️⃣ AUTHENTIFICATION' as section,
  auth.uid() as votre_auth_id,
  CASE 
    WHEN auth.uid() IS NULL THEN '❌ Non authentifié!'
    ELSE '✅ Authentifié'
  END as status;

-- 2. VÉRIFIER SI VOTRE PROFIL EXISTE
SELECT 
  '2️⃣ VOTRE PROFIL' as section,
  id,
  email,
  auth_id,
  role,
  is_active,
  CASE 
    WHEN auth_id = auth.uid() THEN '✅ Correspondance OK'
    ELSE '❌ auth_id ne correspond pas'
  END as correspondance
FROM public.profiles
WHERE auth_id = auth.uid();

-- Si aucune ligne retournée ci-dessus, c'est le problème!
-- Vérifiez tous les profils pour trouver le vôtre:
SELECT 
  '3️⃣ TOUS LES PROFILS' as section,
  id,
  email,
  auth_id,
  role,
  is_active
FROM public.profiles
ORDER BY created_at DESC;

-- 4. VÉRIFIER LES GRANTS SUR LA TABLE PROFILES
SELECT 
  '4️⃣ GRANTS SUR PROFILES' as section,
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' 
  AND table_name = 'profiles';

-- 5. VÉRIFIER QUE RLS EST ACTIVÉ
SELECT 
  '5️⃣ RLS STATUS' as section,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'profiles';

-- 6. VÉRIFIER LES POLICIES RLS
SELECT 
  '6️⃣ POLICIES RLS' as section,
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'profiles';

-- 7. TESTER LA FONCTION is_full_admin()
SELECT 
  '7️⃣ TEST is_full_admin()' as section,
  public.is_full_admin() as resultat,
  CASE 
    WHEN public.is_full_admin() THEN '✅ Vous êtes admin'
    ELSE '❌ Pas admin ou profil non trouvé'
  END as status;

-- 8. COMPTER LES PROFILS VISIBLES
SELECT 
  '8️⃣ PROFILS VISIBLES' as section,
  COUNT(*) as nombre_profiles_visibles,
  CASE 
    WHEN COUNT(*) = 0 THEN '❌ Aucun profil visible (problème de grants ou RLS)'
    WHEN COUNT(*) = 1 THEN '⚠️ Seulement votre profil visible (normal si pas admin)'
    ELSE '✅ Plusieurs profils visibles (vous êtes admin)'
  END as interpretation
FROM public.profiles;

-- 9. LISTER LES AUTH USERS (nécessite service_role dans certains cas)
-- Cette requête peut échouer, c'est normal
SELECT 
  '9️⃣ AUTH USERS' as section,
  id,
  email,
  created_at
FROM auth.users
ORDER BY created_at DESC;

