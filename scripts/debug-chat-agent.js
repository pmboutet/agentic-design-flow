const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Configuration Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-key';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debugChatAgent() {
  console.log('🔍 Debugging chat agent configuration...');

  try {
    // 1. Get the chat agent with all relations
    console.log('📋 Fetching chat agent with relations...');
    
    const { data: agentData, error: agentError } = await supabase
      .from('ai_agents')
      .select(`
        *,
        model_config:ai_model_configs!model_config_id(*),
        fallback_model_config:ai_model_configs!fallback_model_config_id(*)
      `)
      .eq('slug', 'ask-conversation-response')
      .maybeSingle();

    if (agentError) {
      console.error('❌ Error fetching agent:', agentError);
      return;
    }

    if (!agentData) {
      console.log('❌ Chat agent not found');
      return;
    }

    console.log('✅ Chat agent found:');
    console.log(`   - ID: ${agentData.id}`);
    console.log(`   - Slug: ${agentData.slug}`);
    console.log(`   - Name: ${agentData.name}`);
    console.log(`   - System Prompt: ${agentData.system_prompt?.substring(0, 100)}...`);
    console.log(`   - User Prompt: ${agentData.user_prompt?.substring(0, 100)}...`);
    console.log(`   - Model Config ID: ${agentData.model_config_id}`);
    console.log(`   - Fallback Model Config ID: ${agentData.fallback_model_config_id}`);
    console.log('');

    // 2. Check model configurations
    console.log('🔍 Model configurations:');
    
    if (agentData.model_config) {
      console.log('✅ Primary model config:');
      console.log(`   - Code: ${agentData.model_config.code}`);
      console.log(`   - Provider: ${agentData.model_config.provider}`);
      console.log(`   - Model: ${agentData.model_config.model}`);
      console.log(`   - API Key Env Var: ${agentData.model_config.api_key_env_var}`);
      console.log(`   - Is Default: ${agentData.model_config.is_default}`);
    } else {
      console.log('❌ Primary model config not found');
    }

    if (agentData.fallback_model_config) {
      console.log('✅ Fallback model config:');
      console.log(`   - Code: ${agentData.fallback_model_config.code}`);
      console.log(`   - Provider: ${agentData.fallback_model_config.provider}`);
      console.log(`   - Model: ${agentData.fallback_model_config.model}`);
      console.log(`   - API Key Env Var: ${agentData.fallback_model_config.api_key_env_var}`);
      console.log(`   - Is Fallback: ${agentData.fallback_model_config.is_fallback}`);
    } else {
      console.log('⚠️  Fallback model config not found');
    }

    console.log('');

    // 3. Test the mapping function
    console.log('🧪 Testing mapping function...');
    
    // Simulate the mapping
    const mappedAgent = {
      id: agentData.id,
      slug: agentData.slug,
      name: agentData.name,
      description: agentData.description ?? null,
      modelConfigId: agentData.model_config_id ?? null,
      fallbackModelConfigId: agentData.fallback_model_config_id ?? null,
      systemPrompt: agentData.system_prompt,
      userPrompt: agentData.user_prompt ?? '',
      availableVariables: Array.isArray(agentData.available_variables) ? agentData.available_variables : [],
      metadata: agentData.metadata ?? null,
      modelConfig: agentData.model_config ? {
        id: agentData.model_config.id,
        code: agentData.model_config.code,
        name: agentData.model_config.name,
        provider: agentData.model_config.provider,
        model: agentData.model_config.model,
        baseUrl: agentData.model_config.base_url ?? null,
        apiKeyEnvVar: agentData.model_config.api_key_env_var,
        additionalHeaders: agentData.model_config.additional_headers ?? null,
        isDefault: Boolean(agentData.model_config.is_default),
        isFallback: Boolean(agentData.model_config.is_fallback),
        createdAt: agentData.model_config.created_at ?? undefined,
        updatedAt: agentData.model_config.updated_at ?? undefined,
      } : null,
      fallbackModelConfig: agentData.fallback_model_config ? {
        id: agentData.fallback_model_config.id,
        code: agentData.fallback_model_config.code,
        name: agentData.fallback_model_config.name,
        provider: agentData.fallback_model_config.provider,
        model: agentData.fallback_model_config.model,
        baseUrl: agentData.fallback_model_config.base_url ?? null,
        apiKeyEnvVar: agentData.fallback_model_config.api_key_env_var,
        additionalHeaders: agentData.fallback_model_config.additional_headers ?? null,
        isDefault: Boolean(agentData.fallback_model_config.is_default),
        isFallback: Boolean(agentData.fallback_model_config.is_fallback),
        createdAt: agentData.fallback_model_config.created_at ?? undefined,
        updatedAt: agentData.fallback_model_config.updated_at ?? undefined,
      } : null,
    };

    console.log('✅ Mapped agent:');
    console.log(`   - Model Config: ${mappedAgent.modelConfig?.code || 'null'}`);
    console.log(`   - Fallback Model Config: ${mappedAgent.fallbackModelConfig?.code || 'null'}`);
    console.log(`   - System Prompt Length: ${mappedAgent.systemPrompt?.length || 0}`);
    console.log(`   - User Prompt Length: ${mappedAgent.userPrompt?.length || 0}`);

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

debugChatAgent().catch(console.error);
