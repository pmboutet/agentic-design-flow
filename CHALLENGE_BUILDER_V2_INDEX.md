# Challenge Builder V2 - Index de la documentation 📚

## 🎯 Par besoin

### Je veux démarrer rapidement
👉 **[CHALLENGE_BUILDER_V2_QUICKSTART.md](./CHALLENGE_BUILDER_V2_QUICKSTART.md)**
- Installation en 3 étapes
- Tests de base
- Premiers appels API

### Je veux comprendre en détail
👉 **[CHALLENGE_BUILDER_V2_README.md](./CHALLENGE_BUILDER_V2_README.md)**
- Architecture complète
- Concepts clés (foundation insights, vision globale)
- Configuration avancée
- Monitoring et troubleshooting

### Je veux migrer depuis V1
👉 **[CHALLENGE_BUILDER_V2_MIGRATION.md](./CHALLENGE_BUILDER_V2_MIGRATION.md)**
- Checklist de migration
- Comparaison V1 vs V2
- Tests de validation
- Procédure de rollback

### Je veux comprendre l'architecture
👉 **[docs/CHALLENGE_BUILDER_OPTIMIZED.md](./docs/CHALLENGE_BUILDER_OPTIMIZED.md)**
- Flow détaillé (Phase 1 & 2)
- Types TypeScript
- Schémas de données
- Variables disponibles

---

## 📁 Par type de fichier

### Documentation

| Fichier | Description | Pour qui ? |
|---------|-------------|------------|
| **CHALLENGE_BUILDER_V2_QUICKSTART.md** | Démarrage rapide | Développeurs pressés |
| **CHALLENGE_BUILDER_V2_README.md** | Documentation principale | Tout le monde |
| **CHALLENGE_BUILDER_V2_MIGRATION.md** | Guide de migration V1→V2 | Ops/DevOps |
| **docs/CHALLENGE_BUILDER_OPTIMIZED.md** | Architecture technique | Architectes/Devs |

### Code

| Fichier | Description | Usage |
|---------|-------------|-------|
| **src/app/api/admin/projects/[id]/ai/challenge-builder-v2/route.ts** | Route API V2 | Endpoint principal |
| **src/app/api/admin/projects/[id]/ai/challenge-builder/route.ts** | Route API V1 (ancienne) | Référence |

### Scripts

| Script | Description | Commande |
|--------|-------------|----------|
| **scripts/init-challenge-builder-optimized.js** | Installe les 3 agents en BDD | `node scripts/init-challenge-builder-optimized.js` |
| **scripts/test-challenge-builder-v2.js** | Valide l'installation | `node scripts/test-challenge-builder-v2.js [PROJECT_ID]` |

---

## 🔍 Par rôle

### Développeur Frontend

**Besoin** : Intégrer le nouveau endpoint dans l'UI

**Fichiers à consulter** :
1. [CHALLENGE_BUILDER_V2_QUICKSTART.md](./CHALLENGE_BUILDER_V2_QUICKSTART.md) - Section "Utilisation"
2. [CHALLENGE_BUILDER_V2_README.md](./CHALLENGE_BUILDER_V2_README.md) - Section "API Endpoint"

**Code à modifier** :
- `src/components/project/ProjectJourneyBoard.tsx`

**Changement minimal** :
```typescript
// Remplacer
const response = await fetch(`/api/admin/projects/${projectId}/ai/challenge-builder`);

// Par
const response = await fetch(`/api/admin/projects/${projectId}/ai/challenge-builder-v2`);
```

### Développeur Backend

**Besoin** : Comprendre l'architecture et personnaliser

**Fichiers à consulter** :
1. [docs/CHALLENGE_BUILDER_OPTIMIZED.md](./docs/CHALLENGE_BUILDER_OPTIMIZED.md) - Architecture complète
2. [src/app/api/admin/projects/[id]/ai/challenge-builder-v2/route.ts](./src/app/api/admin/projects/[id]/ai/challenge-builder-v2/route.ts) - Code source

