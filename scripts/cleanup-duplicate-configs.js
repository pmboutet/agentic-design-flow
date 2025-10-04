const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Configuration Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-key';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function cleanupDuplicateConfigs() {
  console.log('🧹 Cleaning up duplicate model configurations...');

  try {
    // 1. Get all configurations
    const { data: allConfigs, error: fetchError } = await supabase
      .from('ai_model_configs')
      .select('*')
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error('❌ Error fetching configs:', fetchError);
      return;
    }

    console.log('📋 Found configurations:');
    allConfigs?.forEach(config => {
      console.log(`- ${config.code} (${config.model}) - Default: ${config.is_default}`);
    });
    console.log('');

    // 2. Identify duplicates
    const anthropicConfigs = allConfigs?.filter(config => 
      config.provider === 'anthropic' && 
      config.model.includes('sonnet-4-5')
    ) || [];

    console.log('🔍 Anthropic sonnet-4-5 configurations:');
    anthropicConfigs.forEach(config => {
      console.log(`- ${config.code} (${config.model}) - Default: ${config.is_default}`);
    });
    console.log('');

    if (anthropicConfigs.length <= 1) {
      console.log('✅ No duplicates found');
      return;
    }

    // 3. Keep the best configuration (anthropic-claude-sonnet-4-5)
    const keepConfig = anthropicConfigs.find(config => 
      config.code === 'anthropic-claude-sonnet-4-5'
    );

    if (!keepConfig) {
      console.log('⚠️  No anthropic-claude-sonnet-4-5 config found, keeping the first one');
      const firstConfig = anthropicConfigs[0];
      
      // Update the first config to be the correct one
      const { error: updateError } = await supabase
        .from('ai_model_configs')
        .update({
          code: 'anthropic-claude-sonnet-4-5',
          name: 'Claude Sonnet 4.5',
          model: 'claude-sonnet-4-5',
          is_default: true
        })
        .eq('id', firstConfig.id);

      if (updateError) {
        console.error('❌ Error updating config:', updateError);
        return;
      }

      console.log('✅ Updated first config to be the correct one');
    } else {
      console.log('✅ Found correct config:', keepConfig.code);
    }

    // 4. Remove duplicate configurations
    const configsToDelete = anthropicConfigs.filter(config => 
      config.code !== 'anthropic-claude-sonnet-4-5'
    );

    if (configsToDelete.length > 0) {
      console.log('🗑️  Removing duplicate configurations:');
      configsToDelete.forEach(config => {
        console.log(`- ${config.code} (${config.model})`);
      });

      for (const config of configsToDelete) {
        const { error: deleteError } = await supabase
          .from('ai_model_configs')
          .delete()
          .eq('id', config.id);

        if (deleteError) {
          console.error(`❌ Error deleting ${config.code}:`, deleteError);
        } else {
          console.log(`✅ Deleted ${config.code}`);
        }
      }
    }

    // 5. Ensure only one default configuration
    console.log('');
    console.log('🔧 Ensuring only one default configuration...');

    const { error: unsetError } = await supabase
      .from('ai_model_configs')
      .update({ is_default: false })
      .neq('code', 'anthropic-claude-sonnet-4-5');

    if (unsetError) {
      console.error('❌ Error unsetting other defaults:', unsetError);
    } else {
      console.log('✅ Other configurations unmarked as default');
    }

    // 6. Verify final state
    console.log('');
    console.log('🔍 Verifying final configuration...');

    const { data: finalConfigs, error: finalError } = await supabase
      .from('ai_model_configs')
      .select('*')
      .order('created_at', { ascending: true });

    if (finalError) {
      console.error('❌ Error verifying final configs:', finalError);
    } else {
      console.log('✅ Final configurations:');
      finalConfigs?.forEach(config => {
        console.log(`- ${config.code} (${config.model}) - Default: ${config.is_default}`);
      });
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

cleanupDuplicateConfigs().catch(console.error);
