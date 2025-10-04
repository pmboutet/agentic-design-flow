const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Configuration Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-key';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Simulate the resolveApiKey function
function resolveApiKey(config) {
  console.log('🔑 Resolving API key for config:', {
    code: config.code,
    provider: config.provider,
    model: config.model,
    apiKeyEnvVar: config.apiKeyEnvVar,
    availableEnvVars: Object.keys(process.env).filter(key => key.includes('API') || key.includes('KEY'))
  });
  
  const key = process.env[config.apiKeyEnvVar];
  console.log('🔍 API key lookup result:', {
    envVar: config.apiKeyEnvVar,
    keyExists: !!key,
    keyLength: key ? key.length : 0,
    keyPrefix: key ? key.substring(0, 10) + '...' : 'undefined'
  });
  
  if (!key) {
    throw new Error(`Missing API key for model ${config.code}. Define environment variable ${config.apiKeyEnvVar}.`);
  }
  return key;
}

async function testApiKeyResolution() {
  console.log('🧪 Testing API key resolution...');
  console.log('Environment check:');
  console.log('- ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 'Set' : 'Not set');
  console.log('- Available env vars with API/KEY:', Object.keys(process.env).filter(key => key.includes('API') || key.includes('KEY')));
  console.log('');

  try {
    // 1. Get the default model configuration using the proper function
    console.log('📋 Fetching default model configuration...');
    
    // Import the function (we'll simulate it here)
    const { data: rawConfig, error: defaultError } = await supabase
      .from('ai_model_configs')
      .select('*')
      .eq('is_default', true)
      .limit(1)
      .maybeSingle();

    if (defaultError) {
      console.error('❌ Error fetching default config:', defaultError);
      return;
    }

    if (!rawConfig) {
      console.log('⚠️  No default model configuration found');
      return;
    }

    // Map the raw data to the proper format
    const defaultConfig = {
      id: rawConfig.id,
      code: rawConfig.code,
      name: rawConfig.name,
      provider: rawConfig.provider,
      model: rawConfig.model,
      baseUrl: rawConfig.base_url ?? null,
      apiKeyEnvVar: rawConfig.api_key_env_var,
      additionalHeaders: rawConfig.additional_headers ?? null,
      isDefault: Boolean(rawConfig.is_default),
      isFallback: Boolean(rawConfig.is_fallback),
      createdAt: rawConfig.created_at ?? undefined,
      updatedAt: rawConfig.updated_at ?? undefined,
    };

    console.log('✅ Default config found:');
    console.log(`   - Code: ${defaultConfig.code}`);
    console.log(`   - Provider: ${defaultConfig.provider}`);
    console.log(`   - Model: ${defaultConfig.model}`);
    console.log(`   - API Key Env Var: ${defaultConfig.apiKeyEnvVar}`);
    console.log('');

    // 2. Test API key resolution
    console.log('🔑 Testing API key resolution...');
    try {
      const apiKey = resolveApiKey(defaultConfig);
      console.log('✅ API key resolved successfully');
      console.log(`   - Key length: ${apiKey.length}`);
      console.log(`   - Key prefix: ${apiKey.substring(0, 10)}...`);
    } catch (error) {
      console.error('❌ API key resolution failed:', error.message);
      
      // 3. If it fails, try to identify the issue
      console.log('');
      console.log('🔍 Debugging the issue:');
      console.log(`   - Expected env var: ${defaultConfig.api_key_env_var}`);
      console.log(`   - Actual env var value: ${process.env[defaultConfig.api_key_env_var] || 'undefined'}`);
      console.log(`   - All env vars containing 'ANTHROPIC':`, Object.keys(process.env).filter(key => key.includes('ANTHROPIC')));
      console.log(`   - All env vars containing 'API':`, Object.keys(process.env).filter(key => key.includes('API')));
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

testApiKeyResolution().catch(console.error);
