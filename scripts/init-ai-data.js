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

Contexte :
- Question ASK : {{ask_question}}
- Participants : {{participants}}
- Historique : {{message_history}}

Extrais les insights les plus pertinents et structure-les de manière claire.`,
        user_prompt: `Analyse cette conversation et extrais les insights les plus importants :

{{message_history}}

Fournis une réponse structurée avec les insights identifiés.`,
        available_variables: [
          'ask_key',
          'ask_question',
          'ask_description', 
          'message_history',
          'participants',
          'insights_context'
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
