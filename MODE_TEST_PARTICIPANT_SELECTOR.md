# 👥 Sélecteur de Participant - Mode Test

## 🎯 Problème Résolu

Avant, le mode test utilisait `null` comme `userId` lors de la récupération des données, ce qui posait plusieurs problèmes :

1. **Thread incorrect** : Le système ne savait pas quel thread de conversation charger
2. **Messages manquants** : Certains messages pouvaient être manquants selon les permissions
3. **Variables incorrectes** : Les variables construites ne correspondaient pas à la réalité d'un utilisateur spécifique
4. **Fusion inexacte** : Le prompt fusionné ne reflétait pas la perspective d'un vrai participant

## ✅ Solution Implémentée

Un **sélecteur de participant** a été ajouté au mode test pour :

- ✅ Choisir quel participant/utilisateur on veut simuler
- ✅ Récupérer le bon thread de conversation pour ce participant
- ✅ Obtenir les messages réels que ce participant verrait
- ✅ Construire les variables exactement comme en production
- ✅ Tester avec la vraie perspective utilisateur

## 🔧 Fonctionnalités

### Chargement Automatique des Participants

Lorsqu'une session ASK est sélectionnée, le système :

1. Charge automatiquement tous les participants de cette session
2. Filtre pour ne garder que ceux qui ont un `user_id` (compte utilisateur lié)
3. Affiche leur nom ou email dans le sélecteur
4. Auto-sélectionne le premier participant disponible

### Interface Utilisateur

```
┌───────────────────────────────────────────────────────────────┐
│ Sélectionner une session ASK                                  │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ ASK-2024-001 - Comment améliorer notre UX ?            ▼ │ │
│ └───────────────────────────────────────────────────────────┘ │
│                                                               │
│ Sélectionner un participant (pour simuler sa perspective)    │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ Jean Dupont                                             ▼ │ │
│ │ Marie Martin                                              │ │
│ │ Pierre Durand                                             │ │
│ └───────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

### Messages d'Avertissement

Le système affiche des avertissements utiles :

#### Aucun participant trouvé
```
⚠️ Aucun participant avec compte utilisateur trouvé pour cette session
```

#### Participants sans user_id
```
⚠️ Aucun participant n'a de compte utilisateur lié (user_id)
```

#### Chargement en cours
```
Chargement des participants...
```

## 🔄 Flux de Données

### 1. Sélection de la Session ASK

```typescript
// Frontend
setSelectedAskId(askId)
  ↓
// Appel API
GET /api/admin/asks/${askId}/participants
  ↓
// Backend
- Récupère les participants de la session
- Charge les infos utilisateur pour chaque participant
- Construit le nom d'affichage
- Retourne la liste
  ↓
// Frontend
- Affiche les participants dans le sélecteur
- Auto-sélectionne le premier avec user_id
```

### 2. Test avec Participant Sélectionné

```typescript
// Frontend
POST /api/admin/ai/agents/${agentId}/test
{
  askSessionId: "...",
  userId: selectedParticipantUserId  // ← IMPORTANT !
}
  ↓
// Backend
- Utilise userId pour getOrCreateConversationThread()
- Récupère le thread spécifique à ce participant
- Charge les messages de ce thread
- Construit les variables avec ces données
- Fusionne les prompts
- Retourne le résultat
```

## 📁 Fichiers Créés/Modifiés

### 1. Nouvel Endpoint API

**`/src/app/api/admin/asks/[id]/participants/route.ts`** (NOUVEAU)

Endpoint pour récupérer les participants d'une session ASK :

```typescript
GET /api/admin/asks/:id/participants

Response:
{
  success: true,
  data: [
    {
      id: "participant-1",
      userId: "user-123",
      participantName: "Jean Dupont",
      participantEmail: "jean@example.com",
      role: "admin",
      isSpokesperson: false
    },
    ...
  ]
}
```

### 2. Backend de Test Modifié

**`/src/app/api/admin/ai/agents/[id]/test/route.ts`**

Changements :

```typescript
interface TestRequest {
  askSessionId?: string;
  userId?: string;  // ← AJOUTÉ
  ...
}

// Utilise userId au lieu de null
const profileId = body.userId || null;

