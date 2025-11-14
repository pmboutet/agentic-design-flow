# Optimisation de l'agent ask-conversation-response

## Résumé

Optimisation de la configuration de l'agent `ask-conversation-response` pour supprimer les redondances dans les variables et les prompts, conformément aux recommandations fournies.

## Redondances supprimées

### 1. Historique dupliqué
- ❌ **Supprimé** : `message_history` (format texte)
- ❌ **Supprimé** : `previous_messages` (redondant avec message_history)
- ✅ **Conservé** : `messages_json` (format JSON structuré, plus complet)

### 2. Dernier message répété
- ❌ **Supprimé** : `latest_user_message` (déjà présent dans `messages_json`)

### 3. Informations contextuelles répétées
- ❌ **Supprimé** : `challenge_name` (non utilisé dans les prompts)
- ❌ **Supprimé** : `project_name` (non utilisé dans les prompts)
- ✅ **Conservé** : `ask_question` et `ask_description` (utilisés dans les prompts)

### 4. Participants dupliqués
- ❌ **Supprimé** : `participant_name` (redondant avec `participants`)
- ❌ **Supprimé** : `participants_count` (redondant avec `participants`)
- ✅ **Conservé** : `participants` (liste complète des participants)

### 5. Métadonnées temporelles
- ❌ **Supprimé** : `current_timestamp` (inutile, timestamps déjà dans `messages_json`)

### 6. Autres variables inutiles
- ❌ **Supprimé** : `delivery_mode`, `audience_scope`, `response_mode` (non utilisés dans les prompts)

## Variables finales

Les variables suivantes sont maintenant utilisées :

```typescript
{
  ask_key: string,
  ask_question: string,
  ask_description: string,
  messages_json: string,  // Format JSON structuré avec id, senderType, senderName, content, timestamp
  participants: string     // Liste formatée des participants
}
```

## Modifications apportées

### 1. Configuration de l'agent (base de données)

**System Prompt optimisé :**
- Utilise `{{messages_json}}` au lieu de `{{message_history}}` et `{{latest_user_message}}`
- Format JSON structuré pour un meilleur traitement par l'IA

**User Prompt optimisé :**
- Suppression de la référence explicite à `{{latest_user_message}}`
- L'IA peut extraire le dernier message depuis `messages_json`

**Available Variables :**
- Réduit de 7 à 5 variables essentielles

### 2. Code source

**`src/app/api/ask/[key]/stream/route.ts` :**
- Suppression de toutes les variables redondantes dans `agentVariables`
- Utilisation uniquement de `messages_json` pour l'historique
- Commentaires ajoutés pour expliquer les optimisations

### 3. Scripts de migration

**Scripts mis à jour :**
- `scripts/restore-all-agents.js`
- `scripts/init-ai-data.js`
- `scripts/create-ai-config.js`
- `scripts/init-ai-simple.js`

**Nouveaux scripts :**
- `scripts/optimize-ask-conversation-agent.js` - Script Node.js pour optimiser la configuration en base
- `scripts/optimize-ask-conversation-agent.sql` - Script SQL pour optimiser la configuration

## Avantages

1. **Réduction de la taille des prompts** : Moins de tokens envoyés à l'IA
2. **Meilleure structure** : Format JSON structuré plus facile à traiter
3. **Moins de confusion** : Une seule source de vérité pour chaque information
4. **Performance améliorée** : Moins de données à traiter et transmettre
5. **Maintenance simplifiée** : Moins de variables à gérer

## Format de messages_json

```json
[
  {
    "id": "message-id",
    "senderType": "user" | "ai",
    "senderName": "Nom du participant",
    "content": "Contenu du message",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
]
```

## Migration

Pour appliquer les optimisations à une base de données existante :

```bash
# Option 1 : Script Node.js
node scripts/optimize-ask-conversation-agent.js

# Option 2 : Script SQL
# Exécuter scripts/optimize-ask-conversation-agent.sql dans l'éditeur SQL de Supabase
```

## Compatibilité

⚠️ **Note importante** : Cette optimisation change le format des variables. Assurez-vous que :
1. Tous les endpoints utilisent la nouvelle structure
2. Les prompts personnalisés dans `ask_sessions.system_prompt` sont mis à jour si nécessaire
3. Les tests sont mis à jour pour refléter les nouvelles variables

## Fichiers modifiés

- `src/app/api/ask/[key]/stream/route.ts`
- `scripts/restore-all-agents.js`
- `scripts/init-ai-data.js`
- `scripts/create-ai-config.js`
- `scripts/init-ai-simple.js`
- `scripts/optimize-ask-conversation-agent.js` (nouveau)
- `scripts/optimize-ask-conversation-agent.sql` (nouveau)






