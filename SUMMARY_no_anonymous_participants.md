# Résumé: Aucun Participant Anonyme

## Décision de Design

**TOUS les participants DOIVENT avoir un `user_id` lié à un profil utilisateur.**

Il n'existe AUCUN participant anonyme dans le système.

---

## Rationale

### Pourquoi cette décision ?

1. **Sécurité et Responsabilité**
   - Chaque action (message, vote, etc.) doit être attribuée à un utilisateur réel
   - Traçabilité complète pour l'audit et la modération
   - Pas de contenu orphelin sans propriétaire

2. **Authentification via Invite Token**
   - Les invite tokens sont des liens magiques personnalisés
   - Ils doivent identifier un utilisateur spécifique
   - Sans `user_id`, l'authentification échoue avec 403

3. **Intégrité des Données**
   - Évite les participants "fantômes" dans la base de données
   - Relations claires entre tables (foreign keys)
   - Pas de données orphelines difficiles à nettoyer

4. **Expérience Utilisateur**
   - Les participants sans compte ne peuvent pas participer
   - Les admins doivent explicitement créer un profil par email
   - Les erreurs sont claires et actionnables

---

## Implémentation

### Base de Données

```sql
-- Migration 044: Enforcement strict
ALTER TABLE public.ask_participants
ALTER COLUMN user_id SET NOT NULL;

-- Tous les participants existants sans user_id sont SUPPRIMÉS
DELETE FROM public.ask_participants
WHERE user_id IS NULL;
```

### Code Backend

**Création de participants** (`/api/admin/asks/route.ts`)
```typescript
// ✅ CORRECT: Toujours créer un profil via ensureProfileExists()
const profileId = await ensureProfileExists(email, projectId);
participantRecords.push({
  ask_session_id: askId,
  user_id: profileId, // REQUIS
  participant_email: email,
  role: "participant"
});

// ❌ INTERDIT: Plus possible depuis migration 045
participantRecords.push({
  ask_session_id: askId,
  participant_email: email, // Pas de user_id
  role: "participant"
});
```

**Authentification** (`/api/ask/[key]/route.ts`)
```typescript
// Validation stricte du token
if (!participant.user_id) {
  return NextResponse.json({
    success: false,
    error: "Ce lien d'invitation n'est pas correctement configuré."
  }, { status: 403 });
}

// Validation finale
if (!profileId) {
  return NextResponse.json({
    success: false,
    error: "Authentification requise avec un profil utilisateur valide."
  }, { status: 403 });
}
```

---

## Cas d'Usage

### ✅ Scénario Supporté: Participant avec Email

1. Admin ajoute un participant par email dans le dashboard
2. Système crée automatiquement:
   - Un compte auth user (passwordless)
   - Un profil utilisateur (`profiles` table)
   - Un participant avec `user_id` lié au profil
3. Admin envoie le lien d'invitation par email
4. Participant clique sur le lien magique
5. Système authentifie via invite token → extrait `user_id`
6. Participant peut poster des messages
7. Messages sont liés au `user_id`

### ✅ Scénario Supporté: Participant Existant

1. Admin ajoute un utilisateur existant (de la liste)
2. Système crée un participant avec le `user_id` existant
3. Système génère un invite token automatiquement
4. Admin envoie l'invitation
5. Utilisateur clique sur le lien
6. Authentification réussie via token

### ❌ Scénario NON Supporté: Participant "Guest"

1. ~~Admin essaie d'ajouter un participant "anonyme"~~
2. ~~Système devrait créer un participant sans `user_id`~~
3. **REJETÉ** - La base de données refuse l'insertion (NOT NULL constraint)
4. **REJETÉ** - Le code refuse de créer sans profil

### ❌ Scénario NON Supporté: Orphan Token

1. ~~Participant avec invite token mais sans `user_id`~~
2. ~~Utilisateur clique sur le lien d'invitation~~
3. **REJETÉ** - API retourne 403 lors de l'authentification
4. Message d'erreur: "Ce lien d'invitation n'est pas correctement configuré"

---

## Migration pour Déploiements Existants

### Étape 1: Vérifier les Données

```bash
# Avant la migration, voir ce qui va être supprimé
psql $DATABASE_URL -f migrations/045_pre_check_user_id.sql
```

