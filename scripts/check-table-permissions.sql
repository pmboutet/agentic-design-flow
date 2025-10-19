-- Script SQL à exécuter dans Supabase SQL Editor
-- pour vérifier les permissions de la table profiles

-- 1. Vérifier que RLS est activé
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'profiles';

-- 2. Vérifier les grants (permissions au niveau table)
SELECT 
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' 
  AND table_name = 'profiles';

-- 3. Lister toutes les policies actives sur profiles
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles';

-- 4. Tester directement avec auth.uid()
SELECT 
  'auth.uid() returns:' as info,
  auth.uid() as current_uid;

-- 5. Tester la fonction helper
SELECT 
  'is_full_admin() returns:' as info,
  public.is_full_admin() as result;

-- 6. Essayer de lire les profiles (devrait fonctionner si vous êtes admin)
SELECT 
  id,
  email,
  auth_id,
  role,
  is_active
FROM public.profiles
WHERE role IN ('admin', 'full_admin')
ORDER BY created_at DESC;

