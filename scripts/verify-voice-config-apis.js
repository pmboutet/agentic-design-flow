#!/usr/bin/env node

/**
 * Script de vérification des APIs Deepgram et ElevenLabs
 * Vérifie que les modèles/voix configurés en DB existent dans les APIs
 */

import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

// Modèles Deepgram connus (selon la documentation officielle)
const KNOWN_DEEPGRAM_STT_MODELS = [
  'nova-2', 'nova', 'enhanced', 'base', 'whisper-large', 'whisper-medium', 'whisper-small'
];

const KNOWN_DEEPGRAM_TTS_MODELS = [
  'aura-2-thalia-en', 'aura-2-asteria-en', 'aura-2-luna-en', 'aura-2-stella-en',
  'aura-thalia-en', 'aura-asteria-en', 'aura-luna-en', 'aura-stella-en'
];

const KNOWN_DEEPGRAM_LLM_MODELS = {
  anthropic: [
    'claude-3-5-haiku-latest',
    'claude-3-5-sonnet-20241022',
    'claude-sonnet-4-20250514',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307'
  ],
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo'
  ]
};

// Modèles ElevenLabs connus
const KNOWN_ELEVENLABS_MODELS = [
  'eleven_turbo_v2_5',
  'eleven_multilingual_v2',
  'eleven_multilingual_v1',
  'eleven_monolingual_v1',
  'eleven_turbo_v2',
  'eleven_turbo_v2_0'
];

async function checkDeepgramAPI() {
  console.log('\n🔍 Vérification de l\'API Deepgram...\n');

  if (!DEEPGRAM_API_KEY) {
    console.log('❌ DEEPGRAM_API_KEY non définie dans les variables d\'environnement');
    return { valid: false, models: null };
  }

  try {
    // Test de connexion avec un appel simple
    const testResponse = await fetch('https://api.deepgram.com/v1/projects', {
      headers: {
        'Authorization': `Token ${DEEPGRAM_API_KEY}`,
      },
    });

    if (!testResponse.ok) {
      console.log(`❌ Erreur d'authentification Deepgram: ${testResponse.status} ${testResponse.statusText}`);
      const errorText = await testResponse.text();
      console.log(`   Détails: ${errorText}`);
      return { valid: false, models: null };
    }

    console.log('✅ Clé API Deepgram valide');

    // Note: Deepgram n'a pas d'endpoint public pour lister les modèles disponibles
    // On utilise donc les modèles connus de la documentation
    console.log('\n📋 Modèles STT connus:');
    KNOWN_DEEPGRAM_STT_MODELS.forEach(model => {
      console.log(`   - ${model}`);
    });

    console.log('\n📋 Modèles TTS connus:');
    KNOWN_DEEPGRAM_TTS_MODELS.forEach(model => {
      console.log(`   - ${model}`);
    });

    console.log('\n📋 Modèles LLM supportés:');
    console.log('   Anthropic:');
    KNOWN_DEEPGRAM_LLM_MODELS.anthropic.forEach(model => {
      console.log(`     - ${model}`);
    });
    console.log('   OpenAI:');
    KNOWN_DEEPGRAM_LLM_MODELS.openai.forEach(model => {
      console.log(`     - ${model}`);
    });

    return {
      valid: true,
      models: {
        stt: KNOWN_DEEPGRAM_STT_MODELS,
        tts: KNOWN_DEEPGRAM_TTS_MODELS,
        llm: KNOWN_DEEPGRAM_LLM_MODELS,
      },
    };
  } catch (error) {
    console.error('❌ Erreur lors de la vérification Deepgram:', error.message);
    return { valid: false, models: null };
  }
}

async function checkElevenLabsAPI() {
  console.log('\n🔍 Vérification de l\'API ElevenLabs...\n');

  if (!ELEVENLABS_API_KEY) {
    console.log('❌ ELEVENLABS_API_KEY non définie dans les variables d\'environnement');
    return { valid: false, voices: null, models: null };
  }

  try {
    // Lister les voix disponibles
    const voicesResponse = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
    });

    if (!voicesResponse.ok) {
      console.log(`❌ Erreur d'authentification ElevenLabs: ${voicesResponse.status} ${voicesResponse.statusText}`);
      const errorText = await voicesResponse.text();
      console.log(`   Détails: ${errorText}`);
      return { valid: false, voices: null, models: null };
    }

    const voicesData = await voicesResponse.json();
    const voices = voicesData.voices || [];

    console.log('✅ Clé API ElevenLabs valide');
    console.log(`\n📋 ${voices.length} voix disponible(s):`);

    const voiceIds = [];
    for (const voice of voices.slice(0, 10)) { // Afficher les 10 premières
      console.log(`   - ${voice.name} (${voice.voice_id})`);
      voiceIds.push(voice.voice_id);
    }
    if (voices.length > 10) {
      console.log(`   ... et ${voices.length - 10} autre(s) voix`);
    }

    // Récupérer tous les voice_ids
    const allVoiceIds = voices.map(v => v.voice_id);

    console.log('\n📋 Modèles TTS connus:');
    KNOWN_ELEVENLABS_MODELS.forEach(model => {
      console.log(`   - ${model}`);
    });

    return {
      valid: true,
      voices: allVoiceIds,
      models: KNOWN_ELEVENLABS_MODELS,
    };
  } catch (error) {
    console.error('❌ Erreur lors de la vérification ElevenLabs:', error.message);
    return { valid: false, voices: null, models: null };
  }
}

