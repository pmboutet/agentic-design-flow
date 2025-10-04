const { createClient } = require('@supabase/supabase-js');

// Configuration Supabase (à adapter selon ton setup)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-key';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function initAiData() {
  console.log('Initializing AI data...');

  try {
    // Créer une configuration de modèle Anthropic
    const { data: modelConfig, error: modelError } = await supabase
      .from('ai_model_configs')
      .upsert({
        code: 'anthropic-claude-3-5-sonnet',
        name: 'Claude 3.5 Sonnet',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        api_key_env_var: 'ANTHROPIC_API_KEY',
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

    // Créer l'agent de conversation
    const { data: agent, error: agentError } = await supabase
      .from('ai_agents')
      .upsert({
        slug: 'ask-conversation-response',
        name: 'ASK Conversation Response Agent',
        description: 'Agent responsible for generating conversational responses in ASK sessions',
        model_config_id: modelConfig.id,
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

    if (agentError) {
      console.error('Error creating agent:', agentError);
      return;
    }

    console.log('Agent created:', agent.slug);
    console.log('AI data initialization completed successfully!');

  } catch (error) {
    console.error('Error initializing AI data:', error);
  }
}

initAiData();
