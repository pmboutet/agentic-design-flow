/**
 * Speechmatics Voice Agent
 * Uses Speechmatics Real-Time STT, LLM for responses, and ElevenLabs for TTS
 */

import { ElevenLabsTTS, type ElevenLabsConfig } from './elevenlabs';

export interface SpeechmaticsConfig {
  systemPrompt: string;
  // Speechmatics STT config
  sttLanguage?: string; // e.g., "fr", "en", "multi", "fr,en"
  sttOperatingPoint?: "enhanced" | "standard";
  sttMaxDelay?: number; // Max delay between segments (default: 2.0)
  sttEnablePartials?: boolean; // Enable partial transcription results
  // LLM config
  llmProvider?: "anthropic" | "openai";
  llmModel?: string;
  llmApiKey?: string;
  // ElevenLabs TTS config
  elevenLabsApiKey?: string; // Optional - will be fetched automatically if not provided
  elevenLabsVoiceId?: string;
  elevenLabsModelId?: string;
}

export interface SpeechmaticsMessageEvent {
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
  isInterim?: boolean;
}

export type SpeechmaticsMessageCallback = (message: SpeechmaticsMessageEvent) => void;
export type SpeechmaticsErrorCallback = (error: Error) => void;
export type SpeechmaticsConnectionCallback = (connected: boolean) => void;
export type SpeechmaticsAudioCallback = (audio: Uint8Array) => void;

export class SpeechmaticsVoiceAgent {
  private ws: WebSocket | null = null;
  private speechmaticsApiKey: string | null = null;
  private elevenLabsTTS: ElevenLabsTTS | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: AudioWorkletNode | null = null;
  private audioQueue: Uint8Array[] = [];
  private nextStartTime: number = 0;
  private currentAudioSource: AudioBufferSourceNode | null = null;
  private isProcessingAudio: boolean = false;
  private isMicrophoneActive: boolean = false;
  private isFirefox: boolean;
  private config: SpeechmaticsConfig | null = null;
  private conversationHistory: Array<{ role: 'user' | 'agent'; content: string }> = [];
  private isGeneratingResponse: boolean = false;
  private isPlayingAudio: boolean = false;
  private audioPlaybackQueue: AudioBuffer[] = [];
  private pendingUserMessage: { content: string; timestamp: string } | null = null;
  private userMessageQueue: Array<{ content: string; timestamp: string }> = [];
  private lastPartialUserContent: string | null = null;
  private lastFinalUserContent: string | null = null;
  private pendingFinalTranscript: string | null = null; // Accumulate final transcripts until complete sentence
  private isDisconnected: boolean = false;
  private wsConnected: boolean = false;
  
  // Callbacks
  private onMessageCallback: SpeechmaticsMessageCallback | null = null;
  private onErrorCallback: SpeechmaticsErrorCallback | null = null;
  private onConnectionCallback: SpeechmaticsConnectionCallback | null = null;
  private onAudioCallback: SpeechmaticsAudioCallback | null = null;

  constructor() {
    this.isFirefox = typeof navigator !== 'undefined' && navigator.userAgent.includes('Firefox');
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

  private speechmaticsJWT: string | null = null;
  private jwtExpiry: number = 0;

  async authenticateSpeechmatics(): Promise<string> {
    console.log('[Speechmatics] 🔐 Starting authentication...');
    
    // Check if we have a valid JWT token
    if (this.speechmaticsJWT && Date.now() < this.jwtExpiry) {
      console.log('[Speechmatics] ✅ Using existing JWT token');
      return this.speechmaticsJWT!;
    }
    
    try {
      // Try to get a JWT token first (for direct connection without proxy)
      let response = await fetch('/api/speechmatics-jwt', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        const jwtData = await response.json();
        if (jwtData.jwt) {
          this.speechmaticsJWT = jwtData.jwt;
          // Set expiry to 90% of TTL to be safe
          this.jwtExpiry = Date.now() + (jwtData.ttl * 900);
          console.log('[Speechmatics] ✅ JWT token obtained (TTL:', jwtData.ttl, 's)');
          return this.speechmaticsJWT!;
        }
      }

      // Fallback to API key if JWT generation fails (for local development with proxy)
      // In production (Vercel), we should use JWT, so log this as a warning
      const errorText = response ? await response.text() : 'No response';
      console.log('[Speechmatics] ⚠️ JWT generation failed:', errorText, '- falling back to API key (proxy mode)');
      response = await fetch('/api/speechmatics-token', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Speechmatics authentication failed: ${errorText}`);
      }

      const data = await response.json();
      this.speechmaticsApiKey = data.apiKey;
      if (!this.speechmaticsApiKey) {
        throw new Error('Failed to get Speechmatics API key');
      }
      console.log('[Speechmatics] ✅ Authentication successful, API key length:', this.speechmaticsApiKey.length);
      console.log('[Speechmatics] API key prefix:', this.speechmaticsApiKey.substring(0, 10) + '...');
      return this.speechmaticsApiKey;
    } catch (error) {
      console.error('[Speechmatics] ❌ Authentication error:', error);
      throw error;
    }
  }

  async getElevenLabsApiKey(): Promise<string> {
    console.log('[Speechmatics] 🔐 Getting ElevenLabs API key...');
    try {
      const response = await fetch('/api/elevenlabs-token', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get ElevenLabs API key: ${errorText}`);
      }

      const data = await response.json();
      const apiKey = data.apiKey;
      if (!apiKey) {
        throw new Error('Failed to get ElevenLabs API key');
      }
      console.log('[Speechmatics] ✅ ElevenLabs API key retrieved');
      return apiKey;
    } catch (error) {
      console.error('[Speechmatics] ❌ Error getting ElevenLabs API key:', error);
      throw error;
    }
  }