**Points clés** :
- Phase 1 : Planner analyse tout (1 appel)
- Phase 2 : Exécution parallèle (N appels)
- Tous les appels loggés dans `ai_agent_logs`

### DevOps / SRE

**Besoin** : Déployer, migrer, monitorer

**Fichiers à consulter** :
1. [CHALLENGE_BUILDER_V2_MIGRATION.md](./CHALLENGE_BUILDER_V2_MIGRATION.md) - Migration complète
2. [CHALLENGE_BUILDER_V2_README.md](./CHALLENGE_BUILDER_V2_README.md) - Section "Monitoring"

**Scripts à exécuter** :
```bash
# 1. Installation
node scripts/init-challenge-builder-optimized.js

# 2. Test
node scripts/test-challenge-builder-v2.js PROJECT_ID

# 3. Monitoring
psql -c "SELECT interaction_type, COUNT(*), AVG(latency_ms) FROM ai_agent_logs WHERE interaction_type LIKE 'project_challenge_%' GROUP BY 1"
```

### Product Owner / Manager

**Besoin** : Comprendre les gains et valider

**Fichiers à consulter** :
1. [CHALLENGE_BUILDER_V2_QUICKSTART.md](./CHALLENGE_BUILDER_V2_QUICKSTART.md) - Vue d'ensemble
2. [CHALLENGE_BUILDER_V2_README.md](./CHALLENGE_BUILDER_V2_README.md) - Section "Comparaison V1 vs V2"

**Gains clés** :
- ⚡ **×6 plus rapide** : 5s vs 30s pour 10 challenges
- 💰 **-56% de coût** : 35K vs 80K tokens
- 🎯 **+30% cohérence** : vision globale vs silotée
- 🧠 **Innovation** : Foundation insights identifiés automatiquement

### Data Analyst

**Besoin** : Analyser les performances

**Fichiers à consulter** :
1. [CHALLENGE_BUILDER_V2_README.md](./CHALLENGE_BUILDER_V2_README.md) - Section "Monitoring"
2. [docs/CHALLENGE_BUILDER_OPTIMIZED.md](./docs/CHALLENGE_BUILDER_OPTIMIZED.md) - Section "Monitoring et debug"

**Requêtes SQL** :
```sql
-- Performance par phase
SELECT 
  interaction_type,
  AVG(latency_ms) / 1000 as avg_seconds,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms / 1000.0) as p95_seconds
FROM ai_agent_logs
WHERE interaction_type LIKE 'project_challenge_%'
GROUP BY interaction_type;

-- Taux de succès
SELECT 
  DATE(created_at),
  COUNT(*) as total,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as success
FROM ai_agent_logs
WHERE interaction_type LIKE 'project_challenge_%'
GROUP BY 1;
```

---

## 📊 Par étape du projet

### Phase 1 : Découverte (5 minutes)

1. ✅ Lire [CHALLENGE_BUILDER_V2_QUICKSTART.md](./CHALLENGE_BUILDER_V2_QUICKSTART.md)
2. ✅ Comprendre les gains (×6 vitesse, -56% coût)
3. ✅ Voir l'architecture (2 phases : Planning + Execution)

### Phase 2 : Installation (10 minutes)

1. ✅ Vérifier les prérequis (env vars)
2. ✅ Exécuter `node scripts/init-challenge-builder-optimized.js`
3. ✅ Valider avec `node scripts/test-challenge-builder-v2.js`

### Phase 3 : Test (15 minutes)

1. ✅ Tester sur un projet dev : `node scripts/test-challenge-builder-v2.js PROJECT_ID`
2. ✅ Comparer avec V1 (temps, qualité, coût)
3. ✅ Vérifier les logs dans `ai_agent_logs`

### Phase 4 : Intégration (30 minutes)

1. ✅ Modifier le frontend (feature flag ou direct)
2. ✅ Tester en local
3. ✅ Déployer en staging

### Phase 5 : Migration (1 semaine)

