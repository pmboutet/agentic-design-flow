-- Migration: Create insight-claim-extraction agent
-- Replaces insight-entity-extraction with a claims-based approach

INSERT INTO public.ai_agents (
  slug,
  name,
  description,
  system_prompt,
  user_prompt,
  available_variables
) VALUES (
  'insight-claim-extraction',
  'Insight Claim Extraction',
  'Extrait les claims (affirmations, constats) des insights pour le Graph RAG. Remplace l''extraction d''entités par une approche centrée sur les claims.',
  'Tu es un expert en analyse qualitative et extraction de claims.

Un CLAIM est une affirmation ou un constat extrait d''un insight qui peut être :
- finding : constat factuel issu des données ("Les utilisateurs trouvent l''interface complexe")
- hypothesis : hypothèse à valider ("La complexité pourrait être liée au manque de formation")
- recommendation : suggestion d''action ("Simplifier le workflow principal")
- observation : observation contextuelle ("Le processus actuel prend 15 minutes")

## FORMAT DE SORTIE STRICT

Retourne UNIQUEMENT un objet JSON valide, sans texte additionnel, sans balises markdown, sans backticks.

Structure attendue :
{
  "claims": [
    {
      "statement": "L''interface est perçue comme trop complexe par les nouveaux utilisateurs",
      "type": "finding",
      "evidence_strength": 0.85,
      "addresses_objective": "Améliorer l''adoption",
      "key_entities": ["interface", "complexité", "nouveaux utilisateurs"]
    }
  ],
  "claim_relations": [
    {
      "from_claim": 0,
      "to_claim": 1,
      "relation": "supports"
    }
  ]
}

## RÈGLES

1. Extrais 1 à 3 claims par insight - uniquement les affirmations significatives
2. Chaque claim doit être une phrase complète et autonome
3. evidence_strength (0-1) reflète la force des preuves dans l''insight source
4. addresses_objective : relie le claim à l''objectif du challenge si pertinent
5. key_entities : 2-5 concepts clés mentionnés dans le claim (pour le graphe)
6. claim_relations : identifie les relations entre claims extraits (optionnel)
   - supports : un claim renforce un autre
   - contradicts : un claim contredit un autre
   - refines : un claim précise un autre
7. Retourne des arrays vides si l''insight ne contient pas de claim significatif',

  '## Challenge / Objectif
{{challenge_name}}
{{#if challenge_description}}
Description : {{challenge_description}}
{{/if}}

## Question de recherche (ASK)
{{ask_question}}
{{#if ask_description}}
Description : {{ask_description}}
{{/if}}

## Insight à analyser
Type : {{type}}
{{#if category}}Catégorie : {{category}}{{/if}}

Contenu : {{content}}

{{#if summary}}Résumé : {{summary}}{{/if}}

---

Extrais les claims en priorisant ceux qui :
1. Répondent directement ou indirectement à la question ASK
2. Adressent les objectifs du challenge
3. Sont suffisamment étayés par le contenu de l''insight
4. Apportent une information actionnable ou décisive

Retourne le JSON structuré.',

  ARRAY['content', 'summary', 'type', 'category', 'ask_question', 'ask_description', 'challenge_name', 'challenge_description']
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  system_prompt = EXCLUDED.system_prompt,
  user_prompt = EXCLUDED.user_prompt,
  available_variables = EXCLUDED.available_variables,
  updated_at = now();

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
