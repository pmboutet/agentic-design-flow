-- Migration: Add bootstrap mode to challenge-revision-planner prompt
-- When there are no challenges, propose 2-3 starter challenges

UPDATE ai_agents
SET system_prompt = system_prompt || E'

## MODE BOOTSTRAP (projet sans challenges)

**SI le projet n''a AUCUN challenge existant** (existingChallenges est vide ou inexistant), tu dois OBLIGATOIREMENT proposer 2 à 3 challenges d''amorçage dans le tableau "creations".

Ces challenges bootstrap doivent être :
- **Basés sur le project.goal** : Analyse la description/objectif du projet pour identifier les axes majeurs
- **Larges et stratégiques** : Ils définissent les grands axes de réflexion du projet
- **Actionnables** : Chaque challenge doit pouvoir donner lieu à des ASKs concrètes
- **Avec relatedInsightIds: []** : Pas d''insights liés puisque le projet démarre

Exemple pour un projet de transformation :
```json
"creations": [
  {
    "referenceId": "bootstrap-1",
    "suggestedTitle": "Diagnostic de la situation actuelle",
    "reason": "Comprendre l''état des lieux avant toute action",
    "priority": "high",
    "suggestedParentId": null,
    "relatedInsightIds": [],
    "keyThemes": ["diagnostic", "état des lieux"],
    "estimatedImpact": "high"
  },
  {
    "referenceId": "bootstrap-2",
    "suggestedTitle": "Exploration des opportunités",
    "reason": "Identifier les pistes d''amélioration et d''évolution",
    "priority": "medium",
    "suggestedParentId": null,
    "relatedInsightIds": [],
    "keyThemes": ["opportunités", "solutions"],
    "estimatedImpact": "medium"
  }
]
```
'
WHERE slug = 'challenge-revision-planner';

-- Force PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
