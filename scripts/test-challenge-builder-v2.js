#!/usr/bin/env node

/**
 * Script de test pour valider l'installation des agents Challenge Builder V2
 * 
 * Usage:
 *   node scripts/test-challenge-builder-v2.js [PROJECT_ID]
 */

// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const REQUIRED_AGENTS = [
  {
    slug: 'challenge-revision-planner',
    name: 'Challenge Revision Planner',
    phase: 'planning',
    requiredVariables: [
      'project_name',
      'project_goal',
      'project_status',
      'project_timeframe',
      'challenge_context_json'
    ]
  },
  {
    slug: 'challenge-detailed-updater',
    name: 'Challenge Detailed Updater',
    phase: 'execution',
    requiredVariables: [
      'project_name',
      'challenge_id',
      'challenge_title',
      'challenge_context_json',
      'available_owner_options_json'
    ]
  },
  {
    slug: 'challenge-detailed-creator',
    name: 'Challenge Detailed Creator',
    phase: 'execution',
    requiredVariables: [
      'project_name',
      'reference_id',
      'suggested_title',
      'related_insights_json',
      'project_context_json'
    ]
  }
];

async function checkAgents() {
  console.log('🔍 Checking Challenge Builder V2 agents...\n');
  
  let allValid = true;

  for (const required of REQUIRED_AGENTS) {
    console.log(`📋 Checking: ${required.slug}`);
    
    const { data: agent, error } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('slug', required.slug)
      .maybeSingle();

    if (error) {
      console.error(`   ❌ Database error: ${error.message}`);
      allValid = false;
      continue;
    }

    if (!agent) {
      console.error(`   ❌ Agent not found in database`);
      console.log(`   💡 Run: node scripts/init-challenge-builder-optimized.js`);
      allValid = false;
      continue;
    }

    // Check name
    if (agent.name !== required.name) {
      console.warn(`   ⚠️  Name mismatch: expected "${required.name}", got "${agent.name}"`);
    }

    // Check metadata
    const version = agent.metadata?.version;
    const phase = agent.metadata?.phase;
    
    if (version !== '2.0') {
      console.warn(`   ⚠️  Version mismatch: expected "2.0", got "${version}"`);
    }
    
    if (phase !== required.phase) {
      console.warn(`   ⚠️  Phase mismatch: expected "${required.phase}", got "${phase}"`);
    }

    // Check variables
    const availableVars = agent.available_variables || [];
    const missingVars = required.requiredVariables.filter(v => !availableVars.includes(v));
    
    if (missingVars.length > 0) {
      console.warn(`   ⚠️  Missing variables: ${missingVars.join(', ')}`);
    }

    // Check model config
    if (!agent.model_config_id) {
      console.error(`   ❌ No model config assigned`);
      allValid = false;
      continue;
    }

    // Check prompts are not empty
    if (!agent.system_prompt || agent.system_prompt.trim().length < 100) {
      console.error(`   ❌ System prompt is too short or empty`);
      allValid = false;
      continue;
    }

    if (!agent.user_prompt || agent.user_prompt.trim().length < 50) {
      console.error(`   ❌ User prompt is too short or empty`);
      allValid = false;
      continue;
    }

    console.log(`   ✅ Agent valid`);
    console.log(`      - Model: ${agent.model_config_id}`);
    console.log(`      - Variables: ${availableVars.length} defined`);
    console.log(`      - Version: ${version}, Phase: ${phase}`);
    console.log('');
  }

  return allValid;
}

async function checkModelConfig() {
  console.log('🔍 Checking model configuration...\n');

  const { data, error } = await supabase
    .from('ai_model_configs')
    .select('*')
    .eq('is_default', true)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error(`❌ Database error: ${error.message}`);
    return false;
  }

  if (!data || data.length === 0) {
    console.error('❌ No default model config found');
    console.log('💡 Run: node scripts/init-challenge-builder-optimized.js');
    return false;
  }

  const defaultConfig = data[0];
  
  // Warn if multiple defaults exist
  if (data.length > 1) {
    console.log(`⚠️  Warning: Multiple default model configs found. Using most recent.`);
  }

  console.log(`✅ Default model config: ${defaultConfig.name}`);
  console.log(`   - Provider: ${defaultConfig.provider}`);
  console.log(`   - Model: ${defaultConfig.model}`);
  console.log(`   - API Key Env Var: ${defaultConfig.api_key_env_var}`);
  console.log('');

  // Check if API key exists
  const apiKey = process.env[defaultConfig.api_key_env_var];
  if (!apiKey) {
    console.error(`❌ Environment variable ${defaultConfig.api_key_env_var} is not set`);
    console.log(`💡 Set: export ${defaultConfig.api_key_env_var}=your-key`);
    return false;
  }

  console.log(`✅ API key found (${apiKey.substring(0, 10)}...)`);
  console.log('');

  return true;
}

