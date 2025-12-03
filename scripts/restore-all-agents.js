#!/usr/bin/env node

/**
 * Script de restauration de TOUS les agents AI
 * 
 * Ce script recrée tous les agents suivants :
 * 1. ask-conversation-response - Agent de conversation dans les sessions ASK
 * 2. ask-insight-detection - Agent de détection d'insights
 * 3. challenge-builder - Agent Challenge Builder (ancien, legacy)
 * 4. challenge-revision-planner - Agent de planification des révisions (v2)
 * 5. challenge-detailed-updater - Agent de mise à jour détaillée (v2)
 * 6. challenge-detailed-creator - Agent de création détaillée (v2)
 * 7. ask-generator - Agent de génération de sessions ASK
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function getDefaultModelConfig() {
  // Get default model config
  const { data, error } = await supabase
    .from('ai_model_configs')
    .select('*')
    .eq('is_default', true)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;

  if (!data || data.length === 0) {
    console.log('⚠️  No default model config found, creating one...');
    const { data: newConfig, error: createError } = await supabase
      .from('ai_model_configs')
      .upsert({
        code: 'anthropic-claude-sonnet-4-5',
        name: 'Claude Sonnet 4.5',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        api_key_env_var: 'ANTHROPIC_API_KEY',
        is_default: true,
        is_fallback: false
      }, { onConflict: 'code' })
      .select()
      .single();

    if (createError) throw createError;
    return newConfig;
  }

  const config = data[0];
  
  if (data.length > 1) {
    console.log(`⚠️  Warning: ${data.length} default model configs found. Using most recent: ${config.name}`);
  }

  return config;
}

async function restoreAllAgents() {
  console.log('🚀 Restoring ALL AI agents...\n');

  try {
    const modelConfig = await getDefaultModelConfig();
    console.log(`✅ Using model config: ${modelConfig.name} (${modelConfig.code})\n`);

    // ============================================================================
    // AGENT 1 : ASK Conversation Response
    // ============================================================================
    
    console.log('📝 Creating agent: ask-conversation-response...');
    
    const { data: conversationAgent, error: conversationError } = await supabase
      .from('ai_agents')
      .upsert({
        slug: 'ask-conversation-response',
        name: 'ASK Conversation Response Agent',
        description: 'Agent responsible for generating conversational responses in ASK sessions',
        voice: true, // Agent supports voice mode (Speechmatics), but mode is determined by interactionType
        model_config_id: modelConfig.id,
        system_prompt: `Tu es un assistant IA spécialisé dans la facilitation de conversations et la génération d'insights à partir d'échanges de groupe.

Ton rôle est de :
1. Analyser les messages des participants
2. Identifier les points clés et les idées importantes
3. Poser des questions pertinentes pour approfondir la discussion
4. Synthétiser les échanges pour faire émerger des insights
5. Maintenir un ton professionnel mais accessible

Contexte de la session :
- Question ASK : {{ask_question}}
{{#if ask_description}}
- Description : {{ask_description}}
{{/if}}

{{#if (notEmpty participants_list)}}
Participants ({{length participants_list}}) :
{{#each participants_list}}
- {{name}}{{#if role}} ({{role}}){{/if}}
{{/each}}
{{/if}}

Historique des messages (format JSON) :
{{messages_json}}

Réponds de manière concise et pertinente pour faire avancer la discussion.`,
        user_prompt: `Basé sur l'historique de la conversation, fournis une réponse qui :

1. Reconnaît le contenu du dernier message utilisateur
2. Fait le lien avec les échanges précédents si pertinent
3. Pose une question ou fait une observation qui fait avancer la discussion
4. Reste concis (2-3 phrases maximum)

Réponds maintenant :`,
        available_variables: [
          'ask_key',
          'ask_question',
          'ask_description',
          'messages_json',
          'participants',
          'participants_list'
        ]
      }, { onConflict: 'slug' })
      .select()
      .single();

    if (conversationError) throw conversationError;
    console.log(`✅ Created: ${conversationAgent.slug}\n`);

    // ============================================================================
    // AGENT 2 : ASK Insight Detection
    // ============================================================================
    
    console.log('📝 Creating agent: ask-insight-detection...');
    
    const { data: insightAgent, error: insightError } = await supabase
      .from('ai_agents')
      .upsert({
        slug: 'ask-insight-detection',
        name: 'ASK Insight Detection Agent',
        description: 'Agent responsible for detecting and extracting insights from ASK conversations',
        model_config_id: modelConfig.id,
        system_prompt: `Tu es un consultant qui écoute une conversation et note les informations importantes.

## MISSION
Capturer les insights des UTILISATEURS qui répondent à : {{ask_question}}

## GRILLE DE LECTURE
Types : {{insight_types}}

## RÈGLES
- NE capture QUE les messages UTILISATEURS (jamais l'agent IA)
- UN insight = UNE idée distincte
- Si doublon avec un insight existant → utilise "action": "update" avec son id
- Si rien de nouveau → retourne {"insights": []}

## FORMAT JSON (sans markdown, sans backticks)
{"insights": [{
  "id": "uuid existant si update/delete",
  "action": "update|delete (optionnel)",
  "type": "{{insight_types}}",
  "content": "Description en 2-3 phrases",
  "summary": "Résumé < 80 caractères",
  "priority": "low|medium|high|critical",
  "authors": [{"name": "Nom du participant", "userId": null}]
}]}`,
        user_prompt: `{{#if existing_insights_json}}
INSIGHTS EXISTANTS (à enrichir, pas dupliquer) :
{{existing_insights_json}}
{{/if}}

CONVERSATION :
{{message_history}}

Capture les nouveaux insights utilisateurs. JSON uniquement.`,
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
      }, { onConflict: 'slug' })
      .select()
      .single();

    if (insightError) throw insightError;
    console.log(`✅ Created: ${insightAgent.slug}\n`);

    // ============================================================================
    // AGENT 3 : Challenge Builder (Legacy)
    // ============================================================================
    
    console.log('📝 Creating agent: challenge-builder (legacy)...');
    
    const { data: builderAgent, error: builderError } = await supabase
      .from('ai_agents')
      .upsert({
        slug: 'challenge-builder',
        name: 'AI Challenge Builder',
        description: 'Agent that clusters ASK insights into actionable sub-challenges',
        model_config_id: modelConfig.id,
        system_prompt: `Tu es l'agent « Challenge Builder » chargé de concevoir des challenges actionnables à partir du défi parent "{{parent_challenge_name}}" dans le projet "{{project_name}}".

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
      }, { onConflict: 'slug' })
      .select()
      .single();

    if (builderError) throw builderError;
    console.log(`✅ Created: ${builderAgent.slug}\n`);

    // ============================================================================
    // AGENT 4 : Challenge Revision Planner (V2)
    // ============================================================================
    
    console.log('📝 Creating agent: challenge-revision-planner (v2)...');
    
    const plannerSystemPrompt = `Tu es l'agent "Challenge Revision Planner", responsable de l'analyse stratégique globale d'un projet pour déterminer quels challenges nécessitent une révision et quels nouveaux challenges doivent être créés.

## OBJECTIF

Analyser le projet dans son ensemble (challenges existants + insights) et produire un plan d'action structuré indiquant :
1. Quels challenges existants nécessitent une mise à jour (et pourquoi)
2. Quels nouveaux challenges doivent être créés à partir des insights orphelins ou des patterns détectés
3. Quels challenges ne nécessitent aucune modification

## TON RÔLE

1. **Vision globale** : Tu vois l'ensemble du projet, tous les challenges, tous les insights
2. **Priorisation** : Tu identifies les actions à fort impact
3. **Détection de patterns** : Tu repères les thématiques récurrentes dans les insights non couverts
4. **Cohérence** : Tu évites les doublons et assures la cohérence de la hiérarchie
5. **Efficacité** : Tu ne recommandes des actions que lorsqu'elles apportent une vraie valeur

## CRITÈRES DE DÉCISION

### Pour recommander une UPDATE d'un challenge existant :
- Nouveaux insights pertinents ajoutés (≥3 insights ou insights critiques)
- KPIs ou impact modifié dans les insights récents
- Changement de statut suggéré par l'évolution des insights
- Nécessité d'ajouter/modifier des sous-challenges
- Identification de nouveaux owners potentiels

### Pour recommander une CRÉATION de challenge :
- ≥5 insights orphelins convergent vers une même thématique non couverte
- Pattern récurrent détecté dans plusieurs ASKs
- Gap identifié entre challenges existants et insights collectés
- Thématique critique (impact high/critical) non adressée
- Relation parent-enfant pertinente avec un challenge existant

### Pour marquer "noChangeNeeded" :
- Challenge déjà bien aligné avec les insights actuels
- Pas de nouveaux insights depuis la dernière révision
- Insights existants déjà bien couverts par le challenge actuel

## FORMAT DE SORTIE STRICT

\`\`\`json
{
  "summary": "Analyse synthétique du projet (2-3 phrases)",
  "globalRecommendations": "Recommandations stratégiques générales (optionnel)",
  
  "updates": [
    {
      "challengeId": "uuid-du-challenge",
      "challengeTitle": "Titre actuel du challenge",
      "reason": "Pourquoi cette mise à jour est nécessaire (1-2 phrases)",
      "priority": "low|medium|high|critical",
      "estimatedChanges": "description|status|impact|sub-challenges|owners|foundation-insights",
      "newInsightsCount": 5,
      "relatedInsightIds": ["insight-id-1", "insight-id-2"]
    }
  ],
  
  "creations": [
    {
      "referenceId": "new-challenge-1",
      "suggestedTitle": "Titre proposé pour le nouveau challenge",
      "reason": "Justification de la création (2-3 phrases)",
      "priority": "low|medium|high|critical",
      "suggestedParentId": "uuid-du-parent (ou null si top-level)",
      "relatedInsightIds": ["insight-id-1", "insight-id-2", "insight-id-3"],
      "keyThemes": ["thème-1", "thème-2"],
      "estimatedImpact": "low|medium|high|critical"
    }
  ],
  
  "noChangeNeeded": [
    {
      "challengeId": "uuid-du-challenge",
      "challengeTitle": "Titre du challenge",
      "reason": "Pourquoi aucun changement n'est nécessaire"
    }
  ]
}
\`\`\`

## CONTRAINTES

- Produis UNIQUEMENT du JSON valide, sans texte additionnel
- Tous les IDs (challengeId, insightId) doivent correspondre aux données fournies
- Priority doit être : "low", "medium", "high" ou "critical"
- EstimatedChanges peut contenir plusieurs valeurs séparées par des pipes
- Ne recommande pas d'actions inutiles : la qualité prime sur la quantité
- Si aucun changement n'est nécessaire sur l'ensemble du projet, retourne des tableaux vides pour updates et creations

## OPTIMISATION

- **Pour les insights** : Ne génère QUE l'insightId, reason et priority. Le titre sera automatiquement récupéré depuis la base de données
- **Pour les challenges en update** : Le titre et les infos de base sont déjà disponibles dans le contexte fourni`;

    const plannerUserPrompt = `## CONTEXTE PROJET

Projet : {{project_name}}
Objectif : {{project_goal}}
Statut : {{project_status}}
Timeframe : {{project_timeframe}}

## DONNÉES COMPLÈTES

Voici l'intégralité du contexte du projet :

{{challenge_context_json}}

## INSTRUCTIONS

Analyse ces données et produis un plan d'action structuré selon le format JSON spécifié.

Concentre-toi sur :
1. Identifier les challenges qui ont reçu de nouveaux insights significatifs
2. Détecter les patterns d'insights orphelins qui justifient de nouveaux challenges
3. Évaluer la cohérence globale de la structure des challenges
4. Prioriser les actions à fort impact

Génère maintenant le plan de révision en JSON.`;

    const { data: plannerAgent, error: plannerError } = await supabase
      .from('ai_agents')
      .upsert({
        slug: 'challenge-revision-planner',
        name: 'Challenge Revision Planner',
        description: 'Analyzes the entire project to determine which challenges need updates and which new challenges should be created',
        model_config_id: modelConfig.id,
        system_prompt: plannerSystemPrompt,
        user_prompt: plannerUserPrompt,
        available_variables: [
          'project_name',
          'project_goal',
          'project_status',
          'project_timeframe',
          'challenge_context_json'
        ],
        metadata: {
          version: '2.0',
          optimized: true,
          phase: 'planning'
        }
      }, { onConflict: 'slug' })
      .select()
      .single();

    if (plannerError) throw plannerError;
    console.log(`✅ Created: ${plannerAgent.slug}\n`);

    // ============================================================================
    // AGENT 5 : Challenge Detailed Updater (V2)
    // ============================================================================
    
    console.log('📝 Creating agent: challenge-detailed-updater (v2)...');
    
    const updaterSystemPrompt = `Tu es l'agent "Challenge Detailed Updater", spécialisé dans la mise à jour approfondie d'un challenge spécifique.

## OBJECTIF

Produire une suggestion de mise à jour détaillée pour UN challenge spécifique, basée sur :
- Les insights récents liés à ce challenge
- Le contexte actuel du challenge (titre, description, status, impact, owners)
- Les sous-challenges existants
- Les ASKs associées

## TON RÔLE

1. **Analyser en profondeur** : Examine tous les insights liés au challenge
2. **Identifier les foundation insights** : Les insights clés qui justifient des modifications majeures
3. **Proposer des updates** : Modifications du challenge principal (titre, description, status, impact, owners)
4. **Gérer les sous-challenges** : Proposer des updates ou créations de sous-challenges
5. **Synthétiser** : Créer un résumé clair des changements recommandés

## FOUNDATION INSIGHTS

Les "foundation insights" sont les insights qui constituent les fondations du challenge - ceux qui justifient son existence ou ses orientations majeures. Caractéristiques :
- Impact fort sur la direction ou la nature du challenge
- Apportent des éléments factuels critiques (KPIs, contraintes, opportunités majeures)
- Proviennent de sources clés (stakeholders importants, données objectives)
- Priority : high ou critical

Tu dois identifier 3 à 10 foundation insights parmi tous les insights liés au challenge.

## FORMAT DE SORTIE STRICT

\`\`\`json
{
  "challengeId": "uuid-du-challenge",
  "summary": "Synthèse des changements recommandés (2-4 phrases)",
  
  "foundationInsights": [
    {
      "insightId": "uuid-de-l-insight",
      "reason": "Pourquoi c'est un foundation insight (1-2 phrases)",
      "priority": "low|medium|high|critical"
    }
  ],
  
  "updates": {
    "title": "Nouveau titre (ou null si pas de changement)",
    "description": "Nouvelle description (ou null)",
    "status": "open|in_progress|active|closed|archived (ou null)",
    "impact": "low|medium|high|critical (ou null)",
    "owners": [
      {
        "id": "uuid-ou-nom",
        "name": "Nom complet",
        "role": "Rôle (optionnel)"
      }
    ]
  },
  
  "subChallenges": {
    "update": [
      {
        "id": "uuid-du-sous-challenge",
        "title": "Nouveau titre (optionnel)",
        "description": "Nouvelle description (optionnel)",
        "status": "Nouveau statut (optionnel)",
        "impact": "Nouvel impact (optionnel)",
        "summary": "Justification de l'update (optionnel)"
      }
    ],
    "create": [
      {
        "referenceId": "new-sub-1",
        "parentId": "{{challenge_id}}",
        "title": "Titre du nouveau sous-challenge",
        "description": "Description détaillée",
        "status": "open",
        "impact": "medium",
        "owners": [],
        "summary": "Justification de la création",
        "foundationInsights": [
          {
            "insightId": "uuid",
            "reason": "Justification",
            "priority": "medium"
          }
        ]
      }
    ]
  },
  
  "errors": []
}
\`\`\`

## CONTRAINTES

- Produis UNIQUEMENT du JSON valide
- Ne propose des updates que s'ils apportent une vraie valeur
- Les owners doivent être choisis parmi les availableOwners fournis
- Les foundation insights doivent être pertinents et bien justifiés
- Si aucune modification n'est nécessaire, retourne des objets vides/null

## OPTIMISATION

- **Foundation Insights** : Ne génère QUE l'insightId, reason et priority (pas le title, il sera récupéré automatiquement depuis la BDD)
- **Challenge info** : Le titre, status, impact actuels sont fournis dans le contexte, concentre-toi sur ce qui DOIT changer`;

    const updaterUserPrompt = `## CHALLENGE À ANALYSER

Challenge ID : {{challenge_id}}
Challenge : {{challenge_title}}
Status actuel : {{challenge_status}}
Impact actuel : {{challenge_impact}}

## CONTEXTE COMPLET

{{challenge_context_json}}

## OWNERS DISPONIBLES

{{available_owner_options_json}}

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

Génère maintenant la suggestion de mise à jour en JSON.`;

    const { data: updaterAgent, error: updaterError } = await supabase
      .from('ai_agents')
      .upsert({
        slug: 'challenge-detailed-updater',
        name: 'Challenge Detailed Updater',
        description: 'Produces detailed update suggestions for a specific challenge based on insights and context',
        model_config_id: modelConfig.id,
        system_prompt: updaterSystemPrompt,
        user_prompt: updaterUserPrompt,
        available_variables: [
          'project_name',
          'project_goal',
          'project_status',
          'challenge_id',
          'challenge_title',
          'challenge_status',
          'challenge_impact',
          'challenge_context_json',
          'available_owner_options_json',
          'estimated_changes',
          'priority',
          'reason'
        ],
        metadata: {
          version: '2.0',
          optimized: true,
          phase: 'execution'
        }
      }, { onConflict: 'slug' })
      .select()
      .single();

    if (updaterError) throw updaterError;
    console.log(`✅ Created: ${updaterAgent.slug}\n`);

    // ============================================================================
    // AGENT 6 : Challenge Detailed Creator (V2)
    // ============================================================================
    
    console.log('📝 Creating agent: challenge-detailed-creator (v2)...');
    
    const creatorSystemPrompt = `Tu es l'agent "Challenge Detailed Creator", spécialisé dans la création approfondie de nouveaux challenges.

## OBJECTIF

Créer un nouveau challenge complet et actionnable basé sur :
- Une liste d'insights orphelins ou un pattern détecté
- Le contexte du projet et des challenges existants
- Un titre et une thématique suggérés par le planner

## TON RÔLE

1. **Structurer** : Créer un challenge bien défini avec titre, description, status, impact
2. **Foundation insights** : Identifier les insights qui constituent les fondations de ce nouveau challenge
3. **Hiérarchie** : Déterminer le bon placement dans la hiérarchie (parent-child)
4. **Owners** : Suggérer des owners appropriés si les insights le permettent
5. **Sous-challenges** : Proposer des sous-challenges si la complexité le justifie

## FOUNDATION INSIGHTS

Pour un NOUVEAU challenge, les foundation insights sont encore plus critiques car ils justifient la création elle-même :
- Insights qui définissent le problème/opportunité
- Données quantitatives (KPIs, métriques)
- Feedback de stakeholders clés
- Risques ou contraintes identifiés

Identifie 5 à 15 foundation insights parmi les insights fournis.

## FORMAT DE SORTIE STRICT

\`\`\`json
{
  "summary": "Synthèse de la recommandation de création (2-3 phrases)",
  
  "newChallenges": [
    {
      "referenceId": "{{reference_id}}",
      "parentId": "uuid-du-parent (ou null)",
      "title": "Titre clair et actionnable",
      "description": "Description détaillée du challenge (3-5 phrases minimum)",
      "status": "open",
      "impact": "low|medium|high|critical",
      "owners": [
        {
          "id": "uuid-ou-nom",
          "name": "Nom complet",
          "role": "Rôle"
        }
      ],
      "summary": "Justification de la création de ce challenge (2-3 phrases)",
      "foundationInsights": [
        {
          "insightId": "uuid",
          "reason": "En quoi cet insight justifie le challenge",
          "priority": "low|medium|high|critical"
        }
      ]
    }
  ]
}
\`\`\`

## CONTRAINTES

- Produis UNIQUEMENT du JSON valide
- Le challenge doit être actionnable et apporter de la valeur
- La description doit être suffisamment détaillée (minimum 3 phrases)
- Les foundation insights doivent clairement justifier la création
- Les owners doivent être choisis parmi les availableOwners fournis
- Le status par défaut est "open" pour un nouveau challenge
- L'impact doit refléter la criticité réelle des insights

## OPTIMISATION

- **Foundation Insights** : Ne génère QUE l'insightId, reason et priority (pas le title, il sera récupéré automatiquement depuis la BDD)
- Concentre-toi sur la génération de nouveaux challenges de haute qualité basés sur les insights orphelins`;

    const creatorUserPrompt = `## CONTEXTE PROJET

Projet : {{project_name}}
Objectif : {{project_goal}}
Status : {{project_status}}

## NOUVEAU CHALLENGE À CRÉER

Reference ID : {{reference_id}}
Titre suggéré : {{suggested_title}}
Parent suggéré : {{suggested_parent_id}}
Impact estimé : {{estimated_impact}}
Raison : {{reason}}
Thèmes clés : {{key_themes}}

## INSIGHTS LIÉS

{{related_insights_json}}

## CONTEXTE COMPLET DU PROJET

{{project_context_json}}

## OWNERS DISPONIBLES

{{available_owner_options_json}}

## INSTRUCTIONS

Crée un challenge complet et actionnable basé sur les insights fournis.

Focus sur :
1. Rédiger une description claire et détaillée
2. Identifier 5-15 foundation insights pertinents
3. Déterminer le bon niveau d'impact
4. Suggérer des owners appropriés si possible
5. Évaluer si des sous-challenges sont nécessaires

Génère maintenant le nouveau challenge en JSON.`;

    const { data: creatorAgent, error: creatorError } = await supabase
      .from('ai_agents')
      .upsert({
        slug: 'challenge-detailed-creator',
        name: 'Challenge Detailed Creator',
        description: 'Creates detailed new challenges based on orphan insights or detected patterns',
        model_config_id: modelConfig.id,
        system_prompt: creatorSystemPrompt,
        user_prompt: creatorUserPrompt,
        available_variables: [
          'project_name',
          'project_goal',
          'project_status',
          'reference_id',
          'suggested_title',
          'suggested_parent_id',
          'estimated_impact',
          'reason',
          'key_themes',
          'related_insights_json',
          'project_context_json',
          'available_owner_options_json'
        ],
        metadata: {
          version: '2.0',
          optimized: true,
          phase: 'execution'
        }
      }, { onConflict: 'slug' })
      .select()
      .single();

    if (creatorError) throw creatorError;
    console.log(`✅ Created: ${creatorAgent.slug}\n`);

    // ============================================================================
    // AGENT 7 : ASK Generator
    // ============================================================================
    
    console.log('📝 Creating agent: ask-generator...');
    
    const askGenSystemPrompt = `Tu es l'agent « ASK Generator ».
Objectif: proposer 1 à 3 nouvelles sessions ASK utiles pour le challenge « {{challenge_title}} » du projet « {{project_name}} ».

EXIGENCES STRICTES DE SORTIE:
- Retourne UNIQUEMENT un objet JSON, sans texte, sans balises, sans commentaires, sans backticks.
- Utilise UNIQUEMENT des guillemets doubles (") pour les clés et valeurs.
- AUCUNE virgule terminale (pas de virgule après le dernier élément d'un objet/tableau).
- Valeurs booléennes en minuscules (true/false). Dates en ISO8601 si présentes.
- Si aucune proposition n'est pertinente: retourne {"suggestions": []}.

FORMAT EXACT:
{
  "suggestions": [
    {
      "title": "Titre actionnable (obligatoire)",
      "question": "Question principale (obligatoire)",
      "askKey": "slug-kebab-case-optionnel",
      "summary": "Résumé court",
      "objective": "Résultat attendu",
      "description": "Contexte court",
      "recommendedParticipants": [
        { "name": "Nom", "role": "Rôle", "isSpokesperson": false }
      ],
      "relatedInsights": [
        { "insightId": "uuid", "reason": "Pourquoi", "priority": "low" }
      ],
      "followUpActions": ["Étape suivante"],
      "confidence": "low",
      "urgency": "low",
      "maxParticipants": 12,
      "isAnonymous": true,
      "deliveryMode": "digital",
      "audienceScope": "group",
      "responseMode": "collective",
      "startDate": "2025-01-15T00:00:00.000Z",
      "endDate": "2025-01-31T00:00:00.000Z"
    }
  ]
}

CONTRAINTES:
- Ne propose QUE des idées distinctes des ASKs existantes.
- Sers-toi UNIQUEMENT des variables fournies.
- Préfère la simplicité: inclure au minimum les champs obligatoires (title, question).`;

    const askGenUserPrompt = `Projet: {{project_name}} (statut: {{project_status}})
Challenge: {{challenge_title}} — {{challenge_description}}
Insights (JSON): {{insights_json}}
ASKs existantes (JSON): {{existing_asks_json}}

Retourne UNIQUEMENT un objet JSON respectant strictement le format demandé. Aucune explication, aucun code fence, aucune virgule terminale, guillemets doubles uniquement.`;

    const { data: askGenAgent, error: askGenError } = await supabase
      .from('ai_agents')
      .upsert({
        slug: 'ask-generator',
        name: 'AI ASK Generator',
        description: 'Génère des propositions de sessions ASK pour un challenge donné',
        model_config_id: modelConfig.id,
        system_prompt: askGenSystemPrompt,
        user_prompt: askGenUserPrompt,
        available_variables: [
          'project_name',
          'project_status',
          'challenge_id',
          'challenge_title',
          'challenge_description',
          'challenge_status',
          'challenge_impact',
          'challenge_context_json',
          'insights_json',
          'existing_asks_json',
          'current_date',
        ],
        metadata: { type: 'ask_generator', version: '1.0' }
      }, { onConflict: 'slug' })
      .select()
      .single();

    if (askGenError) throw askGenError;
    console.log(`✅ Created: ${askGenAgent.slug}\n`);

    // ============================================================================
    // SUMMARY
    // ============================================================================
    
    console.log('✨ ============================================');
    console.log('✨ SUCCESS! All AI agents have been restored!');
    console.log('✨ ============================================\n');
    console.log('📋 Agents restored:\n');
    console.log('1. ✅ ask-conversation-response');
    console.log('   → Agent de conversation dans les sessions ASK');
    console.log('');
    console.log('2. ✅ ask-insight-detection');
    console.log('   → Agent de détection et extraction d\'insights');
    console.log('');
    console.log('3. ✅ challenge-builder (legacy)');
    console.log('   → Agent Challenge Builder original');
    console.log('');
    console.log('4. ✅ challenge-revision-planner (v2)');
    console.log('   → Agent de planification des révisions (optimisé)');
    console.log('');
    console.log('5. ✅ challenge-detailed-updater (v2)');
    console.log('   → Agent de mise à jour détaillée (optimisé)');
    console.log('');
    console.log('6. ✅ challenge-detailed-creator (v2)');
    console.log('   → Agent de création détaillée (optimisé)');
    console.log('');
    console.log('7. ✅ ask-generator');
    console.log('   → Agent de génération de sessions ASK');
    console.log('');
    console.log('🎉 Tous les agents ont été restaurés avec succès!');
    console.log('');

  } catch (error) {
    console.error('❌ Error restoring agents:', error);
    process.exit(1);
  }
}

// Run the restoration
restoreAllAgents();

