const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Configuration Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-key';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debugModelConfig() {
  console.log('🔍 Debugging AI model configuration...');
  console.log('Environment variables:');
  console.log('- NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl);
  console.log('- SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? 'Set' : 'Not set');
  console.log('- ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 'Set' : 'Not set');
  console.log('');

  try {
    // 1. Check all model configurations
    console.log('📋 All model configurations:');
    const { data: allConfigs, error: allError } = await supabase
      .from('ai_model_configs')
      .select('*')
      .order('created_at', { ascending: true });

    if (allError) {
      console.error('❌ Error fetching all configs:', allError);
      return;
    }

    if (!allConfigs || allConfigs.length === 0) {
      console.log('⚠️  No model configurations found in database');
      return;
    }

    allConfigs.forEach((config, index) => {
      console.log(`${index + 1}. ${config.code}`);
      console.log(`   - Provider: ${config.provider}`);
      console.log(`   - Model: ${config.model}`);
      console.log(`   - API Key Env Var: ${config.api_key_env_var}`);
      console.log(`   - Is Default: ${config.is_default}`);
      console.log(`   - Is Fallback: ${config.is_fallback}`);
      console.log('');
    });

    // 2. Check default configuration
    console.log('🎯 Default model configuration:');
    const { data: defaultConfig, error: defaultError } = await supabase
      .from('ai_model_configs')
      .select('*')
      .eq('is_default', true)
      .limit(1)
      .maybeSingle();

    if (defaultError) {
      console.error('❌ Error fetching default config:', defaultError);
      return;
    }

    if (!defaultConfig) {
      console.log('⚠️  No default model configuration found');
    } else {
      console.log('✅ Default config found:');
      console.log(`   - Code: ${defaultConfig.code}`);
      console.log(`   - Provider: ${defaultConfig.provider}`);
      console.log(`   - Model: ${defaultConfig.model}`);
      console.log(`   - API Key Env Var: ${defaultConfig.api_key_env_var}`);
      console.log(`   - Base URL: ${defaultConfig.base_url}`);
    }

    // 3. Check if the specific model exists
    console.log('');
    console.log('🔍 Looking for anthropic-sonnet-4-5 configurations:');
    const { data: sonnetConfigs, error: sonnetError } = await supabase
      .from('ai_model_configs')
      .select('*')
      .or('code.ilike.%sonnet-4-5%,model.ilike.%sonnet-4-5%');

    if (sonnetError) {
      console.error('❌ Error searching for sonnet configs:', sonnetError);
    } else if (!sonnetConfigs || sonnetConfigs.length === 0) {
      console.log('⚠️  No sonnet-4-5 configurations found');
    } else {
      console.log('✅ Found sonnet-4-5 configurations:');
      sonnetConfigs.forEach(config => {
        console.log(`   - Code: ${config.code}`);
        console.log(`   - Model: ${config.model}`);
        console.log(`   - API Key Env Var: ${config.api_key_env_var}`);
      });
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

debugModelConfig().catch(console.error);
