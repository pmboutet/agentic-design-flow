# Fix Database Connection - Erreur SCRAM

## Problème
`SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature is missing`

Cette erreur indique un problème d'authentification PostgreSQL.

## Solutions à Essayer (dans l'ordre)

### Solution 1 : Utiliser la Connexion Directe (Recommandé)

Au lieu d'utiliser le **pooler** (port 6543), utilisez la **connexion directe** (port 5432).

**Dans Supabase Dashboard :**
1. Allez sur https://supabase.com/dashboard/project/lsqiqrxxzhgikhvkgpbh/settings/database
2. Sous "Connection string" → Onglet "URI"
3. **Important : Sélectionnez "Session mode" au lieu de "Transaction mode"**
4. Copiez la connection string (elle devrait avoir le port **5432**)

**Ou modifiez manuellement votre DATABASE_URL :**

Remplacez `:6543` par `:5432` et supprimez les paramètres pgbouncer :

```bash
# AVANT (pooler - NE MARCHE PAS)
DATABASE_URL="postgresql://postgres.lsqiqrxxzhgikhvkgpbh:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

# APRÈS (direct - DEVRAIT MARCHER)
DATABASE_URL="postgresql://postgres.lsqiqrxxzhgikhvkgpbh:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"
```

### Solution 2 : Encoder les Caractères Spéciaux

Si votre mot de passe contient des caractères spéciaux, ils doivent être encodés en URL :

| Caractère | Encodé |
|-----------|--------|
| @ | %40 |
| # | %23 |
| $ | %24 |
| & | %26 |
| + | %2B |
| = | %3D |
| ? | %3F |
| / | %2F |
| : | %3A |

**Exemple :**
```bash
# Si votre mot de passe est : MyP@ss#123
# Il devient : MyP%40ss%23123

DATABASE_URL="postgresql://postgres.lsqiqrxxzhgikhvkgpbh:MyP%40ss%23123@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"
```

### Solution 3 : Utiliser POSTGRES_URL_NON_POOLING

Supabase fournit parfois plusieurs URLs. Essayez d'utiliser `POSTGRES_URL_NON_POOLING`.

**Dans .env.local, ajoutez :**
```bash
# Gardez DATABASE_URL comme fallback
DATABASE_URL="votre_url_actuelle"

# Mais utilisez celle-ci en priorité (regardez dans votre dashboard Supabase)
POSTGRES_URL_NON_POOLING="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
```

**Puis modifiez scripts/migrate-core.js ligne 146 :**
```javascript
const connectionString =
  process.env.POSTGRES_URL_NON_POOLING || // Ajoutez ceci en premier
  process.env.DATABASE_URL || 
  process.env.POSTGRES_URL || 
  process.env.SUPABASE_MIGRATIONS_URL;
```

### Solution 4 : Utiliser l'API Key pour Authentification

Autre approche : utilisez la connexion via Supabase JS au lieu de PostgreSQL direct.

Mais pour les migrations SQL, nous avons besoin de PostgreSQL direct, donc cette option n'est pas idéale.

## Test Rapide

Après chaque modification de DATABASE_URL, testez immédiatement :

```bash
node scripts/test-db-connection.js
```

Si ça marche, vous verrez :
```
✅ Connected successfully with SSL!
✅ All tests passed!
```

Puis lancez :
```bash
npm run migrate
```

## Debugging : Vérifier Votre Mot de Passe

Pour vérifier que votre mot de passe est correct, essayez de vous connecter avec `psql` :

```bash
psql "postgresql://postgres.lsqiqrxxzhgikhvkgpbh:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"
```

Si ça fonctionne, le problème vient du pooler (port 6543).

## Ma Recommandation ⭐

**Essayez d'abord Solution 1 (port 5432 direct) :**

1. Copiez votre DATABASE_URL actuel
2. Remplacez `:6543` par `:5432`
3. Supprimez `?pgbouncer=true` ou `?pgbouncer=true&connection_limit=1` à la fin
4. Testez avec `node scripts/test-db-connection.js`

C'est généralement le fix le plus rapide pour cette erreur SCRAM avec Supabase.

