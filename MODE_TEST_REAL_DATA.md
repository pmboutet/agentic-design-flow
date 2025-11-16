# Mode Test avec Données Réelles

## 🎯 Objectif

Le mode test de l'interface d'administration AI a été amélioré pour utiliser **exactement le même code** que le chat réel lors de la fusion des prompts. Cela garantit que ce que vous voyez dans le mode test correspond exactement à ce qui sera envoyé au modèle AI en production.

## ✨ Nouvelles Fonctionnalités

### 1. Utilisation des Vraies Données

Lorsque vous testez un agent avec une session ASK, le système récupère maintenant :

- ✅ **Le vrai historique des messages** de la conversation
- ✅ **Les vrais participants** et leurs informations
- ✅ **Le dernier message utilisateur** réel
- ✅ **Les données du projet** et du challenge associés
- ✅ **Les threads de conversation** avec leur contexte

### 2. Même Code que le Chat

Le mode test utilise exactement les mêmes fonctions que le chat en production :

```typescript
// Fonction partagée pour construire les variables
buildConversationAgentVariables({
  ask: askRow,
  project: projectData,
  challenge: challengeData,
  messages,
  participants,
});

// Fonction partagée pour obtenir la configuration de l'agent
getAgentConfigForAsk(supabase, askSessionId, agentVariables);
```

## 📊 Affichage des Résultats

Le mode test affiche maintenant :

### Métadonnées de la Session

Un badge informatif en haut des résultats montrant :
- Nombre de messages dans la conversation
- Nombre de participants
- Présence d'un projet lié
- Présence d'un challenge lié

### Variables Clés

Une section dédiée montrant les variables les plus importantes :
- **Dernier message utilisateur** : Le contenu du dernier message envoyé
- **Participants** : Liste formatée des participants
- **Historique des messages** : JSON structuré de tous les messages

### Prompts Fusionnés

Les prompts system et user fusionnés avec toutes les variables réelles substituées, exactement comme ils seront envoyés au modèle AI.

### Toutes les Variables

Un détail dépliable montrant toutes les variables utilisées avec leurs valeurs.

## 🔧 Comment Utiliser

### Pour l'Agent de Conversation (ask-conversation-response)

1. Allez dans **Admin > AI**
2. Trouvez l'agent `ask-conversation-response`
3. Cliquez sur **Mode test**
4. Sélectionnez une **session ASK** avec des messages existants
5. **Sélectionnez un participant** (obligatoire) pour simuler sa perspective
6. Cliquez sur **Tester**

### 👥 Pourquoi Sélectionner un Participant ?

La sélection du participant est **essentielle** car :

- **Threads de conversation** : Chaque participant peut avoir son propre thread de conversation selon la configuration de l'ASK (`audience_scope`, `response_mode`)
- **Messages différents** : Deux participants peuvent voir des messages différents selon les permissions et les threads
- **Perspective utilisateur** : Le système doit savoir "qui" teste pour récupérer les bonnes données
- **Fusion correcte** : Les variables peuvent être différentes selon le participant connecté

**Note** : Le mode test charge automatiquement les participants de la session ASK sélectionnée. Seuls les participants ayant un compte utilisateur lié (`user_id`) sont disponibles.

### Ce que le Système Fait

Le système va :
1. Récupérer le **thread de conversation** spécifique au participant sélectionné
2. Récupérer tous les **messages réels** de ce thread
3. Récupérer tous les **participants réels** de la session
4. Construire les **variables** exactement comme le fait le chat en production
5. Fusionner les **prompts** avec ces variables
6. Afficher le **résultat final** avec métadonnées

### Exemple de Résultat

```
📊 Données réelles : 15 messages • 3 participants • ✓ Projet • ✓ Challenge

Variables clés (extraites des données réelles)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Dernier message utilisateur :
┌─────────────────────────────────────────┐
│ Comment pouvons-nous améliorer l'UX ?   │
└─────────────────────────────────────────┘

Participants :
┌─────────────────────────────────────────┐
│ Jean Dupont (Admin), Marie Martin       │
│ (Participant), Pierre Durand (Observer) │
└─────────────────────────────────────────┘

Historique des messages :
┌─────────────────────────────────────────┐
│ [                                       │
│   {                                     │
│     "id": "msg-1",                      │
│     "senderType": "user",               │
│     "senderName": "Jean Dupont",        │
│     "content": "Bonjour!",              │
│     "timestamp": "2025-01-01T10:00:00Z" │
│   },                                    │
│   ...                                   │
│ ]                                       │
└─────────────────────────────────────────┘
```

