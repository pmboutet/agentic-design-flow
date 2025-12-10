/**
 * Script pour tester l'agent de conversation sur une session ASK spécifique
 * Usage: npx tsx scripts/debug-init-agent.ts <ask_key>
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { buildConversationAgentVariables } from '@/lib/ai/conversation-agent';
import { executeAgent } from '@/lib/ai/service';

async function main() {
  const askKey = process.argv[2];

  if (!askKey) {
    console.error('❌ Merci de fournir un ask_key. Exemple: npx tsx scripts/debug-init-agent.ts demo-ask');
    process.exit(1);
  }

  const supabase = getAdminSupabaseClient();

  const { data: askRow, error: askError } = await supabase
    .from('ask_sessions')
    .select('id, ask_key, question, description')
    .eq('ask_key', askKey)
    .maybeSingle();

  if (askError) {
    console.error('❌ Erreur lors de la récupération de la session ASK:', askError.message);
    process.exit(1);
  }

  if (!askRow) {
    console.error(`❌ Aucune session ASK trouvée pour la clé "${askKey}"`);
    process.exit(1);
  }

  console.log('📋 ASK session:', {
    id: askRow.id,
    ask_key: askRow.ask_key,
    question: askRow.question,
    description: askRow.description,
  });

  const { data: participantRows } = await supabase
    .from('ask_participants')
    .select('id, participant_name, role, description')
    .eq('ask_session_id', askRow.id)
    .order('joined_at', { ascending: true });

  const participantSummaries =
    (participantRows ?? []).map((row: any) => ({
      name: row.participant_name ?? 'Participant',
      role: row.role ?? null,
      description: row.description ?? null,
    }));

  const variables = buildConversationAgentVariables({
    ask: askRow,
    project: null,
    challenge: null,
    messages: [],
    participants: participantSummaries,
  });

  console.log('🧩 Variables envoyées à l’agent:', variables);

  const result = await executeAgent({
    supabase,
    agentSlug: 'ask-conversation-response',
    askSessionId: askRow.id,
    interactionType: 'debug.ask.init',
    variables,
  });

  console.log('✅ Réponse de l’agent:', result.content);
  console.log('📄 Résultat complet:', result);
  console.log('🧠 Modèle utilisé:', {
    id: result.modelConfig.id,
    provider: result.modelConfig.provider,
    model: result.modelConfig.model,
    voiceAgentProvider: result.modelConfig.voiceAgentProvider,
  });
  console.log('📦 Payload complet:', result.raw);
}

main().catch(error => {
  console.error('❌ Erreur inattendue:', error);
  process.exit(1);
});

