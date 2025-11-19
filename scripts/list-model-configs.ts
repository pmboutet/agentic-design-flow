import { config } from 'dotenv';
config({ path: '.env.local' });

import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';

async function main() {
  const supabase = getAdminSupabaseClient();

  const { data, error } = await supabase
    .from('ai_model_configs')
    .select('id, code, name, provider, model, voice_agent_provider, is_default, is_fallback')
    .order('is_default', { ascending: false });

  if (error) {
    console.error('❌ Failed to fetch configs:', error.message);
    process.exit(1);
  }

  console.log('🧱 Model configs:');
  for (const row of data ?? []) {
    console.log(row);
  }
}

main().catch(err => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});


