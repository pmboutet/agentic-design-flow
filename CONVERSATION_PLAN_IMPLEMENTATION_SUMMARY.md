# Résumé de l'implémentation : Plan de conversation guidé

## Vue d'ensemble

Le système de **plan de conversation guidé** a été implémenté avec succès pour les sessions ASK. Ce système permet de structurer les discussions en étapes claires, avec génération automatique du plan par IA et suivi progressif des échanges.

## Composants implémentés

### 1. Base de données

**Migration créée** : `migrations/057_add_conversation_plans.sql`

- Table `ask_conversation_plans` avec :
  - `id` : UUID du plan
  - `conversation_thread_id` : Lien vers le thread de conversation
  - `plan_data` : Structure JSON contenant les étapes
  - `current_step_id` : ID de l'étape courante active
  - Timestamps de création et mise à jour
- Indexes pour optimiser les requêtes
- RLS policies complètes pour sécuriser l'accès (authenticated, anon, service_role)

**Structure du plan JSON** :
```json
{
  "steps": [
    {
      "id": "step_1",
      "title": "Titre de l'étape",
      "objective": "Objectif détaillé",
      "status": "pending|active|completed|skipped",
      "summary": "Résumé optionnel",
      "created_at": "ISO timestamp",
      "completed_at": "ISO timestamp ou null"
    }
  ]
}
```

### 2. Service de gestion des plans

**Fichier** : `src/lib/ai/conversation-plan.ts`

**Fonctions principales** :
- `generateConversationPlan()` : Génère un plan via l'agent IA
- `createConversationPlan()` : Stocke un plan en base de données
- `getConversationPlan()` : Récupère le plan d'un thread
- `updatePlanStep()` : Met à jour une étape et active la suivante
- `summarizeStepMessages()` : Résume les messages d'une étape (préparé pour future amélioration)
- `getCurrentStep()` : Obtient l'étape active
- `formatPlanForPrompt()` : Formate le plan pour les prompts IA
- `formatCurrentStepForPrompt()` : Formate l'étape courante pour les prompts
- `detectStepCompletion()` : Détecte le marqueur `#end_turn_step_<ID>`

**Types TypeScript** :
- `ConversationPlanStep`
- `ConversationPlanData`
- `ConversationPlan`

### 3. Agent de génération de plan

**Script de création** : `scripts/create-conversation-plan-agent.js`

**Agent** : `ask-conversation-plan-generator`

**Caractéristiques** :
- Analyse le contexte de l'ASK (question, description)
- Prend en compte les `system_prompt` (projet, challenge, ASK)
- Considère les participants
- Génère 3 à 6 étapes logiques et progressives
- Répond avec un JSON structuré et parsable

**Variables disponibles** :
- `ask_key`, `ask_question`, `ask_description`
- `system_prompt_ask`, `system_prompt_project`, `system_prompt_challenge`
- `participants`, `participants_list`

### 4. Intégration dans le flux de conversation

#### A. Variables d'agent enrichies

**Fichier modifié** : `src/lib/ai/conversation-agent.ts`

**Modifications** :
- Ajout du type `ConversationPlan` dans `ConversationAgentContext`
- `buildConversationAgentVariables()` enrichie avec :
  - `conversation_plan` : Plan formaté pour l'agent
  - `current_step` : Étape courante formatée

#### B. Initialisation de la conversation

**Fichier modifié** : `src/app/api/ask/[key]/init/route.ts`

**Flux ajouté** :
1. Vérification de l'existence d'un plan pour le thread
2. Si aucun plan : génération via `ask-conversation-plan-generator`
3. Stockage du plan en base de données
4. Passage du plan à `buildConversationAgentVariables()`
5. L'agent de réponse utilise le plan dans son contexte

**Gestion d'erreurs** : Si la génération échoue, la conversation continue sans plan (backward compatibility).

#### C. Détection et transition d'étapes (mode respond)

**Fichier modifié** : `src/app/api/ask/[key]/respond/route.ts`

**Flux ajouté** :
1. Après stockage de la réponse IA
2. Détection du marqueur `#end_turn_step_<ID>` dans le contenu
3. Si détecté :
   - Vérification que l'ID correspond à l'étape courante
   - Génération d'un résumé (actuellement basique)
   - Mise à jour du plan : étape courante → completed, étape suivante → active
   - Logs détaillés pour suivi

**Gestion d'erreurs** : En cas d'échec de mise à jour du plan, la requête continue (non bloquant).

#### D. Détection et transition d'étapes (mode stream)

**Fichier modifié** : `src/app/api/ask/[key]/stream/route.ts`

**Flux ajouté** :
1. Après envoi du message final dans le stream
2. Même logique de détection que le mode respond
3. Mise à jour du plan de manière asynchrone
4. N'impacte pas le streaming en cours

### 5. Documentation de test

**Fichier créé** : `CONVERSATION_PLAN_TESTING_GUIDE.md`

**Contenu** :
- Guide complet de test avec 6 scénarios
- Commandes SQL de vérification
- Guide de résolution de problèmes
- Vérifications post-test

## Workflow complet

### Scénario 1 : Initialisation d'une nouvelle conversation

