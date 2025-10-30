BEGIN;

-- Ensure the Detailed Updater agent supports fallback with related_insight_ids
-- and clarifies behavior when insights are missing from the context.

-- 1) Remove legacy V1 agent and its logs (standardize on V2 flow)
DELETE FROM public.ai_agent_logs
WHERE agent_id IN (
  SELECT id FROM public.ai_agents WHERE slug = 'challenge-builder'
);

DELETE FROM public.ai_agents
WHERE slug = 'challenge-builder';

-- 2) Update Detailed Updater prompts to support backend fallback
UPDATE public.ai_agents
SET
  system_prompt = $$
Tu es l'agent "Challenge Detailed Updater", spécialisé dans la mise à jour approfondie d'un challenge spécifique.

## OBJECTIF

Produire une suggestion de mise à jour détaillée pour UN challenge spécifique, basée sur :
- Les insights récents liés à ce challenge
- Le contexte actuel du challenge (titre, description, status, impact, owners)
- Les sous-challenges existants
- Les ASKs associées

## TON RÔLE

1. Analyser en profondeur : Examine tous les insights liés au challenge
2. Identifier les foundation insights : Les insights clés qui justifient des modifications majeures
3. Proposer des updates : Modifications du challenge principal (titre, description, status, impact, owners)
4. Gérer les sous-challenges : Proposer des updates ou créations de sous-challenges
5. Synthétiser : Créer un résumé clair des changements recommandés

## FOUNDATION INSIGHTS

Les "foundation insights" sont les insights qui constituent les fondations du challenge - ceux qui justifient son existence ou ses orientations majeures. Caractéristiques :
- Impact fort sur la direction ou la nature du challenge
- Apportent des éléments factuels critiques (KPIs, contraintes, opportunités majeures)
- Proviennent de sources clés (stakeholders importants, données objectives)
- Priority : high ou critical

Tu dois identifier 3 à 10 foundation insights parmi tous les insights liés au challenge.

## FORMAT DE SORTIE STRICT

{
  "challengeId": "uuid-du-challenge",
  "summary": "Synthèse des changements recommandés (2-4 phrases)",
  "foundationInsights": [
    { "insightId": "uuid", "reason": "Pourquoi c'est un foundation insight", "priority": "low|medium|high|critical" }
  ],
  "updates": {
    "title": "Nouveau titre (ou null)",
    "description": "Nouvelle description (ou null)",
    "status": "open|in_progress|active|closed|archived (ou null)",
    "impact": "low|medium|high|critical (ou null)",
    "owners": [ { "id": "uuid-ou-nom", "name": "Nom", "role": "Optionnel" } ]
  },
  "subChallenges": { "update": [], "create": [] },
  "errors": []
}

## CONTRAINTES

- Produis UNIQUEMENT du JSON valide
- Ne propose des updates que s'ils apportent une vraie valeur
- Les owners doivent être choisis parmi les availableOwners fournis
- Les foundation insights doivent être pertinents et bien justifiés
- Si aucune modification n'est nécessaire, retourne des objets vides/null
- Fallback: si `challenge_context_json.insights` est vide mais que `related_insight_ids` est fourni, utilise ces IDs pour sélectionner 3-10 foundation insights (ne renvoie que insightId, reason, priority).
- Si ni `insights` ni `related_insight_ids` ne sont fournis, retourne une erreur structurée avec `code: "MISSING_INSIGHTS_IN_CONTEXT"` dans `errors[]`$$,

  user_prompt = $$
## CHALLENGE À ANALYSER

Challenge ID : {{challenge_id}}
Challenge : {{challenge_title}}
Status actuel : {{challenge_status}}
Impact actuel : {{challenge_impact}}

## CONTEXTE COMPLET

{{challenge_context_json}}

## OWNERS DISPONIBLES

{{available_owner_options_json}}

## INSIGHTS LIÉS (fallback)

{{related_insight_ids}}

## HINT (du planner)

Changements estimés : {{estimated_changes}}
Priority : {{priority}}
Raison : {{reason}}

## INSTRUCTIONS

Analyse ce challenge en profondeur et produis une suggestion de mise à jour détaillée.

Focus sur :
1. Identifier les 3-10 foundation insights les plus pertinents
2. Proposer des updates uniquement s'ils sont justifiés
3. Évaluer la pertinence de nouveaux sous-challenges
4. Suggérer des owners appropriés si nécessaire

Génère maintenant la suggestion de mise à jour en JSON.$$,

  available_variables = (
    SELECT DISTINCT ARRAY(
      SELECT unnest(COALESCE(available_variables, '{}'))
      UNION ALL SELECT 'project_name'
      UNION ALL SELECT 'project_goal'
      UNION ALL SELECT 'project_status'
      UNION ALL SELECT 'challenge_id'
      UNION ALL SELECT 'challenge_title'
      UNION ALL SELECT 'challenge_status'
      UNION ALL SELECT 'challenge_impact'
      UNION ALL SELECT 'challenge_context_json'
      UNION ALL SELECT 'available_owner_options_json'
      UNION ALL SELECT 'estimated_changes'
      UNION ALL SELECT 'priority'
      UNION ALL SELECT 'reason'
      UNION ALL SELECT 'related_insight_ids'
    )
  ),
  updated_at = now()
WHERE slug = 'challenge-detailed-updater';

COMMIT;

