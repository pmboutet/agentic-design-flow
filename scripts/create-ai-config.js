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
        code: 'anthropic-claude-3-5-sonnet',
        name: 'Claude 3.5 Sonnet',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
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

    // Create an AI agent
    const { data: agent, error: agentError } = await supabase
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

    if (agentError) {
      console.error('Error creating agent:', agentError);
      return;
    }

    console.log('Agent created:', agent.slug);
    console.log('AI configuration completed successfully!');

  } catch (error) {
    console.error('Error creating AI configuration:', error);
  }
}

createAiConfig();
