#!/usr/bin/env node

/**
 * Script de vérification des agents AI
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifyAgents() {
  console.log('🔍 Verifying AI agents in database...\n');

  try {
    // Get all agents
    const { data: agents, error } = await supabase
      .from('ai_agents')
      .select('slug, name, description, created_at, updated_at')
      .order('slug');

    if (error) throw error;

    if (!agents || agents.length === 0) {
      console.log('❌ No agents found in database!');
      process.exit(1);
    }

    console.log(`✅ Found ${agents.length} agent(s) in database:\n`);
    
    agents.forEach((agent, index) => {
      console.log(`${index + 1}. ${agent.slug}`);
      console.log(`   Name: ${agent.name}`);
      console.log(`   Description: ${agent.description}`);
      console.log(`   Created: ${new Date(agent.created_at).toLocaleString()}`);
      console.log(`   Updated: ${new Date(agent.updated_at).toLocaleString()}`);
      console.log('');
    });

    // Get model config info
    const { data: modelConfigs, error: modelError } = await supabase
      .from('ai_model_configs')
      .select('code, name, is_default')
      .order('is_default', { ascending: false });

    if (modelError) throw modelError;

    console.log(`\n📊 Model Configurations (${modelConfigs.length}):\n`);
    modelConfigs.forEach((config) => {
      console.log(`  ${config.is_default ? '✓ [DEFAULT]' : ' '} ${config.code} - ${config.name}`);
    });

    console.log('\n✨ Verification complete!\n');

  } catch (error) {
    console.error('❌ Error verifying agents:', error);
    process.exit(1);
  }
}

verifyAgents();

