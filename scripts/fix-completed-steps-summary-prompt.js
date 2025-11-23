#!/usr/bin/env node
/**
 * Script pour corriger le prompt système de l'agent ask-conversation-response
 * pour gérer correctement la variable completed_steps_summary quand elle est vide
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

async function fixPrompt() {
  console.log('🔧 Correction du prompt système pour completed_steps_summary...\n');

  try {
    // Récupérer l'agent actuel
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

    // Remplacer la ligne problématique par une version conditionnelle
    const oldPattern = /Historique des étapes précédentes :\s*\n\s*⟦⟦ {{completed_steps_summary}} ⟧⟧/;
    const newSection = `{{#if (notEmpty completed_steps_summary)}}
Historique des étapes précédentes : 
⟦⟦ {{completed_steps_summary}} ⟧⟧
{{/if}}`;

    let newSystemPrompt = currentAgent.system_prompt;

    if (oldPattern.test(newSystemPrompt)) {
      newSystemPrompt = newSystemPrompt.replace(oldPattern, newSection);
      console.log('✅ Pattern trouvé et remplacé\n');
    } else {
      // Essayer une version plus flexible
      const flexiblePattern = /Historique des étapes précédentes[^\n]*\n[^\n]*⟦⟦\s*\{\{completed_steps_summary\}\}\s*⟧⟧/;
      if (flexiblePattern.test(newSystemPrompt)) {
        newSystemPrompt = newSystemPrompt.replace(flexiblePattern, newSection);
        console.log('✅ Pattern flexible trouvé et remplacé\n');
      } else {
        // Recherche manuelle de la ligne
        const lines = newSystemPrompt.split('\n');
        const targetLineIndex = lines.findIndex(line => 
          line.includes('Historique des étapes précédentes') && 
          (line.includes('{{completed_steps_summary}}') || 
           (lines[lines.indexOf(line) + 1] && lines[lines.indexOf(line) + 1].includes('{{completed_steps_summary}}')))
        );

        if (targetLineIndex !== -1) {
          // Remplacer la ligne et la suivante si nécessaire
          let replacementIndex = targetLineIndex;
          if (lines[targetLineIndex + 1] && lines[targetLineIndex + 1].includes('{{completed_steps_summary}}')) {
            // Remplacer deux lignes
            lines[targetLineIndex] = '{{#if (notEmpty completed_steps_summary)}}';
            lines[targetLineIndex + 1] = lines[targetLineIndex + 1].replace('⟦⟦ {{completed_steps_summary}} ⟧⟧', '⟦⟦ {{completed_steps_summary}} ⟧⟧');
            lines.splice(targetLineIndex + 2, 0, '{{/if}}');
          } else {
            // Remplacer une seule ligne
            lines[targetLineIndex] = lines[targetLineIndex].replace(
              /⟦⟦\s*\{\{completed_steps_summary\}\}\s*⟧⟧/,
              '{{#if (notEmpty completed_steps_summary)}}\n⟦⟦ {{completed_steps_summary}} ⟧⟧\n{{/if}}'
            );
          }
          newSystemPrompt = lines.join('\n');
          console.log('✅ Ligne trouvée et remplacée manuellement\n');
        } else {
          console.warn('⚠️  Pattern non trouvé, utilisation d\'une approche de remplacement directe\n');
          // Remplacement direct de la variable
          newSystemPrompt = newSystemPrompt.replace(
            /⟦⟦\s*\{\{completed_steps_summary\}\}\s*⟧⟧/g,
            '{{#if (notEmpty completed_steps_summary)}}\n⟦⟦ {{completed_steps_summary}} ⟧⟧\n{{/if}}'
          );
        }
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
    console.log('📝 Section corrigée:');
    console.log('---');
    console.log(newSection);
    console.log('---\n');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

fixPrompt().catch(console.error);