  async connect(config: SpeechmaticsConfig): Promise<void> {
    console.log('[Speechmatics] Starting connection process...');
    
    // Disconnect any existing connection first to free up quota
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('[Speechmatics] ⚠️ Closing existing connection before creating new one');
      this.disconnect();
      // Wait a bit for the connection to close
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Reset disconnect flag when connecting
    this.isDisconnected = false;
    this.wsConnected = false;
    this.config = config;

    // Validate required ElevenLabs configuration
    if (!config.elevenLabsVoiceId) {
      throw new Error('ElevenLabs voice ID is required for Speechmatics voice agent');
    }

    // Get ElevenLabs API key if not provided
    let elevenLabsApiKey = config.elevenLabsApiKey;
    if (!elevenLabsApiKey) {
      elevenLabsApiKey = await this.getElevenLabsApiKey();
    }

    // Initialize ElevenLabs TTS
    const elevenLabsConfig: ElevenLabsConfig = {
      apiKey: elevenLabsApiKey,
      voiceId: config.elevenLabsVoiceId,
      modelId: config.elevenLabsModelId,
    };
    this.elevenLabsTTS = new ElevenLabsTTS(elevenLabsConfig);
    console.log('[Speechmatics] ✅ ElevenLabs TTS initialized');

    // Authenticate with Speechmatics (get JWT or API key)
    const authToken = await this.authenticateSpeechmatics();
    
    // Store the token appropriately
    if (this.speechmaticsJWT) {
      // JWT token is stored in speechmaticsJWT
    } else if (authToken && !this.speechmaticsApiKey) {
      // API key fallback
      this.speechmaticsApiKey = authToken;
    }
    
    if (!this.speechmaticsJWT && !this.speechmaticsApiKey) {
      throw new Error('No Speechmatics authentication token available');
    }

    // Determine WebSocket URL based on language
    const language = config.sttLanguage || "fr";
    const region = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SPEECHMATICS_REGION) || 'eu2';
    
