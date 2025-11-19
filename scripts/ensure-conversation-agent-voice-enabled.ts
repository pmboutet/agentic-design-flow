/**
 * Script pour s'assurer que l'agent ask-conversation-response a voice=true
 * 
 * Le flag voice=true indique que l'agent SUPPORTE le mode vocal.
 * Le mode réel (texte ou voix) est déterminé par l'interactionType lors de l'appel.
 * 
 * Usage: npx tsx scripts/ensure-conversation-agent-voice-enabled.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';

async function main() {
  const supabase = getAdminSupabaseClient();

  // Check current value
  const { data: agent, error: fetchError } = await supabase
    .from('ai_agents')
    .select('slug, voice')
    .eq('slug', 'ask-conversation-response')
    .maybeSingle();

  if (fetchError) {
    console.error('❌ Failed to fetch agent:', fetchError.message);
    process.exit(1);
  }

  if (!agent) {
    console.error('❌ Agent ask-conversation-response not found');
    process.exit(1);
  }

  console.log(`📋 Current state: voice=${agent.voice}`);

  if (agent.voice === true) {
    console.log('✅ Agent already configured correctly (voice=true)');
    console.log('ℹ️  Remember: voice=true means the agent CAN support voice, but the mode is determined by interactionType');
    return;
  }

  // Update to true
  const { error: updateError } = await supabase
    .from('ai_agents')
    .update({ voice: true })
    .eq('slug', 'ask-conversation-response');

  if (updateError) {
    console.error('❌ Failed to update agent:', updateError.message);
    process.exit(1);
  }

  console.log('✅ ask-conversation-response agent updated: voice=true');
  console.log('');
  console.log('ℹ️  Context:');
  console.log('   - voice=true indicates the agent CAN support voice mode');
  console.log('   - Actual mode (text or voice) is determined by interactionType at runtime');
  console.log('   - Text endpoints use interactionType: "ask.chat.response" → text mode');
  console.log('   - Voice endpoints use interactionType: "ask.chat.response.voice" → voice mode');
}

main().catch(err => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});


