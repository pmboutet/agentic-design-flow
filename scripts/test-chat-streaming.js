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

async function testChatStreaming() {
  try {
    console.log('🚀 Test du streaming dans le chat principal...');

    // Envoyer un message utilisateur
    const userMessage = {
      content: 'Salut ! Peux-tu me dire bonjour et me raconter une petite histoire courte ?',
      type: 'text',
      senderName: 'Test User',
      timestamp: new Date().toISOString(),
    };

    console.log('📤 Envoi du message utilisateur...');
    const response = await fetch('http://localhost:3000/api/ask/test-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userMessage),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ Message utilisateur sauvegardé:', data.success);

    // Maintenant tester le streaming
    console.log('🔄 Test du streaming AI...');
    const streamResponse = await fetch('http://localhost:3000/api/ask/test-key/stream-simple', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: userMessage.content,
      }),
    });

    if (!streamResponse.ok) {
      throw new Error(`Streaming HTTP error! status: ${streamResponse.status}`);
    }

    console.log('📡 Réception du stream...');
    const reader = streamResponse.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data.trim()) {
            try {
              const parsed = JSON.parse(data);
              
              if (parsed.type === 'chunk' && parsed.content) {
                fullContent += parsed.content;
                process.stdout.write(parsed.content); // Afficher en temps réel
              } else if (parsed.type === 'done') {
                console.log('\n\n✅ Streaming terminé !');
                console.log('📝 Contenu complet:', fullContent);
                return;
              } else if (parsed.type === 'error') {
                console.error('❌ Erreur streaming:', parsed.error);
                return;
              }
            } catch (error) {
              console.error('❌ Erreur parsing:', error);
            }
          }
        }
      }
    }

  } catch (error) {
    console.error('❌ Erreur:', error);
  }
}

testChatStreaming();
