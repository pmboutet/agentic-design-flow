#!/usr/bin/env node
/**
 * Script to show agent prompts with line numbers
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function showPrompts() {
  const { data: agent, error } = await supabase
    .from('ai_agents')
    .select('system_prompt, user_prompt')
    .eq('slug', 'ask-conversation-response')
    .maybeSingle();

  if (error || !agent) {
    console.error('❌ Agent non trouvé');
    return;
  }

  console.log('========== SYSTEM PROMPT ==========');
  const systemLines = (agent.system_prompt || '').split('\n');
  systemLines.forEach((line, i) => {
    console.log(`${String(i + 1).padStart(3, ' ')} | ${line}`);
  });

  console.log('\n========== USER PROMPT ==========');
  const userLines = (agent.user_prompt || '').split('\n');
  userLines.forEach((line, i) => {
    console.log(`${String(i + 1).padStart(3, ' ')} | ${line}`);
  });
}

showPrompts().catch(console.error);




