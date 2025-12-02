const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function dumpAgents() {
  console.log('Fetching agents from database...\n');

  const { data: agents, error } = await supabase
    .from('ai_agents')
    .select('slug, name, description, system_prompt, user_prompt, available_variables, voice')
    .order('slug');

  if (error) {
    console.error('Error fetching agents:', error);
    process.exit(1);
  }

  console.log(`Found ${agents.length} agents:\n`);

  for (const agent of agents) {
    console.log('='.repeat(80));
    console.log(`AGENT: ${agent.slug}`);
    console.log('='.repeat(80));
    console.log(`Name: ${agent.name}`);
    console.log(`Description: ${agent.description}`);
    console.log(`Voice: ${agent.voice || false}`);
    console.log(`\n--- SYSTEM PROMPT ---`);
    console.log(agent.system_prompt);
    console.log(`\n--- USER PROMPT ---`);
    console.log(agent.user_prompt);
    console.log(`\n--- AVAILABLE VARIABLES ---`);
    console.log(JSON.stringify(agent.available_variables, null, 2));
    console.log('\n');
  }

  // Also output as JSON for easy copy
  console.log('='.repeat(80));
  console.log('JSON OUTPUT (for programmatic use):');
  console.log('='.repeat(80));
  console.log(JSON.stringify(agents, null, 2));
}

dumpAgents();
