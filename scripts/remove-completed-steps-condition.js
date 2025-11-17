#!/usr/bin/env node
/**
 * Script pour enlever la condition autour de completed_steps_summary
 * puisque la variable aura toujours une valeur maintenant
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function removeCondition() {
  console.log('🔧 Suppression de la condition autour de completed_steps_summary...\n');

  try {
    const { data: currentAgent, error: fetchError } = await supabase
      .from('ai_agents')
      .select('id, slug, name, system_prompt')
      .eq('slug', 'ask-conversation-response')
      .maybeSingle();

    if (fetchError) {
      throw new Error(`Erreur lors de la récupération: ${fetchError.message}`);
    }

    if (!currentAgent) {
      throw new Error('Agent ask-conversation-response introuvable');
    }

    console.log(`📋 Agent trouvé: ${currentAgent.name} (${currentAgent.id})\n`);

    // Remplacer la section conditionnelle par une version sans condition
    const conditionalPattern = /\{\{#if \(notEmpty completed_steps_summary\)\}\}\s*\n\s*Historique des étapes précédentes[^\n]*\n\s*⟦⟦\s*\{\{completed_steps_summary\}\}\s*⟧⟧\s*\n\s*\{\{\/if\}\}/;
    const simpleSection = `Historique des étapes précédentes : 
⟦⟦ {{completed_steps_summary}} ⟧⟧`;

    let newSystemPrompt = currentAgent.system_prompt;

    if (conditionalPattern.test(newSystemPrompt)) {
      newSystemPrompt = newSystemPrompt.replace(conditionalPattern, simpleSection);
      console.log('✅ Condition supprimée\n');
    } else {
      // Essayer une version plus flexible
      const lines = newSystemPrompt.split('\n');
      let startIndex = -1;
      let endIndex = -1;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('{{#if (notEmpty completed_steps_summary)}}')) {
          startIndex = i;
        }
        if (startIndex !== -1 && lines[i].includes('{{/if}}')) {
          endIndex = i;
          break;
        }
      }

      if (startIndex !== -1 && endIndex !== -1) {
        // Extraire la section entre les conditions
        const sectionLines = lines.slice(startIndex + 1, endIndex);
        const sectionText = sectionLines.join('\n').trim();
        
        // Remplacer toute la section conditionnelle par juste le contenu
        lines.splice(startIndex, endIndex - startIndex + 1, simpleSection);
        newSystemPrompt = lines.join('\n');
        console.log('✅ Condition supprimée (approche manuelle)\n');
      } else {
        console.warn('⚠️  Pattern conditionnel non trouvé, le prompt pourrait déjà être correct\n');
      }
    }

    // Mettre à jour l'agent
    const { error: updateError } = await supabase
      .from('ai_agents')
      .update({
        system_prompt: newSystemPrompt,
        updated_at: new Date().toISOString()
      })
      .eq('id', currentAgent.id);

    if (updateError) {
      throw new Error(`Erreur lors de la mise à jour: ${updateError.message}`);
    }

    console.log('✅ Prompt système mis à jour avec succès!\n');
    console.log('📝 Section simplifiée:');
    console.log('---');
    console.log(simpleSection);
    console.log('---\n');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

removeCondition().catch(console.error);

