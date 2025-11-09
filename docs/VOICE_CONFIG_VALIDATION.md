# Guide de Validation de la Configuration Voice

Ce document décrit comment valider la configuration voice pour les messages avec Deepgram et ElevenLabs.

## Scripts de Vérification

### 1. Vérification de la Base de Données

```bash
node scripts/verify-voice-config-db.js
```

Ce script vérifie :
- La structure de la table `ai_model_configs` (colonnes Deepgram et ElevenLabs)
- Les configurations existantes
- Les valeurs NULL/invalides
- La cohérence entre provider et champs configurés

### 2. Vérification des APIs

```bash
node scripts/verify-voice-config-apis.js
```

Ce script vérifie :
- La validité des clés API Deepgram et ElevenLabs
- Les modèles Deepgram disponibles (STT, TTS, LLM)
- Les voix ElevenLabs disponibles
- La cohérence entre les valeurs en DB et les APIs

### 3. Validation Complète

```bash
node scripts/validate-voice-config.js
```

Ce script exécute toutes les vérifications ci-dessus et génère un rapport complet.

## Modèles Deepgram Supportés

### Modèles STT (Speech-to-Text)
- `nova-2` (recommandé, multilingue)
- `nova-3` (multilingue)
- `nova` (legacy)
- `enhanced`
- `base`

### Modèles TTS (Text-to-Speech)
- `aura-2-thalia-en` (recommandé)
- `aura-2-asteria-en`
- `aura-2-luna-en`
- `aura-2-stella-en`
- `aura-thalia-en` (legacy)
- `aura-asteria-en` (legacy)

### Modèles LLM
**Anthropic:**
- `claude-3-5-haiku-latest` (recommandé)
- `claude-3-5-sonnet-20241022`
- `claude-sonnet-4-20250514`
- `claude-3-opus-20240229`

**OpenAI:**
- `gpt-4o` (recommandé)
- `gpt-4o-mini`
- `gpt-4-turbo`
- `gpt-4`

## Modèles ElevenLabs Supportés

### Modèles TTS
- `eleven_turbo_v2_5` (recommandé)
- `eleven_multilingual_v2`
- `eleven_multilingual_v1`
- `eleven_monolingual_v1`
- `eleven_turbo_v2`
- `eleven_turbo_v2_0`

### Voice IDs
Les voice IDs sont des UUIDs ou des identifiants de 20 caractères. Consultez votre dashboard ElevenLabs pour obtenir les IDs disponibles.

Voix par défaut :
- `21m00Tcm4TlvDq8ikWAM` (Rachel)

## Configuration Requise

### Pour `deepgram-voice-agent`
- `deepgram_stt_model` (requis)
- `deepgram_tts_model` (requis)
- `deepgram_llm_provider` (requis)
- `deepgram_voice_agent_model` (requis)

### Pour `hybrid-voice-agent`
- `deepgram_stt_model` (requis)
- `deepgram_llm_provider` (requis)
- `deepgram_voice_agent_model` (requis)
- `elevenlabs_voice_id` (requis)
- `elevenlabs_model_id` (requis, défaut: `eleven_turbo_v2_5`)

## Variables d'Environnement

- `DEEPGRAM_API_KEY` - Clé API Deepgram (requis)
- `ELEVENLABS_API_KEY` - Clé API ElevenLabs (requis pour hybrid-voice-agent)

## Erreurs Courantes

1. **Voice ID manquant pour hybrid-voice-agent**
   - Solution : Configurer `elevenlabs_voice_id` dans la base de données

2. **Modèle Deepgram invalide**
   - Solution : Vérifier que le nom du modèle correspond exactement à l'API Deepgram

3. **Clé API manquante**
   - Solution : Configurer les variables d'environnement `DEEPGRAM_API_KEY` et `ELEVENLABS_API_KEY`

4. **Champs ElevenLabs non retournés par l'API**
   - Solution : Vérifier que `src/app/api/ask/[key]/agent-config/route.ts` retourne tous les champs

## Bonnes Pratiques

1. **Utiliser des modèles multilingues pour STT**
   - Préférer `nova-2` ou `nova-3` pour la détection automatique de langue

2. **Valider les configurations avant déploiement**
   - Exécuter les scripts de vérification régulièrement
   - Tester avec des voix réelles avant la production

3. **Gérer les erreurs gracieusement**
   - Les erreurs d'API sont catchées et loggées
   - Les fallbacks sont en place pour les valeurs manquantes

4. **Sécurité**
   - Les clés API ne sont jamais exposées côté client
   - Les endpoints `/api/token` et `/api/elevenlabs-token` sont sécurisés

