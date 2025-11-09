#!/usr/bin/env node

/**
 * Script de vérification de la configuration voice en base de données
 * Vérifie la structure de la table ai_model_configs et les valeurs configurées
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   - NEXT_PUBLIC_SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Colonnes attendues pour Deepgram
const DEEPGRAM_COLUMNS = [
  'deepgram_voice_agent_model',
  'deepgram_stt_model',
  'deepgram_tts_model',
  'deepgram_llm_provider',
];

// Colonnes attendues pour ElevenLabs
const ELEVENLABS_COLUMNS = [
  'elevenlabs_voice_id',
  'elevenlabs_model_id',
  'elevenlabs_api_key_env_var',
];

// Modèles Deepgram valides (selon la documentation)
const VALID_DEEPGRAM_STT_MODELS = ['nova-2', 'nova', 'enhanced', 'base'];
const VALID_DEEPGRAM_TTS_MODELS = ['aura-2-thalia-en', 'aura-2-asteria-en', 'aura-thalia-en', 'aura-asteria-en'];
const VALID_DEEPGRAM_LLM_PROVIDERS = ['anthropic', 'openai'];

// Modèles ElevenLabs valides
const VALID_ELEVENLABS_MODELS = ['eleven_turbo_v2_5', 'eleven_multilingual_v2', 'eleven_multilingual_v1', 'eleven_monolingual_v1'];

async function checkTableStructure() {
  console.log('\n📋 Vérification de la structure de la table ai_model_configs...\n');

  try {
    // Vérifier les colonnes Deepgram
    console.log('🔍 Vérification des colonnes Deepgram:');
    for (const col of DEEPGRAM_COLUMNS) {
      const { data, error } = await supabase
        .from('ai_model_configs')
        .select(col)
        .limit(1);

      if (error && error.code === '42703') {
        console.log(`   ❌ Colonne manquante: ${col}`);
        return false;
      } else if (error) {
        console.log(`   ⚠️  Erreur lors de la vérification de ${col}: ${error.message}`);
      } else {
        console.log(`   ✅ Colonne présente: ${col}`);
      }
    }

    // Vérifier les colonnes ElevenLabs
    console.log('\n🔍 Vérification des colonnes ElevenLabs:');
    for (const col of ELEVENLABS_COLUMNS) {
      const { data, error } = await supabase
        .from('ai_model_configs')
        .select(col)
        .limit(1);

      if (error && error.code === '42703') {
        console.log(`   ❌ Colonne manquante: ${col}`);
        return false;
      } else if (error) {
        console.log(`   ⚠️  Erreur lors de la vérification de ${col}: ${error.message}`);
      } else {
        console.log(`   ✅ Colonne présente: ${col}`);
      }
    }

    return true;
  } catch (error) {
    console.error('❌ Erreur lors de la vérification de la structure:', error);
    return false;
  }
}

async function checkVoiceConfigs() {
  console.log('\n📊 Vérification des configurations voice existantes...\n');

  try {
    // Récupérer toutes les configs voice
    const { data: configs, error } = await supabase
      .from('ai_model_configs')
      .select('*')
      .in('provider', ['deepgram-voice-agent', 'hybrid-voice-agent']);

    if (error) {
      console.error('❌ Erreur lors de la récupération des configs:', error);
      return;
    }

    if (!configs || configs.length === 0) {
      console.log('⚠️  Aucune configuration voice trouvée');
      return;
    }

    console.log(`✅ ${configs.length} configuration(s) voice trouvée(s)\n`);

    const issues = [];

    for (const config of configs) {
      console.log(`\n📝 Configuration: ${config.name} (${config.code})`);
      console.log(`   Provider: ${config.provider}`);

      // Vérifier les champs Deepgram
      if (config.provider === 'deepgram-voice-agent' || config.provider === 'hybrid-voice-agent') {
        console.log('\n   🔍 Vérification Deepgram:');

        // STT Model
        if (!config.deepgram_stt_model) {
          issues.push({
            config: config.code,
            field: 'deepgram_stt_model',
            issue: 'Valeur manquante (requis pour voice agent)',
          });
          console.log('   ❌ deepgram_stt_model: MANQUANT');
        } else if (!VALID_DEEPGRAM_STT_MODELS.includes(config.deepgram_stt_model)) {
          issues.push({
            config: config.code,
            field: 'deepgram_stt_model',
            issue: `Valeur invalide: ${config.deepgram_stt_model} (attendu: ${VALID_DEEPGRAM_STT_MODELS.join(', ')})`,
          });
          console.log(`   ⚠️  deepgram_stt_model: ${config.deepgram_stt_model} (non validé)`);
        } else {
          console.log(`   ✅ deepgram_stt_model: ${config.deepgram_stt_model}`);
        }

        // TTS Model (requis pour deepgram-voice-agent uniquement)
        if (config.provider === 'deepgram-voice-agent') {
          if (!config.deepgram_tts_model) {
            issues.push({
              config: config.code,
              field: 'deepgram_tts_model',
              issue: 'Valeur manquante (requis pour deepgram-voice-agent)',
            });
            console.log('   ❌ deepgram_tts_model: MANQUANT');
          } else if (!VALID_DEEPGRAM_TTS_MODELS.some(m => config.deepgram_tts_model.includes(m.split('-')[0]))) {
            issues.push({
              config: config.code,
              field: 'deepgram_tts_model',
              issue: `Valeur invalide: ${config.deepgram_tts_model}`,
            });
            console.log(`   ⚠️  deepgram_tts_model: ${config.deepgram_tts_model} (non validé)`);
          } else {
            console.log(`   ✅ deepgram_tts_model: ${config.deepgram_tts_model}`);
          }
        }

        // LLM Provider
        if (!config.deepgram_llm_provider) {
          issues.push({
            config: config.code,
            field: 'deepgram_llm_provider',
            issue: 'Valeur manquante (requis pour voice agent)',
          });
          console.log('   ❌ deepgram_llm_provider: MANQUANT');
        } else if (!VALID_DEEPGRAM_LLM_PROVIDERS.includes(config.deepgram_llm_provider)) {
          issues.push({
            config: config.code,
            field: 'deepgram_llm_provider',
            issue: `Valeur invalide: ${config.deepgram_llm_provider}`,
          });
          console.log(`   ❌ deepgram_llm_provider: ${config.deepgram_llm_provider} (invalide)`);
        } else {
          console.log(`   ✅ deepgram_llm_provider: ${config.deepgram_llm_provider}`);
        }

        // LLM Model
        if (!config.deepgram_voice_agent_model) {
          issues.push({
            config: config.code,
            field: 'deepgram_voice_agent_model',
            issue: 'Valeur manquante (requis pour voice agent)',
          });
          console.log('   ❌ deepgram_voice_agent_model: MANQUANT');
        } else {
          console.log(`   ✅ deepgram_voice_agent_model: ${config.deepgram_voice_agent_model}`);
        }
      }

      // Vérifier les champs ElevenLabs (requis pour hybrid-voice-agent)
      if (config.provider === 'hybrid-voice-agent') {
        console.log('\n   🔍 Vérification ElevenLabs:');

        if (!config.elevenlabs_voice_id) {
          issues.push({
            config: config.code,
            field: 'elevenlabs_voice_id',
            issue: 'Valeur manquante (requis pour hybrid-voice-agent)',
          });
          console.log('   ❌ elevenlabs_voice_id: MANQUANT');
        } else {
          // Vérifier le format UUID
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!uuidRegex.test(config.elevenlabs_voice_id) && config.elevenlabs_voice_id.length !== 20) {
            issues.push({
              config: config.code,
              field: 'elevenlabs_voice_id',
              issue: `Format invalide: ${config.elevenlabs_voice_id}`,
            });
            console.log(`   ⚠️  elevenlabs_voice_id: ${config.elevenlabs_voice_id} (format non validé)`);
          } else {
            console.log(`   ✅ elevenlabs_voice_id: ${config.elevenlabs_voice_id}`);
          }
        }

        if (!config.elevenlabs_model_id) {
          issues.push({
            config: config.code,
            field: 'elevenlabs_model_id',
            issue: 'Valeur manquante (requis pour hybrid-voice-agent)',
          });
          console.log('   ❌ elevenlabs_model_id: MANQUANT');
        } else if (!VALID_ELEVENLABS_MODELS.includes(config.elevenlabs_model_id)) {
          issues.push({
            config: config.code,
            field: 'elevenlabs_model_id',
            issue: `Valeur invalide: ${config.elevenlabs_model_id}`,
          });
          console.log(`   ⚠️  elevenlabs_model_id: ${config.elevenlabs_model_id} (non validé)`);
        } else {
          console.log(`   ✅ elevenlabs_model_id: ${config.elevenlabs_model_id}`);
        }

        if (!config.elevenlabs_api_key_env_var) {
          console.log('   ⚠️  elevenlabs_api_key_env_var: Non défini (utilisera ELEVENLABS_API_KEY par défaut)');
        } else {
          console.log(`   ✅ elevenlabs_api_key_env_var: ${config.elevenlabs_api_key_env_var}`);
        }
      }
    }

    // Résumé des problèmes
    if (issues.length > 0) {
      console.log('\n\n⚠️  PROBLÈMES DÉTECTÉS:\n');
      for (const issue of issues) {
        console.log(`   - ${issue.config}.${issue.field}: ${issue.issue}`);
      }
      return false;
    } else {
      console.log('\n\n✅ Aucun problème détecté dans les configurations');
      return true;
    }
  } catch (error) {
    console.error('❌ Erreur lors de la vérification des configs:', error);
    return false;
  }
}

async function main() {
  console.log('🔍 Vérification de la configuration voice en base de données\n');
  console.log('=' .repeat(60));

  const structureOk = await checkTableStructure();
  if (!structureOk) {
    console.error('\n❌ La structure de la table est incomplète. Veuillez exécuter les migrations.');
    process.exit(1);
  }

  const configsOk = await checkVoiceConfigs();

  console.log('\n' + '='.repeat(60));
  if (structureOk && configsOk) {
    console.log('\n✅ Vérification terminée avec succès');
    process.exit(0);
  } else {
    console.log('\n⚠️  Vérification terminée avec des avertissements');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Erreur fatale:', error);
  process.exit(1);
});

