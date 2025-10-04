const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Configuration Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variables d\'environnement Supabase manquantes');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createTestSession() {
  try {
    console.log('🚀 Création d\'une session de test...');

    // Créer un client de test d'abord
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .insert({
        name: 'Client Test Streaming',
        status: 'active',
        company: 'Test Company',
        industry: 'Technology'
      })
      .select('id')
      .single();

    if (clientError) {
      console.error('❌ Erreur création client:', clientError);
      return;
    }

    console.log('✅ Client créé:', client.id);

    // Créer un projet de test
    const startDate = new Date().toISOString();
    const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 jours

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({
        name: 'Projet Test Streaming',
        description: 'Projet pour tester le streaming',
        status: 'active',
        client_id: client.id,
        start_date: startDate,
        end_date: endDate
      })
      .select('id')
      .single();

    if (projectError) {
      console.error('❌ Erreur création projet:', projectError);
      return;
    }

    console.log('✅ Projet créé:', project.id);

    // Créer une session ASK de test
    const { data: askSession, error: askError } = await supabase
      .from('ask_sessions')
      .insert({
        ask_key: 'test-key',
        name: 'Session Test Streaming',
        question: 'Test du streaming avec les APIs IA',
        description: 'Session pour tester le streaming avec Anthropic et Mistral',
        start_date: new Date().toISOString(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 jours
        status: 'active',
        is_anonymous: true,
        project_id: project.id,
        ai_config: {
          model: 'anthropic',
          system_prompt: 'Tu es un assistant IA de test. Réponds de manière concise et utile.',
          temperature: 0.7
        }
      })
      .select('id, ask_key')
      .single();

    if (askError) {
      console.error('❌ Erreur création session ASK:', askError);
      return;
    }

    console.log('✅ Session ASK créée:', askSession.ask_key);
    console.log('🎉 Session de test prête ! Vous pouvez maintenant tester le streaming.');
    console.log('📝 URL de test: http://localhost:3000/api/ask/test-key/stream');

  } catch (error) {
    console.error('❌ Erreur:', error);
  }
}

createTestSession();