async function testAgentExecution(projectId) {
  if (!projectId) {
    console.log('⏭️  Skipping agent execution test (no PROJECT_ID provided)');
    console.log('💡 To test execution: node scripts/test-challenge-builder-v2.js YOUR_PROJECT_ID');
    console.log('');
    return true;
  }

  console.log(`🧪 Testing agent execution on project ${projectId}...\n`);

  try {
    // Check if project exists
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, name')
      .eq('id', projectId)
      .maybeSingle();

    if (projectError) {
      console.error(`❌ Database error: ${projectError.message}`);
      return false;
    }

    if (!project) {
      console.error(`❌ Project ${projectId} not found`);
      return false;
    }

    console.log(`✅ Project found: ${project.name}`);
    console.log('');

    // Make API call
    console.log('📡 Calling API...');
    const apiUrl = `${supabaseUrl.replace(/:\d+$/, ':3000')}/api/admin/projects/${projectId}/ai/challenge-builder-v2`;
    
    console.log(`   URL: ${apiUrl}`);
    console.log('   This may take 5-10 seconds...');
    
    const startTime = Date.now();
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const elapsed = Date.now() - startTime;
    console.log(`   ⏱️  Response time: ${(elapsed / 1000).toFixed(2)}s`);
    console.log('');

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API error (${response.status}): ${errorText}`);
      return false;
    }

    const data = await response.json();

    if (!data.success) {
      console.error(`❌ API returned error: ${data.error}`);
      return false;
    }

    console.log('✅ API call successful');
    console.log(`   - Updates: ${data.data.challengeSuggestions?.length || 0}`);
    console.log(`   - New challenges: ${data.data.newChallengeSuggestions?.length || 0}`);
    console.log(`   - Errors: ${data.data.errors?.length || 0}`);
    console.log('');

    // Check logs
    const { data: logs, error: logsError } = await supabase
      .from('ai_agent_logs')
      .select('interaction_type, status, latency_ms')
      .in('interaction_type', [
        'project_challenge_planning',
        'project_challenge_update_detailed',
        'project_challenge_creation_detailed'
      ])
      .order('created_at', { ascending: false })
      .limit(20);

    if (!logsError && logs && logs.length > 0) {
      console.log('📊 Recent logs:');
      
      const logsByType = logs.reduce((acc, log) => {
        if (!acc[log.interaction_type]) {
          acc[log.interaction_type] = [];
        }
        acc[log.interaction_type].push(log);
        return acc;
      }, {});

      Object.entries(logsByType).forEach(([type, typeLogs]) => {
        const avgLatency = typeLogs.reduce((sum, l) => sum + (l.latency_ms || 0), 0) / typeLogs.length;
        const successCount = typeLogs.filter(l => l.status === 'completed').length;
        
        console.log(`   ${type}:`);
        console.log(`      - Calls: ${typeLogs.length}`);
        console.log(`      - Success: ${successCount}/${typeLogs.length} (${((successCount / typeLogs.length) * 100).toFixed(1)}%)`);
        console.log(`      - Avg latency: ${(avgLatency / 1000).toFixed(2)}s`);
      });
      console.log('');
    }

    return true;

  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   Challenge Builder V2 - Installation Test Suite    ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log('');

  const projectId = process.argv[2];

  // Test 1: Check agents
  const agentsValid = await checkAgents();

  // Test 2: Check model config
  const modelConfigValid = await checkModelConfig();

  // Test 3: Test execution (optional)
  const executionValid = await testAgentExecution(projectId);

  // Summary
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('📋 Test Summary:');
  console.log(`   Agents: ${agentsValid ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Model Config: ${modelConfigValid ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Execution: ${executionValid ? '✅ PASS' : '⏭️  SKIPPED'}`);
  console.log('');

  const allPassed = agentsValid && modelConfigValid && (!projectId || executionValid);

  if (allPassed) {
    console.log('🎉 All tests passed! Challenge Builder V2 is ready to use.');
    console.log('');
    console.log('Next steps:');
    console.log('   1. Test with a real project: node scripts/test-challenge-builder-v2.js YOUR_PROJECT_ID');
    console.log('   2. Update frontend to use /api/.../challenge-builder-v2');
    console.log('   3. Monitor performance in ai_agent_logs table');
    console.log('');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed. Please fix the issues above.');
    console.log('');
    console.log('Common fixes:');
    console.log('   - Run: node scripts/init-challenge-builder-optimized.js');
    console.log('   - Check: ANTHROPIC_API_KEY environment variable');
    console.log('   - Verify: Database connection and migrations');
    console.log('');
    process.exit(1);
  }
}

runTests();

