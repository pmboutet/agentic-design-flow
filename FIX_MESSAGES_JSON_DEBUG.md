# Fix messages_json - Messages IA manquants

## Problème

La variable `messages_json` ne contient que les messages de l'utilisateur, pas les réponses de l'IA pour le thread en cours.

## Corrections effectuées

### 1. Correction de l'interface `AskSessionRow` ✅

Ajout des propriétés manquantes `project_id` et `challenge_id` dans `/src/app/api/ask/[key]/route.ts`

### 2. Correction des prompts Handlebars ✅

**Problème identifié :** Les prompts de l'agent `ask-conversation-response` contenaient des erreurs de syntaxe Handlebars :
- Blocs `{{#if}}` et `{{#each}}` non fermés
- Morceaux de code mélangés entre system prompt et user prompt
- Helper `isNotEmpty` inexistant (devrait être `notEmpty`)

**Script de correction :** `scripts/fix-conversation-agent-prompts.js`

**Prompts corrigés :**
- System prompt : Structure correcte avec blocs bien fermés
- User prompt : Séparé et syntaxiquement correct
- Variable `participants_list` ajoutée pour les boucles Handlebars

### 3. Ajout de logs de débogage ✅

Pour identifier où les messages de l'IA sont perdus, j'ai ajouté des logs à 3 niveaux :

**Niveau 1 - DB Query** (`stream/route.ts` ligne 389) :
```typescript
console.log('📥 Messages bruts de la DB:');
console.log(`   Total: ${messageRows.length} messages`);
console.log(`   👤 User messages in DB: ${dbUserMsgCount}`);
console.log(`   🤖 AI messages in DB: ${dbAiMsgCount}`);
```

**Niveau 2 - After Mapping** (`stream/route.ts` ligne 506) :
```typescript
console.log('📊 Messages récupérés pour messages_json:');
console.log(`   Total: ${messages.length} messages`);
console.log(`   👤 User messages: ${userMsgCount}`);
console.log(`   🤖 AI messages: ${aiMsgCount}`);
```

**Niveau 3 - Variable Construction** (`conversation-agent.ts` ligne 58) :
```typescript
console.log('🔧 buildConversationAgentVariables - Création de messages_json:');
console.log(`   Input messages: ${context.messages.length}`);
console.log(`   👤 User in payload: ${payloadUserCount}`);
console.log(`   🤖 AI in payload: ${payloadAiCount}`);
```

## Scripts de diagnostic

### Script 1 : Vérifier les messages en DB
```bash
node scripts/check-messages-in-db.js
```
Ce script vous demandera une clé ASK et affichera :
- Nombre total de messages
- Répartition user/AI
- Messages avec/sans thread
- Derniers messages

### Script 2 : Diagnostiquer l'agent
```bash
node scripts/diagnose-agent-error.js
```
Vérifie la configuration de l'agent `ask-conversation-response`.

### Script 3 : Afficher les prompts
```bash
node scripts/show-agent-prompts.js
```
Affiche les prompts avec numéros de ligne.

## Test et diagnostic

### Étape 1 : Vérifier les données en DB

Exécutez le script de vérification :
```bash
node scripts/check-messages-in-db.js
```

Entrez votre clé ASK et vérifiez :
- ✅ Y a-t-il des messages IA dans la DB ?
- ✅ Les messages IA ont-ils un `conversation_thread_id` ?
- ✅ Le `conversation_thread_id` correspond-il au thread actuel ?

### Étape 2 : Tester l'application avec les logs

1. **Démarrer le serveur** (si ce n'est pas déjà fait) :
   ```bash
   npm run dev
   ```

2. **Envoyer un message** dans l'application

3. **Observer les logs** dans le terminal :
   - Chercher `📥 Messages bruts de la DB:`
   - Chercher `📊 Messages récupérés pour messages_json:`
   - Chercher `🔧 buildConversationAgentVariables`

4. **Analyser les résultats** :
   - Si `🤖 AI messages in DB: 0` → Les messages IA ne sont pas sauvegardés en DB
   - Si `🤖 AI messages in DB: X` mais `🤖 AI messages: 0` → Problème de mapping
   - Si `🤖 AI in payload: 0` → Problème dans buildConversationAgentVariables

## Causes possibles

### A. Messages IA non sauvegardés en DB
**Symptôme :** `🤖 AI messages in DB: 0`

**Causes possibles :**
- Erreur lors de l'insertion (vérifier les logs d'erreur)
- RLS (Row Level Security) empêche l'insertion
- `dataClient` utilisé n'a pas les permissions

**Solution :** Vérifier les logs lors de l'insertion du message IA (ligne 677 de `stream/route.ts`)

### B. Messages IA filtrés lors de la récupération
**Symptôme :** `🤖 AI messages in DB: X` mais `🤖 AI messages: 0` après récupération

**Causes possibles :**
- RLS empêche la lecture des messages où `sender_type = 'ai'`
- `dataClient` n'a pas les bonnes permissions
- Mauvais `conversation_thread_id`

**Solution :** Vérifier les politiques RLS sur la table `messages`

### C. Messages IA avec mauvais thread ID
**Symptôme :** Messages IA existent mais ne sont pas associés au bon thread

**Causes possibles :**
- `conversationThread?.id` est `null` lors de l'insertion
- Thread créé après l'insertion des premiers messages

**Solution :** Vérifier que `conversationThread` existe avant d'insérer le message IA

## Prochaines étapes

1. ✅ Corriger les erreurs Handlebars (FAIT)
2. ✅ Ajouter les logs de débogage (FAIT)
3. 🔄 Tester l'application et observer les logs
4. 🔄 Identifier la cause exacte avec les logs
5. 🔄 Appliquer la correction appropriée

## Notes

- Les logs seront retirés une fois le problème identifié et corrigé
- Le code récupère bien tous les messages (user et AI) depuis la DB
- Le mapping inclut tous les `sender_type`
- La fonction `buildConversationAgentVariables` traite tous les messages reçus

**La question est : pourquoi les messages IA ne sont-ils pas récupérés de la DB ?**

C'est ce que les logs vont nous dire ! 🔍

