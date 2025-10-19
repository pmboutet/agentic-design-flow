# Fix RLS Permission Issues - COMPLETE ✅

## Problème Identifié

Vous obteniez l'erreur "permission denied for table" malgré un rôle admin valide car :

1. **Les routes API utilisaient le service role** (`getAdminSupabaseClient()`)
2. **Le service role bypass RLS** - il n'a pas de contexte d'authentification (`auth.uid()` = NULL)
3. **Les policies RLS dépendent de `auth.uid()`** pour identifier l'utilisateur

## Solution Implémentée

### 1. Nouveau fichier créé: `src/lib/supabaseServer.ts`

Ce fichier expose:
- `createServerSupabaseClient()` - Client qui respecte RLS avec le JWT de l'utilisateur
- `requireAdmin()` - Vérifie que l'utilisateur est admin avant d'autoriser l'accès
- `getCurrentUser()` - Récupère l'utilisateur authentifié

### 2. Routes API mises à jour

#### Routes principales (GET/POST) ✅
- `/api/admin/clients/route.ts`
- `/api/admin/profiles/route.ts`
- `/api/admin/projects/route.ts`
- `/api/admin/challenges/route.ts`
- `/api/admin/asks/route.ts`

#### Routes de détail (GET/PATCH/DELETE) ✅
- `/api/admin/clients/[id]/route.ts`
- `/api/admin/profiles/[id]/route.ts`
- `/api/admin/projects/[id]/route.ts`
- `/api/admin/challenges/[id]/route.ts`
- `/api/admin/asks/[id]/route.ts`

### 3. Pattern utilisé

**AVANT:**
```typescript
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";

export async function GET() {
  const supabase = getAdminSupabaseClient(); // ❌ Bypass RLS
  const { data, error } = await supabase.from("clients").select("*");
  // ...
}
```

**APRÈS:**
```typescript
import { createServerSupabaseClient, requireAdmin } from "@/lib/supabaseServer";

export async function GET() {
  await requireAdmin(); // ✅ Vérifie le rôle admin
  const supabase = await createServerSupabaseClient(); // ✅ Respecte RLS
  const { data, error } = await supabase.from("clients").select("*");
  // ...
}
```

## Comment RLS fonctionne maintenant

1. **L'utilisateur se connecte** → Supabase génère un JWT avec `auth.uid()`
2. **Le front-end appelle `/api/admin/clients`**
3. **La route API:**
   - Appelle `requireAdmin()` qui vérifie le profil dans la DB
   - Crée un client avec `createServerSupabaseClient()` qui utilise le JWT
4. **La requête DB passe par RLS:**
   - La policy `public.is_full_admin()` est évaluée
   - Elle utilise `auth.uid()` pour trouver le profil
   - Elle vérifie `role IN ('admin','full_admin')` et `is_active = true`
5. **L'accès est accordé** ✅

## Vérification

Pour tester, connectez-vous avec votre compte admin et rechargez la page admin.
Les tables devraient maintenant charger correctement.

### En cas de problème persistant

1. **Vérifiez les cookies de session:**
```bash
# Dans la console du navigateur
document.cookie
# Devrait contenir des cookies Supabase
```

2. **Vérifiez l'authentification:**
```sql
-- Dans Supabase SQL Editor
SELECT auth.uid(); -- Devrait retourner votre ID utilisateur
```

3. **Vérifiez votre profil:**
```sql
SELECT * FROM public.profiles 
WHERE auth_id = auth.uid();
-- Devrait montrer role='admin' ou 'full_admin' et is_active=true
```

4. **Testez manuellement la policy:**
```sql
SELECT public.is_full_admin();
-- Devrait retourner true
```

## Notes Importantes

- **Service role toujours utilisé pour `auth.admin` operations** (création d'utilisateurs auth)
- **Codes d'erreur HTTP mis à jour:** 403 pour les erreurs d'autorisation
- **Les autres routes admin** (AI, members, etc.) doivent être mises à jour avec le même pattern

## Routes Restantes à Mettre à Jour

Ces routes utilisent encore le service role mais ne sont pas critiques pour le dashboard admin principal:
- `/api/admin/projects/[id]/journey/route.ts`
- `/api/admin/projects/[id]/members/*.ts`
- `/api/admin/ai/**/*.ts`
- Routes de génération AI (challenge-builder, ask-generator, etc.)

Ces routes peuvent être mises à jour plus tard avec le même pattern.