    // Try to use JWT token for direct connection (works on Vercel)
    // If JWT is available, use it in the URL parameter
    // Otherwise, fall back to proxy (for local development)
    const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    // Use JWT if available (for Vercel), otherwise use proxy (for localhost)
    // Force proxy only if explicitly set or if we're on localhost AND don't have JWT
    const forceProxy = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SPEECHMATICS_USE_PROXY === 'true');
    const useProxy = forceProxy || (isLocalhost && !this.speechmaticsJWT);
    
    let wsUrl: string;
    if (useProxy) {
      // Use proxy for local development
      const proxyPort = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SPEECHMATICS_PROXY_PORT) || '3001';
      wsUrl = `ws://localhost:${proxyPort}/speechmatics-ws?language=${encodeURIComponent(language)}`;
      console.log('[Speechmatics] Using proxy connection');
    } else if (this.speechmaticsJWT) {
      // Use JWT token in URL (works on Vercel, no proxy needed)
      wsUrl = `wss://${region}.rt.speechmatics.com/v2?jwt=${encodeURIComponent(this.speechmaticsJWT!)}`;
      console.log('[Speechmatics] Using JWT token for direct connection');
    } else {
      // Fallback: try direct connection (won't work without auth, but good for debugging)
      wsUrl = `wss://${region}.rt.speechmatics.com/v2`;
      console.log('[Speechmatics] ⚠️ No JWT or proxy, trying direct connection (may fail)');
    }
    
    const tokenToHide = this.speechmaticsJWT || this.speechmaticsApiKey || '';
    console.log('[Speechmatics] Connecting to:', wsUrl.replace(tokenToHide, '***'));
    console.log('[Speechmatics] Language:', language, 'Region:', region);

    return new Promise<void>((resolve, reject) => {
      let resolved = false; // Track if promise has been resolved
      const timeout = setTimeout(() => {
        if (!resolved) {
          const error = new Error('Connection timeout: Did not receive RecognitionStarted event within 10 seconds');
          console.error('[Speechmatics] ❌', error.message);
          resolved = true;
          reject(error);
        }
      }, 10000);

      try {
        const ws = new WebSocket(wsUrl);
        
        // Store the current WebSocket reference to check if it's still the active one
        const currentWs = ws;
        this.ws = ws;

        ws.onopen = () => {
          console.log('[Speechmatics] ✅ WebSocket connected');
          clearTimeout(timeout);
          
          // Send start configuration
          // Note: Speechmatics requires a single ISO language code (e.g., "fr", "en")
          // Multilingual support may require a different configuration or may not be available on free plans
          // For now, we'll use "fr" as default for "multi" to ensure compatibility
          let transcriptionLanguage = language;
          if (language === "multi" || language === "fr,en") {
            // Speechmatics doesn't support comma-separated languages in the language field
            // Use French as default for multilingual requests
            transcriptionLanguage = "fr";
            console.log('[Speechmatics] ⚠️ Multilingual request ("multi" or "fr,en") converted to "fr" for Speechmatics API');
            console.log('[Speechmatics] ℹ️ Note: Speechmatics may support multilingual via different configuration - check documentation');
          }
          
          // Speechmatics Real-Time API StartRecognition message format
          // According to API reference: https://docs.speechmatics.com/api-ref/realtime-transcription-websocket
          // - message: "StartRecognition" (required)
          // - audio_format: object (required) - must specify type, encoding, and sample_rate
          // - transcription_config: object (required)
          const settings: any = {
            message: "StartRecognition",
            audio_format: {
              type: "raw",
              encoding: "pcm_s16le",
              sample_rate: 16000,
            },
            transcription_config: {
              language: transcriptionLanguage,
              enable_partials: config.sttEnablePartials !== false, // Default to true
              max_delay: config.sttMaxDelay || 3.0, // Increased to 3.0 for better accuracy
              operating_point: config.sttOperatingPoint || "enhanced", // Use enhanced for better accuracy
            },
          };

          console.log('[Speechmatics] Sending start configuration:', JSON.stringify(settings, null, 2));
          ws.send(JSON.stringify(settings));
        };

        ws.onmessage = (event) => {
          // Always process RecognitionStarted messages, even if isDisconnected is true
          // This is because React StrictMode may disconnect the first connection attempt
          // while the second one is still waiting for RecognitionStarted
          // We check if this is still the active WebSocket and if promise is resolved below

          try {
            // Handle binary messages (audio data) - Speechmatics may send binary audio
            if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
              // Binary audio data - we don't process this in the WebSocket handler
              // Audio is handled by the AudioWorklet processor
              console.log('[Speechmatics] 📦 Received binary audio data');
              return;
            }

            // Handle text messages (JSON)
            const text = typeof event.data === 'string' ? event.data : event.data.toString();
            console.log('[Speechmatics] 📨 Received message:', text.substring(0, 200));
            const data = JSON.parse(text);
            
            // Check for RecognitionStarted message first
            if (data.message === "RecognitionStarted") {
              // Only resolve if this is still the active WebSocket and promise hasn't been resolved
              if (this.ws === currentWs && !resolved) {
                console.log('[Speechmatics] ✅ RecognitionStarted event received');
                clearTimeout(timeout);
                resolved = true;
                this.wsConnected = true;
                this.onConnectionCallback?.(true);
                resolve();
              } else {
                console.log('[Speechmatics] 🔇 RecognitionStarted received but connection was replaced or already resolved');
              }
            }
            
            // Handle other messages
            this.handleWebSocketMessage(data);
          } catch (error) {
            // Only log if it's not a binary message
            if (!(event.data instanceof Blob || event.data instanceof ArrayBuffer)) {
              console.error('[Speechmatics] ❌ Error parsing WebSocket message:', error);
              console.error('[Speechmatics] Message data type:', typeof event.data, 'value:', event.data);
            }
          }
        };

        ws.onerror = (error) => {
          if (!resolved && this.ws === currentWs) {
            console.error('[Speechmatics] ❌ WebSocket error:', error);
            clearTimeout(timeout);
            resolved = true;
            const err = new Error(`Speechmatics WebSocket error: ${error}`);
            this.onErrorCallback?.(err);
            reject(err);
          }
        };

        ws.onclose = (event) => {
          console.log('[Speechmatics] ⚠️ WebSocket closed:', event.code, event.reason);
          if (this.ws === currentWs) {
            this.wsConnected = false;
            this.onConnectionCallback?.(false);
            if (!this.isDisconnected && !resolved) {
              // Unexpected close before RecognitionStarted
              clearTimeout(timeout);
              resolved = true;
              const error = new Error(`WebSocket closed unexpectedly: ${event.code} ${event.reason || ''}`);
              this.onErrorCallback?.(error);
              reject(error);
            } else if (!this.isDisconnected) {
              // Unexpected close after RecognitionStarted
              const error = new Error(`WebSocket closed unexpectedly: ${event.code} ${event.reason || ''}`);
              this.onErrorCallback?.(error);
            }
          }
        };
      } catch (error) {
        if (!resolved) {
          clearTimeout(timeout);
          resolved = true;
          console.error('[Speechmatics] ❌ Error creating WebSocket:', error);
          reject(error);
        }
      }
    });
  }

  private handleWebSocketMessage(data: any): void {
    // Only ignore messages if disconnected AND already connected (RecognitionStarted received)
    // This allows RecognitionStarted to be processed even if a previous connection was aborted
    if (this.isDisconnected && this.wsConnected) {
      return;
    }

    // Log all messages for debugging
    console.log('[Speechmatics] 📨 Handling message:', JSON.stringify(data, null, 2));

    // Handle RecognitionStarted
    if (data.message === "RecognitionStarted") {
      console.log('[Speechmatics] 🎧 Recognition started');
      return;
    }
    
    // Handle Info messages (like concurrent_session_usage)
    if (data.message === "Info") {
      console.log('[Speechmatics] ℹ️ Info message:', data.type, data.reason || '');
      return;
    }

    // Handle AudioAdded (acknowledgment of audio chunks)
    if (data.message === "AudioAdded") {
      // Just acknowledge, no action needed
      return;
    }

    // Handle partial transcription (AddPartialTranscript)
    // Speechmatics sends: { message: "AddPartialTranscript", metadata: { transcript: "..." } }
    if (data.message === "AddPartialTranscript") {
      // Extract transcript from metadata
      const transcript = data.metadata?.transcript || "";
      if (transcript && transcript.trim() && transcript !== this.lastPartialUserContent) {
        console.log('[Speechmatics] 💬 Partial:', transcript);
        this.lastPartialUserContent = transcript;
        this.onMessageCallback?.({
          role: 'user',
          content: transcript,
          timestamp: new Date().toISOString(),
          isInterim: true,
        });
      }
      return;
    }

    // Handle final transcription (AddTranscript)
    // Speechmatics sends: { message: "AddTranscript", metadata: { transcript: "..." } }
    if (data.message === "AddTranscript") {
      // Extract transcript from metadata
      const transcript = data.metadata?.transcript || "";
      if (transcript && transcript.trim()) {
        console.log('[Speechmatics] ✅ Final:', transcript);
        
        // Accumulate final transcripts until we have a complete sentence
        // This helps group words together instead of processing them one by one
        const trimmedTranscript = transcript.trim();
        
        // Check if this is a new transcript (not a duplicate)
        if (trimmedTranscript && trimmedTranscript !== this.lastFinalUserContent) {
          // If we have a pending transcript, append to it
          if (this.pendingFinalTranscript) {
            // Append new words to pending transcript
            const newWords = trimmedTranscript.replace(this.pendingFinalTranscript, '').trim();
            if (newWords) {
              this.pendingFinalTranscript += ' ' + newWords;
            }
          } else {
            // Start a new pending transcript
            this.pendingFinalTranscript = trimmedTranscript;
          }
          
          // Check if we have a complete sentence (ends with punctuation or silence detected)
          const pendingTranscript = this.pendingFinalTranscript; // Store in const for type safety
          if (!pendingTranscript) return;
          
          const isCompleteSentence = /[.!?]\s*$/.test(pendingTranscript) || 
                                     pendingTranscript.length > 20; // Longer phrases are likely complete
          
          if (isCompleteSentence) {
            const finalMessage = pendingTranscript;
            this.pendingFinalTranscript = null;
            this.lastPartialUserContent = null;
            this.lastFinalUserContent = finalMessage;
            
            console.log('[Speechmatics] ✅ Complete sentence detected:', finalMessage);
            
            // Add to conversation history
            this.conversationHistory.push({ role: 'user', content: finalMessage });
            
            // Notify callback
            this.onMessageCallback?.({
              role: 'user',
              content: finalMessage,
              timestamp: new Date().toISOString(),
              isInterim: false,
            });

            // Process user message and generate response
            this.processUserMessage(finalMessage);
          } else {
            console.log('[Speechmatics] 📝 Accumulating transcript:', this.pendingFinalTranscript);
          }
        } else if (trimmedTranscript === this.lastFinalUserContent) {
          console.log('[Speechmatics] ⏸️ Skipping duplicate final transcript');
        }
      }
      return;
    }

    // Handle EndOfStream
    if (data.message === "EndOfStream") {
      console.log('[Speechmatics] 🔚 End of stream');
      return;
    }

    // Handle Error messages
    if (data.message === "Error") {
      const errorMessage = data.reason || data.message || 'Unknown error';
      console.error('[Speechmatics] ❌ Error message:', errorMessage);
      const error = new Error(`Speechmatics error: ${errorMessage}`);
      this.onErrorCallback?.(error);
      return;
    }
  }

  private async processUserMessage(transcript: string): Promise<void> {
    if (this.isGeneratingResponse) {
      console.log('[Speechmatics] ⏳ Already generating response, queuing message');
      this.userMessageQueue.push({ content: transcript, timestamp: new Date().toISOString() });
      return;
    }

    this.isGeneratingResponse = true;

    try {
      // Get LLM API key
      const llmProvider = this.config?.llmProvider || "anthropic";
      const llmApiKey = this.config?.llmApiKey || await this.getLLMApiKey(llmProvider);
      const llmModel = this.config?.llmModel || (llmProvider === "openai" ? "gpt-4o" : "claude-3-5-haiku-latest");

      // Build messages for LLM
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: this.config?.systemPrompt || '' },
        ...this.conversationHistory.map(msg => ({
          role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
          content: msg.content,
        })),
      ];

      // Call LLM
      console.log('[Speechmatics] 🤖 Calling LLM...');
      const llmResponse = await this.callLLM(llmProvider, llmApiKey, llmModel, messages);
      console.log('[Speechmatics] ✅ LLM response:', llmResponse.substring(0, 100));

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
      if (this.elevenLabsTTS) {
        console.log('[Speechmatics] 🔊 Generating TTS audio...');
        const audioStream = await this.elevenLabsTTS.streamTextToSpeech(llmResponse);
        const audioData = await this.streamToUint8Array(audioStream);
        if (audioData) {
          this.onAudioCallback?.(audioData);
          await this.playAudio(audioData);
        }
      }

      // Process queued messages
      if (this.userMessageQueue.length > 0) {
        const nextMessage = this.userMessageQueue.shift();
        if (nextMessage) {
          this.processUserMessage(nextMessage.content);
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

  private async getLLMApiKey(provider: "anthropic" | "openai"): Promise<string> {
    const response = await fetch('/api/llm-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get LLM API key: ${errorText}`);
    }

    const data = await response.json();
    return data.apiKey;
  }

  private async callLLM(
    provider: "anthropic" | "openai",
    apiKey: string,
    model: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  ): Promise<string> {
    // Use API route to avoid CORS issues
    const systemMessage = messages.find(m => m.role === 'system');
    
    const response = await fetch('/api/speechmatics-llm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider,
        model,
        messages,
        systemPrompt: systemMessage?.content || '',
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`LLM API error: ${(error as any).error || response.statusText}`);
    }

    const data = await response.json();
    return data.content || '';
  }

  private async playAudio(audioData: Uint8Array): Promise<void> {
    if (!this.audioContext) {
      console.warn('[Speechmatics] ⚠️ No audio context for playback');
      return;
    }

    if (this.isPlayingAudio) {
      this.audioPlaybackQueue.push(await this.audioDataToBuffer(audioData));
      return;
    }

    this.isPlayingAudio = true;

    try {
      const buffer = await this.audioDataToBuffer(audioData);
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioContext.destination);

      source.onended = () => {
        if (this.audioPlaybackQueue.length > 0) {
          const nextBuffer = this.audioPlaybackQueue.shift()!;
          this.playAudioBuffer(nextBuffer);
        } else {
          this.isPlayingAudio = false;
        }
      };

      this.playAudioBuffer(buffer);
    } catch (error) {
      console.error('[Speechmatics] ❌ Error playing audio:', error);
      this.isPlayingAudio = false;
    }
  }

  private async playAudioBuffer(buffer: AudioBuffer): Promise<void> {
    if (!this.audioContext) return;

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);

    const currentTime = this.audioContext.currentTime;
    if (this.nextStartTime < currentTime) {
      this.nextStartTime = currentTime;
    }

    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;
  }

  private async streamToUint8Array(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    // Combine all chunks
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    return combined;
  }

  private async audioDataToBuffer(audioData: Uint8Array): Promise<AudioBuffer> {
    if (!this.audioContext) {
      throw new Error('No audio context');
    }

    // ElevenLabs returns MP3 audio, decode it
    try {
      // Convert ArrayBufferLike to ArrayBuffer by creating a new ArrayBuffer
      const arrayBuffer = audioData.buffer instanceof ArrayBuffer 
        ? audioData.buffer 
        : new Uint8Array(audioData).buffer;
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      return audioBuffer;
    } catch (error) {
      console.error('[Speechmatics] ❌ Error decoding audio:', error);
      throw error;
    }
  }

  async startMicrophone(): Promise<void> {
    console.log('[Speechmatics] 🎤 Starting microphone...');
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      const error = new Error('Not connected to Speechmatics');
      console.error('[Speechmatics] ❌', error.message);
      throw error;
    }

    // Configure audio constraints for 16kHz
    const isFirefox = this.isFirefox;
    console.log('[Speechmatics] Browser is Firefox:', isFirefox);
    let audioConstraints: MediaTrackConstraints;
    
    if (isFirefox) {
      audioConstraints = {
        echoCancellation: true,
        noiseSuppression: false,
      };
    } else {
      audioConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 16000,
        channelCount: 1
      };
    }

    console.log('[Speechmatics] Requesting microphone access with constraints:', audioConstraints);
    // Get microphone stream
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints
    });
    console.log('[Speechmatics] ✅ Microphone access granted');
    this.mediaStream = stream;

    // Create audio context at 16kHz
    console.log('[Speechmatics] Creating AudioContext...');
    let audioContext: AudioContext;
    if (isFirefox) {
      audioContext = new AudioContext();
      console.log('[Speechmatics] AudioContext created (Firefox), state:', audioContext.state);
      if (audioContext.state === 'suspended') {
        console.log('[Speechmatics] Resuming suspended AudioContext...');
        await audioContext.resume();
        await new Promise(resolve => setTimeout(resolve, 100));
        console.log('[Speechmatics] AudioContext state after resume:', audioContext.state);
      }
    } else {
      audioContext = new AudioContext({ sampleRate: 16000 });
      console.log('[Speechmatics] AudioContext created with 16kHz sample rate, state:', audioContext.state);
    }
    this.audioContext = audioContext;

    // Create source from stream
    const source = audioContext.createMediaStreamSource(stream);
    this.sourceNode = source;
    console.log('[Speechmatics] MediaStreamSource created');

    // Load AudioWorklet module
    try {
      console.log('[Speechmatics] Loading AudioWorklet module...');
      await audioContext.audioWorklet.addModule('/speechmatics-audio-processor.js');
      console.log('[Speechmatics] ✅ AudioWorklet module loaded');
    } catch (error) {
      console.error('[Speechmatics] ❌ Failed to load AudioWorklet module:', error);
      throw new Error(`Failed to load AudioWorklet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Create AudioWorkletNode
    const processorOptions = {
      processorOptions: {
        isFirefox: isFirefox
      },
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1
    };
    
    const processor = new AudioWorkletNode(audioContext, 'speechmatics-audio-processor', processorOptions);
    this.processorNode = processor;
    console.log('[Speechmatics] AudioWorkletNode created');

    let audioChunkCount = 0;
    this.isMicrophoneActive = true;

    // Handle audio data from AudioWorklet
    processor.port.onmessage = (event) => {
      if (!this.isMicrophoneActive) {
        console.log('[Speechmatics] 🔇 Microphone inactive, dropping audio chunk');
        return;
      }

      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        console.warn('[Speechmatics] ⚠️ WebSocket not available, dropping audio chunk');
        return;
      }

      if (event.data.type === 'audio') {
        if (!this.isMicrophoneActive) {
          console.log('[Speechmatics] 🔇 Microphone inactive during audio processing, dropping chunk');
          return;
        }

        const pcmData = new Int16Array(event.data.data);

        // Send audio to Speechmatics
        try {
          this.ws.send(pcmData.buffer);
          audioChunkCount++;
          if (audioChunkCount % 100 === 0) {
            console.log('[Speechmatics] 🔊 Sent', audioChunkCount, 'audio chunks');
          }
        } catch (error) {
          console.error('[Speechmatics] ❌ Error sending audio:', error);
        }
      }
    };

    // Connect audio graph
    source.connect(processor);
    processor.connect(audioContext.destination);
    console.log('[Speechmatics] ✅ Audio graph connected, microphone is active');
  }

  stopMicrophone(): void {
    console.log('[Speechmatics] 🎤 Stopping microphone...');

    this.isDisconnected = true;
    this.isMicrophoneActive = false;

    // Stop media stream tracks
    if (this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach(track => {
          if (track.readyState === 'live') {
            track.stop();
            console.log('[Speechmatics] ✅ Stopped track:', track.kind);
          }
        });
        this.mediaStream = null;
      } catch (error) {
        console.warn('[Speechmatics] Error stopping media stream:', error);
      }
    }

    // Clear AudioWorklet handler
    if (this.processorNode) {
      try {
        this.processorNode.port.onmessage = null;
        this.processorNode.port.postMessage({ type: 'stop' });
        this.processorNode.disconnect();
        this.processorNode = null;
      } catch (error) {
        console.warn('[Speechmatics] Error stopping processor:', error);
      }
    }

    // Disconnect source node
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
        this.sourceNode = null;
      } catch (error) {
        console.warn('[Speechmatics] Error disconnecting source:', error);
      }
    }

    // Close audio context
    if (this.audioContext) {
      try {
        if (this.audioContext.state !== 'closed') {
          this.audioContext.close();
        }
        this.audioContext = null;
      } catch (error) {
        console.warn('[Speechmatics] Error closing audio context:', error);
      }
    }

    this.onConnectionCallback?.(false);
    console.log('[Speechmatics] ✅ Microphone stopped');
  }

  disconnect(): void {
    console.log('[Speechmatics] 🔌 Disconnecting...');
    
    this.isDisconnected = true;
    
    // Stop microphone first
    this.stopMicrophone();

    // Close WebSocket (send EndOfStream to properly close the session)
    if (this.ws) {
      try {
        // Send EndOfStream message to properly close the session
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ message: "EndOfStream", last_seq_no: 0 }));
          // Wait a bit for the message to be sent (fire-and-forget)
          setTimeout(() => {
            if (this.ws) {
              this.ws.close();
              console.log('[Speechmatics] ✅ WebSocket closed and session ended');
            }
          }, 100);
        } else {
          this.ws.close();
          console.log('[Speechmatics] ✅ WebSocket closed');
        }
      } catch (error) {
        console.warn('[Speechmatics] Error closing WebSocket:', error);
        if (this.ws) {
          this.ws.close();
        }
      }
      this.ws = null;
    }

    // Stop current audio playback
    if (this.currentAudioSource) {
      try {
        this.currentAudioSource.stop();
        this.currentAudioSource = null;
      } catch (error) {
        console.warn('[Speechmatics] Error stopping audio source:', error);
      }
    }
    
    // Clear audio queue
    this.audioQueue = [];
    this.nextStartTime = 0;
    this.isProcessingAudio = false;
    this.audioPlaybackQueue = [];
    
    // Clear pending transcripts
    this.pendingFinalTranscript = null;
    this.lastPartialUserContent = null;
    this.lastFinalUserContent = null;

    this.wsConnected = false;
    this.onConnectionCallback?.(false);
    console.log('[Speechmatics] ✅ Disconnection complete');
  }

  isConnected(): boolean {
    return this.wsConnected && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

