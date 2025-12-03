/**
 * SpeechmaticsVoiceAgent - Agent vocal utilisant Speechmatics STT + LLM + ElevenLabs TTS
 * 
 * Architecture modulaire :
 * - SpeechmaticsAuth : Gestion de l'authentification Speechmatics et ElevenLabs
 * - SpeechmaticsWebSocket : Gestion de la connexion WebSocket et des messages
 * - SpeechmaticsAudio : Capture et envoi de l'audio du microphone
 * - AudioChunkDedupe : Déduplication des chunks audio pour éviter les doublons
 * - TranscriptionManager : Gestion des transcriptions partielles et finales
 * - SpeechmaticsLLM : Appels au LLM (Anthropic/OpenAI) pour générer les réponses
 * - ElevenLabsTTS : Synthèse vocale pour les réponses de l'agent
 * 
 * Flux de traitement :
 * 1. Audio du microphone → Speechmatics STT (transcription en temps réel)
 * 2. Transcription finale → LLM (génération de réponse)
 * 3. Réponse LLM → ElevenLabs TTS (synthèse vocale)
 * 4. Audio TTS → Lecture dans le navigateur
 * 
 * Ce fichier a été refactoré pour utiliser des composants modulaires
 * afin d'améliorer la maintenabilité et la testabilité.
 */

/**
 * Helper function to get timestamp for logging
 */
function getTimestamp(): string {
  const now = new Date();
  return now.toISOString().split('T')[1].replace('Z', '');
}

import { ElevenLabsTTS, type ElevenLabsConfig } from './elevenlabs';
import { SpeechmaticsAuth } from './speechmatics-auth';
import { AudioChunkDedupe } from './speechmatics-audio-dedupe';
import { TranscriptionManager } from './speechmatics-transcription';
import { SpeechmaticsWebSocket } from './speechmatics-websocket';
import { SpeechmaticsAudio } from './speechmatics-audio';
import { SpeechmaticsLLM } from './speechmatics-llm';
import {
  createSemanticTurnDetector,
  type SemanticTurnDetector,
  type SemanticTurnTelemetryEvent,
} from './turn-detection';
import { resolveSemanticTurnDetectorConfig } from './turn-detection-config';

// Import and re-export types for backward compatibility
import type {
  SpeechmaticsConfig,
  SpeechmaticsMessageEvent,
  SpeechmaticsMessageCallback,
  SpeechmaticsErrorCallback,
  SpeechmaticsConnectionCallback,
  SpeechmaticsAudioCallback,
} from './speechmatics-types';

export type {
  SpeechmaticsConfig,
  SpeechmaticsMessageEvent,
  SpeechmaticsMessageCallback,
  SpeechmaticsErrorCallback,
  SpeechmaticsConnectionCallback,
  SpeechmaticsAudioCallback,
};

/**
 * Classe principale SpeechmaticsVoiceAgent
 * 
 * Coordonne tous les modules pour fournir une expérience vocale complète :
 * - Connexion WebSocket à Speechmatics
 * - Capture audio du microphone
 * - Transcription en temps réel
 * - Génération de réponses via LLM
 * - Synthèse vocale avec ElevenLabs
 */
export class SpeechmaticsVoiceAgent {
  // ===== STATIC CLASS VARIABLES =====
  // Global connection token counter shared across ALL instances to track connection attempts
  private static globalConnectionToken: number = 0;

  // ===== MODULES CORE =====
  // Gestion de l'authentification (Speechmatics et ElevenLabs)
  private auth: SpeechmaticsAuth;
  // Déduplication des chunks audio (évite les doublons)
  private audioDedupe: AudioChunkDedupe;
  // Gestionnaire de transcription (traite les partials et finals)
  private transcriptionManager: TranscriptionManager | null = null;
  // Gestionnaire WebSocket (connexion et messages)
  private websocket: SpeechmaticsWebSocket | null = null;
  // Gestionnaire audio (capture et envoi du microphone)
  private audio: SpeechmaticsAudio | null = null;
  // Gestionnaire LLM (appels à Anthropic/OpenAI)
  private llm: SpeechmaticsLLM;
  // Gestionnaire TTS ElevenLabs (synthèse vocale)
  private elevenLabsTTS: ElevenLabsTTS | null = null;