async function compareWithDatabase(deepgramInfo, elevenLabsInfo) {
  console.log('\n📊 Comparaison avec la base de données...\n');

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.log('⚠️  Impossible de comparer avec la DB (variables manquantes)');
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: configs, error } = await supabase
      .from('ai_model_configs')
      .select('*')
      .in('provider', ['deepgram-voice-agent', 'hybrid-voice-agent']);

    if (error) {
      console.error('❌ Erreur lors de la récupération des configs:', error);
      return;
    }

    if (!configs || configs.length === 0) {
      console.log('⚠️  Aucune configuration voice en DB');
      return;
    }

    const issues = [];

    for (const config of configs) {
      console.log(`\n🔍 Vérification: ${config.name} (${config.code})`);

      // Vérifier Deepgram STT
      if (config.deepgram_stt_model && deepgramInfo?.models?.stt) {
        if (!deepgramInfo.models.stt.includes(config.deepgram_stt_model)) {
          issues.push({
            config: config.code,
            field: 'deepgram_stt_model',
            value: config.deepgram_stt_model,
            issue: 'Modèle non trouvé dans la liste des modèles connus',
          });
          console.log(`   ⚠️  deepgram_stt_model: ${config.deepgram_stt_model} (non validé)`);
        } else {
          console.log(`   ✅ deepgram_stt_model: ${config.deepgram_stt_model}`);
        }
      }

      // Vérifier Deepgram TTS
      if (config.deepgram_tts_model && deepgramInfo?.models?.tts) {
        const isValid = deepgramInfo.models.tts.some(m => 
          config.deepgram_tts_model.includes(m.split('-')[0])
        );
        if (!isValid) {
          issues.push({
            config: config.code,
            field: 'deepgram_tts_model',
            value: config.deepgram_tts_model,
            issue: 'Modèle non trouvé dans la liste des modèles connus',
          });
          console.log(`   ⚠️  deepgram_tts_model: ${config.deepgram_tts_model} (non validé)`);
        } else {
          console.log(`   ✅ deepgram_tts_model: ${config.deepgram_tts_model}`);
        }
      }

      // Vérifier Deepgram LLM
      if (config.deepgram_voice_agent_model && config.deepgram_llm_provider && deepgramInfo?.models?.llm) {
        const validModels = deepgramInfo.models.llm[config.deepgram_llm_provider] || [];
        if (!validModels.includes(config.deepgram_voice_agent_model)) {
          issues.push({
            config: config.code,
            field: 'deepgram_voice_agent_model',
            value: config.deepgram_voice_agent_model,
            issue: `Modèle non trouvé pour le provider ${config.deepgram_llm_provider}`,
          });
          console.log(`   ⚠️  deepgram_voice_agent_model: ${config.deepgram_voice_agent_model} (non validé)`);
        } else {
          console.log(`   ✅ deepgram_voice_agent_model: ${config.deepgram_voice_agent_model}`);
        }
      }

      // Vérifier ElevenLabs Voice ID
      if (config.elevenlabs_voice_id && elevenLabsInfo?.voices) {
        if (!elevenLabsInfo.voices.includes(config.elevenlabs_voice_id)) {
          issues.push({
            config: config.code,
            field: 'elevenlabs_voice_id',
            value: config.elevenlabs_voice_id,
            issue: 'Voice ID non trouvé dans votre compte ElevenLabs',
          });
          console.log(`   ❌ elevenlabs_voice_id: ${config.elevenlabs_voice_id} (non trouvé)`);
        } else {
          console.log(`   ✅ elevenlabs_voice_id: ${config.elevenlabs_voice_id}`);
        }
      }

      // Vérifier ElevenLabs Model ID
      if (config.elevenlabs_model_id && elevenLabsInfo?.models) {
        if (!elevenLabsInfo.models.includes(config.elevenlabs_model_id)) {
          issues.push({
            config: config.code,
            field: 'elevenlabs_model_id',
            value: config.elevenlabs_model_id,
            issue: 'Modèle non trouvé dans la liste des modèles connus',
          });
          console.log(`   ⚠️  elevenlabs_model_id: ${config.elevenlabs_model_id} (non validé)`);
        } else {
          console.log(`   ✅ elevenlabs_model_id: ${config.elevenlabs_model_id}`);
        }
      }
    }

    if (issues.length > 0) {
      console.log('\n\n⚠️  INCOHÉRENCES DÉTECTÉES:\n');
      for (const issue of issues) {
        console.log(`   - ${issue.config}.${issue.field} = "${issue.value}": ${issue.issue}`);
      }
      return false;
    } else {
      console.log('\n\n✅ Toutes les valeurs en DB sont cohérentes avec les APIs');
      return true;
    }
  } catch (error) {
    console.error('❌ Erreur lors de la comparaison:', error);
    return false;
  }
}

async function main() {
  console.log('🔍 Vérification des APIs Deepgram et ElevenLabs\n');
  console.log('='.repeat(60));

  const deepgramInfo = await checkDeepgramAPI();
  const elevenLabsInfo = await checkElevenLabsAPI();

  if (deepgramInfo.valid && elevenLabsInfo.valid) {
    await compareWithDatabase(deepgramInfo, elevenLabsInfo);
  }

  console.log('\n' + '='.repeat(60));
  if (deepgramInfo.valid && elevenLabsInfo.valid) {
    console.log('\n✅ Vérification des APIs terminée');
    process.exit(0);
  } else {
    console.log('\n⚠️  Vérification terminée avec des erreurs');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Erreur fatale:', error);
  process.exit(1);
});

