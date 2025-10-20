# Insights Types Dynamiques

## 🎯 Objectif

Les types d'insights sont maintenant chargés dynamiquement depuis la table `insight_types` de la base de données, au lieu d'être codés en dur dans le prompt de l'agent.

## ✅ Modifications Réalisées

### 1. Nouvelle Fonction dans `insightQueries.ts`

Ajout de `fetchInsightTypesForPrompt()` qui :
- Récupère tous les types d'insights depuis la table `insight_types`
- Les formate en une chaîne de caractères séparée par des virgules
- Fournit un fallback si aucun type n'est trouvé

```typescript
export async function fetchInsightTypesForPrompt(
  supabase: SupabaseClient,
): Promise<string> {
  const { data, error } = await supabase
    .from('insight_types')
    .select('name')
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  const types = (data ?? [])
    .map(row => (row as InsightTypeRow).name)
    .filter(name => typeof name === 'string' && name.trim().length > 0)
    .map(name => name.toLowerCase());

  if (types.length === 0) {
    return 'pain, idea, solution, opportunity, risk, feedback, question';
  }

  return types.join(', ');
}
```

### 2. Mise à Jour de `buildPromptVariables()`

La fonction accepte maintenant un paramètre optionnel `insightTypes` :

```typescript
function buildPromptVariables(options: {
  ask: AskSessionRow;
  project: ProjectRow | null;
  challenge: ChallengeRow | null;
  messages: Message[];
  participants: { name: string; role?: string | null }[];
  insights: Insight[];
  latestAiResponse?: string | null;
  insightTypes?: string | null;  // 👈 NOUVEAU
}): Record<string, string | null | undefined>
```

Et retourne une nouvelle variable `insight_types` :

```typescript
return {
  // ... autres variables ...
  insight_types: options.insightTypes ?? 'pain, idea, solution, opportunity, risk, feedback, question',
}
```

### 3. Mise à Jour du Endpoint API

Dans `/api/ask/[key]/respond/route.ts` :

1. **Import de la nouvelle fonction** :
   ```typescript
   import { fetchInsightTypesForPrompt } from '@/lib/insightQueries';
   ```

2. **Récupération des types** au début du traitement :
   ```typescript
   const insightTypes = await fetchInsightTypesForPrompt(supabase);
   ```

3. **Passage aux 4 appels de `buildPromptVariables()`** :
   - Pour les variables de prompt générales
   - Pour la détection d'insights (mode detectInsightsOnly)
   - Pour la génération de réponse chat
   - Pour la détection d'insights finale

### 4. Mise à Jour du Prompt de l'Agent

Le prompt de l'agent `ask-insight-detection` utilise maintenant :

**Avant :**
```
## TYPES D'INSIGHTS

Classifie chaque insight selon l'un de ces types :
- **pain** : Problème, frustration, difficulté identifiée
- **idea** : Idée nouvelle, suggestion, proposition
- **solution** : Solution concrète proposée pour un problème
- **opportunity** : Opportunité d'amélioration ou de croissance
- **risk** : Risque, menace ou contrainte identifiée
- **feedback** : Retour d'expérience, témoignage
- **question** : Question importante soulevée
```

**Après :**
```
## TYPES D'INSIGHTS

Les types d'insights disponibles sont : {{insight_types}}

Classifie chaque insight selon l'un de ces types.
```

Et dans la structure JSON attendue :
```json
{
  "insights": [
    {
      "type": "un des types disponibles (voir insight_types)",
      // ...
    }
  ]
}
```

### 5. Ajout de la Variable aux Available Variables

Dans les deux scripts (`restore-all-agents.js` et `init-ai-data.js`) :

```javascript
available_variables: [
  'ask_key',
  'ask_question',
  'ask_description',
  'message_history',
  'participants',
  'existing_insights_json',
  'latest_ai_response',
  'insight_types'  // 👈 NOUVEAU
]
```

## 📊 Types d'Insights dans la Base de Données

Actuellement dans la table `insight_types` :
- `pain` : Problème, frustration, difficulté
- `gain` : Bénéfice, avantage
- `opportunity` : Opportunité d'amélioration
- `risk` : Risque, menace
- `signal` : Signal faible, tendance
- `idea` : Idée nouvelle

## 🎁 Avantages

1. **Flexibilité** : Ajout/modification de types d'insights sans changer le code
2. **Cohérence** : Les types utilisés par l'IA correspondent toujours à ceux de la BDD
3. **Maintenance** : Gestion centralisée des types via la table `insight_types`
4. **Évolutivité** : Facile d'ajouter de nouveaux types selon les besoins

## 🔄 Comment Ajouter un Nouveau Type d'Insight

1. **Ajouter le type dans la base de données** :
   ```sql
   INSERT INTO public.insight_types (name)
   VALUES ('nouveau_type')
   ON CONFLICT (name) DO NOTHING;
   ```

2. **C'est tout !** L'agent utilisera automatiquement le nouveau type lors de la prochaine exécution.

## 🧪 Test

Pour tester :

1. Vérifier les types disponibles :
   ```sql
   SELECT name FROM insight_types ORDER BY name;
   ```

2. Envoyer un message dans une session ASK
3. L'IA devrait détecter des insights en utilisant les types de la BDD
4. Vérifier dans la console que la variable `insight_types` est bien passée

## 📝 Fichiers Modifiés

- ✅ `src/lib/insightQueries.ts`
- ✅ `src/app/api/ask/[key]/respond/route.ts`
- ✅ `scripts/restore-all-agents.js`
- ✅ `scripts/init-ai-data.js`

## 🚀 Déploiement

L'agent a été mis à jour dans la base de données locale. Pour la production, exécutez :

```bash
node scripts/restore-all-agents.js
```

---

**Note** : Cette approche rend le système beaucoup plus flexible et maintenable, permettant d'adapter facilement les types d'insights selon l'évolution des besoins métier.