  // ===== CONFIGURATION ET ÉTAT =====
  // Configuration actuelle de l'agent
  private config: SpeechmaticsConfig | null = null;
  // Historique de conversation (pour le contexte LLM)
  private conversationHistory: Array<{ role: 'user' | 'agent'; content: string }> = [];
  // Flag indiquant si une réponse est en cours de génération (pour la queue)
  private isGeneratingResponse: boolean = false;
  // Queue des messages utilisateur en attente (si plusieurs messages arrivent pendant la génération)
  private userMessageQueue: Array<{ content: string; timestamp: string }> = [];
  // Track if user continues speaking during response generation (abort-on-continue)
  private responseAbortedDueToUserContinuation: boolean = false;
  // Last processed user message (to detect new content during response)
  private lastSentUserMessage: string = '';
  // Deduplication: Track last successfully processed message to avoid duplicate processing
  private lastProcessedMessage: { content: string; timestamp: number } | null = null;
  // Flag indiquant si l'agent est déconnecté (pour ignorer les messages tardifs)
  private isDisconnected: boolean = false;
  // Promise de déconnexion en cours (pour éviter les déconnexions multiples)
  private disconnectPromise: Promise<void> | null = null;
  // Connection token for THIS instance's connection attempt (captured from global counter)
  private myConnectionToken: number = 0;
  // Semantic turn detection configuration
  private semanticTurnConfig = resolveSemanticTurnDetectorConfig();
  private semanticTurnDetector: SemanticTurnDetector | null =
    createSemanticTurnDetector(this.semanticTurnConfig);
  // AbortController for canceling in-flight LLM requests
  private llmAbortController: AbortController | null = null;

  // ===== CALLBACKS =====
  // Callback appelé lorsqu'un message est reçu (user ou agent, interim ou final)
  private onMessageCallback: SpeechmaticsMessageCallback | null = null;
  // Callback appelé en cas d'erreur
  private onErrorCallback: SpeechmaticsErrorCallback | null = null;
  // Callback appelé lors des changements d'état de connexion
  private onConnectionCallback: SpeechmaticsConnectionCallback | null = null;
  // Callback appelé lorsqu'un chunk audio TTS est reçu (pour l'analyse si nécessaire)
  private onAudioCallback: SpeechmaticsAudioCallback | null = null;
  // Callback pour les événements de détection sémantique
  private onSemanticTurnCallback: ((event: SemanticTurnTelemetryEvent) => void) | null = null;

  /**
   * Constructeur - Initialise les modules core
   */
  constructor() {
    this.auth = new SpeechmaticsAuth();
    this.audioDedupe = new AudioChunkDedupe();
    this.llm = new SpeechmaticsLLM();
  }

  /**
   * Configure les callbacks pour recevoir les événements
   * 
   * @param callbacks - Objet contenant les callbacks optionnels
   */
  setCallbacks(callbacks: {
    onMessage?: SpeechmaticsMessageCallback;
    onError?: SpeechmaticsErrorCallback;
    onConnection?: SpeechmaticsConnectionCallback;
    onAudio?: SpeechmaticsAudioCallback;
    onSemanticTurn?: (event: SemanticTurnTelemetryEvent) => void;
  }) {
    this.onMessageCallback = callbacks.onMessage || null;
    this.onErrorCallback = callbacks.onError || null;
    this.onConnectionCallback = callbacks.onConnection || null;
    this.onAudioCallback = callbacks.onAudio || null;
    this.onSemanticTurnCallback = callbacks.onSemanticTurn || null;
  }

