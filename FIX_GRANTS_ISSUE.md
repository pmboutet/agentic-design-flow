# Fix "Profile not found" Issue 🔐

## 🎯 Problème Identifié

Vous voyez maintenant "**Profile not found**" au lieu de "permission denied". C'est du progrès!

### Ce qui s'est passé

1. ✅ Le fix RLS fonctionne (plus de "permission denied for table")
2. ✅ Les routes utilisent maintenant le client authentifié
3. ❌ **MAIS**: Les GRANTS de base sur les tables sont manquants

## 📚 Explication Technique

### Deux niveaux de sécurité PostgreSQL

PostgreSQL a **deux niveaux** de permissions:

#### 1. **GRANTS** (Permissions de base)
```sql
GRANT SELECT ON public.profiles TO authenticated;
```
= "Le rôle `authenticated` peut SELECT sur la table"

#### 2. **RLS Policies** (Filtres de sécurité)
```sql
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth_id = auth.uid());
```
= "Parmi les lignes accessibles, ne montrer que celles qui correspondent"

### Le Problème

Votre migration 014 a activé **RLS et créé les policies**, mais **n'a pas ajouté les GRANTS de base**.

Résultat: Les policies ne peuvent même pas s'exécuter car le rôle `authenticated` n'a pas le droit de toucher la table.

## ✅ Solution

### Option 1: Via Supabase Dashboard (Recommandé)

1. **Allez dans Supabase Dashboard** → SQL Editor
2. **Ouvrez** le fichier `migrations/015_fix_table_grants.sql`
3. **Copiez tout le contenu**
4. **Collez et exécutez** dans SQL Editor
5. ✅ C'est fait!

### Option 2: Via Script (si ça marche)

```bash
node scripts/apply-migration-015.js
```

⚠️ **Note**: Le script peut ne pas fonctionner directement car Supabase ne permet pas toujours l'exécution de SQL arbitraire via l'API. Utilisez l'option 1.

## 🧪 Vérifier que ça fonctionne

### Dans Supabase SQL Editor

```sql
-- Devrait retourner plusieurs lignes avec 'authenticated' comme grantee
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' 
  AND table_name = 'profiles';
```

Vous devriez voir:
```
grantee          | privilege_type
-----------------+---------------
authenticated    | SELECT
authenticated    | INSERT
authenticated    | UPDATE
authenticated    | DELETE
```

### Tester votre accès

```sql
-- Devrait retourner votre profil
SELECT * FROM public.profiles WHERE auth_id = auth.uid();

-- Devrait retourner true si vous êtes admin
SELECT public.is_full_admin();
```

## 🎉 Après le Fix

1. **Rechargez votre dashboard admin** (`/admin`)
2. Les données devraient maintenant charger correctement
3. Plus d'erreur "Profile not found"!

## 📋 Ce que la migration 015 fait

```sql
-- Donne les permissions de base au rôle authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
-- ... et toutes les autres tables
```

**Important**: Ces GRANTS sont filtrés par les RLS policies!
- Un utilisateur normal ne verra que ses données (via RLS)
- Un admin verra tout (via RLS policy `is_full_admin()`)
- Le service role bypass tout (pas affecté par RLS)

## 🔍 Pourquoi ce problème existe?

La migration 014 a créé:
- ✅ `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- ✅ `CREATE POLICY ...`

Mais a oublié:
- ❌ `GRANT ... TO authenticated`

C'est une erreur commune lors de la configuration de RLS. Les deux sont nécessaires!

## 🚨 Si le problème persiste

1. **Vérifiez que vous êtes bien connecté**
   - Déconnectez-vous
   - Reconnectez-vous
   - Vérifiez les cookies dans DevTools

2. **Vérifiez votre profil dans la DB**
```sql
SELECT id, email, auth_id, role, is_active
FROM public.profiles
WHERE email = 'votre@email.com';
```

3. **Vérifiez la correspondance auth_id**
```sql
-- Dans SQL Editor (connecté avec votre compte)
SELECT 
  auth.uid() as mon_auth_id,
  (SELECT auth_id FROM public.profiles WHERE auth_id = auth.uid()) as profile_auth_id,
  CASE 
    WHEN auth.uid() = (SELECT auth_id FROM public.profiles WHERE auth_id = auth.uid())
    THEN '✅ Correspondance OK'
    ELSE '❌ Pas de correspondance'
  END as status;
```

---

**Une fois la migration 015 appliquée, le dashboard admin devrait fonctionner complètement! 🎊**

