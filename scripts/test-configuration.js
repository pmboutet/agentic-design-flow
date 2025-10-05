const { createClient } = require('@supabase/supabase-js');

console.log('🧪 Testing AI configuration...');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Configuration Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

console.log('Environment check:');
console.log('- NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'Set' : 'Not set');
console.log('- SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? 'Set' : 'Not set');
console.log('- ANTHROPIC_API_KEY:', anthropicApiKey ? 'Set' : 'Not set');
console.log('');

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase configuration. Please check your .env.local file.');
  process.exit(1);
}

if (!anthropicApiKey) {
  console.error('❌ Missing ANTHROPIC_API_KEY. Please add it to your .env.local file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testConfiguration() {
  try {
    console.log('🔍 Testing Supabase connection...');
    
    // Test connection by fetching model configs
    const { data: configs, error } = await supabase
      .from('ai_model_configs')
      .select('*')
      .limit(1);

    if (error) {
      console.error('❌ Supabase connection failed:', error.message);
      return;
    }

    console.log('✅ Supabase connection successful');
    console.log('');

    // Test API key resolution
    console.log('🔑 Testing API key resolution...');
    
    const testConfig = {
      code: 'anthropic-claude-sonnet-4-5',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      apiKeyEnvVar: 'ANTHROPIC_API_KEY'
    };

    const apiKey = process.env[testConfig.apiKeyEnvVar];
    if (!apiKey) {
      console.error('❌ API key not found for', testConfig.apiKeyEnvVar);
      return;
    }

    console.log('✅ API key found');
    console.log(`   - Key length: ${apiKey.length}`);
    console.log(`   - Key prefix: ${apiKey.substring(0, 10)}...`);
    console.log('');

    // Test model configuration loading
    console.log('📋 Testing model configuration loading...');
    
    const { data: defaultConfig, error: configError } = await supabase
      .from('ai_model_configs')
      .select('*')
      .eq('is_default', true)
      .limit(1)
      .maybeSingle();

    if (configError) {
      console.error('❌ Error fetching default config:', configError.message);
      return;
    }

    if (!defaultConfig) {
      console.log('⚠️  No default model configuration found');
      console.log('Run: node scripts/fix-model-config.js to create one');
      return;
    }

    console.log('✅ Default model configuration found:');
    console.log(`   - Code: ${defaultConfig.code}`);
    console.log(`   - Provider: ${defaultConfig.provider}`);
    console.log(`   - Model: ${defaultConfig.model}`);
    console.log(`   - API Key Env Var: ${defaultConfig.api_key_env_var}`);
    console.log('');

    // Test the complete flow
    console.log('🔄 Testing complete API key resolution flow...');
    
    try {
      const resolvedKey = process.env[defaultConfig.api_key_env_var];
      if (!resolvedKey) {
        throw new Error(`Missing API key for model ${defaultConfig.code}. Define environment variable ${defaultConfig.api_key_env_var}.`);
      }
      
      console.log('✅ Complete flow successful!');
      console.log('🎉 Your configuration is ready for use.');
      
    } catch (flowError) {
      console.error('❌ Complete flow failed:', flowError.message);
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
  }
}

testConfiguration().catch(console.error);
