require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variables d\'environnement Supabase manquantes');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testLogCreation() {
  try {
    console.log('🧪 Test de création de log...');
    
    const logId = crypto.randomUUID();
    
    const { data, error } = await supabase
      .from('ai_agent_logs')
      .insert({
        id: logId,
        agent_id: null,
        model_config_id: null,
        ask_session_id: null,
        interaction_type: 'ask.chat.response.streaming',
        request_payload: {
          systemPrompt: 'Test prompt',
          userPrompt: 'Test message',
          model: 'anthropic',
          streaming: true,
          sessionKey: '123-key'
        },
        status: 'completed',
        response_payload: {
          content: 'Test response',
          streaming: true
        },
        latency_ms: 1000
      })
      .select();

    if (error) {
      console.error('❌ Erreur lors de la création du log:', error);
    } else {
      console.log('✅ Log créé avec succès:', data);
    }
    
    // Vérifier si la table existe
    const { data: tables, error: tableError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'ai_agent_logs');

    if (tableError) {
      console.error('❌ Erreur lors de la vérification de la table:', tableError);
    } else {
      console.log('📋 Tables trouvées:', tables);
    }

  } catch (err) {
    console.error('❌ Erreur:', err);
  }
}

testLogCreation();
