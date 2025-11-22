/**
 * Script pour vérifier le prompt actuel de l'agent ask-conversation-response
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkAgentPrompt() {
  console.log('🔍 Checking ask-conversation-response agent prompt...\n');

  try {
    const { data: agent, error } = await supabase
      .from('ai_agents')
      .select('id, slug, name, system_prompt, user_prompt, available_variables')
      .eq('slug', 'ask-conversation-response')
      .maybeSingle();

    if (error) {
      throw new Error(`Error: ${error.message}`);
    }

    if (!agent) {
      throw new Error('Agent ask-conversation-response not found');
    }

    console.log(`📋 Agent: ${agent.name} (${agent.id})`);
    console.log('');
    console.log('📝 Available variables:');
    console.log(agent.available_variables?.join(', ') || 'none');
    console.log('');
    console.log('🔧 System prompt (first 200 chars):');
    console.log(agent.system_prompt?.substring(0, 200) || 'none');
    console.log('...');
    console.log('');
    console.log('🔧 User prompt:');
    console.log(agent.user_prompt || 'none');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkAgentPrompt();