  /**
   * Établit la connexion à Speechmatics et initialise tous les modules
   * 
   * Cette fonction :
   * 1. Initialise ElevenLabs TTS (si activé)
   * 2. Réinitialise le cache de déduplication audio
   * 3. Crée le TranscriptionManager
   * 4. Crée et connecte le WebSocket
   * 5. Initialise le gestionnaire audio
   * 6. Configure la sensibilité du microphone
   * 
   * @param config - Configuration de l'agent (STT, LLM, TTS, etc.)
   */
  async connect(config: SpeechmaticsConfig): Promise<void> {
    // Increment GLOBAL connection token to track THIS specific connection attempt
    // Using static counter ensures tokens are unique across ALL agent instances
    SpeechmaticsVoiceAgent.globalConnectionToken++;
    this.myConnectionToken = SpeechmaticsVoiceAgent.globalConnectionToken;
    console.log(`[Speechmatics] 🔌 connect() called with token #${this.myConnectionToken}`);

    // Réinitialiser le flag de déconnexion
    this.isDisconnected = false;
    this.config = config;
    // Refresh semantic detector on each connection to pick up env changes
    this.semanticTurnConfig = resolveSemanticTurnDetectorConfig();
    this.semanticTurnDetector = createSemanticTurnDetector(this.semanticTurnConfig);

    if (this.semanticTurnConfig.enabled) {
      console.log('[Speechmatics] ✅ Semantic turn detector enabled:', {
        provider: this.semanticTurnConfig.provider,
        model: this.semanticTurnConfig.model,
        threshold: this.semanticTurnConfig.probabilityThreshold,
      });
    }

    // ===== INITIALISATION D'ELEVENLABS TTS =====
    // Initialiser ElevenLabs seulement si TTS n'est pas désactivé
    if (!config.disableElevenLabsTTS) {
      // Validate required ElevenLabs configuration
      if (!config.elevenLabsVoiceId) {
        throw new Error('ElevenLabs voice ID is required for Speechmatics voice agent (or set disableElevenLabsTTS to true)');
      }

      // Get ElevenLabs API key if not provided
      let elevenLabsApiKey = config.elevenLabsApiKey;
      if (!elevenLabsApiKey) {
        elevenLabsApiKey = await this.auth.getElevenLabsApiKey();
      }

      // Initialize ElevenLabs TTS
      const elevenLabsConfig: ElevenLabsConfig = {
        apiKey: elevenLabsApiKey,
        voiceId: config.elevenLabsVoiceId,
        modelId: config.elevenLabsModelId,
      };
      this.elevenLabsTTS = new ElevenLabsTTS(elevenLabsConfig);
    } else {
      console.log('[Speechmatics] 🔊 ElevenLabs TTS is disabled - only STT will work');
    }

    // Reset dedupe cache
    this.audioDedupe.reset();

    // Initialize transcription manager
    this.transcriptionManager = new TranscriptionManager(
      this.onMessageCallback,
      (transcript: string) => this.processUserMessage(transcript),
      this.conversationHistory,
      config.sttEnablePartials !== false,
      this.semanticTurnDetector && this.semanticTurnConfig.enabled
        ? {
            detector: this.semanticTurnDetector,
            threshold: this.semanticTurnConfig.probabilityThreshold,
            gracePeriodMs: this.semanticTurnConfig.gracePeriodMs,
            maxHoldMs: this.semanticTurnConfig.maxHoldMs,
            fallbackMode: this.semanticTurnConfig.fallbackMode,
            maxContextMessages: this.semanticTurnConfig.contextMessages,
            telemetry: (event) => this.onSemanticTurnCallback?.(event),
          }
        : undefined
    );

    // Initialize WebSocket manager
    this.websocket = new SpeechmaticsWebSocket(
      this.auth,
      this.onConnectionCallback,
      this.onErrorCallback,
      (data: any) => this.handleWebSocketMessage(data)
    );

    // Connect WebSocket
    await this.websocket.connect(config, this.disconnectPromise);

    // CRITICAL: Check if this connection attempt is still valid
    // If a newer connect() call has incremented the global counter beyond our token,
    // it means this connection is orphaned and should be aborted
    if (this.myConnectionToken !== SpeechmaticsVoiceAgent.globalConnectionToken) {
      console.log(`[Speechmatics] ⚠️ Connection token mismatch (mine: ${this.myConnectionToken}, current: ${SpeechmaticsVoiceAgent.globalConnectionToken}), aborting audio initialization`);
      return;
    }

    // Also check isDisconnected flag as a secondary safety check
    if (this.isDisconnected) {
      console.log(`[Speechmatics] ⚠️ Disconnected during connect (token: ${this.myConnectionToken}), aborting audio initialization`);
      return;
    }

    console.log(`[Speechmatics] ✅ Connection token #${this.myConnectionToken} is active and creating Audio instance`);


    // Initialize audio manager (will be updated with WebSocket reference after connection)
    this.audio = new SpeechmaticsAudio(
      this.audioDedupe,
      () => {}, // onAudioChunk not needed, handled internally
      this.websocket.getWebSocket(),
      () => this.abortResponse(), // Barge-in callback
      () => this.handleEchoDetected() // Echo detection callback - discard pending transcript
    );
    
    // Update audio with WebSocket reference
    if (this.audio && this.websocket) {
      this.audio.updateWebSocket(this.websocket.getWebSocket());
    }

    // Set microphone sensitivity if configured
    // Higher values = less sensitive = ignores distant/quieter sounds
    // Default: 1.5 (less sensitive to filter out background conversations)
    const sensitivity = config.microphoneSensitivity ?? 1.5;
    this.audio.setMicrophoneSensitivity(sensitivity);
    
    // Configure adaptive audio processing features
    this.audio.setAdaptiveFeatures({
      enableAdaptiveSensitivity: config.enableAdaptiveSensitivity !== false, // Default: true
      enableAdaptiveNoiseGate: config.enableAdaptiveNoiseGate !== false, // Default: true
      enableWorkletAGC: config.enableWorkletAGC !== false, // Default: true
    });
  }

