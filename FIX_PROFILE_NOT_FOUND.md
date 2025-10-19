# Fix "Profile not found" - Diagnostic et Solutions 🔍

## 🎯 Diagnostic Étape par Étape

### Étape 1: Exécuter le Diagnostic

1. **Allez dans Supabase Dashboard** → SQL Editor
2. **Ouvrez** le fichier `scripts/full-diagnostic.sql`
3. **Copiez et exécutez** tout le contenu
4. **Regardez les résultats** de chaque section

---

## 🔍 Interprétation des Résultats

### Section 1️⃣: Authentification

**Si `votre_auth_id` est NULL:**
- ❌ Vous n'êtes pas authentifié dans le SQL Editor
- **Solution**: Le SQL Editor utilise son propre contexte. C'est normal si vous testez ici.
- Continuez avec les autres sections.

**Si `votre_auth_id` a une valeur:**
- ✅ Vous êtes authentifié
- Notez cette valeur (vous en aurez besoin)

### Section 2️⃣: Votre Profil

**Si AUCUNE ligne retournée:**
- ❌ **C'EST LE PROBLÈME!** Votre profil n'existe pas ou l'auth_id ne correspond pas
- Allez à la section "Solutions" ci-dessous

**Si UNE ligne retournée:**
- Vérifiez que `role` = 'admin' ou 'full_admin'
- Vérifiez que `is_active` = true
- Vérifiez que `correspondance` = '✅ Correspondance OK'

### Section 3️⃣: Tous les Profils

**Si AUCUNE ligne retournée:**
- ❌ Problème de GRANTS - les permissions de base sont manquantes
- **Solution**: Exécutez la migration 015 (voir ci-dessous)

**Si plusieurs lignes retournées:**
- ✅ Les grants fonctionnent
- Cherchez votre email dans la liste
- Si absent → il faut créer votre profil

### Section 4️⃣: Grants sur Profiles

**Vous devriez voir:**
```
authenticated | SELECT
authenticated | INSERT
authenticated | UPDATE
authenticated | DELETE
```

**Si manquant:**
- ❌ Les grants ne sont pas en place
- **Solution**: Exécutez la migration 015

### Section 7️⃣: Test is_full_admin()

**Si retourne `false` ou erreur:**
- ❌ La fonction ne vous reconnaît pas comme admin
- Vérifiez la section 2️⃣ pour voir votre rôle

---

## ✅ Solutions

### Solution A: Exécuter la Migration 015 (Si grants manquants)

Dans Supabase SQL Editor, exécutez:

```sql
-- Migration 015: Fix table GRANTS
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Core tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.challenges TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ask_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ask_participants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;

-- Insight tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insights TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insight_authors TO authenticated;
GRANT SELECT ON public.insight_types TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.insight_types TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.challenge_insights TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.challenge_foundation_insights TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_estimations TO authenticated;

-- AI tables
GRANT SELECT ON public.ai_model_configs TO authenticated;
GRANT SELECT ON public.ai_agents TO authenticated;
GRANT SELECT ON public.ai_agent_logs TO authenticated;
GRANT SELECT ON public.ai_insight_jobs TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ai_model_configs TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ai_agents TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ai_agent_logs TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ai_insight_jobs TO authenticated;

-- Documents
GRANT SELECT ON public.documents TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.documents TO authenticated;

-- Grant sequence usage
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Service role
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
```

### Solution B: Créer ou Corriger Votre Profil

Si votre profil n'existe pas ou l'auth_id ne correspond pas:

#### B1: Trouver votre auth.uid() réel

Dans votre application (console navigateur):
```javascript
// Exécutez ceci dans la console
const { data } = await supabase.auth.getUser()
console.log('Mon auth ID:', data.user?.id)
```

#### B2: Créer/Corriger le profil dans SQL Editor

**Si le profil n'existe pas du tout:**
```sql
-- Remplacez 'VOTRE_AUTH_ID' et 'votre@email.com' par vos valeurs
INSERT INTO public.profiles (auth_id, email, role, is_active, full_name)
VALUES (
  'VOTRE_AUTH_ID',  -- UUID de auth.users.id
  'votre@email.com',
  'admin',
  true,
  'Votre Nom'
);
```

**Si le profil existe mais auth_id est NULL ou incorrect:**
```sql
-- Remplacez les valeurs
UPDATE public.profiles
SET auth_id = 'VOTRE_AUTH_ID'  -- UUID de auth.users.id
WHERE email = 'votre@email.com';
```

**Si le profil existe mais n'est pas admin:**
```sql
UPDATE public.profiles
SET role = 'admin', is_active = true
WHERE email = 'votre@email.com';
```

### Solution C: Vérification de Session

Si tout semble correct mais ça ne fonctionne toujours pas:

1. **Déconnectez-vous complètement**
2. **Videz le cache du navigateur**
   - Chrome: F12 → Application → Clear site data
   - Firefox: F12 → Storage → Clear All
3. **Reconnectez-vous**
4. **Vérifiez dans la console que auth.uid() retourne une valeur**

---

## 🧪 Test Final

Après avoir appliqué une solution, testez dans SQL Editor:

```sql
-- Test 1: Votre profil est visible
SELECT * FROM public.profiles WHERE auth_id = auth.uid();
-- Devrait retourner 1 ligne

-- Test 2: Vous êtes admin
SELECT public.is_full_admin();
-- Devrait retourner true

-- Test 3: Vous pouvez voir des clients
SELECT COUNT(*) FROM public.clients;
-- Devrait retourner un nombre > 0
```

Si ces 3 tests passent, rechargez votre dashboard admin et tout devrait fonctionner! 🎉

---

## 📝 Checklist de Résolution

- [ ] Exécuté le diagnostic complet
- [ ] Identifié le problème spécifique
- [ ] Appliqué la migration 015 (si grants manquants)
- [ ] Vérifié/créé mon profil avec le bon auth_id
- [ ] Vérifié que role = 'admin' et is_active = true
- [ ] Déconnecté/reconnecté pour nouvelle session
- [ ] Tests SQL passent tous
- [ ] Dashboard admin fonctionne

---

**Si après tout ça, ça ne fonctionne toujours pas, partagez les résultats du diagnostic complet et je vous aiderai plus spécifiquement!**

