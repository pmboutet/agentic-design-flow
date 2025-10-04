const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Configuration Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-key';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixModelConfig() {
  console.log('🔧 Fixing AI model configuration...');

  try {
    // 1. First, let's see what we have
    const { data: existingConfigs, error: fetchError } = await supabase
      .from('ai_model_configs')
      .select('*')
      .or('code.ilike.%sonnet-4-5%,model.ilike.%sonnet-4-5%');

    if (fetchError) {
      console.error('❌ Error fetching existing configs:', fetchError);
      return;
    }

    console.log('📋 Existing sonnet-4-5 configurations:');
    existingConfigs?.forEach(config => {
      console.log(`- ${config.code} (${config.model}) - Default: ${config.is_default}`);
    });

    // 2. Create or update the correct configuration
    console.log('');
    console.log('🔧 Creating/updating anthropic-claude-sonnet-4-5 configuration...');

    const { data: newConfig, error: upsertError } = await supabase
      .from('ai_model_configs')
      .upsert({
        id: '550e8400-e29b-41d4-a716-446655440061',
        code: 'anthropic-claude-sonnet-4-5',
        name: 'Claude Sonnet 4.5',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        api_key_env_var: 'ANTHROPIC_API_KEY',
        base_url: 'https://api.anthropic.com/v1',
        is_default: true,
        is_fallback: false
      }, { onConflict: 'code' })
      .select()
      .single();

    if (upsertError) {
      console.error('❌ Error upserting config:', upsertError);
      return;
    }

    console.log('✅ Configuration updated successfully:');
    console.log(`   - Code: ${newConfig.code}`);
    console.log(`   - Model: ${newConfig.model}`);
    console.log(`   - API Key Env Var: ${newConfig.api_key_env_var}`);
    console.log(`   - Is Default: ${newConfig.is_default}`);

    // 3. Ensure no other configs are marked as default
    console.log('');
    console.log('🔧 Ensuring only one default configuration...');

    const { error: updateError } = await supabase
      .from('ai_model_configs')
      .update({ is_default: false })
      .neq('code', 'anthropic-claude-sonnet-4-5');

    if (updateError) {
      console.error('❌ Error updating other configs:', updateError);
    } else {
      console.log('✅ Other configurations unmarked as default');
    }

    // 4. Verify the final state
    console.log('');
    console.log('🔍 Verifying final configuration...');

    const { data: finalConfig, error: finalError } = await supabase
      .from('ai_model_configs')
      .select('*')
      .eq('is_default', true)
      .limit(1)
      .maybeSingle();

    if (finalError) {
      console.error('❌ Error verifying final config:', finalError);
    } else if (!finalConfig) {
      console.log('⚠️  No default configuration found after update');
    } else {
      console.log('✅ Final default configuration:');
      console.log(`   - Code: ${finalConfig.code}`);
      console.log(`   - Model: ${finalConfig.model}`);
      console.log(`   - API Key Env Var: ${finalConfig.api_key_env_var}`);
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

fixModelConfig().catch(console.error);
