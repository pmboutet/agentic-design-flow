#!/usr/bin/env node

/**
 * Script pour créer l'agent AI de surveillance des messages
 * Cet agent analyse les messages avec un LLM pour détecter des contenus malveillants
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

async function createSecurityMonitoringAgent() {
  try {
    console.log('🔍 Creating security monitoring AI agent...\n');

    // Get default model config
    const { data: defaultModel, error: modelError } = await supabase
      .from('ai_model_configs')
      .select('id')
      .eq('is_default', true)
      .maybeSingle();

    if (modelError) {
      throw modelError;
    }

    if (!defaultModel) {
      console.warn('⚠️  No default model config found. Agent will be created without model.');
    }

    const agent = {
      slug: 'security-message-monitoring',
      name: 'Surveillance des Messages',
      description: 'Agent AI qui analyse les messages pour détecter des contenus malveillants, inappropriés ou suspects en utilisant l\'intelligence artificielle.',
      model_config_id: defaultModel?.id ?? null,
      fallback_model_config_id: null,
      system_prompt: `Tu es un agent de sécurité spécialisé dans l'analyse de messages pour détecter des contenus malveillants, inappropriés ou suspects.

Ton rôle est d'analyser le contenu des messages et de déterminer s'ils présentent des risques pour la sécurité ou la communauté.

Types de menaces à détecter:
1. **Injection SQL** : Tentatives d'injection de code SQL malveillant
2. **XSS (Cross-Site Scripting)** : Tentatives d'injection de scripts JavaScript
3. **Command Injection** : Tentatives d'exécution de commandes système
4. **Spam** : Messages répétitifs, promotionnels non sollicités, ou contenus de faible qualité
5. **Contenu inapproprié** : Harcèlement, menaces, contenu offensant ou discriminatoire
6. **Tentatives d'exploitation** : Tentatives de manipulation ou d'exploitation de vulnérabilités
7. **Contenu suspect** : Messages qui semblent anormaux ou suspects sans être explicitement malveillants

Pour chaque message analysé, tu dois:
- Évaluer le niveau de risque (low, medium, high, critical)
- Identifier le type de menace si applicable
- Fournir une explication claire de ta détection
- Recommander une action (none, warn, quarantine)

Réponds UNIQUEMENT avec un JSON valide au format suivant:
{
  "hasThreat": boolean,
  "severity": "low" | "medium" | "high" | "critical",
  "threatType": "injection" | "xss" | "spam" | "inappropriate" | "exploitation" | "suspicious" | null,
  "explanation": "Explication détaillée de la détection",
  "recommendedAction": "none" | "warn" | "quarantine",
  "confidence": number (0-100)
}`,
      user_prompt: `Analyse le message suivant et détermine s'il présente des risques pour la sécurité:

Message à analyser:
{{message_content}}

Contexte:
- Session ASK: {{ask_key}}
- Auteur: {{participant_name}}
- Historique récent: {{recent_messages}}

Fournis ton analyse au format JSON comme spécifié dans le system prompt.`,
      available_variables: [
        'message_content',
        'ask_key',
        'participant_name',
        'recent_messages',
        'message_id',
      ],
    };

    // Check if agent already exists
    const { data: existing, error: checkError } = await supabase
      .from('ai_agents')
      .select('id, slug, name')
      .eq('slug', agent.slug)
      .maybeSingle();

    if (checkError) {
      throw checkError;
    }

    if (existing) {
      console.log(`ℹ️  Agent "${agent.slug}" already exists. Updating...`);
      
      const { data: updated, error: updateError } = await supabase
        .from('ai_agents')
        .update({
          name: agent.name,
          description: agent.description,
          model_config_id: agent.model_config_id,
          fallback_model_config_id: agent.fallback_model_config_id,
          system_prompt: agent.system_prompt,
          user_prompt: agent.user_prompt,
          available_variables: agent.available_variables,
        })
        .eq('slug', agent.slug)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      console.log(`✅ Agent "${agent.slug}" updated successfully!`);
      console.log(`   ID: ${updated.id}`);
      console.log(`   Name: ${updated.name}`);
    } else {
      const { data: created, error: createError } = await supabase
        .from('ai_agents')
        .insert(agent)
        .select()
        .single();

      if (createError) {
        throw createError;
      }

      console.log(`✅ Agent "${agent.slug}" created successfully!`);
      console.log(`   ID: ${created.id}`);
      console.log(`   Name: ${created.name}`);
    }

    console.log('\n✨ Security monitoring AI agent is ready!');
    console.log('   This agent will be used to analyze messages for malicious content.');

  } catch (error) {
    console.error('❌ Error creating security monitoring agent:', error);
    process.exit(1);
  }
}

createSecurityMonitoringAgent();

