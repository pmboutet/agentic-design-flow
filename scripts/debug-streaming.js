const { createClient } = require('@supabase/supabase-js');

// Configuration Supabase (à adapter selon ton setup)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-key';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debugStreaming() {
  console.log('Debugging streaming endpoint for ask key "123"...');

  try {
    // Check if ask session exists
    const { data: askSession, error: askError } = await supabase
      .from('ask_sessions')
      .select('*')
      .eq('ask_key', '123')
      .single();

    if (askError) {
      console.error('Error fetching ask session:', askError);
      return;
    }

    if (!askSession) {
      console.log('ASK session with key "123" not found');
      return;
    }

    console.log('ASK session found:', askSession.id);

    // Check if AI model configs exist
    const { data: modelConfigs, error: modelError } = await supabase
      .from('ai_model_configs')
      .select('*');

    if (modelError) {
      console.error('Error fetching model configs:', modelError);
      return;
    }

    console.log('Model configs found:', modelConfigs?.length || 0);
    if (modelConfigs && modelConfigs.length > 0) {
      console.log('Default model:', modelConfigs.find(m => m.is_default)?.name || 'None');
    }

    // Check if AI agents exist
    const { data: agents, error: agentError } = await supabase
      .from('ai_agents')
      .select('*');

    if (agentError) {
      console.error('Error fetching agents:', agentError);
      return;
    }

    console.log('Agents found:', agents?.length || 0);

    // Check messages for this ask session
    const { data: messages, error: messageError } = await supabase
      .from('messages')
      .select('*')
      .eq('ask_session_id', askSession.id)
      .order('created_at', { ascending: true });

    if (messageError) {
      console.error('Error fetching messages:', messageError);
      return;
    }

    console.log('Messages found:', messages?.length || 0);

    // Check participants
    const { data: participants, error: participantError } = await supabase
      .from('ask_participants')
      .select('*')
      .eq('ask_session_id', askSession.id);

    if (participantError) {
      console.error('Error fetching participants:', participantError);
      return;
    }

    console.log('Participants found:', participants?.length || 0);

    console.log('\n=== DIAGNOSTIC SUMMARY ===');
    console.log('✓ ASK session exists:', !!askSession);
    console.log('✓ Model configs available:', (modelConfigs?.length || 0) > 0);
    console.log('✓ Agents available:', (agents?.length || 0) > 0);
    console.log('✓ Messages available:', (messages?.length || 0) > 0);
    console.log('✓ Participants available:', (participants?.length || 0) > 0);

    if ((modelConfigs?.length || 0) === 0) {
      console.log('\n❌ ISSUE: No AI model configurations found!');
      console.log('Run: node scripts/create-ai-config.js');
    }

    if ((agents?.length || 0) === 0) {
      console.log('\n❌ ISSUE: No AI agents found!');
      console.log('Run: node scripts/create-ai-config.js');
    }

    if (!askSession) {
      console.log('\n❌ ISSUE: No ASK session with key "123" found!');
      console.log('Run: node scripts/create-test-ask.js');
    }

  } catch (error) {
    console.error('Error debugging streaming:', error);
  }
}

debugStreaming();
