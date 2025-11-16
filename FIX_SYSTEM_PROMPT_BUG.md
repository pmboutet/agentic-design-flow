# Correction du bug de gestion des prompts dans ask-conversation-response

## 🐛 Problème identifié

Le `system_prompt` configuré au niveau de l'ASK (`ask_sessions.system_prompt`) **écrasait complètement** le `system_prompt` de l'agent `ask-conversation-response`, au lieu d'être fourni comme **variable** `{{system_prompt_ask}}` qui devrait être substituée dans le prompt de l'agent.

### Comportement incorrect (avant correction)

```typescript
// Dans getAgentConfigForAsk
if (askSession.system_prompt) {
  // ❌ Le system_prompt de l'ASK remplace COMPLÈTEMENT le prompt de l'agent
  return {
    systemPrompt: askSession.system_prompt,
    userPrompt: defaultAgent?.userPrompt,
    // ...
  };
}
```

### Comportement correct (après correction)

```typescript
// Dans getAgentConfigForAsk
// ✅ L'agent est TOUJOURS utilisé
// Les system_prompt de l'ASK/projet/challenge sont fournis comme VARIABLES
const agent = /* agent configuré ou agent par défaut */;
return {
  systemPrompt: substitutePromptVariables(agent.systemPrompt, {
    system_prompt_ask: askSession.system_prompt,
    system_prompt_project: project?.system_prompt,
    system_prompt_challenge: challenge?.system_prompt,
    // ... autres variables
  }),
  // ...
};
```

## ✅ Corrections apportées

### 1. Code : `src/lib/ai/agent-config.ts`

**Modification de `getAgentConfigForAsk`** :
- ❌ Supprimé : Logique de "Priority 1" qui écrasait le prompt de l'agent avec `askSession.system_prompt`
- ❌ Supprimé : Logique de "Priority 3" et "Priority 4" qui écrasaient le prompt avec `project.system_prompt` et `challenge.system_prompt`
- ✅ Nouveau comportement : 
  - Priority 1 : Agent configuré dans `ai_config`
  - Priority 2 : Agent par défaut `ask-conversation-response`
  - Les `system_prompt` sont fournis comme **variables**, pas comme remplacements

### 2. Code : `src/lib/ai/service.ts`

**Mise à jour du commentaire dans `executeAgent`** :
```typescript
// For ask-conversation-response agent, use getAgentConfigForAsk to ensure
// proper agent selection and variable substitution
// system_prompt_ask, system_prompt_project, system_prompt_challenge are provided as variables
// This ensures consistency with other modes (streaming, voice)
```

### 3. Documentation : `docs/ASK_CONVERSATION_AGENT_REFERENCE.md`

**Mise à jour de la section "Configuration de l'agent"** :
- Nouvelle priorité : Agent configuré (1) > Agent par défaut (2)
- Note importante : Les `system_prompt` sont des **variables**, pas des remplacements
- Exemples mis à jour pour montrer la substitution des variables

### 4. Script de migration : `scripts/fix-conversation-agent-prompt-variables.js`

Créé un script pour mettre à jour le prompt de l'agent `ask-conversation-response` afin d'inclure les variables `{{system_prompt_ask}}`, `{{system_prompt_project}}`, `{{system_prompt_challenge}}`.

## 🎯 Actions à effectuer

### 1. Exécuter le script de migration

```bash
cd /Users/pmboutet/Documents/GitHub/agentic-design-flow
node scripts/fix-conversation-agent-prompt-variables.js
```

Ce script va :
- Récupérer l'agent `ask-conversation-response`
- Mettre à jour son `system_prompt` pour inclure les variables `{{system_prompt_ask}}`, `{{system_prompt_project}}`, `{{system_prompt_challenge}}`
- Conserver le `user_prompt` existant

### 2. Vérifier le prompt mis à jour

Après l'exécution du script, vérifier que le prompt de l'agent inclut bien les variables :

```sql
SELECT slug, system_prompt 
FROM ai_agents 
WHERE slug = 'ask-conversation-response';
```

Le `system_prompt` devrait contenir :
```
Tu es un assistant IA spécialisé dans la facilitation de conversations...

{{system_prompt_ask}}

Contexte de la session :
- Question ASK : {{ask_question}}
- Description : {{ask_description}}
- Participants : {{participants}}

System prompt projet : {{system_prompt_project}}
System prompt challenge : {{system_prompt_challenge}}

Historique des messages (format JSON) :
{{messages_json}}
...
```

### 3. Tester le comportement

Créer une session ASK avec :
- Un `system_prompt` dans `ask_sessions.system_prompt`
- Un projet avec un `system_prompt` dans `projects.system_prompt`
- Un challenge avec un `system_prompt` dans `challenges.system_prompt`

Vérifier que :
1. Le prompt de l'agent `ask-conversation-response` est **toujours** utilisé
2. Les variables `{{system_prompt_ask}}`, `{{system_prompt_project}}`, `{{system_prompt_challenge}}` sont substituées correctement
3. Le prompt final contient le prompt de l'agent **avec** les valeurs substituées, pas juste le `system_prompt` de l'ASK

## 📊 Impact

### Avant la correction
- ❌ Si un ASK avait un `system_prompt`, le prompt de l'agent était complètement ignoré
- ❌ Perte de toutes les instructions soigneusement conçues dans le prompt de l'agent
- ❌ Incohérence entre les modes (texte, streaming, vocal)

### Après la correction
- ✅ Le prompt de l'agent est **toujours** utilisé
- ✅ Les `system_prompt` de l'ASK, projet et challenge sont fournis comme **variables**
- ✅ Cohérence entre tous les modes d'exécution
- ✅ Flexibilité : l'agent peut choisir comment utiliser ces variables dans son prompt

## 🔍 Variables disponibles

Les variables suivantes sont disponibles dans les prompts de l'agent :

| Variable | Source | Description |
|----------|--------|-------------|
| `{{ask_key}}` | `ask_sessions.ask_key` | Clé de la session ASK |
| `{{ask_question}}` | `ask_sessions.question` | Question de la session ASK |
| `{{ask_description}}` | `ask_sessions.description` | Description de la session ASK |
| `{{system_prompt_ask}}` | `ask_sessions.system_prompt` | System prompt de l'ASK (variable) |
| `{{system_prompt_project}}` | `projects.system_prompt` | System prompt du projet (variable) |
| `{{system_prompt_challenge}}` | `challenges.system_prompt` | System prompt du challenge (variable) |
| `{{participants}}` | `ask_participants` | Liste formatée des participants |
| `{{messages_json}}` | `messages` | Historique des messages (JSON) |

## 📚 Références

- **Code** : `src/lib/ai/agent-config.ts` - Fonction `getAgentConfigForAsk`
- **Code** : `src/lib/ai/service.ts` - Fonction `executeAgent`
- **Code** : `src/lib/ai/conversation-agent.ts` - Fonction `buildConversationAgentVariables`
- **Documentation** : `docs/ASK_CONVERSATION_AGENT_REFERENCE.md`
- **Script** : `scripts/fix-conversation-agent-prompt-variables.js`

## ✨ Résumé

**AVANT** : Le `system_prompt` de l'ASK **remplaçait** le prompt de l'agent  
**APRÈS** : Le `system_prompt` de l'ASK est une **variable** `{{system_prompt_ask}}` dans le prompt de l'agent

Cette correction garantit que le prompt de l'agent est toujours utilisé et que les `system_prompt` de l'ASK, projet et challenge sont correctement intégrés comme variables contextuelles.

