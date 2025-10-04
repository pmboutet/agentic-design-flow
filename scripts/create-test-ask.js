const { createClient } = require('@supabase/supabase-js');

// Configuration Supabase (à adapter selon ton setup)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-key';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createTestAsk() {
  console.log('Creating test ASK session with key "123"...');

  try {
    // First, create a test client
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .upsert({
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Test Client',
        company: 'Test Company',
        industry: 'Technology',
        email: 'test@example.com',
        status: 'active'
      }, { onConflict: 'id' })
      .select()
      .single();

    if (clientError) {
      console.error('Error creating client:', clientError);
      return;
    }

    console.log('Client created:', client.id);

    // Create a test user
    const { data: user, error: userError } = await supabase
      .from('users')
      .upsert({
        id: '550e8400-e29b-41d4-a716-446655440011',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        full_name: 'Test User',
        role: 'facilitator',
        client_id: client.id,
        is_active: true
      }, { onConflict: 'id' })
      .select()
      .single();

    if (userError) {
      console.error('Error creating user:', userError);
      return;
    }

    console.log('User created:', user.id);

    // Create a test project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .upsert({
        id: '550e8400-e29b-41d4-a716-446655440021',
        name: 'Test Project',
        description: 'Test project for debugging',
        start_date: new Date().toISOString(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
        status: 'active',
        client_id: client.id,
        created_by: user.id
      }, { onConflict: 'id' })
      .select()
      .single();

    if (projectError) {
      console.error('Error creating project:', projectError);
      return;
    }

    console.log('Project created:', project.id);

    // Create a test ASK session with key "123"
    const { data: askSession, error: askError } = await supabase
      .from('ask_sessions')
      .upsert({
        id: '550e8400-e29b-41d4-a716-446655440041',
        ask_key: '123',
        name: 'Test ASK Session',
        question: 'What are the main challenges in our current workflow?',
        description: 'A test session to debug the streaming issue',
        start_date: new Date().toISOString(),
        end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
        status: 'active',
        project_id: project.id,
        created_by: user.id,
        delivery_mode: 'digital',
        audience_scope: 'individual',
        response_mode: 'collective'
      }, { onConflict: 'ask_key' })
      .select()
      .single();

    if (askError) {
      console.error('Error creating ASK session:', askError);
      return;
    }

    console.log('ASK session created:', askSession.ask_key);

    // Create a participant
    const { data: participant, error: participantError } = await supabase
      .from('ask_participants')
      .upsert({
        id: '550e8400-e29b-41d4-a716-446655440051',
        ask_session_id: askSession.id,
        user_id: user.id,
        role: 'participant',
        is_spokesperson: true
      }, { onConflict: 'id' })
      .select()
      .single();

    if (participantError) {
      console.error('Error creating participant:', participantError);
      return;
    }

    console.log('Participant created:', participant.id);

    // Create an initial message
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        ask_session_id: askSession.id,
        user_id: user.id,
        sender_type: 'user',
        content: 'Hello, I need help with our workflow optimization.',
        message_type: 'text'
      })
      .select()
      .single();

    if (messageError) {
      console.error('Error creating message:', messageError);
      return;
    }

    console.log('Message created:', message.id);
    console.log('Test ASK session with key "123" created successfully!');
    console.log('You can now test the streaming endpoint at: /api/ask/123/stream');

  } catch (error) {
    console.error('Error creating test ASK:', error);
  }
}

createTestAsk();