  private handleWebSocketMessage(data: any): void {
    // CRITICAL FIX: Only skip if we're disconnected AND websocket is not connected
    // If websocket is connected, we should process messages even if isDisconnected flag is set
    // (This can happen if disconnect() was called but connection is still active)
    if (this.isDisconnected && !this.websocket?.isConnected()) {
      return;
    }
    
    // If websocket is connected but isDisconnected flag is true, reset the flag
    // This handles the case where disconnect() was called but connection is still active
    if (this.isDisconnected && this.websocket?.isConnected()) {
      this.isDisconnected = false;
    }

    // Handle RecognitionStarted
    if (data.message === "RecognitionStarted") {
      return;
    }
    
    // Handle Info messages
    if (data.message === "Info") {
      return;
    }

    // Handle AudioAdded
    if (data.message === "AudioAdded") {
      return;
    }

    // Handle partial transcription
    if (data.message === "AddPartialTranscript") {
      // Speechmatics API structure: transcript is in metadata.transcript (full text)
      const transcript = data.metadata?.transcript || "";

      if (this.audio && transcript && transcript.trim()) {
        const trimmedTranscript = transcript.trim();

        // ABORT-ON-CONTINUE: If response is being generated and user continues speaking,
        // abort the current response and let them finish
        if (this.isGeneratingResponse && this.lastSentUserMessage) {
          const hasSignificantNewContent = this.hasSignificantNewContent(trimmedTranscript, this.lastSentUserMessage);
          if (hasSignificantNewContent) {
            console.log('[Speechmatics] 🛑 User continues speaking during response - aborting response');
            console.log('[Speechmatics] New content:', trimmedTranscript.substring(0, 100));
            this.responseAbortedDueToUserContinuation = true;
            this.abortResponse();
            // Remove the incomplete user message from conversation history
            // (it will be replaced by the complete one when user finishes)
            if (this.conversationHistory.length > 0 &&
                this.conversationHistory[this.conversationHistory.length - 1]?.role === 'user') {
              this.conversationHistory.pop();
            }
            // CRITICAL: Clear the message queue since those are now stale fragments
            // The transcription manager will send the complete message when user finishes
            if (this.userMessageQueue.length > 0) {
              console.log(`[Speechmatics] 🧹 Clearing ${this.userMessageQueue.length} stale queued messages`);
              this.userMessageQueue = [];
            }
          }
        }

        // Get recent conversation context for echo detection (last agent message + last user message)
        const recentContext = this.conversationHistory
          .slice(-2)
          .map(msg => msg.content)
          .join(' ')
          .slice(-200); // Last 200 chars of recent context

        // Validate barge-in with transcript content and context
        this.audio?.validateBargeInWithTranscript(trimmedTranscript, recentContext);

        // Process partial transcript normally
        this.transcriptionManager?.handlePartialTranscript(trimmedTranscript);
      }
      return;
    }

    // Handle final transcription
    if (data.message === "AddTranscript") {
      // Speechmatics API structure: transcript is in metadata.transcript (full text)
      const transcript = data.metadata?.transcript || "";

      if (transcript && transcript.trim()) {
        // Get recent conversation context for echo detection (last agent message + last user message)
        const recentContext = this.conversationHistory
          .slice(-2)
          .map(msg => msg.content)
          .join(' ')
          .slice(-200); // Last 200 chars of recent context

        // Validate barge-in with transcript content and context
        this.audio?.validateBargeInWithTranscript(transcript.trim(), recentContext);

        // Process final transcript normally
        this.transcriptionManager?.handleFinalTranscript(transcript.trim());
      }
      return;
    }

    // Handle EndOfUtterance
    // This is the signal from Speechmatics that the user has finished speaking
    // IMPORTANT: We DON'T process immediately on EndOfUtterance because it can arrive too early
    // Instead, we just mark it and let the silence timeout handle the processing
    // This gives the user more time to continue speaking if they want
    if (data.message === "EndOfUtterance") {
      console.log('[Speechmatics] 🎯 EndOfUtterance received - will wait for silence timeout');
      // Just mark that we received it, but don't process yet
      // The silence timeout will handle processing after the configured delay
      this.transcriptionManager?.markEndOfUtterance();
      return;
    }

    // Handle EndOfStream (server response to our EndOfStream message)
    // According to Speechmatics API, the server may send EndOfStream back
    // This indicates the server has processed our EndOfStream and is ready to close
    if (data.message === "EndOfStream") {
      console.log('[Speechmatics] 📨 Server sent EndOfStream response - server has processed our EndOfStream');
      this.transcriptionManager?.processPendingTranscript(true);
      return;
    }

    // Handle Error messages
    if (data.message === "Error") {
      const errorMessage = data.reason || data.message || 'Unknown error';
      
      // Handle quota errors with a more user-friendly message
      if (errorMessage.includes('Quota') || errorMessage.includes('quota') || errorMessage.includes('Concurrent')) {
        // Record quota error timestamp in WebSocket class to enforce longer delay on reconnect
        SpeechmaticsWebSocket.lastQuotaErrorTimestamp = Date.now();
        
        const friendlyError = new Error('Speechmatics quota exceeded. Please wait 10 seconds before trying again, or check your account limits. If you have multiple tabs open, close them to free up concurrent sessions.');
        console.error('[Speechmatics] ❌ Quota error:', errorMessage);
        console.error('[Speechmatics] ⏳ Will prevent reconnection for 10 seconds to allow quota to reset');
        this.onErrorCallback?.(friendlyError);
        // Disconnect on quota error to prevent further attempts
        // Use a longer delay to ensure quota is released
        this.disconnect().catch(() => {});
        return;
      }
      
      console.error('[Speechmatics] ❌ Error message:', errorMessage);
      const error = new Error(`Speechmatics error: ${errorMessage}`);
      this.onErrorCallback?.(error);
      return;
    }
  }

  private async processUserMessage(transcript: string): Promise<void> {
    const processStartedAt = Date.now();
    const processTimestamp = new Date().toISOString();
    const normalizedTranscript = transcript.trim().toLowerCase();

    console.log('[Speechmatics] 📨 Received finalized user chunk', {
      timestamp: processTimestamp,
      inProgress: this.isGeneratingResponse,
      queuedMessages: this.userMessageQueue.length,
      transcriptPreview: transcript.slice(0, 120),
      transcriptLength: transcript.length,
      wasAbortedDueToContinuation: this.responseAbortedDueToUserContinuation,
    });

    // DEDUPLICATION: Skip if this is identical to what we just processed (within 5 seconds)
    if (this.lastProcessedMessage &&
        this.lastProcessedMessage.content === normalizedTranscript &&
        processStartedAt - this.lastProcessedMessage.timestamp < 5000) {
      console.log('[Speechmatics] 🔁 Skipping duplicate message (same as recently processed)', {
        transcript: transcript.slice(0, 50),
        timeSinceLastProcess: processStartedAt - this.lastProcessedMessage.timestamp,
      });
      return;
    }

    // If we were aborted due to user continuation, clear the flag and proceed
    // The new transcript should contain the complete user input
    if (this.responseAbortedDueToUserContinuation) {
      console.log('[Speechmatics] ✅ Processing complete user input after abort');
      this.responseAbortedDueToUserContinuation = false;
    }

    if (this.isGeneratingResponse) {
      // DEDUPLICATION: Check if this message is already in queue or identical to what's being processed
      const isInQueue = this.userMessageQueue.some(q => q.content.trim().toLowerCase() === normalizedTranscript);
      const isCurrentlyProcessing = this.lastSentUserMessage.trim().toLowerCase() === normalizedTranscript;

      if (isInQueue || isCurrentlyProcessing) {
        console.log('[Speechmatics] 🔁 Skipping duplicate - already in queue or being processed', {
          isInQueue,
          isCurrentlyProcessing,
          transcript: transcript.slice(0, 50),
          queueSize: this.userMessageQueue.length,
        });
        return;
      }

      this.userMessageQueue.push({ content: transcript, timestamp: new Date().toISOString() });
      console.log('[Speechmatics] ⏳ Agent busy - queued user chunk', {
        queueSize: this.userMessageQueue.length,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    this.isGeneratingResponse = true;

    // Track the message we're about to process (for abort-on-continue detection)
    this.lastSentUserMessage = transcript;

    // Add user message to conversation history
    this.conversationHistory.push({ role: 'user', content: transcript });

    // Update audio manager with conversation history for start-of-turn detection
    if (this.audio) {
      const historyForDetection = this.conversationHistory.slice(-4).map(msg => ({
        role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
        content: msg.content,
      }));
      this.audio.updateConversationHistory(historyForDetection);
    }

    // Create abort controller for this LLM request
    this.llmAbortController = new AbortController();
    const signal = this.llmAbortController.signal;

    try {
      const llmProvider = this.config?.llmProvider || "anthropic";
      const llmApiKey = this.config?.llmApiKey || await this.llm.getLLMApiKey(llmProvider);
      const llmModel = this.config?.llmModel || (llmProvider === "openai" ? "gpt-4o" : "claude-3-5-haiku-latest");

      // Build messages for LLM (same format as text mode)
      const recentHistory = this.conversationHistory.slice(-4);
      
      // Use user prompt if available (same as text mode), otherwise use transcript directly
      // Import renderTemplate to properly replace ALL variables, not just latest_user_message
      const { renderTemplate } = await import('./templates');
      const userPrompt = this.config?.userPrompt;
      let userMessageContent: string;
      if (userPrompt && userPrompt.trim()) {
        // Build variables for template rendering (same as text mode)
        // Use promptVariables from config if available, otherwise build minimal set
        const baseVariables = this.config?.promptVariables || {};
        const variables: Record<string, string | null | undefined> = {
          ...baseVariables, // Include all variables from config (ask_question, ask_description, etc.)
          latest_user_message: transcript, // Override with current transcript
        };
        // Render template with all variables (same as text mode)
        userMessageContent = renderTemplate(userPrompt, variables);
        console.log('[Speechmatics] 📝 User prompt rendered:', {
          hasUserPrompt: true,
          originalTranscript: transcript.substring(0, 50) + '...',
          renderedContent: userMessageContent.substring(0, 50) + '...',
          variablesCount: Object.keys(variables).length,
        });
      } else {
        // Fallback: use transcript directly
        userMessageContent = transcript;
        console.log('[Speechmatics] 📝 No user prompt, using transcript directly:', {
          hasUserPrompt: false,
          transcript: transcript.substring(0, 50) + '...',
        });
      }
      
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: this.config?.systemPrompt || '' },
        ...recentHistory.map(msg => ({
          role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
          content: msg.content,
        })),
        { role: 'user', content: userMessageContent },
      ];

      // Log conversation state for debugging
      console.log('[Speechmatics] 🧠 LLM context state:', {
        hasSystemPrompt: !!this.config?.systemPrompt,
        systemPromptLength: this.config?.systemPrompt?.length || 0,
        conversationHistoryLength: this.conversationHistory.length,
        recentHistoryLength: recentHistory.length,
        totalMessagesForLLM: messages.length,
      });

      // Call LLM with abort signal
      const llmResponse = await this.llm.callLLM(
        llmProvider,
        llmApiKey,
        llmModel,
        messages,
        {
          enableThinking: this.config?.enableThinking,
          thinkingBudgetTokens: this.config?.thinkingBudgetTokens,
          signal,
        }
      );

      // Add to conversation history
      this.conversationHistory.push({ role: 'agent', content: llmResponse });

      // Update audio manager with conversation history for start-of-turn detection
      if (this.audio) {
        const historyForDetection = this.conversationHistory.slice(-4).map(msg => ({
          role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
          content: msg.content,
        }));
        this.audio.updateConversationHistory(historyForDetection);
      }

      console.log(`[${getTimestamp()}] [Speechmatics] 📥 LLM response ready`, {
        timestamp: new Date().toISOString(),
        elapsedMs: Date.now() - processStartedAt,
        contentPreview: llmResponse.slice(0, 120),
        contentLength: llmResponse.length,
      });

      // Notify callback
      this.onMessageCallback?.({
        role: 'agent',
        content: llmResponse,
        timestamp: new Date().toISOString(),
        isInterim: false,
      });

      // Generate TTS audio only if ElevenLabs is enabled
      if (!this.config?.disableElevenLabsTTS && this.elevenLabsTTS && this.audio) {
        try {
          // Set current assistant speech for echo detection
          this.audio.setCurrentAssistantSpeech(llmResponse);

          const audioStream = await this.elevenLabsTTS.streamTextToSpeech(llmResponse);
          const audioData = await this.audio.streamToUint8Array(audioStream);
          if (audioData) {
            this.onAudioCallback?.(audioData);
            await this.audio.playAudio(audioData).catch(err => {
              console.error('[Speechmatics] ❌ Error playing audio:', err);
            });
          }
        } catch (error) {
          console.error('[Speechmatics] ❌ Error generating TTS audio:', error);
          // Don't fail the whole message processing if TTS fails
        }
      } else if (this.config?.disableElevenLabsTTS) {
        console.log('[Speechmatics] 🔊 TTS disabled - skipping audio generation');
      }

      // DEDUPLICATION: Track the successfully processed message to prevent re-processing
      this.lastProcessedMessage = {
        content: this.lastSentUserMessage.trim().toLowerCase(),
        timestamp: Date.now(),
      };

      // Clear the sent message tracker as response completed successfully
      this.lastSentUserMessage = '';

      // Process queued messages
      if (this.userMessageQueue.length > 0) {
        console.log(`[Speechmatics] 📋 Processing queue after response (${this.userMessageQueue.length} pending)`);
        const nextMessage = this.userMessageQueue.shift();
        if (nextMessage) {
          console.log(`[Speechmatics] ▶️ Dequeued message: "${nextMessage.content.slice(0, 50)}..."`);
          // Process next message (will reset isGeneratingResponse when done)
          await this.processUserMessage(nextMessage.content);
        } else {
          console.log('[Speechmatics] ✅ Queue empty after shift, response cycle complete');
          this.isGeneratingResponse = false;
        }
      } else {
        console.log('[Speechmatics] ✅ No queued messages, response cycle complete');
        this.isGeneratingResponse = false;
      }
    } catch (error) {
      // Check if error was caused by user aborting (barge-in or continuation)
      if (error instanceof Error && error.name === 'AbortError') {
        const reason = this.responseAbortedDueToUserContinuation ? 'user continuation' : 'barge-in';
        console.log(`[${getTimestamp()}] [Speechmatics] 🛑 LLM request aborted (${reason})`);
        // Don't treat abort as error - it's expected behavior
        this.isGeneratingResponse = false;
        // Keep lastSentUserMessage if aborted due to continuation
        // (will be compared against new partials)
        if (!this.responseAbortedDueToUserContinuation) {
          this.lastSentUserMessage = '';
        }
        // NOTE: Don't process queue on abort - user is still speaking or interrupted
        // The new/complete message will arrive through normal flow
        return;
      }

      console.error('[Speechmatics] ❌ Error processing user message:', error);
      this.lastSentUserMessage = '';
      this.onErrorCallback?.(error instanceof Error ? error : new Error(String(error)));

      // CRITICAL: Even on error, try to process queued messages so we don't get stuck
      if (this.userMessageQueue.length > 0) {
        console.log(`[Speechmatics] 🔄 Error occurred but processing ${this.userMessageQueue.length} queued messages`);
        const nextMessage = this.userMessageQueue.shift();
        if (nextMessage) {
          // Reset flag before recursive call (it will be set to true again in processUserMessage)
          this.isGeneratingResponse = false;
          // Use setTimeout to avoid deep recursion and allow event loop to process
          setTimeout(() => {
            this.processUserMessage(nextMessage.content).catch(err => {
              console.error('[Speechmatics] ❌ Error processing queued message:', err);
            });
          }, 100);
        } else {
          this.isGeneratingResponse = false;
        }
      } else {
        this.isGeneratingResponse = false;
      }
    } finally {
      // Clear abort controller
      this.llmAbortController = null;
    }
  }

  async startMicrophone(deviceId?: string, voiceIsolation: boolean = true): Promise<void> {
    if (!this.websocket?.isConnected()) {
      throw new Error('Not connected to Speechmatics');
    }

    if (!this.audio) {
      throw new Error('Audio manager not initialized');
    }

    // Update audio with current WebSocket
    this.audio.updateWebSocket(this.websocket.getWebSocket());
    await this.audio.startMicrophone(deviceId, voiceIsolation);
  }

  setMicrophoneSensitivity(sensitivity: number): void {
    this.audio?.setMicrophoneSensitivity(sensitivity);
  }

  async stopMicrophone(): Promise<void> {
    await this.audio?.stopMicrophone();
  }

  async disconnect(): Promise<void> {
    if (this.disconnectPromise) {
      return this.disconnectPromise;
    }

    this.disconnectPromise = (async () => {
      // CRITICAL: Increment global token to invalidate any in-flight connect() attempts
      // This ensures orphaned connections will be aborted when they finish
      SpeechmaticsVoiceAgent.globalConnectionToken++;
      console.log(`[Speechmatics] 🔌 disconnect() called (my token: ${this.myConnectionToken}, global token now: ${SpeechmaticsVoiceAgent.globalConnectionToken})`);
      this.isDisconnected = true;

      // CRITICAL: According to Speechmatics API docs:
      // 1. Stop sending audio FIRST (no AddAudio after EndOfStream)
      // 2. Send EndOfStream message
      // 3. Wait for server to process
      // 4. Close WebSocket
      
      const disconnectStartTime = Date.now();
      console.log('[Speechmatics] 🔌 Agent disconnect() called', {
        timestamp: new Date().toISOString(),
        hasAudio: !!this.audio,
        hasWebSocket: !!this.websocket,
        websocketConnected: this.websocket?.isConnected(),
      });
      
      if (this.audio) {
        console.log('[Speechmatics] 🎤 Step 1: Stopping microphone...');
        // Stop microphone input completely - this stops all AddAudio messages
        this.audio.setMicrophoneMuted(true);
        try {
          await this.audio.stopMicrophone();
          console.log('[Speechmatics] ✅ Microphone stopped');
        } catch (error) {
          console.error('[Speechmatics] ❌ Error stopping microphone:', error);
        }
        
        // CRITICAL: Wait to ensure NO audio chunks are in flight
        // According to docs: "Protocol specification doesn't allow adding audio after EndOfStream"
        // We must ensure all audio has been sent before sending EndOfStream
        console.log('[Speechmatics] ⏳ Waiting 800ms to ensure no audio chunks in flight...');
        await new Promise(resolve => setTimeout(resolve, 800)); // Increased to ensure all chunks are processed
        console.log('[Speechmatics] ✅ Audio flush complete');
      }

      // Now disconnect WebSocket (this will send EndOfStream and close properly)
      // The WebSocket disconnect will:
      // 1. Send EndOfStream message (if connection is open)
      // 2. Wait for server to process
      // 3. Close WebSocket with code 1000
      // 4. Wait additional time for server to release session
      if (this.websocket) {
        console.log('[Speechmatics] 🔌 Step 2: Disconnecting WebSocket...');
        const wsDisconnectStart = Date.now();
        await this.websocket.disconnect(this.isDisconnected);
        console.log('[Speechmatics] ✅ WebSocket disconnected', {
          elapsed: Date.now() - wsDisconnectStart,
          totalElapsed: Date.now() - disconnectStartTime,
        });
      } else {
        console.log('[Speechmatics] ⚠️ No WebSocket to disconnect');
      }

      // Cleanup transcription manager
      console.log('[Speechmatics] 🧹 Step 3: Cleaning up...');
      this.transcriptionManager?.cleanup();

      // Clear state
      this.conversationHistory = [];
      this.userMessageQueue = [];
      this.audioDedupe.reset();
      this.lastSentUserMessage = '';
      this.responseAbortedDueToUserContinuation = false;

      this.onConnectionCallback?.(false);
      
      // CRITICAL: Force browser to release any ghost microphone permissions
      // This must be called AFTER everything is disconnected (WebSocket + audio)
      // Wait a bit to ensure all resources are fully released before forcing cleanup
      console.log('[Speechmatics] 🧹 Step 4: Forcing browser to release microphone permissions...');
      await new Promise(resolve => setTimeout(resolve, 500)); // Small delay to ensure cleanup is complete
      
      if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        try {
          await navigator.mediaDevices.enumerateDevices();
          console.log('[Speechmatics] ✅ Called enumerateDevices() to release ghost permissions');
        } catch (error) {
          // Ignore errors - this is just a cleanup trick
          console.log('[Speechmatics] ℹ️ enumerateDevices() call completed (may have failed silently)');
        }
      }
      
      console.log('[Speechmatics] ✅ Agent disconnect() complete', {
        totalTime: Date.now() - disconnectStartTime,
        timestamp: new Date().toISOString(),
      });
    })();

    try {
      await this.disconnectPromise;
    } finally {
      this.disconnectPromise = null;
    }
  }

  isConnected(): boolean {
    return this.websocket?.isConnected() || false;
  }

  setMicrophoneMuted(muted: boolean): void {
    this.audio?.setMicrophoneMuted(muted);
  }

  /**
   * Check if new transcript contains significant new content beyond what was already sent
   * Used to detect when user continues speaking after we started generating a response
   */
  private hasSignificantNewContent(newTranscript: string, sentMessage: string): boolean {
    // Normalize both for comparison
    const normalizeText = (text: string) => text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[.,!?;:'"«»\-–—…()[\]{}]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const normalizedNew = normalizeText(newTranscript);
    const normalizedSent = normalizeText(sentMessage);

    // If new is shorter or same length, likely just a variation/repetition
    if (normalizedNew.length <= normalizedSent.length) {
      return false;
    }

    // Check if new content starts with sent content (continuation)
    if (normalizedNew.startsWith(normalizedSent)) {
      // Calculate new words added
      const newPortion = normalizedNew.substring(normalizedSent.length).trim();
      const newWords = newPortion.split(/\s+/).filter(w => w.length > 1);
      // Require at least 3 new words to consider it significant continuation
      if (newWords.length >= 3) {
        console.log('[Speechmatics] 📝 Detected continuation:', newWords.length, 'new words');
        return true;
      }
    }

    // Check word-based: count new words not in sent message
    const sentWords = new Set(normalizedSent.split(/\s+/).filter(w => w.length > 1));
    const newWords = normalizedNew.split(/\s+/).filter(w => w.length > 1);
    const genuinelyNewWords = newWords.filter(w => !sentWords.has(w));

    // If 3+ genuinely new words, user is continuing
    if (genuinelyNewWords.length >= 3) {
      console.log('[Speechmatics] 📝 Detected new words:', genuinelyNewWords.slice(0, 5).join(', '));
      return true;
    }

    return false;
  }

  /**
   * Handle echo detection - discard pending transcript
   * Called when the audio module detects that the transcribed audio is actually
   * TTS playback being picked up by the microphone (not real user speech)
   */
  private handleEchoDetected(): void {
    console.log(`[${getTimestamp()}] [Speechmatics] 🔇 Echo detected - discarding pending transcript`);

    // Discard any pending transcript in the transcription manager
    // This prevents sending echo as user input to the LLM
    this.transcriptionManager?.discardPendingTranscript();
  }

  /**
   * Abort current assistant response (called when user interrupts)
   * Stops ElevenLabs playback, clears assistant interim message, and cancels in-flight LLM request
   */
  abortResponse(): void {
    console.log(`[${getTimestamp()}] [Speechmatics] 🛑 Aborting current assistant response`);

    // Stop ElevenLabs TTS playback
    if (this.audio) {
      this.audio.stopAgentSpeech();
    }

    // Cancel in-flight LLM request
    if (this.llmAbortController) {
      this.llmAbortController.abort();
      this.llmAbortController = null;
    }

    // Clear assistant interim message via callback
    this.onMessageCallback?.({
      role: 'agent',
      content: '',
      timestamp: new Date().toISOString(),
      isInterim: true,
      messageId: `abort-${Date.now()}`,
    });

    // Reset generation state
    this.isGeneratingResponse = false;
  }

  /**
   * Update prompts dynamically without reconnecting
   * Call this when the conversation step changes to update system prompt with new variables
   *
   * @param prompts - New prompts and variables to use for subsequent LLM calls
   */
  updatePrompts(prompts: {
    systemPrompt?: string;
    userPrompt?: string;
    promptVariables?: Record<string, string | null | undefined>;
  }): void {
    if (!this.config) {
      console.warn('[Speechmatics] ⚠️ Cannot update prompts: no config available (not connected)');
      return;
    }

    const updates: string[] = [];

    if (prompts.systemPrompt !== undefined) {
      this.config.systemPrompt = prompts.systemPrompt;
      updates.push('systemPrompt');
    }

    if (prompts.userPrompt !== undefined) {
      this.config.userPrompt = prompts.userPrompt;
      updates.push('userPrompt');
    }

    if (prompts.promptVariables !== undefined) {
      this.config.promptVariables = prompts.promptVariables;
      updates.push(`promptVariables (${Object.keys(prompts.promptVariables).length} vars)`);
    }

    console.log(`[Speechmatics] 📝 Prompts updated dynamically:`, updates.join(', '));

    // Log key variables for debugging step changes
    if (prompts.promptVariables) {
      const vars = prompts.promptVariables;
      console.log('[Speechmatics] 📋 Key variables after update:', {
        current_step_id: vars.current_step_id ?? '(not set)',
        current_step: vars.current_step ? `${String(vars.current_step).substring(0, 50)}...` : '(not set)',
        completed_steps_summary: vars.completed_steps_summary ? `${String(vars.completed_steps_summary).substring(0, 50)}...` : '(not set)',
      });
    }
  }

  /**
   * Get the current step ID from prompt variables
   * Useful for detecting step changes
   */
  getCurrentStepId(): string | null {
    return this.config?.promptVariables?.current_step_id as string | null ?? null;
  }
}
