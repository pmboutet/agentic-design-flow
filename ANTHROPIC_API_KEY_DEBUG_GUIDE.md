# Guide de résolution du problème ANTHROPIC_API_KEY

## Problème identifié

L'erreur `Missing API key for model anthropic-sonnet-4-5. Define environment variable undefined.` indique que :

1. **Incohérence dans le nom du modèle** : L'erreur mentionne "anthropic-sonnet-4-5" mais la configuration en base utilise "anthropic-claude-sonnet-4-5"
2. **Variable d'environnement non accessible** : La variable `ANTHROPIC_API_KEY` n'est pas accessible côté serveur

## Solutions proposées

### 1. Vérifier la configuration en base de données

Exécutez le script de debug pour voir l'état actuel :

```bash
node scripts/debug-model-config.js
```

### 2. Corriger la configuration si nécessaire

Si la configuration n'est pas correcte, exécutez :

```bash
node scripts/fix-model-config.js
```

### 3. Tester la résolution de la clé API

Pour tester si la clé API est accessible :

```bash
node scripts/test-api-key-resolution.js
```

### 4. Test simple de la clé API

Pour un test rapide :

```bash
node scripts/test-simple-api-key.js
```

## Debugging ajouté au code

J'ai ajouté des logs de debug dans :

- `src/lib/ai/providers.ts` - fonction `resolveApiKey()`
- `src/lib/ai/agent-config.ts` - fonction `getDefaultModelConfig()`

Ces logs vous aideront à identifier :
- Quelle configuration est chargée
- Quelle variable d'environnement est recherchée
- Si la clé API est trouvée ou non

## Vérifications sur Vercel

1. **Variables d'environnement** : Vérifiez que `ANTHROPIC_API_KEY` est bien configurée dans les paramètres Vercel
2. **Redéploiement** : Après avoir ajouté/modifié une variable d'environnement, redéployez l'application
3. **Logs** : Consultez les logs de déploiement pour voir si les variables sont bien injectées

## Configuration attendue

La configuration correcte en base de données devrait être :

```sql
INSERT INTO ai_model_configs (
  id,
  code,
  name,
  provider,
  model,
  api_key_env_var,
  base_url,
  is_default,
  is_fallback
) VALUES (
  '550e8400-e29b-41d4-a716-446655440061',
  'anthropic-claude-sonnet-4-5',
  'Claude Sonnet 4.5',
  'anthropic',
  'claude-sonnet-4-5',
  'ANTHROPIC_API_KEY',
  'https://api.anthropic.com/v1',
  true,
  false
);
```

## Prochaines étapes

1. Exécutez les scripts de debug pour identifier le problème exact
2. Corrigez la configuration si nécessaire
3. Vérifiez que la variable d'environnement est bien configurée sur Vercel
4. Redéployez l'application
5. Testez à nouveau le streaming

## Nettoyage

Une fois le problème résolu, vous pouvez supprimer les logs de debug ajoutés dans :
- `src/lib/ai/providers.ts`
- `src/lib/ai/agent-config.ts`
