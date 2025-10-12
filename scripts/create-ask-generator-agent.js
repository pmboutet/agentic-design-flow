const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log('🔧 Upserting ask-generator agent...');

  // 1) Resolve default model config id (handle multiple defaults gracefully)
  let defaultModel = null;
  let defaultModelError = null;

  // Prefer the canonical code if present
  const preferredCode = 'anthropic-claude-3-5-sonnet';
  const preferred = await supabase
    .from('ai_model_configs')
    .select('id, code')
    .eq('code', preferredCode)
    .maybeSingle();

  if (preferred.error) {
    defaultModelError = preferred.error;
  }
  if (!preferred.error && preferred.data) {
    defaultModel = preferred.data;
  }

  // Fallback: take the most recently updated default
  if (!defaultModel) {
    const latestDefault = await supabase
      .from('ai_model_configs')
      .select('id, code, updated_at')
      .eq('is_default', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestDefault.error) {
      defaultModelError = latestDefault.error;
    }
    if (!latestDefault.error && latestDefault.data) {
      defaultModel = latestDefault.data;
    }
  }

  if (defaultModelError) {
    console.error('❌ Error fetching default model config:', defaultModelError);
    process.exit(1);
  }

  if (!defaultModel) {
    console.error('❌ No default model config found. Create one first (see scripts/init-ai-data.js).');
    process.exit(1);
  }

  // 2) Concise prompts
  const systemPrompt = `Tu es l'agent « ASK Generator ». Propose 1 à 3 nouvelles sessions ASK utiles pour le challenge « {{challenge_title}} » du projet « {{project_name}} ». 
Règles: reste factuel, évite les doublons avec les ASKs existantes, et renvoie uniquement un JSON valide.`;

  const userPrompt = `Contexte projet: {{project_name}} (statut: {{project_status}})
Challenge: {{challenge_title}} — {{challenge_description}}
Insights (JSON): {{insights_json}}
ASKs existantes (JSON): {{existing_asks_json}}
Génère des suggestions au format JSON demandé, sans texte hors JSON.`;

  // 3) Upsert agent
  const agent = {
    slug: 'ask-generator',
    name: 'AI ASK Generator',
    description: 'Génère des propositions de sessions ASK pour un challenge donné',
    model_config_id: defaultModel.id,
    system_prompt: systemPrompt,
    user_prompt: userPrompt,
    available_variables: [
      'project_name',
      'project_status',
      'challenge_id',
      'challenge_title',
      'challenge_description',
      'challenge_status',
      'challenge_impact',
      'challenge_context_json',
      'insights_json',
      'existing_asks_json',
      'current_date',
    ],
    metadata: { type: 'ask_generator', version: '1.0' },
  };

  const { data, error } = await supabase
    .from('ai_agents')
    .upsert(agent, { onConflict: 'slug' })
    .select()
    .maybeSingle();

  if (error) {
    console.error('❌ Error upserting agent:', error);
    process.exit(1);
  }

  console.log('✅ ask-generator agent upserted:', data?.id || '(updated)');
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});


