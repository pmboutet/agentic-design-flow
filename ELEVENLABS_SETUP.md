# Configuration d'ElevenLabs pour la Synthèse Vocale (TTS)

## Vue d'ensemble

ElevenLabs est utilisé dans ce projet pour la synthèse vocale (Text-to-Speech) dans le mode **hybrid-voice-agent**. Ce mode combine :
- **Deepgram** pour la reconnaissance vocale (Speech-to-Text / STT)
- **LLM** (Anthropic ou OpenAI) pour générer les réponses
- **ElevenLabs** pour la synthèse vocale (Text-to-Speech / TTS)

## Prérequis

1. Un compte ElevenLabs (gratuit ou payant)
2. Une clé API ElevenLabs
3. Accès à la base de données Supabase
4. Accès aux variables d'environnement (local ou Vercel)

## Étape 1 : Obtenir une clé API ElevenLabs

1. **Créer un compte ElevenLabs**
   - Allez sur https://elevenlabs.io
   - Créez un compte (plan gratuit disponible avec limites)

2. **Obtenir votre clé API**
   - Connectez-vous à votre compte
   - Allez dans **Profile** → **API Keys**
   - Cliquez sur **Generate New API Key**
   - Copiez la clé API (elle ne sera affichée qu'une seule fois)

3. **Choisir une voix (optionnel)**
   - Allez dans **Voices** dans le dashboard ElevenLabs
   - Explorez les voix disponibles
   - Notez l'ID de la voix que vous souhaitez utiliser (ex: `21m00Tcm4TlvDq8ikWAM` pour Rachel)
   - Vous pouvez aussi créer une voix personnalisée

## Étape 2 : Configurer la variable d'environnement

### En développement local

1. Créez ou modifiez le fichier `.env.local` à la racine du projet :

```env
ELEVENLABS_API_KEY=votre_cle_api_elevenlabs_ici
```

2. Redémarrez le serveur de développement :
```bash
npm run dev
```

### En production (Vercel)

1. Allez sur votre projet Vercel
2. **Settings** → **Environment Variables**
3. Ajoutez la variable :
   - **Name** : `ELEVENLABS_API_KEY`
   - **Value** : votre clé API ElevenLabs
   - **Environment** : Production, Preview, Development (selon vos besoins)
4. Cliquez sur **Save**
5. **Redéployez** votre application pour que la variable soit prise en compte

## Étape 3 : Configurer la base de données

### Option A : Via l'interface Admin (Recommandé)

1. Connectez-vous à l'application en tant qu'administrateur
2. Allez dans la section **Admin** → **AI Models**
3. Créez ou modifiez une configuration de modèle avec le provider `hybrid-voice-agent`
4. Configurez les champs ElevenLabs :
   - **ElevenLabs Voice ID** : L'ID de la voix (ex: `21m00Tcm4TlvDq8ikWAM`)
   - **ElevenLabs Model ID** : Le modèle TTS (ex: `eleven_turbo_v2_5` ou `eleven_multilingual_v2`)
   - **ElevenLabs API Key Env Var** : `ELEVENLABS_API_KEY` (par défaut)

### Option B : Via SQL direct

Exécutez cette requête SQL dans l'éditeur SQL de Supabase :

```sql
-- Mettre à jour une configuration de modèle existante
UPDATE ai_model_configs
SET 
  elevenlabs_voice_id = '21m00Tcm4TlvDq8ikWAM',  -- Remplacez par votre voice ID
  elevenlabs_model_id = 'eleven_turbo_v2_5',     -- Modèle TTS
  elevenlabs_api_key_env_var = 'ELEVENLABS_API_KEY'
WHERE provider = 'hybrid-voice-agent';

-- Ou créer une nouvelle configuration
INSERT INTO ai_model_configs (
  code,
  name,
  provider,
  model,
  api_key_env_var,
  elevenlabs_voice_id,
  elevenlabs_model_id,
  elevenlabs_api_key_env_var
) VALUES (
  'hybrid-voice-agent-elevenlabs',
  'Hybrid Voice Agent avec ElevenLabs',
  'hybrid-voice-agent',
  'claude-3-5-haiku-latest',  -- Modèle LLM
  'ANTHROPIC_API_KEY',        -- Clé API pour le LLM
  '21m00Tcm4TlvDq8ikWAM',     -- Voice ID ElevenLabs
  'eleven_turbo_v2_5',        -- Modèle TTS ElevenLabs
  'ELEVENLABS_API_KEY'        -- Variable d'environnement pour ElevenLabs
);
```

## Étape 4 : Modèles et voix disponibles

### Modèles TTS ElevenLabs

- `eleven_turbo_v2_5` (par défaut) - Rapide, optimisé pour la latence
- `eleven_multilingual_v2` - Support multilingue (FR, EN, ES, DE, etc.)
- `eleven_monolingual_v1` - Anglais uniquement

### Voix par défaut (exemples)

- **Rachel** : `21m00Tcm4TlvDq8ikWAM` (voix féminine anglaise)
- **Domi** : `AZnzlk1XvdvUeBnXmlld` (voix féminine anglaise)
- **Bella** : `EXAVITQu4vr4xnSDxMaL` (voix féminine anglaise)
- **Antoni** : `ErXwobaYiN019PkySvjV` (voix masculine anglaise)
- **Elli** : `MF3mGyEYCl7XYWbV9V6O` (voix féminine anglaise)
- **Josh** : `TxGEqnHWrfWFTfGW9XjX` (voix masculine anglaise)
- **Arnold** : `VR6AewLTigWG4xSOukaG` (voix masculine anglaise)
- **Adam** : `pNInz6obpgDQGcFmaJgB` (voix masculine anglaise)
- **Sam** : `yoZ06aMxZJJ28mfd3POQ` (voix masculine anglaise)

**Note** : Pour obtenir la liste complète des voix disponibles avec votre compte, utilisez l'API ElevenLabs ou consultez le dashboard.

## Étape 5 : Utilisation dans l'application

### Configuration d'un ASK avec voice mode

1. Créez ou modifiez un ASK
2. Dans les paramètres du modèle, sélectionnez :
   - **Provider** : `hybrid-voice-agent`
   - **ElevenLabs Voice ID** : Choisissez une voix
   - **ElevenLabs Model ID** : Choisissez un modèle TTS

### Test de la configuration

1. Ouvrez un ASK avec le mode vocal activé
2. Cliquez sur le bouton de mode vocal
3. Parlez dans le microphone
4. L'agent devrait répondre avec la voix ElevenLabs configurée

## Dépannage

### Erreur : "ElevenLabs API key is not set"

**Problème** : La variable d'environnement `ELEVENLABS_API_KEY` n'est pas configurée.

**Solution** :
1. Vérifiez que la variable est définie dans `.env.local` (local) ou dans Vercel (production)
2. Redémarrez le serveur de développement ou redéployez sur Vercel
3. Vérifiez que le nom de la variable est exactement `ELEVENLABS_API_KEY` (sensible à la casse)

### Erreur : "ElevenLabs API error (401)"

**Problème** : La clé API est invalide ou expirée.

**Solution** :
1. Vérifiez que la clé API est correcte dans votre compte ElevenLabs
2. Générez une nouvelle clé API si nécessaire
3. Mettez à jour la variable d'environnement

### Erreur : "ElevenLabs API error (429)"

**Problème** : Vous avez atteint la limite de votre plan ElevenLabs.

**Solution** :
1. Vérifiez votre utilisation dans le dashboard ElevenLabs
2. Attendez que la limite se réinitialise (généralement mensuel)
3. Ou passez à un plan supérieur

### La voix ne fonctionne pas

**Problème** : La configuration de la voix n'est pas correcte.

**Solution** :
1. Vérifiez que `elevenlabs_voice_id` est correct dans la base de données
2. Vérifiez que le voice ID existe dans votre compte ElevenLabs
3. Testez avec une voix par défaut (ex: `21m00Tcm4TlvDq8ikWAM`)

### Le modèle TTS ne fonctionne pas

**Problème** : Le modèle ID est incorrect ou non disponible.

**Solution** :
1. Vérifiez que `elevenlabs_model_id` est correct (ex: `eleven_turbo_v2_5`)
2. Vérifiez que le modèle est disponible dans votre plan ElevenLabs
3. Utilisez `eleven_turbo_v2_5` qui est généralement disponible sur tous les plans

## Vérification de la configuration

### Vérifier la variable d'environnement

```bash
# En local
echo $ELEVENLABS_API_KEY

# Ou dans Node.js
node -e "console.log(process.env.ELEVENLABS_API_KEY)"
```

### Vérifier la configuration dans la base de données

```sql
SELECT 
  code,
  name,
  provider,
  elevenlabs_voice_id,
  elevenlabs_model_id,
  elevenlabs_api_key_env_var
FROM ai_model_configs
WHERE provider = 'hybrid-voice-agent';
```

### Tester l'API ElevenLabs directement

```bash
curl -X GET "https://api.elevenlabs.io/v1/voices" \
  -H "xi-api-key: VOTRE_CLE_API"
```

## Paramètres avancés

### Personnaliser les paramètres de voix

Vous pouvez modifier les paramètres de voix dans le code (`src/lib/ai/elevenlabs.ts`) :

- **stability** (0.0 - 1.0) : Stabilité de la voix (défaut: 0.5)
- **similarityBoost** (0.0 - 1.0) : Similarité avec la voix originale (défaut: 0.75)
- **style** (0.0 - 1.0) : Style de la voix (défaut: 0.0)
- **useSpeakerBoost** (boolean) : Amélioration du locuteur (défaut: true)

### Créer une voix personnalisée

1. Allez dans **Voices** → **Add Voice** dans le dashboard ElevenLabs
2. Suivez les instructions pour créer une voix personnalisée
3. Utilisez le voice ID généré dans votre configuration

## Ressources

- [Documentation ElevenLabs API](https://elevenlabs.io/docs)
- [Dashboard ElevenLabs](https://elevenlabs.io/app)
- [Liste des voix disponibles](https://elevenlabs.io/app/voices)

## Support

Si vous rencontrez des problèmes :
1. Vérifiez les logs du serveur (console du navigateur et logs Vercel)
2. Vérifiez les logs de l'API ElevenLabs dans le dashboard
3. Consultez la documentation ElevenLabs pour les erreurs spécifiques





