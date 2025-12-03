const { Pool } = require('pg');

// Remove quotes if present (some environments include them)
const databaseUrl = (process.env.DATABASE_URL || '').replace(/^"|"$/g, '');

if (!databaseUrl) {
  console.error('Missing DATABASE_URL environment variable');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

async function dumpAgents() {
  console.log('Fetching agents from database...\n');

  const result = await pool.query(`
    SELECT slug, name, description, system_prompt, user_prompt, available_variables, voice
    FROM ai_agents
    ORDER BY slug
  `);

  const agents = result.rows;

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

  await pool.end();
}

dumpAgents().catch(err => {
  console.error('Error:', err);
  pool.end();
  process.exit(1);
});