Cette commande affiche:
- Nombre de participants orphelins
- Détails de chaque participant sans `user_id`
- ASK sessions impactées
- Messages qui perdront leur attribution

### Étape 2: Sauvegarder les Données (Optionnel)

```bash
# Exporter les participants orphelins avant suppression
psql $DATABASE_URL -c "COPY (SELECT * FROM ask_participants WHERE user_id IS NULL) TO STDOUT CSV HEADER" > orphan_participants_backup.csv
```

### Étape 3: Exécuter la Migration

```bash
psql $DATABASE_URL -f migrations/045_require_user_id_for_participants.sql
```

### Étape 4: Re-créer les Participants

Pour chaque participant supprimé:
1. Aller dans le dashboard admin
2. Éditer l'ASK session correspondante
3. Re-ajouter le participant par email
4. Système créera automatiquement le profil + `user_id`
5. Re-envoyer l'email d'invitation

---

## Messages d'Erreur

### Pour les Utilisateurs

**403 Forbidden**
```
Ce lien d'invitation n'est pas correctement configuré.
Contactez l'administrateur pour qu'il regénère votre lien d'accès.
```

**Cause**: Le participant a un invite token mais pas de `user_id`

**Solution pour l'admin**:
1. Supprimer le participant orphelin
2. Re-créer le participant via le dashboard
3. Envoyer un nouveau lien d'invitation

### Pour les Admins

**Logs Console**
```
❌ Failed to create profile for john@example.com: [error details]
⚠️  Failed to create participants for emails (no user_id assigned): john@example.com
⚠️  These participants will NOT be created. All participants must have a linked user profile.
```

**Cause**: La création du profil a échoué (email invalide, erreur réseau, etc.)

**Solution**:
1. Vérifier que l'email est valide
2. Vérifier la connectivité à Supabase Auth
3. Réessayer la création du participant

---

## Tests de Non-Régression

### Test 1: Création Normale
```typescript
// ✅ Doit réussir
POST /api/admin/asks
{
  participantEmails: ["valid@example.com"]
}
// Vérifie que le participant a un user_id
```

### Test 2: Email Invalide
```typescript
// ⚠️  Doit échouer silencieusement
POST /api/admin/asks
{
  participantEmails: ["invalid-email"]
}
// Vérifie que le participant N'est PAS créé
// Vérifie les logs montrent l'erreur
```

### Test 3: Authentification via Token
```typescript
// ✅ Doit réussir si user_id présent
POST /api/ask/[key]
headers: { 'X-Invite-Token': 'valid-token-with-user' }

// ❌ Doit échouer si user_id absent
POST /api/ask/[key]
headers: { 'X-Invite-Token': 'orphan-token-no-user' }
// Vérifie 403 avec message clair
```

### Test 4: Voice Mode
```typescript
// ✅ Doit réussir avec token valide
// Activer voice mode via invite link
// Parler un message
// Vérifie que le message a un user_id
```

---

## Fichiers Modifiés

### Code
- `src/app/api/ask/[key]/route.ts` - Validation stricte GET et POST
- `src/app/api/admin/asks/route.ts` - Prévention création orphelins

### Base de Données
- `migrations/045_require_user_id_for_participants.sql` - Enforcement
- `migrations/045_pre_check_user_id.sql` - Vérification pré-migration

### Documentation
- `docs/PARTICIPANT_AUTHENTICATION.md` - Guide complet
- `CHANGELOG_voice_fixes.md` - Détails techniques
- `SUMMARY_no_anonymous_participants.md` - Ce document

---

## Points Clés à Retenir

1. ✅ **Tous les participants ont un `user_id` (NOT NULL)**
2. ✅ **Pas de participants anonymes**
3. ✅ **Les invite tokens nécessitent un profil utilisateur**
4. ✅ **Les messages sont toujours attribués à un utilisateur**
5. ✅ **La migration 045 nettoie les orphelins existants**
6. ✅ **Le code refuse de créer des orphelins**
7. ✅ **Les erreurs sont claires et actionnables**

---

## Support

Pour toute question ou problème:
1. Consulter les logs serveur
2. Vérifier la base de données avec `044_pre_check.sql`
3. Consulter `docs/PARTICIPANT_AUTHENTICATION.md`
4. Consulter `CHANGELOG_voice_fixes.md`
