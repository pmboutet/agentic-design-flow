# Migration: participants → participants_list

**Date:** 16 novembre 2025  
**Status:** ✅ Complété

## Résumé

Ajout de `participants_list` (tableau) en plus de `participants` (string) pour permettre l'utilisation des boucles Handlebars `{{#each}}`.

## Changements

### 1. Variable ajoutée: `participants_list`

**Fichier:** `src/lib/ai/conversation-agent.ts`

```typescript
return {
  ask_key: context.ask.ask_key,
  ask_question: context.ask.question,
  ask_description: context.ask.description ?? '',
  // String format for backward compatibility with old templates
  participants: participantsSummary,
  // Array format for Handlebars loops (preferred for new templates)
  participants_list: context.participants,  // ✅ NOUVEAU
  messages_json: JSON.stringify(conversationMessagesPayload),
  latest_user_message: lastUserMessage?.content ?? '',
  system_prompt_ask: context.ask.system_prompt ?? '',
  system_prompt_project: context.project?.system_prompt ?? '',
  system_prompt_challenge: context.challenge?.system_prompt ?? '',
};
```

### 2. Scripts d'initialisation mis à jour

Tous les scripts d'init utilisent maintenant le nouveau format:

**Fichiers modifiés:**
- ✅ `scripts/init-ai-simple.js`
- ✅ `scripts/init-ai-data.js`
- ✅ `scripts/restore-all-agents.js`
- ✅ `scripts/create-ai-config.js`

**Ancien format (string):**
```handlebars
- Participants : {{participants}}
```

**Nouveau format (array avec Handlebars):**
```handlebars
{{#if (notEmpty participants_list)}}
Participants ({{length participants_list}}) :
{{#each participants_list}}
- {{name}}{{#if role}} ({{role}}){{/if}}
{{/each}}
{{/if}}
```

### 3. Backward compatibility

**La variable `participants` (string) est conservée** pour les anciens templates qui l'utilisent encore.

**Format:**
- `participants`: `"Alice (Manager), Bob (Developer), Carol (Designer)"`
- `participants_list`: `[{name: "Alice", role: "Manager"}, {name: "Bob", role: "Developer"}, ...]`

## Avantages du nouveau format

### Avec `participants` (ancien - string)
```handlebars
Participants : {{participants}}
```
**Résultat:** `Participants : Alice (Manager), Bob (Developer)`

❌ Pas de contrôle sur le formatage  
❌ Pas de condition sur le rôle  
❌ Pas de comptage facile

### Avec `participants_list` (nouveau - array)
```handlebars
{{#if (notEmpty participants_list)}}
Participants ({{length participants_list}}) :
{{#each participants_list}}
- {{name}}{{#if role}} ({{role}}){{/if}}
{{/each}}
{{else}}
Aucun participant
{{/if}}
```

**Résultat:**
```
Participants (2) :
- Alice (Manager)
- Bob (Developer)
```

✅ Formatage personnalisé  
✅ Conditions sur chaque participant  
✅ Comptage automatique  
✅ Gestion des cas vides

## Migration des templates existants

### Si vous utilisez actuellement `{{participants}}`

**Option 1: Ne rien faire (backward compatible)**
```handlebars
Participants : {{participants}}
```
→ Continue de fonctionner ✅

**Option 2: Migrer vers `participants_list` (recommandé)**
```handlebars
{{#if (notEmpty participants_list)}}
Participants ({{length participants_list}}) :
{{#each participants_list}}
- {{name}}{{#if role}} ({{role}}){{/if}}
{{/each}}
{{/if}}
```
→ Plus flexible et puissant ✅

## Exemple complet de prompt modernisé

```handlebars
Tu es un assistant IA spécialisé dans la facilitation de conversations.

Contexte de la session :
- Question ASK : {{ask_question}}
{{#if ask_description}}
- Description : {{ask_description}}
{{/if}}

{{#if system_prompt_project}}
Contexte projet : {{system_prompt_project}}
{{/if}}

{{#if system_prompt_challenge}}
Contexte challenge : {{system_prompt_challenge}}
{{/if}}

{{#if (notEmpty participants_list)}}
Participants ({{length participants_list}}) :
{{#each participants_list}}
- {{name}}{{#if role}} ({{role}}){{/if}}
{{/each}}
{{/if}}

Historique des messages (format JSON) :
{{messages_json}}

Réponds de manière concise et pertinente.
```

## Variables disponibles dans `participants_list`

Chaque élément du tableau contient:

```typescript
{
  name: string;          // Nom du participant (requis)
  role?: string | null;  // Rôle du participant (optionnel)
}
```

## Tests

La variable `participants_list` est testée dans:
- ✅ `src/lib/ai/__tests__/templates.test.ts`
- ✅ Runtime validation via les scripts d'init

## Prochaines étapes (optionnel)

Si vous souhaitez **complètement retirer** l'ancien format `participants` (string):

1. Rechercher tous les usages de `{{participants}}` dans vos prompts
2. Les remplacer par le nouveau format avec `{{#each participants_list}}`
3. Retirer la ligne `participants: participantsSummary` de `buildConversationAgentVariables`
4. Mettre à jour `available_variables` pour retirer `participants`

**Note:** Ce n'est pas nécessaire pour le moment, les deux formats coexistent sans problème.

## Résolution du bug initial

Le bug HTTP 500 était causé par:
```handlebars
{{#each participants}}  <!-- ❌ participants est une STRING -->
- {{name}} ({{role}})
{{/each}}
```

Handlebars ne peut pas itérer sur une string avec `#each`, d'où l'erreur 500.

**Solution appliquée:**
```handlebars
{{#each participants_list}}  <!-- ✅ participants_list est un ARRAY -->
- {{name}}{{#if role}} ({{role}}){{/if}}
{{/each}}
```

---

**Migration complète:** Tous les scripts et la documentation ont été mis à jour ✅