```
1. Utilisateur ouvre une session ASK (pas encore de messages)
   ↓
2. Frontend fait focus sur textarea
   ↓
3. POST /api/ask/[key]/init
   ↓
4. Vérification : plan existe déjà ?
   ↓ Non
5. Génération du plan par ask-conversation-plan-generator
   ↓
6. Stockage du plan dans ask_conversation_plans
   - step_1 → status: 'active'
   - step_2+ → status: 'pending'
   ↓
7. Variables enrichies pour ask-conversation-response
   - conversation_plan: plan formaté
   - current_step: "step_1" formaté
   ↓
8. Agent génère le message d'accueil avec contexte du plan
   ↓
9. Message stocké et retourné au frontend
```

### Scénario 2 : Échange de messages avec plan actif

```
1. Utilisateur envoie un message
   ↓
2. POST /api/ask/[key]/stream
   ↓
3. Récupération du plan existant
   ↓
4. Variables enrichies avec plan et étape courante
   ↓
5. Agent génère la réponse en tenant compte de l'étape
   ↓
6. Réponse streamée au frontend
   ↓
7. Réponse stockée dans messages
```

### Scénario 3 : Transition d'étape

```
1. Agent détecte objectif de l'étape atteint
   ↓
2. Agent inclut #end_turn_step_step_1 dans sa réponse
   ↓
3. Réponse stockée dans messages
   ↓
4. Détection du marqueur #end_turn_step_step_1
   ↓
5. Vérification : step_1 = current_step_id ?
   ↓ Oui
6. Génération du résumé de l'étape
   ↓
7. Mise à jour du plan :
   - step_1.status = 'completed'
   - step_1.completed_at = NOW()
   - step_1.summary = résumé
   - step_2.status = 'active'
   - step_2.created_at = NOW()
   - current_step_id = 'step_2'
   ↓
8. Logs de confirmation
   ↓
9. Prochains messages utiliseront step_2 comme contexte
```

## Points techniques importants

### Backward compatibility

Le système est conçu pour ne pas casser les conversations existantes :
- Si la génération de plan échoue, la conversation continue
- Si la mise à jour de plan échoue, la réponse est quand même envoyée
- Les variables `conversation_plan` et `current_step` sont optionnelles

### Performance

- Index créés sur `conversation_thread_id` et `current_step_id`
- Plan stocké en JSONB pour requêtes efficaces
- Un seul plan par thread (contrainte UNIQUE)

### Sécurité

- RLS policies complètes (authenticated, anon, service_role)
- Accès basé sur les permissions du thread de conversation
- Support des threads partagés et individuels

### Extensibilité

Le système est préparé pour des améliorations futures :
- Résumé IA des messages par étape (TODO dans le code)
- Archivage des anciens messages (TODO dans le code)
- Métriques sur la durée des étapes
- Visualisation du plan dans le frontend

## Prochaines étapes (post-implémentation)

### Déploiement

1. **Exécuter la migration** :
   ```bash
   # Appliquer la migration 057
   ```

2. **Créer l'agent de génération** :
   ```bash
   node scripts/create-conversation-plan-agent.js
   ```

3. **Tester avec le guide** :
   - Suivre `CONVERSATION_PLAN_TESTING_GUIDE.md`
   - Vérifier les 6 scénarios principaux

### Optimisations futures

1. **Améliorer le résumé des étapes** :
   - Créer un agent IA dédié à la summarisation
   - Utiliser les techniques de compression de contexte

2. **Interface utilisateur** :
   - Afficher le plan dans une sidebar
   - Indicateur visuel de progression
   - Possibilité de sauter des étapes

3. **Analytics** :
   - Durée moyenne par étape
   - Taux de complétion des plans
   - Qualité des plans générés (feedback utilisateur)

4. **Configuration** :
   - Permettre la personnalisation du nombre d'étapes
   - Templates de plans prédéfinis par type d'ASK
   - Possibilité de modifier le plan manuellement

## Fichiers créés/modifiés

### Créés
- `migrations/057_add_conversation_plans.sql`
- `src/lib/ai/conversation-plan.ts`
- `scripts/create-conversation-plan-agent.js`
- `CONVERSATION_PLAN_TESTING_GUIDE.md`
- `CONVERSATION_PLAN_IMPLEMENTATION_SUMMARY.md` (ce fichier)

### Modifiés
- `src/lib/ai/conversation-agent.ts`
- `src/app/api/ask/[key]/init/route.ts`
- `src/app/api/ask/[key]/respond/route.ts`
- `src/app/api/ask/[key]/stream/route.ts`

## Commandes utiles

### Création de l'agent
```bash
NEXT_PUBLIC_SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> \
  node scripts/create-conversation-plan-agent.js
```

### Vérifier les plans en base
```sql
SELECT 
  acp.id,
  acp.current_step_id,
  jsonb_array_length(acp.plan_data->'steps') as steps_count,
  acp.created_at
FROM ask_conversation_plans acp
ORDER BY acp.created_at DESC
LIMIT 10;
```

### Voir les détails d'un plan
```sql
SELECT jsonb_pretty(plan_data) 
FROM ask_conversation_plans 
WHERE id = '<plan_id>';
```

## Conclusion

Le système de plan de conversation guidé est maintenant **entièrement implémenté** et prêt à être testé. Toutes les fonctionnalités décrites dans le plan initial ont été développées :

✅ Stockage persistant des plans  
✅ Génération automatique par IA  
✅ Intégration dans le flow de conversation  
✅ Détection et transition d'étapes  
✅ Variables disponibles dans les agents  
✅ Backward compatibility  
✅ Documentation complète  

Le système est conçu pour être robuste, extensible et non-invasif pour les conversations existantes.