const { thread } = await getOrCreateConversationThread(
  supabase,
  askRow.id,
  profileId,  // ← Maintenant utilise le vrai userId !
  askConfig
);
```

### 3. Frontend Amélioré

**`/src/components/admin/AgentTestMode.tsx`**

Ajouts :

- État `participants` pour stocker la liste
- État `selectedParticipantUserId` pour le participant sélectionné
- État `isLoadingParticipants` pour l'indicateur de chargement
- `useEffect` pour charger les participants quand une ASK est sélectionnée
- Sélecteur de participant dans l'UI
- Validation pour s'assurer qu'un participant est sélectionné
- Envoi du `userId` dans la requête de test

## 🎓 Cas d'Usage

### Scénario 1 : Tester avec Différents Participants

Une session ASK a 3 participants. Vous voulez vérifier que l'agent fonctionne bien pour chacun :

1. Sélectionnez la session ASK
2. Choisissez **Jean Dupont** → Testez
   - Voir les messages de son thread
3. Choisissez **Marie Martin** → Testez
   - Voir les messages de son thread (peut être différent !)
4. Choisissez **Pierre Durand** → Testez
   - Voir les messages de son thread

**Résultat** : Vous validez que l'agent fonctionne pour tous les participants, avec leurs données spécifiques.

### Scénario 2 : Debug d'un Problème Spécifique

Un utilisateur "Marie Martin" signale un problème :

1. Sélectionnez sa session ASK
2. Choisissez **Marie Martin** dans le sélecteur
3. Testez pour voir exactement ce qu'elle voit
4. Identifiez le problème dans ses messages/variables

**Résultat** : Vous reproduisez exactement le problème qu'elle rencontre.

### Scénario 3 : Valider les Threads de Conversation

Configuration : `response_mode: "individual"` (threads séparés par participant)

1. Sélectionnez la session ASK
2. Testez avec **Jean** : 5 messages affichés
3. Testez avec **Marie** : 8 messages affichés (différent !)

**Résultat** : Vous vérifiez que les threads individuels fonctionnent correctement.

## ⚠️ Limitations et Avertissements

### Participants Sans user_id

Si un participant n'a pas de `user_id` :
- Il n'apparaîtra PAS dans le sélecteur
- Vous ne pouvez pas tester avec ce participant
- **Solution** : Lier le participant à un compte utilisateur dans la base de données

### Sessions Sans Participants

Si une session ASK n'a aucun participant avec `user_id` :
- Le sélecteur sera vide
- Un message d'avertissement s'affichera
- Le test sera impossible
- **Solution** : Ajouter des participants à la session

### Auto-Sélection

Le système auto-sélectionne le premier participant avec `user_id` :
- Pratique pour les tests rapides
- Mais vérifiez que c'est bien celui que vous voulez tester
- Changez si nécessaire avant de tester

## 📊 Données Techniques

### Structure Participant

```typescript
interface Participant {
  id: string;                      // ID du participant dans ask_participants
  user_id: string | null;          // ID de l'utilisateur dans profiles
  participant_name: string | null; // Nom personnalisé
  participant_email: string | null;// Email personnalisé
}
```

### Priorité pour le Nom d'Affichage

1. `participant_name` (si défini)
2. `user.full_name` (si disponible)
3. `user.first_name + user.last_name` (si disponibles)
4. `user.email` (si disponible)
5. `"Participant"` (par défaut)

### Filtrage

Seuls les participants avec `user_id !== null` sont affichés, car :
- On a besoin d'un user_id pour récupérer le thread
- C'est obligatoire pour `getOrCreateConversationThread()`
- Impossible de simuler un participant sans compte utilisateur

## 🎉 Avantages

1. **Précision** : Test avec les vraies données d'un vrai participant
2. **Flexibilité** : Possibilité de tester plusieurs perspectives
3. **Debug** : Reproduction exacte des problèmes utilisateur
4. **Validation** : Vérification que tous les participants voient les bonnes données
5. **Confiance** : Ce que vous testez est ce qui sera utilisé en production

## 🚀 Prochaines Améliorations Possibles

1. **Comparaison multi-participants** : Afficher côte à côte les résultats de plusieurs participants
2. **Filtrage avancé** : Filtrer par rôle (admin, participant, observer)
3. **Indicateur de messages** : Afficher le nombre de messages par participant
4. **Dernière activité** : Afficher quand le participant a été actif pour la dernière fois
5. **Création rapide** : Bouton pour créer/lier un participant rapidement si aucun n'existe

