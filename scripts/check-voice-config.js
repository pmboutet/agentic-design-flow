#!/usr/bin/env node
/**
 * Check voice configuration for conversation agent
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('NEXT_PUBLIC_SUPABASE_URL:', !!supabaseUrl);
  console.error('SUPABASE_SERVICE_ROLE_KEY:', !!supabaseKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkVoiceConfig() {
  console.log('🔍 Checking voice configuration for conversation agent...\n');
  
  // Check the conversation agent
  const { data: agent, error: agentError } = await supabase
    .from('ai_agents')
    .select('id, slug, name, voice, model_config_id, metadata')
    .eq('slug', 'ask-conversation-response')
    .single();
  
  if (agentError) {
    console.error('❌ Error fetching agent:', agentError.message);
    return;
  }
  
  if (!agent) {
    console.error('❌ Agent not found!');
    return;
  }
  
  console.log('✅ Agent found:');
  console.log('   ID:', agent.id);
  console.log('   Slug:', agent.slug);
  console.log('   Name:', agent.name);
  console.log('   Voice enabled:', agent.voice ? '✅ YES' : '❌ NO');
  console.log('   Model config ID:', agent.model_config_id || '(none)');
  console.log('   Metadata:', agent.metadata ? JSON.stringify(agent.metadata, null, 2) : '(none)');
  
  // Check the model config
  if (agent.model_config_id) {
    console.log('\n🔍 Checking model configuration...\n');
    
    const { data: modelConfig, error: configError } = await supabase
      .from('ai_model_configs')
      .select('*')
      .eq('id', agent.model_config_id)
      .single();
    
    if (configError) {
      console.error('❌ Error fetching model config:', configError.message);
    } else if (modelConfig) {
      console.log('✅ Model Config:');
      console.log('   ID:', modelConfig.id);
      console.log('   Name:', modelConfig.name);
      console.log('   Provider:', modelConfig.provider);
      console.log('   Voice Agent Provider:', modelConfig.voice_agent_provider || '(not set)');
      console.log('   Deepgram STT Model:', modelConfig.deepgram_stt_model || '(not set)');
      console.log('   Deepgram TTS Model:', modelConfig.deepgram_tts_model || '(not set)');
      console.log('   Deepgram LLM Provider:', modelConfig.deepgram_llm_provider || '(not set)');
      console.log('   Deepgram LLM Model:', modelConfig.deepgram_llm_model || '(not set)');
      console.log('   Speechmatics STT Language:', modelConfig.speechmatics_stt_language || '(not set)');
      console.log('   Speechmatics LLM Provider:', modelConfig.speechmatics_llm_provider || '(not set)');
      console.log('   Speechmatics LLM Model:', modelConfig.speechmatics_llm_model || '(not set)');
      console.log('   ElevenLabs Voice ID:', modelConfig.elevenlabs_voice_id || '(not set)');
      console.log('   ElevenLabs Model ID:', modelConfig.elevenlabs_model_id || '(not set)');
      
      // Determine if voice mode should work
      console.log('\n📋 Voice Mode Analysis:');
      
      const hasVoiceAgentProvider = !!modelConfig.voice_agent_provider;
      const hasDeepgramConfig = !!(modelConfig.deepgram_stt_model && modelConfig.deepgram_llm_provider && modelConfig.deepgram_llm_model);
      const hasSpeechmaticsConfig = !!(modelConfig.speechmatics_stt_language && modelConfig.speechmatics_llm_provider && modelConfig.speechmatics_llm_model);
      
      console.log('   Voice Agent Provider set:', hasVoiceAgentProvider ? '✅' : '❌');
      console.log('   Deepgram config complete:', hasDeepgramConfig ? '✅' : '❌');
      console.log('   Speechmatics config complete:', hasSpeechmaticsConfig ? '✅' : '❌');
      console.log('   Agent voice flag:', agent.voice ? '✅' : '❌');
      
      if (!agent.voice) {
        console.log('\n❌ PROBLEM: Agent voice flag is NOT enabled');
        console.log('   Solution: Run the script to enable voice on the agent:');
        console.log('   node scripts/ensure-conversation-agent-voice-enabled.ts');
      } else if (!hasVoiceAgentProvider) {
        console.log('\n⚠️  WARNING: Voice agent provider is not set in model config');
        console.log('   This may cause issues. Set it to "deepgram-voice-agent" or "speechmatics-voice-agent"');
      } else if (!hasDeepgramConfig && !hasSpeechmaticsConfig) {
        console.log('\n❌ PROBLEM: No voice agent configuration found');
        console.log('   You need to configure either:');
        console.log('   - Deepgram (STT, LLM provider, LLM model)');
        console.log('   - Speechmatics (STT language, LLM provider, LLM model)');
      } else {
        console.log('\n✅ Voice mode should be WORKING!');
        console.log('   If you still don\'t see the voice button, check:');
        console.log('   1. The API /api/ask/[key]/agent-config is returning data');
        console.log('   2. Browser console for errors');
        console.log('   3. Network tab to see the API response');
      }
    }
  } else {
    console.log('\n❌ PROBLEM: No model config associated with the agent');
    console.log('   Solution: Associate a model config with voice capabilities');
  }
}

checkVoiceConfig()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });

