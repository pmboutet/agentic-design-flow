# Structure Modulaire pour Speechmatics Voice Agent

## 📁 Fichiers Créés

Le fichier `speechmatics.ts` (1486 lignes) a été divisé en modules plus petits et maintenables :

### 1. `speechmatics-types.ts`
- **Contenu** : Tous les types, interfaces et callbacks
- **Exports** :
  - `SpeechmaticsConfig`
  - `SpeechmaticsMessageEvent`
  - `SpeechmaticsMessageCallback`
  - `SpeechmaticsErrorCallback`
  - `SpeechmaticsConnectionCallback`
  - `SpeechmaticsAudioCallback`

### 2. `speechmatics-auth.ts`
- **Contenu** : Gestion de l'authentification
- **Classe** : `SpeechmaticsAuth`
- **Méthodes** :
  - `authenticate()` - Authentification Speechmatics (JWT ou API key)
  - `getElevenLabsApiKey()` - Récupération de la clé ElevenLabs
  - `getJWT()` / `getApiKey()` - Getters pour les tokens
  - `hasJWT()` - Vérification de validité du JWT

### 3. `speechmatics-audio-dedupe.ts`
- **Contenu** : Système de déduplication des chunks audio
- **Classe** : `AudioChunkDedupe`
- **Méthodes** :
  - `computeChunkSignature(chunk)` - Calcul de la signature d'un chunk
  - `shouldSkipChunk(signature)` - Vérification si un chunk est un doublon
  - `reset()` - Réinitialisation du cache

### 4. `speechmatics-transcription.ts`
- **Contenu** : Gestion des transcriptions (partielles et finales)
- **Classe** : `TranscriptionManager`
- **Méthodes** :
  - `handlePartialTranscript(transcript)` - Traitement des transcriptions partielles
  - `handleFinalTranscript(transcript)` - Traitement des transcriptions finales
  - `processPendingTranscript()` - Traitement après détection de silence
  - `resetSilenceTimeout()` - Gestion du timeout de silence
  - `cleanup()` - Nettoyage

### 5. `speechmatics-llm.ts`
- **Contenu** : Intégration LLM
- **Classe** : `SpeechmaticsLLM`
- **Méthodes** :
  - `getLLMApiKey(provider)` - Récupération de la clé API LLM
  - `callLLM(provider, apiKey, model, messages)` - Appel au LLM

## 🔄 Prochaines Étapes (Optionnel)

Pour compléter la modularisation, on pourrait créer :

### 6. `speechmatics-websocket.ts`
- Gestion de la connexion WebSocket
- Gestion des messages WebSocket
- Configuration de la connexion

### 7. `speechmatics-audio.ts`
- Gestion du microphone (start/stop)
- Gestion du playback audio (TTS)
- Voice Activity Detection (VAD)
- Barge-in handling

### 8. `speechmatics.ts` (Refactorisé)
- Classe principale qui orchestre tous les modules
- Utilise les classes modulaires créées
- Beaucoup plus court et lisible

## 💡 Avantages de cette Structure

1. **Séparation des responsabilités** : Chaque module a un rôle clair
2. **Maintenabilité** : Plus facile de trouver et modifier du code
3. **Testabilité** : Chaque module peut être testé indépendamment
4. **Réutilisabilité** : Les modules peuvent être réutilisés ailleurs
5. **Lisibilité** : Le fichier principal sera beaucoup plus court

## 📝 Exemple d'Utilisation (Après Refactoring)

```typescript
import { SpeechmaticsVoiceAgent } from './speechmatics';
import { SpeechmaticsAuth } from './speechmatics-auth';
import { AudioChunkDedupe } from './speechmatics-audio-dedupe';
import { TranscriptionManager } from './speechmatics-transcription';
import { SpeechmaticsLLM } from './speechmatics-llm';

// Dans la classe principale :
private auth = new SpeechmaticsAuth();
private audioDedupe = new AudioChunkDedupe();
private transcriptionManager: TranscriptionManager;
private llm = new SpeechmaticsLLM();
```

## ⚠️ Note

Les modules sont créés mais le fichier principal `speechmatics.ts` n'a pas encore été refactorisé pour les utiliser. Le code actuel continue de fonctionner comme avant.

Pour refactoriser complètement, il faudrait :
1. Créer les modules manquants (WebSocket, Audio)
2. Refactoriser `speechmatics.ts` pour utiliser tous les modules
3. Tester que tout fonctionne correctement

Souhaitez-vous que je continue avec le refactoring complet ?

## 🎯 Détection Sémantique de Fin de Tour

Le pipeline Speechmatics inclut désormais un détecteur d'arrêt sémantique optionnel.

- **Helper dédié** : `src/lib/ai/turn-detection.ts` formate les derniers tours en ChatML, appelle un SLM léger (HTTP/OpenAI compatible) et calcule la probabilité combinée des tokens `<|im_end|>` / ponctuation forte.
- **Configuration** : tirée directement de la configuration modèle enregistrée en base (`ai_model_configs`). Par défaut on cible le slug `mistral-small` (provider **Mistral**, base URL `https://api.mistral.ai/v1`, variable API `MISTRAL_API_KEY`). Les autres paramètres (`SEMANTIC_TURN_PROB_THRESHOLD`, `SEMANTIC_TURN_GRACE_MS`, `SEMANTIC_TURN_MAX_HOLD_MS`, `SEMANTIC_TURN_FALLBACK`) restent ajustables via `turn-detection-config.ts`.
- **Intégration pipeline** :
  - `TranscriptionManager` déclenche la requête sémantique lors d'un silence VAD ou du signal Speechmatics `EndOfUtterance`.
  - Si la probabilité est inférieure au seuil, un délai configurable (grace period) maintient l'écoute avant de relancer une requête.
  - Quand la probabilité dépasse le seuil, la finalisation est forcée et la réponse agent est déclenchée immédiatement.
- **UI & télémétrie** :
  - `SpeechmaticsVoiceAgent` propage les événements (`hold`, `dispatch`, `fallback`) via un callback `onSemanticTurn`.
  - `PremiumVoiceInterface` affiche l'état courant (hold/dispatch/fallback) sous l'indicateur de statut vocal.

Des tests unitaires couvrent le helper SLM et un scénario bout-en-bout VAD+détection pour sécuriser la logique.



