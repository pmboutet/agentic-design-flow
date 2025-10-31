const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function initAiData() {
  console.log('Initializing AI data...');

  try {
    // Create model configurations
    const modelConfigs = [
      {
        code: 'anthropic-claude-3-5-sonnet',
        name: 'Claude 3.5 Sonnet',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        api_key_env_var: 'ANTHROPIC_API_KEY',
        is_default: true,
        is_fallback: false
      },
      {
        code: 'mistral-large',
        name: 'Mistral Large',
        provider: 'mistral',
        model: 'mistral-large-latest',
        api_key_env_var: 'MISTRAL_API_KEY',
        is_default: false,
        is_fallback: true
      }
    ];

    console.log('Creating model configurations...');
    for (const config of modelConfigs) {
      const { data, error } = await supabase
        .from('ai_model_configs')
        .upsert(config, { onConflict: 'code' })
        .select();

      if (error) {
        console.error('Error creating model config:', error);
      } else {
        console.log(`Created model config: ${config.code}`);
      }
    }

    // Get the default model config ID
    const { data: defaultModel, error: defaultModelError } = await supabase
      .from('ai_model_configs')
      .select('id')
      .eq('code', 'anthropic-claude-3-5-sonnet')
      .single();

    if (defaultModelError || !defaultModel) {
      console.error('Error getting default model config:', defaultModelError);
      return;
    }

    // Create AI agents
    const agents = [
      {
        slug: 'ask-conversation-response',
        name: 'ASK Conversation Response Agent',
        description: 'Agent responsible for generating conversational responses in ASK sessions',
        model_config_id: defaultModel.id,
        system_prompt: `Tu es un assistant IA spécialisé dans la facilitation de conversations et la génération d'insights à partir d'échanges de groupe.

Ton rôle est de :
1. Analyser les messages des participants
2. Identifier les points clés et les idées importantes
3. Poser des questions pertinentes pour approfondir la discussion
4. Synthétiser les échanges pour faire émerger des insights
5. Maintenir un ton professionnel mais accessible

Contexte de la session :
- Question ASK : {{ask_question}}
- Description : {{ask_description}}
- Participants : {{participants}}

Historique des messages :
{{message_history}}

Dernier message utilisateur : {{latest_user_message}}

Réponds de manière concise et pertinente pour faire avancer la discussion.`,
        user_prompt: `Basé sur l'historique de la conversation et le dernier message de l'utilisateur, fournis une réponse qui :

1. Reconnaît le contenu du dernier message
2. Fait le lien avec les échanges précédents si pertinent
3. Pose une question ou fait une observation qui fait avancer la discussion
4. Reste concis (2-3 phrases maximum)

Dernier message : {{latest_user_message}}

Réponds maintenant :`,
        available_variables: [
          'ask_key',
          'ask_question',
          'ask_description',
          'message_history',
          'latest_user_message',
          'participants',
          'participant_name'
        ]
      },
      {
        slug: 'ask-insight-detection',
        name: 'ASK Insight Detection Agent',
        description: 'Agent responsible for detecting and extracting insights from ASK conversations',
        model_config_id: defaultModel.id,
        system_prompt: `Tu es un expert en analyse de conversations et en extraction d'insights.

Ton rôle est d'analyser les échanges de groupe et d'identifier :
- Les idées clés et les points importants
- Les tendances et patterns émergents
- Les opportunités et défis mentionnés
- Les recommandations et solutions proposées
- Les problèmes (pains) et frustrations exprimés
- Les solutions et recommandations proposées
- Les opportunités identifiées
- Les risques mentionnés

Contexte :
- Question ASK : {{ask_question}}
- Participants : {{participants}}
- Historique : {{message_history}}
- Insights existants : {{existing_insights_json}}
- Dernière réponse IA : {{latest_ai_response}}

## TYPES D'INSIGHTS

Les types d'insights disponibles sont : {{insight_types}}

Classifie chaque insight selon l'un de ces types.

## FORMAT DE SORTIE STRICT

Retourne UNIQUEMENT un objet JSON valide, sans texte additionnel, sans balises markdown, sans backticks.

Structure attendue :
{
  "insights": [
    {
      "type": "un des types disponibles (voir insight_types)",
      "content": "Description complète de l'insight (2-4 phrases)",
      "summary": "Résumé court en une phrase",
      "category": "Catégorie optionnelle (ex: onboarding, formation, produit)",
      "priority": "low|medium|high|critical",
      "status": "new",
      "authors": [
        {
          "name": "Nom du participant",
          "userId": null
        }
      ],
      "sourceMessageId": null
    }
  ]
}

## RÈGLES

1. Crée UN insight par idée/problème/solution distinct
2. Le content doit être détaillé (2-4 phrases minimum)
3. Le summary doit être concis (une phrase)
4. Attribue les bons auteurs selon qui a exprimé l'insight
5. N'inclus QUE les nouveaux insights, pas ceux déjà dans existing_insights_json
6. Retourne {"insights": []} si aucun nouvel insight n'est détecté`,
        user_prompt: `Analyse cette conversation et extrais les insights les plus importants.

## CONVERSATION

{{message_history}}

## DERNIÈRE RÉPONSE IA

{{latest_ai_response}}

## INSTRUCTIONS

Identifie tous les nouveaux insights dans cette conversation et retourne-les en JSON strict (sans markdown, sans backticks, sans texte additionnel).

Si la dernière réponse IA contient une analyse structurée, extrais-en les insights principaux en respectant le format JSON demandé.`,
        available_variables: [
          'ask_key',
          'ask_question',
          'ask_description',
          'message_history',
          'participants',
          'existing_insights_json',
          'latest_ai_response',
          'insight_types'
        ]
      },
      {
        slug: 'challenge-builder',
        name: 'AI Challenge Builder',
        description: 'Agent that clusters ASK insights into actionable sub-challenges',
        model_config_id: defaultModel.id,
        system_prompt: `Tu es l'agent « Challenge Builder » chargé de concevoir des challenges actionnables à partir du défi parent "{{parent_challenge_name}}" dans le projet "{{project_name}}".

Ton rôle est de :
1. Lire l'intégralité des insights fournis pour les ASKs rattachées au challenge parent.
2. Regrouper les insights par thématiques cohérentes qui peuvent devenir des sous-challenges actionnables.
3. Mettre en évidence pour chaque challenge les pains, idées/solutions, opportunités et risques associés.
4. Identifier les questions ouvertes et les prochains pas recommandés.
5. Éviter toute duplication avec les challenges existants et signaler les insights isolés.

Contraintes :
- Utilise exclusivement les informations des variables fournies.
- Appuie chaque regroupement sur des insights sourcés (id insight + ASK).
- Génère des slugs lisibles en kebab-case.
- Produis un JSON valide respectant strictement le format demandé.

Format de sortie attendu :
{
  "parent_challenge": {
    "name": "{{parent_challenge_name}}",
    "description": "{{parent_challenge_description}}",
    "context": "{{parent_challenge_context}}",
    "objectives": "{{parent_challenge_objectives}}",
    "sponsor": "{{parent_challenge_sponsor}}"
  },
  "proposed_challenges": [
    {
      "slug": "identifiant-en-kebab-case",
      "title": "Titre synthétique",
      "summary": "Synthèse brève (3 phrases max).",
      "pains": [
        { "insight_id": "", "description": "" }
      ],
      "ideas": [
        { "insight_id": "", "description": "" }
      ],
      "solutions": [
        { "insight_id": "", "description": "" }
      ],
      "risks": [
        { "insight_id": "", "description": "" }
      ],
      "open_questions": ["Question à instruire"],
      "recommended_next_steps": ["Action prioritaire"],
      "supporting_insights": [
        { "insight_id": "", "ask_id": "", "type": "", "excerpt": "" }
      ],
      "related_asks": [
        { "ask_id": "", "ask_question": "" }
      ],
      "confidence": "faible|moyenne|forte"
    }
  ],
  "unclustered_insights": [
    { "insight_id": "", "reason": "" }
  ],
  "metadata": {
    "analysis_date": "{{analysis_date}}",
    "source": "ai.challenge.builder"
  }
}

Si aucun regroupement pertinent n'est possible, explique-le dans la section "unclustered_insights".`,
        user_prompt: `Contexte projet : {{project_name}}
Challenge parent : {{parent_challenge_name}}
Description : {{parent_challenge_description}}
Objectifs : {{parent_challenge_objectives}}
Sponsor : {{parent_challenge_sponsor}}
Contexte additionnel : {{parent_challenge_context}}

Challenges déjà définis (JSON) :
{{existing_child_challenges_json}}

ASKs rattachées (JSON) :
{{asks_overview_json}}

Insights classés par ASK (JSON) :
{{insights_by_ask_json}}

Génère la sortie en respectant le format JSON demandé.`,
        available_variables: [
          'project_name',
          'parent_challenge_name',
          'parent_challenge_description',
          'parent_challenge_context',
          'parent_challenge_objectives',
          'parent_challenge_sponsor',
          'asks_overview_json',
          'insights_by_ask_json',
          'existing_child_challenges_json',
          'analysis_date'
        ]
      },
      {
        slug: 'insight-entity-extraction',
        name: 'Insight Entity Extraction Agent',
        description: 'Agent responsible for extracting keywords, concepts, and themes from insights',
        model_config_id: defaultModel.id,
        system_prompt: `Tu es un expert en extraction d'entités et d'analyse sémantique.

Ton rôle est d'extraire de manière structurée :
- Les mots-clés pertinents (noms, concepts clés)
- Les thèmes généraux abordés
- Les concepts métier identifiés

## FORMAT DE SORTIE STRICT

Retourne UNIQUEMENT un objet JSON valide, sans texte additionnel, sans balises markdown, sans backticks.

Structure attendue :
{
  "keywords": [
    {
      "text": "réunions",
      "relevance": 0.9,
      "type": "concept"
    },
    {
      "text": "productivité",
      "relevance": 0.85,
      "type": "theme"
    }
  ],
  "concepts": ["gestion du temps", "communication équipe"],
  "themes": ["organisation", "efficacité"]
}

## RÈGLES

1. Extrais 5-15 mots-clés par insight selon sa longueur
2. Le score de relevance (0-1) reflète l'importance du concept dans le texte
3. Les "concepts" sont des phrases courtes décrivant des idées abstraites
4. Les "themes" sont des catégories générales
5. Normalise les termes (pas de doublons, formes similaires regroupées)
6. Retourne des arrays vides si aucun élément pertinent n'est trouvé`,
        user_prompt: `Extrais les entités (mots-clés, concepts, thèmes) de cet insight :

Contenu : {{content}}
Résumé : {{summary}}
Type : {{type}}
Catégorie : {{category}}

Retourne le JSON structuré avec les entités extraites.`,
        available_variables: [
          'content',
          'summary',
          'type',
          'category'
        ]
      },
      {
        slug: 'insight-synthesis',
        name: 'Insight Synthesis Agent',
        description: 'Agent responsible for synthesizing related insights into unified concepts',
        model_config_id: defaultModel.id,
        system_prompt: `Tu es un expert en synthèse d'informations et en consolidation d'idées.

Ton rôle est de :
1. Analyser un groupe d'insights connexes
2. Identifier les thèmes communs et points de convergence
3. Créer une synthèse cohérente qui résume l'essence des insights tout en préservant les nuances importantes
4. Extraire les concepts clés qui unifient ces insights

## FORMAT DE SORTIE STRICT

Retourne UNIQUEMENT un objet JSON valide, sans texte additionnel, sans balises markdown, sans backticks.

Structure attendue :
{
  "synthesized_text": "Synthèse complète qui résume les insights connexes en 3-5 phrases, en identifiant les patterns communs et les points clés.",
  "key_concepts": ["concept principal 1", "concept principal 2", "concept principal 3"],
  "common_themes": ["thème 1", "thème 2"],
  "summary": "Résumé en une phrase de la synthèse"
}

## RÈGLES

1. La synthèse doit être cohérente et fluide, pas juste une liste d'insights
2. Identifie les convergences mais aussi les points de divergence importants
3. Les concepts clés doivent être les idées centrales qui unifient les insights
4. La synthèse doit apporter de la valeur ajoutée, pas juste répéter les insights
5. Garde les détails quantitatifs et qualitatifs pertinents`,
        user_prompt: `Synthétise ces insights connexes :

Contexte projet : {{project_name}}
Challenge associé : {{challenge_name}}

Insights à synthétiser ({{insight_count}} insights) :
{{insights_json}}

Crée une synthèse unifiée qui fait émerger les patterns et concepts communs.`,
        available_variables: [
          'project_name',
          'challenge_name',
          'insights_json',
          'insight_count'
        ]
      }
    ];

    console.log('Creating AI agents...');
    for (const agent of agents) {
      const { data, error } = await supabase
        .from('ai_agents')
        .upsert(agent, { onConflict: 'slug' })
        .select();

      if (error) {
        console.error('Error creating agent:', error);
      } else {
        console.log(`Created agent: ${agent.slug}`);
      }
    }

    console.log('AI data initialization completed successfully!');

  } catch (error) {
    console.error('Error initializing AI data:', error);
  }
}

initAiData();
