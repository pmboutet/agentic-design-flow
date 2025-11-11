/**
 * Speechmatics Voice Agent
 * Uses Speechmatics Real-Time STT, LLM for responses, and ElevenLabs for TTS
 * 
 * This file has been refactored to use modular components for better maintainability
 */

import { ElevenLabsTTS, type ElevenLabsConfig } from './elevenlabs';
import { SpeechmaticsAuth } from './speechmatics-auth';
import { AudioChunkDedupe } from './speechmatics-audio-dedupe';
import { TranscriptionManager } from './speechmatics-transcription';
import { SpeechmaticsWebSocket } from './speechmatics-websocket';
import { SpeechmaticsAudio } from './speechmatics-audio';
import { SpeechmaticsLLM } from './speechmatics-llm';

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

export class SpeechmaticsVoiceAgent {
  // Core modules
  private auth: SpeechmaticsAuth;
  private audioDedupe: AudioChunkDedupe;
  private transcriptionManager: TranscriptionManager | null = null;
  private websocket: SpeechmaticsWebSocket | null = null;
  private audio: SpeechmaticsAudio | null = null;
  private llm: SpeechmaticsLLM;
  private elevenLabsTTS: ElevenLabsTTS | null = null;

  // Configuration and state
  private config: SpeechmaticsConfig | null = null;
  private conversationHistory: Array<{ role: 'user' | 'agent'; content: string }> = [];
  private isGeneratingResponse: boolean = false;
  private userMessageQueue: Array<{ content: string; timestamp: string }> = [];
  private isDisconnected: boolean = false;
  private disconnectPromise: Promise<void> | null = null;

  // Callbacks
  private onMessageCallback: SpeechmaticsMessageCallback | null = null;
  private onErrorCallback: SpeechmaticsErrorCallback | null = null;
  private onConnectionCallback: SpeechmaticsConnectionCallback | null = null;
  private onAudioCallback: SpeechmaticsAudioCallback | null = null;

  constructor() {
    this.auth = new SpeechmaticsAuth();
    this.audioDedupe = new AudioChunkDedupe();
    this.llm = new SpeechmaticsLLM();
  }

  setCallbacks(callbacks: {
    onMessage?: SpeechmaticsMessageCallback;
    onError?: SpeechmaticsErrorCallback;
    onConnection?: SpeechmaticsConnectionCallback;
    onAudio?: SpeechmaticsAudioCallback;
  }) {
    this.onMessageCallback = callbacks.onMessage || null;
    this.onErrorCallback = callbacks.onError || null;
    this.onConnectionCallback = callbacks.onConnection || null;
    this.onAudioCallback = callbacks.onAudio || null;
  }

  async connect(config: SpeechmaticsConfig): Promise<void> {
    // Reset disconnect flag
    this.isDisconnected = false;
    this.config = config;

    // Validate required ElevenLabs configuration
    if (!config.elevenLabsVoiceId) {
      throw new Error('ElevenLabs voice ID is required for Speechmatics voice agent');
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

    // Reset dedupe cache
    this.audioDedupe.reset();

    // Initialize transcription manager
    this.transcriptionManager = new TranscriptionManager(
      this.onMessageCallback,
      (transcript: string) => this.processUserMessage(transcript),
      this.conversationHistory
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

    // Initialize audio manager (will be updated with WebSocket reference after connection)
    this.audio = new SpeechmaticsAudio(
      this.audioDedupe,
      () => {}, // onAudioChunk not needed, handled internally
      this.websocket.getWebSocket()
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
  }

  private handleWebSocketMessage(data: any): void {
    if (this.isDisconnected && this.websocket?.isConnected()) {
      return;
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
      const transcript = data.metadata?.transcript || "";
      if (transcript && transcript.trim()) {
        console.log('[Speechmatics] 📝 AddPartialTranscript received:', {
          transcript: transcript.substring(0, 50) + (transcript.length > 50 ? '...' : ''),
          length: transcript.length,
          language: this.config?.sttLanguage,
        });
        this.transcriptionManager?.handlePartialTranscript(transcript.trim());
      }
      return;
    }

    // Handle final transcription
    if (data.message === "AddTranscript") {
      const transcript = data.metadata?.transcript || "";
      if (transcript && transcript.trim()) {
        console.log('[Speechmatics] ✅ AddTranscript received:', {
          transcript: transcript.substring(0, 50) + (transcript.length > 50 ? '...' : ''),
          length: transcript.length,
          language: this.config?.sttLanguage,
        });
        this.transcriptionManager?.handleFinalTranscript(transcript.trim());
      }
      return;
    }

    // Handle EndOfUtterance
    if (data.message === "EndOfUtterance") {
      this.transcriptionManager?.processPendingTranscript();
      return;
    }

    // Handle EndOfStream (server response to our EndOfStream message)
    // According to Speechmatics API, the server may send EndOfStream back
    // This indicates the server has processed our EndOfStream and is ready to close
    if (data.message === "EndOfStream") {
      console.log('[Speechmatics] 📨 Server sent EndOfStream response - server has processed our EndOfStream');
      this.transcriptionManager?.processPendingTranscript();
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
    if (this.isGeneratingResponse) {
      this.userMessageQueue.push({ content: transcript, timestamp: new Date().toISOString() });
      return;
    }

    this.isGeneratingResponse = true;

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

      // Call LLM
      const llmResponse = await this.llm.callLLM(llmProvider, llmApiKey, llmModel, messages);

      // Add to conversation history
      this.conversationHistory.push({ role: 'agent', content: llmResponse });

      // Notify callback
      this.onMessageCallback?.({
        role: 'agent',
        content: llmResponse,
        timestamp: new Date().toISOString(),
        isInterim: false,
      });

      // Generate TTS audio
      if (this.elevenLabsTTS && this.audio) {
        try {
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
      }

      // Process queued messages
      if (this.userMessageQueue.length > 0) {
        const nextMessage = this.userMessageQueue.shift();
        if (nextMessage) {
          // Process next message (will reset isGeneratingResponse when done)
          await this.processUserMessage(nextMessage.content);
        } else {
          this.isGeneratingResponse = false;
        }
      } else {
        this.isGeneratingResponse = false;
      }
    } catch (error) {
      console.error('[Speechmatics] ❌ Error processing user message:', error);
      this.isGeneratingResponse = false;
      this.onErrorCallback?.(error instanceof Error ? error : new Error(String(error)));
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

  stopMicrophone(): void {
    this.audio?.stopMicrophone();
  }

  async disconnect(): Promise<void> {
    if (this.disconnectPromise) {
      return this.disconnectPromise;
    }

    this.disconnectPromise = (async () => {
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
        this.audio.stopMicrophone();
        console.log('[Speechmatics] ✅ Microphone stopped');
        
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

      this.onConnectionCallback?.(false);
      
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
}