1. ✅ Suivre [CHALLENGE_BUILDER_V2_MIGRATION.md](./CHALLENGE_BUILDER_V2_MIGRATION.md)
2. ✅ Monitorer pendant 1 semaine
3. ✅ Comparer les métriques V1 vs V2
4. ✅ Décider de remplacer V1

### Phase 6 : Optimisation (continu)

1. ✅ Affiner les prompts basé sur les retours
2. ✅ Monitorer les performances
3. ✅ Ajuster les seuils (nombre d'insights, etc.)

---

## 🆘 Troubleshooting rapide

### Problème d'installation

**Symptôme** : "Agent not found"

**Solution** : 
1. Vérifier [CHALLENGE_BUILDER_V2_QUICKSTART.md](./CHALLENGE_BUILDER_V2_QUICKSTART.md) - Section "Troubleshooting"
2. Exécuter `node scripts/init-challenge-builder-optimized.js`
3. Valider avec `node scripts/test-challenge-builder-v2.js`

### Problème de performance

**Symptôme** : Pas plus rapide que V1

**Solution** :
1. Consulter [CHALLENGE_BUILDER_V2_README.md](./CHALLENGE_BUILDER_V2_README.md) - Section "Troubleshooting"
2. Vérifier la parallélisation dans les logs SQL
3. Vérifier `Promise.all()` dans le code

### Problème de qualité

**Symptôme** : Trop ou pas assez d'updates

**Solution** :
1. Lire [CHALLENGE_BUILDER_V2_README.md](./CHALLENGE_BUILDER_V2_README.md) - Section "Configuration"
2. Ajuster les prompts des agents
3. Modifier les seuils dans le system prompt

### Problème de logs

**Symptôme** : Erreurs dans `ai_agent_logs`

**Solution** :
1. Consulter [docs/CHALLENGE_BUILDER_OPTIMIZED.md](./docs/CHALLENGE_BUILDER_OPTIMIZED.md) - Section "Troubleshooting"
2. Vérifier les logs détaillés
3. Tester avec température/tokens différents

---

## 📞 Contacts et ressources

### Documentation

- **Quick Start** : [CHALLENGE_BUILDER_V2_QUICKSTART.md](./CHALLENGE_BUILDER_V2_QUICKSTART.md)
- **README** : [CHALLENGE_BUILDER_V2_README.md](./CHALLENGE_BUILDER_V2_README.md)
- **Migration** : [CHALLENGE_BUILDER_V2_MIGRATION.md](./CHALLENGE_BUILDER_V2_MIGRATION.md)
- **Architecture** : [docs/CHALLENGE_BUILDER_OPTIMIZED.md](./docs/CHALLENGE_BUILDER_OPTIMIZED.md)

### Code source

- **Route V2** : `src/app/api/admin/projects/[id]/ai/challenge-builder-v2/route.ts`
- **Route V1** : `src/app/api/admin/projects/[id]/ai/challenge-builder/route.ts`

### Scripts

- **Installation** : `scripts/init-challenge-builder-optimized.js`
- **Tests** : `scripts/test-challenge-builder-v2.js`

### Base de données

- **Agents** : Table `ai_agents`
- **Logs** : Table `ai_agent_logs`
- **Models** : Table `ai_model_configs`

---

## ✅ Checklist complète

- [ ] Documentation lue et comprise
- [ ] Prérequis vérifiés (env vars)
- [ ] Agents installés
- [ ] Tests unitaires passés
- [ ] Test sur projet réel réussi
- [ ] Comparaison V1 vs V2 effectuée
- [ ] Frontend intégré (optionnel)
- [ ] Monitoring en place
- [ ] Équipe formée
- [ ] Migration planifiée

---

**Navigation rapide** :
- 🚀 [Quick Start](./CHALLENGE_BUILDER_V2_QUICKSTART.md)
- 📖 [README complet](./CHALLENGE_BUILDER_V2_README.md)
- 🔄 [Guide de migration](./CHALLENGE_BUILDER_V2_MIGRATION.md)
- 🏗️ [Architecture](./docs/CHALLENGE_BUILDER_OPTIMIZED.md)

