# Correction : Fusion de la variable latest_user_message dans le user prompt

## Problème identifié

La variable `{{latest_user_message}}` dans le user prompt de l'agent `ask-conversation-response` n'était pas fusionnée correctement :

```
Voici le dernier message de l'utilisateur : {{latest_user_message}}
```

Résultat attendu :
```
Voici le dernier message de l'utilisateur : Bonjour, voici mon message
```

Résultat obtenu :
```
Voici le dernier message de l'utilisateur : 

```

## Causes du problème

### 1. Variable manquante dans `buildConversationAgentVariables`

La fonction `buildConversationAgentVariables` dans `src/lib/ai/conversation-agent.ts` ne construisait pas la variable `latest_user_message`.

**Correction** : Ajout de la logique pour extraire le dernier message utilisateur :

```typescript
// Find the last user message
const lastUserMessage = [...context.messages].reverse().find(message => message.senderType === 'user');

return {
  ask_key: context.ask.ask_key,
  ask_question: context.ask.question,
  ask_description: context.ask.description ?? '',
  participants: participantsSummary,
  messages_json: JSON.stringify(conversationMessagesPayload),
  latest_user_message: lastUserMessage?.content ?? '', // ✅ Ajouté
  system_prompt_ask: context.ask.system_prompt ?? '',
  system_prompt_project: context.project?.system_prompt ?? '',
  system_prompt_challenge: context.challenge?.system_prompt ?? '',
};
```

### 2. Le nouveau message utilisateur n'était pas parsé dans le mode streaming

Dans `/api/ask/[key]/stream/route.ts`, le serveur récupérait les messages de la base de données mais ne parsait **jamais** le body de la requête pour obtenir le nouveau message utilisateur envoyé par le client.

**Correction** : Ajout du parsing du body et override de `latest_user_message` :

```typescript
// Parse the request body to get the new user message
let newUserMessage = '';
try {
  const body = await request.json();
  newUserMessage = body.message || body.content || '';
} catch (error) {
  console.warn('⚠️ Could not parse request body for new user message:', error);
}

const agentVariables = buildConversationAgentVariables({
  ask: askRow,
  project: projectData,
  challenge: challengeData,
  messages,
  participants: participantSummaries,
});

// Override latest_user_message with the new message from the request
if (newUserMessage) {
  agentVariables.latest_user_message = newUserMessage;
}
```

## Fichiers modifiés

### 1. `src/lib/ai/conversation-agent.ts`

- Ajout de la ligne pour trouver le dernier message utilisateur
- Ajout de `latest_user_message` dans l'objet retourné par `buildConversationAgentVariables`

### 2. `src/app/api/ask/[key]/stream/route.ts`

- Ajout du parsing du body de la requête
- Override de `latest_user_message` avec le nouveau message

### 3. `scripts/add-latest-user-message-variable.js` (nouveau)

- Script pour ajouter `latest_user_message` aux `available_variables` de l'agent

## Instructions pour appliquer la correction

### 1. Vérifier les modifications

Les modifications ont été apportées aux fichiers :
- `src/lib/ai/conversation-agent.ts`
- `src/app/api/ask/[key]/stream/route.ts`

### 2. Mettre à jour l'agent dans la base de données (optionnel)

Exécutez le script pour ajouter `latest_user_message` aux `available_variables` :

```bash
node scripts/add-latest-user-message-variable.js
```

**Note** : Cette étape est optionnelle car la fusion fonctionne même si la variable n'est pas dans `available_variables`. Le champ `available_variables` sert uniquement au logging optimisé.

### 3. Tester

1. Démarrez l'application
2. Ouvrez une session ASK
3. Envoyez un message
4. Vérifiez que la réponse de l'agent inclut bien le dernier message utilisateur

## Contexte technique

### Comment fonctionne la fusion des variables

1. **Client** : Envoie un message via `POST /api/ask/[key]/stream` avec le body :
   ```json
   {
     "message": "Mon message utilisateur",
     "model": "anthropic"
   }
   ```

2. **Serveur** :
   - Parse le body pour récupérer le nouveau message
   - Récupère les messages existants de la base de données
   - Construit les variables avec `buildConversationAgentVariables` (utilise les messages DB)
   - Override `latest_user_message` avec le nouveau message du body
   - Passe les variables à `executeAgent` → `getAgentConfigForAsk` → `getChatAgentConfig` → `renderTemplate`
   - `renderTemplate` remplace `{{latest_user_message}}` avec la valeur fournie

3. **Agent** :
   - Le system prompt contient le contexte avec `{{messages_json}}`
   - Le user prompt peut utiliser `{{latest_user_message}}` pour référencer spécifiquement le dernier message

## Modes d'utilisation

La variable `latest_user_message` est maintenant correctement fusionnée dans :

1. ✅ **Mode texte GET** (`/api/ask/[key]/route.ts`) - Initialisation
2. ✅ **Mode texte POST init** (`/api/ask/[key]/init/route.ts`) - Focus textarea  
3. ✅ **Mode streaming** (`/api/ask/[key]/stream/route.ts`) - Chat en temps réel
4. ✅ **Mode vocal init** (`/api/ask/[key]/voice-agent/init/route.ts`) - Initialisation vocale
5. ✅ **Mode vocal log** (`/api/ask/[key]/voice-agent/log/route.ts`) - Transcription Speechmatics

**Note** : Pour les modes d'initialisation (GET, POST init, voice init), `latest_user_message` sera vide car il n'y a pas encore de message utilisateur. C'est normal et attendu.

## Vérification

Pour vérifier que la variable est bien fusionnée, ajoutez des logs dans le code :

```typescript
console.log('🔍 Agent variables:', agentVariables);
console.log('🔍 latest_user_message:', agentVariables.latest_user_message);
```

Ou vérifiez dans les logs d'agent (`ai_agent_logs` table) le champ `request_payload.userPrompt`.

## Références

- Documentation de l'agent : `docs/ASK_CONVERSATION_AGENT_REFERENCE.md`
- Variables disponibles : `src/lib/ai/constants.ts` (ligne 41-44)
- Fonction de rendu : `src/lib/ai/templates.ts` (ligne 3-18)

