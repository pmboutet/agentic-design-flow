const { createClient } = require('@supabase/supabase-js');

// Configuration Supabase (à adapter selon ton setup)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-key';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createAiConfig() {
  console.log('Creating AI model configuration...');

  try {
    // Create a default model configuration
    const { data: modelConfig, error: modelError } = await supabase
      .from('ai_model_configs')
      .upsert({
        id: '550e8400-e29b-41d4-a716-446655440061',
        code: 'anthropic-claude-sonnet-4-5',
        name: 'Claude Sonnet 4.5',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        api_key_env_var: 'ANTHROPIC_API_KEY',
        base_url: 'https://api.anthropic.com/v1',
        is_default: true,
        is_fallback: false
      }, { onConflict: 'code' })
      .select()
      .single();

    if (modelError) {
      console.error('Error creating model config:', modelError);
      return;
    }

    console.log('Model config created:', modelConfig.id);

    // Create a fallback model configuration
    const { data: fallbackModelConfig, error: fallbackError } = await supabase
      .from('ai_model_configs')
      .upsert({
        id: '550e8400-e29b-41d4-a716-446655440062',
        code: 'mistral-large',
        name: 'Mistral Large',
        provider: 'mistral',
        model: 'mistral-large-latest',
        api_key_env_var: 'MISTRAL_API_KEY',
        base_url: 'https://api.mistral.ai/v1',
        is_default: false,
        is_fallback: true
      }, { onConflict: 'code' })
      .select()
      .single();

    if (fallbackError) {
      console.error('Error creating fallback model config:', fallbackError);
      return;
    }

    console.log('Fallback model config created:', fallbackModelConfig.id);

    // Create the conversation agent
    const { data: conversationAgent, error: conversationAgentError } = await supabase
      .from('ai_agents')
      .upsert({
        id: '550e8400-e29b-41d4-a716-446655440063',
        slug: 'ask-conversation-response',
        name: 'ASK Conversation Response Agent',
        description: 'Agent responsible for generating conversational responses in ASK sessions',
        model_config_id: modelConfig.id,
        fallback_model_config_id: fallbackModelConfig.id,
        system_prompt: `Tu es un assistant IA spécialisé dans la facilitation de conversations et la génération d'insights à partir d'échanges de groupe.

Ton rôle est de :
1. Analyser les messages des participants
2. Identifier les points clés et les idées importantes
3. Poser des questions pertinentes pour approfondir la discussion
4. Synthétiser les échanges pour faire émerger des insights
5. Maintenir un ton professionnel mais accessible

Réponds de manière concise et pertinente pour faire avancer la discussion.`,
        user_prompt: `Basé sur l'historique de la conversation et le dernier message de l'utilisateur, fournis une réponse qui :

1. Reconnaît le contenu du dernier message
2. Fait le lien avec les échanges précédents si pertinent
3. Pose une question ou fait une observation qui fait avancer la discussion
4. Reste concis (2-3 phrases maximum)

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
      }, { onConflict: 'slug' })
      .select()
      .single();

    if (conversationAgentError) {
      console.error('Error creating agent:', conversationAgentError);
      return;
    }

    console.log('Agent created:', conversationAgent.slug);

    // Create the Challenge Builder agent
    const { data: challengeBuilderAgent, error: challengeBuilderError } = await supabase
      .from('ai_agents')
      .upsert({
        id: '550e8400-e29b-41d4-a716-446655440064',
        slug: 'challenge-builder',
        name: 'AI Challenge Builder',
        description: 'Agent that clusters ASK insights into actionable sub-challenges',
        model_config_id: modelConfig.id,
        fallback_model_config_id: fallbackModelConfig.id,
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
      }, { onConflict: 'slug' })
      .select()
      .single();

    if (challengeBuilderError) {
      console.error('Error creating Challenge Builder agent:', challengeBuilderError);
      return;
    }

    console.log('Agent created:', challengeBuilderAgent.slug);
    console.log('AI configuration completed successfully!');

  } catch (error) {
    console.error('Error creating AI configuration:', error);
  }
}

createAiConfig();
