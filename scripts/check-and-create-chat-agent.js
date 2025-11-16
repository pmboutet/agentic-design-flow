const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Configuration Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-key';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkAndCreateChatAgent() {
  console.log('🔍 Checking chat agent configuration...');

  try {
    // 1. Check if the chat agent exists
    console.log('📋 Looking for chat agent: ask-conversation-response');
    
    const { data: existingAgent, error: fetchError } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('slug', 'ask-conversation-response')
      .maybeSingle();

    if (fetchError) {
      console.error('❌ Error fetching agent:', fetchError);
      return;
    }

    if (existingAgent) {
      console.log('✅ Chat agent found:');
      console.log(`   - ID: ${existingAgent.id}`);
      console.log(`   - Name: ${existingAgent.name}`);
      console.log(`   - System Prompt Length: ${existingAgent.system_prompt?.length || 0}`);
      console.log(`   - User Prompt Length: ${existingAgent.user_prompt?.length || 0}`);
      console.log(`   - Model Config ID: ${existingAgent.model_config_id}`);
      console.log(`   - Fallback Model Config ID: ${existingAgent.fallback_model_config_id}`);
      return;
    }

    console.log('⚠️  Chat agent not found, creating it...');

    // 2. Get the default model configuration
    const { data: defaultModelConfig, error: modelError } = await supabase
      .from('ai_model_configs')
      .select('*')
      .eq('is_default', true)
      .limit(1)
      .maybeSingle();

    if (modelError) {
      console.error('❌ Error fetching default model config:', modelError);
      return;
    }

    if (!defaultModelConfig) {
      console.error('❌ No default model configuration found');
      return;
    }

    console.log('✅ Default model config found:', defaultModelConfig.code);

    // 3. Create the chat agent
    const chatAgentData = {
      id: '550e8400-e29b-41d4-a716-446655440070',
      slug: 'ask-conversation-response',
      name: 'Agent de Conversation ASK',
      description: 'Agent IA pour les conversations dans les sessions ASK',
      voice: true, // Agent supports voice mode (Speechmatics), but mode is determined by interactionType
      model_config_id: defaultModelConfig.id,
      fallback_model_config_id: null,
      system_prompt: `Tu es un facilitateur de conversation expérimenté spécialisé dans l'exploration de défis organisationnels. Ton rôle est d'aider les participants à explorer leurs défis, partager leurs expériences et générer des insights collectifs.

Tu dois :
- Écouter activement et poser des questions pertinentes qui font avancer la discussion
- Aider à clarifier les problèmes et défis exprimés par les participants
- Encourager le partage d'expériences concrètes et d'exemples
- Faire émerger des solutions et insights collectifs
- Maintenir un ton professionnel mais accessible et engageant
- Adapter ton approche selon le contexte (projet, défi, question posée)

Réponds de manière concise (2-3 phrases maximum) et engageante. Pose une question ou fait une observation qui fait avancer la discussion.`,
      user_prompt: `Basé sur l'historique de la conversation et le dernier message de l'utilisateur, fournis une réponse qui :

1. Reconnaît le contenu du dernier message
2. Fait le lien avec les échanges précédents si pertinent
3. Pose une question ou fait une observation qui fait avancer la discussion
4. Reste concis (2-3 phrases maximum)

Dernier message : {{latest_user_message}}

Réponds maintenant :`,
      available_variables: [
        'ask_question',
        'ask_description', 
        'participant_name',
        'project_name',
        'challenge_name',
        'delivery_mode',
        'audience_scope',
        'response_mode',
        'message_history',
        'latest_user_message',
        'participants'
      ],
      metadata: {
        type: 'chat_agent',
        version: '1.0',
        created_for: 'ask_conversation_system'
      }
    };

    const { data: newAgent, error: createError } = await supabase
      .from('ai_agents')
      .insert(chatAgentData)
      .select()
      .single();

    if (createError) {
      console.error('❌ Error creating chat agent:', createError);
      return;
    }

    console.log('✅ Chat agent created successfully:');
    console.log(`   - ID: ${newAgent.id}`);
    console.log(`   - Slug: ${newAgent.slug}`);
    console.log(`   - Name: ${newAgent.name}`);
    console.log(`   - System Prompt Length: ${newAgent.system_prompt?.length || 0}`);
    console.log(`   - User Prompt Length: ${newAgent.user_prompt?.length || 0}`);

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

checkAndCreateChatAgent().catch(console.error);
