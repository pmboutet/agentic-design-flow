# Comment obtenir votre DATABASE_URL depuis Supabase

## Option 1 : Via le Dashboard Supabase (Recommandé)

1. **Allez sur** https://supabase.com/dashboard
2. **Sélectionnez** votre projet (`lsqiqrxxzhgikhvkgpbh`)
3. **Cliquez** sur "Project Settings" (icône engrenage en bas à gauche)
4. **Cliquez** sur "Database" dans le menu latéral
5. **Faites défiler** jusqu'à "Connection string"
6. **Sélectionnez** l'onglet "URI" 
7. **Copiez** la connection string qui ressemble à :
   ```
   postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
   ```
8. **IMPORTANT** : Remplacez `[YOUR-PASSWORD]` par votre mot de passe de base de données

## Option 2 : Si vous avez oublié votre mot de passe

Si vous ne connaissez pas votre mot de passe de base de données :

1. Allez sur Project Settings > Database
2. Cliquez sur "Reset Database Password"
3. Définissez un nouveau mot de passe
4. Utilisez ce nouveau mot de passe dans votre connection string

## Option 3 : Connection Pooler (Recommandé pour Production)

Pour des connexions avec pooling (recommandé pour migrations) :

**Port 6543** (Transaction mode - pour migrations)
```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
```

**Port 5432** (Direct connection - pour opérations longues)
```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[region].pooler.supabase.com:5432/postgres
```

## Ajouter à votre .env.local

Une fois que vous avez votre connection string :

```bash
# Ouvrez votre fichier .env.local et ajoutez :
DATABASE_URL="postgresql://postgres.lsqiqrxxzhgikhvkgpbh:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres"
```

**OU**

```bash
POSTGRES_URL="postgresql://postgres.lsqiqrxxzhgikhvkgpbh:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres"
```

## Variables déjà présentes ✅

Vous avez déjà configuré :
- ✅ NEXT_PUBLIC_SUPABASE_URL
- ✅ NEXT_PUBLIC_SUPABASE_ANON_KEY
- ✅ SUPABASE_SERVICE_ROLE_KEY

Il ne vous manque que :
- ❌ DATABASE_URL (ou POSTGRES_URL)

## Vérification

Une fois ajouté, testez avec :

```bash
npm run migrate
```

Vous devriez voir :
```
Running migrations...
Migration 010_migrate_to_auth_profiles.sql completed
Migration 011_enable_rls_policies.sql completed
```

## Sécurité ⚠️

- ❌ **NE JAMAIS** commiter le fichier `.env.local` dans Git
- ❌ **NE JAMAIS** exposer DATABASE_URL côté client
- ✅ Utilisez DATABASE_URL **uniquement** dans les scripts serveur et migrations
- ✅ Le fichier `.env.local` est déjà dans `.gitignore`

## Troubleshooting

### Erreur "password authentication failed"
→ Vérifiez que votre mot de passe est correct

### Erreur "could not connect to server"
→ Vérifiez que vous utilisez le bon port (6543 ou 5432)

### Erreur "database does not exist"
→ Utilisez `/postgres` à la fin de l'URL (pas `/[votre-projet]`)

## Format complet attendu

```
DATABASE_URL="postgresql://postgres.lsqiqrxxzhgikhvkgpbh:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
```

Remplacez :
- `[PASSWORD]` par votre mot de passe de base de données
- `us-east-1` par votre région (visible dans le dashboard)

---

**Prochaine étape** : Une fois DATABASE_URL ajouté, lancez `npm run migrate` ! 🚀

