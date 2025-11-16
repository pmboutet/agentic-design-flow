#!/usr/bin/env node
/**
 * Script to check messages in database for a specific ASK session
 */

const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function checkMessages() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const askKey = await new Promise((resolve) => {
    rl.question('Entrez la clé ASK (ask_key) : ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

  console.log(`\n🔍 Recherche des messages pour ASK key: ${askKey}\n`);

  // Get ASK session
  const { data: askSession, error: askError } = await supabase
    .from('ask_sessions')
    .select('id, ask_key, question, response_mode, audience_scope')
    .eq('ask_key', askKey)
    .maybeSingle();

  if (askError || !askSession) {
    console.error('❌ ASK session non trouvée:', askError?.message || 'Not found');
    return;
  }

  console.log('✅ ASK session trouvée:');
  console.log('   ID:', askSession.id);
  console.log('   Question:', askSession.question);
  console.log('   Response mode:', askSession.response_mode);
  console.log('   Audience scope:', askSession.audience_scope);

  // Get conversation threads
  console.log('\n📋 Threads de conversation:');
  const { data: threads, error: threadsError } = await supabase
    .from('conversation_threads')
    .select('id, user_id, created_at')
    .eq('ask_session_id', askSession.id)
    .order('created_at', { ascending: true });

  if (threadsError) {
    console.error('❌ Erreur lors de la récupération des threads:', threadsError);
  } else if (!threads || threads.length === 0) {
    console.log('   ⚠️  Aucun thread trouvé');
  } else {
    threads.forEach((thread, i) => {
      console.log(`   Thread ${i + 1}: ${thread.id} (user: ${thread.user_id || 'shared'})`);
    });
  }

  // Get all messages
  console.log('\n💬 Messages:');
  const { data: messages, error: messagesError } = await supabase
    .from('messages')
    .select('id, sender_type, content, conversation_thread_id, created_at')
    .eq('ask_session_id', askSession.id)
    .order('created_at', { ascending: true });

  if (messagesError) {
    console.error('❌ Erreur lors de la récupération des messages:', messagesError);
    return;
  }

  if (!messages || messages.length === 0) {
    console.log('   ⚠️  Aucun message trouvé');
    return;
  }

  console.log(`   Total: ${messages.length} messages\n`);

  // Count by sender type
  const userMessages = messages.filter(m => m.sender_type === 'user').length;
  const aiMessages = messages.filter(m => m.sender_type === 'ai').length;
  console.log(`   👤 Messages utilisateur: ${userMessages}`);
  console.log(`   🤖 Messages IA: ${aiMessages}\n`);

  // Count by thread
  const withThread = messages.filter(m => m.conversation_thread_id !== null).length;
  const withoutThread = messages.filter(m => m.conversation_thread_id === null).length;
  console.log(`   🧵 Messages avec thread: ${withThread}`);
  console.log(`   ❌ Messages sans thread: ${withoutThread}\n`);

  // Show last 10 messages
  console.log('   📝 Derniers messages:');
  const last10 = messages.slice(-10);
  last10.forEach((msg, i) => {
    const senderIcon = msg.sender_type === 'user' ? '👤' : '🤖';
    const threadInfo = msg.conversation_thread_id 
      ? `[thread: ${msg.conversation_thread_id.substring(0, 8)}...]` 
      : '[no thread]';
    const content = msg.content.length > 50 ? msg.content.substring(0, 50) + '...' : msg.content;
    console.log(`      ${i + 1}. ${senderIcon} ${msg.sender_type} ${threadInfo}: "${content}"`);
  });

  // Test: Can we build messages_json?
  console.log('\n🧪 Test de construction de messages_json:');
  const messagesPayload = messages.map(msg => ({
    id: msg.id,
    senderType: msg.sender_type,
    senderName: msg.sender_type === 'ai' ? 'Agent' : 'Participant',
    content: msg.content,
    timestamp: msg.created_at
  }));

  const messagesJson = JSON.stringify(messagesPayload, null, 2);
  console.log(`   Longueur: ${messagesJson.length} caractères`);
  console.log(`   Contient ${messagesPayload.length} messages`);
  console.log(`   Premier message: ${messagesPayload[0]?.senderType} - "${messagesPayload[0]?.content.substring(0, 30)}..."`);
  console.log(`   Dernier message: ${messagesPayload[messagesPayload.length - 1]?.senderType} - "${messagesPayload[messagesPayload.length - 1]?.content.substring(0, 30)}..."`);

  console.log('\n✅ Diagnostic terminé');
}

checkMessages().catch(err => {
  console.error('❌ Erreur fatale:', err);
  process.exit(1);
});

