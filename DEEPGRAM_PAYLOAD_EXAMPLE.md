# Exemple de Payload Deepgram et Vérification de la Configuration

## ✅ OUI, le modèle vient bien de la base de données

### Flux de chargement depuis la DB

1. **Base de données** (`ai_model_configs` table)
   - Colonne: `deepgram_stt_model` (ex: `"nova-2"`, `"nova-3"`)
   - Colonne: `deepgram_tts_model` (ex: `"aura-2-thalia-en"`)
   - Colonne: `deepgram_llm_provider` (ex: `"anthropic"`, `"openai"`)
   - Colonne: `deepgram_voice_agent_model` (ex: `"claude-3-5-haiku-latest"`)

2. **Chargement** (`src/lib/ai/models.ts`)
   ```typescript
   // mapModelRow() mappe les colonnes DB vers l'objet TypeScript
   deepgramSttModel: row.deepgram_stt_model ?? undefined,
   deepgramTtsModel: row.deepgram_tts_model ?? undefined,
   deepgramLlmProvider: row.deepgram_llm_provider ?? undefined,
   deepgramLlmModel: row.deepgram_voice_agent_model ?? undefined,
   ```

3. **Agent Config** (`src/lib/ai/agent-config.ts`)
   - `fetchAgentByIdOrSlug()` charge l'agent avec son `model_config_id`
   - Le `modelConfig` contient les valeurs de la DB

4. **API Route** (`src/app/api/ask/[key]/agent-config/route.ts`)
   ```typescript
   // Ligne 349-352 : Les valeurs sont extraites depuis modelConfig
   deepgramSttModel: (agentConfig.modelConfig as any).deepgramSttModel,
   deepgramTtsModel: (agentConfig.modelConfig as any).deepgramTtsModel,
   deepgramLlmProvider: (agentConfig.modelConfig as any).deepgramLlmProvider,
   deepgramLlmModel: (agentConfig.modelConfig as any).deepgramLlmModel,
   ```

5. **HomePage** (`src/app/HomePage.tsx`)
   ```typescript
   // Ligne 955 : Utilise la valeur de la DB (avec fallback seulement si absente)
   deepgramSttModel: data.data.modelConfig.deepgramSttModel || 'nova-3',
   ```

6. **VoiceMode/PremiumVoiceInterface**
   ```typescript
   // Passe modelConfig à l'agent
   sttModel: modelConfig?.deepgramSttModel || "nova-3",
   ```

7. **DeepgramVoiceAgent** (`src/lib/ai/deepgram.ts`)
   ```typescript
   // Ligne 149 : Utilise config.sttModel qui vient de la DB
   const sttModel = config.sttModel || "nova-3";
   ```

---

## 📦 Exemple de Payload envoyé à Deepgram

### Payload complet (settings object)

```json
{
  "audio": {
    "input": {
      "encoding": "linear16",
      "sample_rate": 24000
    },
    "output": {
      "encoding": "linear16",
      "sample_rate": 24000,
      "container": "none"
    }
  },
  "agent": {
    "listen": {
      "provider": {
        "type": "deepgram",
        "model": "nova-3"
      }
    },
    "speak": {
      "provider": {
        "type": "deepgram",
        "model": "aura-2-thalia-en"
      }
    },
    "think": {
      "provider": {
        "type": "anthropic",
        "model": "claude-3-5-haiku-latest"
      },
      "prompt": "Vous êtes un assistant IA..."
    }
  }
}
```

### Exemple avec valeurs de la DB

Si dans la table `ai_model_configs` vous avez :
- `deepgram_stt_model = "nova-3"`
- `deepgram_tts_model = "aura-2-asteria-en"`
- `deepgram_llm_provider = "anthropic"`
- `deepgram_voice_agent_model = "claude-sonnet-4-20250514"`

Le payload sera :

```json
{
  "audio": {
    "input": {
      "encoding": "linear16",
      "sample_rate": 24000
    },
    "output": {
      "encoding": "linear16",
      "sample_rate": 24000,
      "container": "none"
    }
  },
  "agent": {
    "listen": {
      "provider": {
        "type": "deepgram",
        "model": "nova-3"
      }
    },
    "speak": {
      "provider": {
        "type": "deepgram",
        "model": "aura-2-asteria-en"
      }
    },
    "think": {
      "provider": {
        "type": "anthropic",
        "model": "claude-sonnet-4-20250514"
      },
      "prompt": "Vous êtes un assistant IA..."
    }
  }
}
```

---

## 🔍 Points de vérification

### 1. Logs de configuration

Dans `src/lib/ai/deepgram.ts` ligne 196 :
```typescript
console.log('[Deepgram] Configuring agent with settings:', JSON.stringify(settings, null, 2));
```

Ce log affiche le payload exact envoyé à Deepgram.

### 2. Logs de modèle utilisé

Dans `src/lib/ai/deepgram.ts` ligne 155 :
```typescript
console.log('[Deepgram] Using STT model:', finalSttModel, '- This model supports automatic language detection for French (fr) and English (en)');
```

Ce log confirme le modèle STT utilisé (vient de `config.sttModel` qui vient de la DB).

### 3. Vérification dans HomePage

Dans `src/app/HomePage.tsx` ligne 955 :
```typescript
deepgramSttModel: data.data.modelConfig.deepgramSttModel || 'nova-3',
```

Le `|| 'nova-3'` est seulement un fallback si la valeur n'existe pas en DB. Si elle existe, c'est la valeur de la DB qui est utilisée.

---

## ✅ Conclusion

**OUI**, le système utilise bien les modèles configurés dans la table `ai_model_configs` :

1. ✅ Les colonnes `deepgram_stt_model`, `deepgram_tts_model`, etc. sont lues depuis la DB
2. ✅ Ces valeurs sont mappées via `mapModelRow()` 
3. ✅ Elles sont passées via l'API `/api/ask/[key]/agent-config`
4. ✅ Elles sont utilisées dans `DeepgramVoiceAgent.connect(config)`
5. ✅ Le payload envoyé à Deepgram contient ces valeurs

Le seul fallback (`|| "nova-3"`) est utilisé uniquement si la valeur n'existe pas en base de données, ce qui est une bonne pratique de sécurité.