## 🔄 Comparaison Avant/Après

### ❌ Avant

Le mode test utilisait des données mockées :
```typescript
message_history: 'Message 1: Test message\nMessage 2: Another test message'
latest_user_message: 'Test user message'
participants: 'Test User (Participant), Another User (Observer)'
```

**Problème** : Impossible de savoir si le prompt fusionné était correct avec des vraies données.

### ✅ Après

Le mode test utilise les vraies données de la session ASK sélectionnée :
```typescript
// Données extraites de la base de données
message_history: 'Jean: Bonjour!\nAgent: Bonjour Jean! Comment puis-je vous aider?\nJean: ...'
latest_user_message: 'Comment pouvons-nous améliorer l\'UX ?'
participants: 'Jean Dupont (Admin), Marie Martin (Participant), Pierre Durand (Observer)'
```

**Avantage** : Vous voyez exactement ce qui sera utilisé en production.

## 🎓 Cas d'Usage

### Debug d'un Prompt qui ne Fonctionne Pas

1. Un utilisateur signale un problème avec l'agent sur sa session ASK
2. Vous allez dans Admin > AI > Mode test
3. Vous sélectionnez la session ASK concernée
4. Vous voyez le prompt fusionné avec les vraies données
5. Vous identifiez le problème (variable manquante, format incorrect, etc.)

### Validation d'une Modification de Prompt

1. Vous modifiez le system prompt ou user prompt de l'agent
2. Vous sauvegardez
3. Vous testez avec une session ASK réelle
4. Vous vérifiez que la fusion est correcte
5. Vous confirmez que les variables sont bien substituées

### Audit de la Qualité des Données

1. Vous testez avec plusieurs sessions ASK différentes
2. Vous comparez les métadonnées (nombre de messages, participants)
3. Vous validez que toutes les données nécessaires sont présentes
4. Vous identifiez les sessions avec des données manquantes ou incorrectes

## 🔍 Code Source

### Backend

Le code se trouve dans `/src/app/api/admin/ai/agents/[id]/test/route.ts`

Points clés :
- Import de `buildConversationAgentVariables` depuis `/src/lib/ai/conversation-agent.ts`
- Import de `getAgentConfigForAsk` depuis `/src/lib/ai/agent-config.ts`
- Récupération des messages via `getMessagesForThread`
- Construction des participants de la même manière que dans le stream route

### Frontend

Le code se trouve dans `/src/components/admin/AgentTestMode.tsx`

Points clés :
- Affichage des métadonnées dans un badge informatif
- Section dédiée pour les variables clés
- Format JSON pour l'historique des messages
- Support des types variables complexes (objets, arrays)

## 📝 Notes Techniques

### Pourquoi c'est Important

Le mode test était auparavant déconnecté de la réalité de production. En utilisant le même code que le chat :

1. **Fiabilité** : Ce que vous testez est ce qui sera utilisé
2. **Consistance** : Pas de divergence entre test et production
3. **Debug** : Vous pouvez reproduire exactement les problèmes en production
4. **Confiance** : Vous savez que si ça marche en test, ça marchera en prod

### Limites Actuelles

- Le mode test ne supporte actuellement que l'agent `ask-conversation-response`
- Pour les autres agents, le comportement reste inchangé (utilise renderTemplate)
- Le mode test ne peut pas tester l'exécution réelle du modèle AI (seulement la fusion des prompts)

## 🚀 Prochaines Étapes

Améliorations possibles :

1. **Support de tous les agents** : Étendre la logique de données réelles aux autres types d'agents
2. **Test d'exécution** : Ajouter une option pour exécuter réellement l'agent et voir sa réponse
3. **Comparaison de versions** : Permettre de comparer les prompts fusionnés avant/après une modification
4. **Export** : Ajouter un bouton pour exporter les résultats du test en JSON/TXT

## 💡 Conseils

- Testez toujours avec plusieurs sessions ASK différentes pour valider votre agent
- Vérifiez les métadonnées pour vous assurer d'avoir assez de données (minimum 2-3 messages)
- Utilisez les sessions ASK actives en production pour des tests réalistes
- Si le dernier message utilisateur est vide, cela peut indiquer un problème de données

