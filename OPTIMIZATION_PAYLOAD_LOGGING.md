# Optimisation du payload de logging - Suppression des redondances

## Problème identifié

Le payload de logging contenait des redondances massives :

1. **`systemPrompt`** : Contient déjà toutes les informations via substitution de variables (ask_question, ask_description, participants, messages_json)
2. **`userPrompt`** : Contient déjà toutes les informations via substitution de variables
3. **`variables`** : Dupliquait toutes les informations déjà dans les prompts (ask_question, ask_description, messages_json, participants)
4. **`context`** : Dupliquait encore les mêmes informations (ask.question, ask.description, participants, messages)

**Résultat** : Les mêmes données étaient présentes 3-4 fois dans le payload de logging !

## Solution appliquée

### 1. Optimisation dans `stream/route.ts`

**Avant :**
```typescript
const agentContext = {
  ask: { id, key, question, description, ... },
  participants: [...],
  messages: [...],
};

const agentRequestPayload = {
  systemPrompt: prompts.system,  // Contient déjà tout
  userPrompt: prompts.user,       // Contient déjà tout
  variables: agentVariables,      // Duplique tout
  context: agentContext,          // Duplique tout
};
```

**Après :**
```typescript
const agentRequestPayload = {
  systemPrompt: prompts.system,  // Contient déjà tout
  userPrompt: prompts.user,      // Contient déjà tout
  variables: {
    ask_key: agentVariables.ask_key,  // Seulement la clé pour référence
    // Les autres variables sont déjà dans systemPrompt/userPrompt
  },
  // context supprimé (redondant)
};
```

### 2. Optimisation dans `service.ts`

**Avant :**
```typescript
requestPayload: {
  ...buildRequestPayload(agent, prompts),
  variables: options.variables,  // Toutes les variables (redondant)
}
```

**Après :**
```typescript
const optimizedVariables = {
  ask_key: options.variables.ask_key,
  // Les autres variables sont déjà dans les prompts résolus
};

requestPayload: {
  ...buildRequestPayload(agent, prompts),
  variables: optimizedVariables,  // Seulement ask_key
}
```

## Réduction de la taille

**Avant :**
- `systemPrompt` : ~2000 caractères (avec toutes les variables substituées)
- `userPrompt` : ~200 caractères
- `variables` : ~3000 caractères (messages_json seul fait ~2000)
- `context` : ~3000 caractères (messages + ask + participants)
- **Total** : ~8200 caractères

**Après :**
- `systemPrompt` : ~2000 caractères (avec toutes les variables substituées)
- `userPrompt` : ~200 caractères
- `variables` : ~20 caractères (seulement ask_key)
- **Total** : ~2220 caractères

**Réduction** : ~73% de réduction de la taille du payload de logging !

## Avantages

1. **Moins de stockage** : Les logs prennent beaucoup moins d'espace en base
2. **Meilleure lisibilité** : Les logs sont plus faciles à lire et déboguer
3. **Performance** : Moins de données à sérialiser/écrire en base
4. **Clarté** : Une seule source de vérité (les prompts résolus)

## Variables conservées

On garde seulement `ask_key` dans les variables car :
- C'est un identifiant unique utile pour le debugging
- Il n'est pas substitué dans les prompts (pas de template variable)
- Il permet de retrouver facilement la session ASK

## Notes importantes

⚠️ **Les prompts résolus contiennent déjà toutes les informations nécessaires** :
- `{{ask_question}}` → dans systemPrompt
- `{{ask_description}}` → dans systemPrompt
- `{{participants}}` → dans systemPrompt
- `{{messages_json}}` → dans systemPrompt

Donc il n'est pas nécessaire de les dupliquer dans `variables` ou `context`.

## Fichiers modifiés

- `src/app/api/ask/[key]/stream/route.ts` - Suppression de `context` et optimisation de `variables`
- `src/lib/ai/service.ts` - Optimisation de `variables` dans le payload de logging

