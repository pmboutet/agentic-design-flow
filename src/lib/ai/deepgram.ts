import { DeepgramClient, AgentLiveClient, AgentEvents } from '@deepgram/sdk';
import type { AiModelConfig } from '@/types';

export interface DeepgramConfig {
  systemPrompt: string;
  sttModel?: string; // Speech-to-text model, default: "nova-3"
  ttsModel?: string; // Text-to-speech model, default: "aura-thalia-en"
  llmProvider?: "anthropic" | "openai";
  llmModel?: string;
}

export interface DeepgramMessageEvent {
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
  isInterim?: boolean;
}

export type DeepgramMessageCallback = (message: DeepgramMessageEvent) => void;
export type DeepgramErrorCallback = (error: Error) => void;
export type DeepgramConnectionCallback = (connected: boolean) => void;
export type DeepgramAudioCallback = (audio: Uint8Array) => void;

export class DeepgramVoiceAgent {
  private client: AgentLiveClient | null = null;
  private token: string | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: AudioWorkletNode | null = null;
  private audioQueue: Uint8Array[] = [];
  private nextStartTime: number = 0;
  private currentAudioSource: AudioBufferSourceNode | null = null;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private isProcessingAudio: boolean = false;
  private isMicrophoneActive: boolean = false;
  private isFirefox: boolean;
  private config: DeepgramConfig | null = null;
  private isDisconnected: boolean = false; // Flag to prevent event handlers from firing after disconnect
  
  // Event handler references for cleanup
  private eventHandlers: Map<string, (...args: any[]) => void> = new Map();
  
  // Callbacks
  private onMessageCallback: DeepgramMessageCallback | null = null;
  private onErrorCallback: DeepgramErrorCallback | null = null;
  private onConnectionCallback: DeepgramConnectionCallback | null = null;
  private onAudioCallback: DeepgramAudioCallback | null = null;

  constructor() {
    this.isFirefox = typeof navigator !== 'undefined' && navigator.userAgent.includes('Firefox');
  }

  setCallbacks(callbacks: {
    onMessage?: DeepgramMessageCallback;
    onError?: DeepgramErrorCallback;
    onConnection?: DeepgramConnectionCallback;
    onAudio?: DeepgramAudioCallback;
  }) {
    this.onMessageCallback = callbacks.onMessage || null;
    this.onErrorCallback = callbacks.onError || null;
    this.onConnectionCallback = callbacks.onConnection || null;
    this.onAudioCallback = callbacks.onAudio || null;
  }

  async authenticate(): Promise<string> {
    console.log('[Deepgram] 🔐 Starting authentication...');
    try {
      const response = await fetch('/api/token', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      console.log('[Deepgram] Auth response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Deepgram] ❌ Auth failed:', errorText);
        throw new Error(`Authentication failed: ${errorText}`);
      }

      const data = await response.json();
      console.log('[Deepgram] Auth response received, token length:', data.token?.length || 0);
      this.token = data.token;
      if (!this.token) {
        throw new Error('Failed to get Deepgram token');
      }
      console.log('[Deepgram] ✅ Authentication successful');
      return this.token;
    } catch (error) {
      console.error('[Deepgram] ❌ Authentication error:', error);
      throw error;
    }
  }

  async connect(config: DeepgramConfig): Promise<void> {
    console.log('[Deepgram] Starting connection process...');
    
    // Reset disconnect flag when connecting
    this.isDisconnected = false;
    this.eventHandlers.clear();
    
    if (!this.token) {
      console.log('[Deepgram] Authenticating...');
      await this.authenticate();
      console.log('[Deepgram] Authentication successful');
    }

    if (!this.token) {
      const error = new Error('No token available');
      console.error('[Deepgram] ❌', error.message);
      throw error;
    }

    console.log('[Deepgram] Token available, creating client...');
    console.log('[Deepgram] Token preview:', this.token.substring(0, 20) + '...');
    this.config = config;
    
    try {
      const client = new DeepgramClient({ accessToken: this.token }).agent();
      this.client = client;
      console.log('[Deepgram] Client created successfully');
      console.log('[Deepgram] Client type:', typeof client);
      console.log('[Deepgram] Client methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(client)));
    } catch (error) {
      console.error('[Deepgram] ❌ Error creating client:', error);
      throw error;
    }
    
    const client = this.client!;
    console.log('[Deepgram] Setting up event handlers...');

    // Create a promise that resolves when connection is fully established
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const error = new Error('Connection timeout: Did not receive Welcome event within 10 seconds');
        console.error('[Deepgram] ❌', error.message);
        reject(error);
      }, 10000);

      // Handle Welcome event
      client.once(AgentEvents.Welcome, (welcomeMessage) => {
        console.log('[Deepgram] ✅ Welcome event received:', welcomeMessage);
        clearTimeout(timeout);
        
        // Use multilingual model (nova-2 or nova-3) for automatic language detection
        // Nova-2 and Nova-3 are multilingual models that can transcribe multiple languages
        // For streaming, we use the multilingual model which supports FR and EN
        const sttModel = config.sttModel || "nova-3";
        const isMultilingualModel = sttModel.includes("nova-2") || sttModel.includes("nova-3");
        
        // Ensure we're using a multilingual model (nova-3 supports FR and EN automatically)
        const finalSttModel = isMultilingualModel ? sttModel : "nova-3";
        
        console.log('[Deepgram] Using STT model:', finalSttModel, '- This model supports automatic language detection for French (fr) and English (en)');
        
        const settings: any = {
          audio: {
            input: {
              encoding: "linear16" as const,
              sample_rate: 24000
            },
            output: {
              encoding: "linear16" as const,
              sample_rate: 24000,
              container: "none" as const
            }
          },
          agent: {
            listen: {
              provider: {
                type: "deepgram" as const,
                model: finalSttModel
                // Nova-2 and Nova-3 are multilingual models that automatically detect language
                // They support both French (fr) and English (en) automatically
                // The model will auto-detect the language based on the speech content
                // Note: The 'language' parameter is NOT supported in agent.listen.provider for Agent API
                // Multilingual mode is enabled by default with nova-2 and nova-3 models
                // detect_language: true at agent level helps improve language detection accuracy
              }
            },
            speak: {
              provider: {
                type: "deepgram" as const,
                model: config.ttsModel || "aura-2-thalia-en"
              }
            },
          think: {
            provider: {
              type: config.llmProvider || "anthropic",
              model: config.llmModel || (config.llmProvider === "openai" ? "gpt-4o" : "claude-3-5-haiku-latest")
            },
            prompt: config.systemPrompt
          }
        }
        };
        
        console.log('[Deepgram] Configuring agent with settings:', JSON.stringify(settings, null, 2));
        client.configure(settings);
      });

      // Handle SettingsApplied event
      const settingsAppliedTimeout = setTimeout(() => {
        const error = new Error('Connection timeout: Did not receive SettingsApplied event within 10 seconds');
        console.error('[Deepgram] ❌', error.message);
        clearTimeout(timeout);
        reject(error);
      }, 10000);

      client.once(AgentEvents.SettingsApplied, (appliedSettings) => {
        console.log('[Deepgram] ✅ SettingsApplied event received:', appliedSettings);
        clearTimeout(timeout);
        clearTimeout(settingsAppliedTimeout);
        this.onConnectionCallback?.(true);
        
        // Start keep-alive
        client.keepAlive();
        this.keepAliveInterval = setInterval(() => {
          if (this.client) {
            this.client.keepAlive();
          } else {
            if (this.keepAliveInterval) {
              clearInterval(this.keepAliveInterval);
              this.keepAliveInterval = null;
            }
          }
        }, 8000);
        
        console.log('[Deepgram] ✅ Connection fully established!');
        resolve();
      });

      // Handle ConversationText events (transcriptions and agent responses)
      const conversationTextHandler = (message: any) => {
        if (this.isDisconnected) {
          console.log('[Deepgram] 🔇 Ignoring ConversationText event - agent is disconnected');
          return;
        }
        console.log('[Deepgram] 💬 ConversationText:', message.role, ':', message.content.substring(0, 100));
        this.onMessageCallback?.({
          role: message.role as 'user' | 'agent',
          content: message.content,
          timestamp: new Date().toISOString()
        });
      };
      client.on(AgentEvents.ConversationText, conversationTextHandler);
      this.eventHandlers.set('ConversationText', conversationTextHandler);

      // Handle Audio events (agent speaking)
      const audioHandler = async (audio: Uint8Array) => {
        if (this.isDisconnected) {
          console.log('[Deepgram] 🔇 Ignoring Audio event - agent is disconnected');
          return;
        }
        console.log('[Deepgram] 🔊 Audio chunk received, size:', audio.length);
        // Call the audio callback if set
        this.onAudioCallback?.(audio);
        // Also process for internal playback
        this.audioQueue.push(audio);
        await this.processAudioQueue();
      };
      client.on(AgentEvents.Audio, audioHandler);
      this.eventHandlers.set('Audio', audioHandler);

      // Handle user started speaking (interrupt agent)
      const userStartedSpeakingHandler = () => {
        if (this.isDisconnected) {
          console.log('[Deepgram] 🔇 Ignoring UserStartedSpeaking event - agent is disconnected');
          return;
        }
        console.log('[Deepgram] 👤 User started speaking');
        // Stop current audio playback
        if (this.currentAudioSource) {
          try {
            this.currentAudioSource.stop();
            this.currentAudioSource = null;
          } catch (error) {
            console.warn('[Deepgram] Error stopping audio on user speech:', error);
          }
        }
        // Clear audio queue
        this.audioQueue = [];
        this.nextStartTime = 0;
        this.isProcessingAudio = false;
      };
      client.on(AgentEvents.UserStartedSpeaking, userStartedSpeakingHandler);
      this.eventHandlers.set('UserStartedSpeaking', userStartedSpeakingHandler);

      // Handle agent started speaking
      const agentStartedSpeakingHandler = () => {
        if (this.isDisconnected) {
          console.log('[Deepgram] 🔇 Ignoring AgentStartedSpeaking event - agent is disconnected');
          return;
        }
        console.log('[Deepgram] 🤖 Agent started speaking');
      };
      client.on(AgentEvents.AgentStartedSpeaking, agentStartedSpeakingHandler);
      this.eventHandlers.set('AgentStartedSpeaking', agentStartedSpeakingHandler);

      // Handle errors
      const errorHandler = (error: any) => {
        if (this.isDisconnected) {
          console.log('[Deepgram] 🔇 Ignoring Error event - agent is disconnected');
          return;
        }
        console.error('[Deepgram] ❌ Error event:', error);
        const errorMessage = error.description || error.message || 'Unknown error';
        const errorCode = error.code || 'UNKNOWN';
        
        // Provide helpful error message for model not available
        let enhancedMessage = errorMessage;
        if (errorCode === 'INVALID_SETTINGS' && errorMessage.includes('model not available')) {
          enhancedMessage = `${errorMessage}. Please check the Deepgram documentation for supported model names. For Anthropic, try: claude-3-5-haiku-latest or claude-sonnet-4-20250514. Current model: ${config.llmModel || 'not set'}`;
        }
        if (errorCode === 'FAILED_TO_SPEAK') {
          enhancedMessage = `${errorMessage}. Please check your TTS model name. Try: aura-2-thalia-en, aura-2-asteria-en, or other aura-2 models. Current TTS model: ${config.ttsModel || 'not set'}`;
        }
        
        const err = new Error(`Deepgram Agent error (${errorCode}): ${enhancedMessage}`);
        console.error('[Deepgram] ❌ Full error details:', JSON.stringify(error, null, 2));
        console.error('[Deepgram] ❌ Current model configuration:', {
          provider: config.llmProvider,
          model: config.llmModel
        });
        this.onErrorCallback?.(err);
        clearTimeout(timeout);
        clearTimeout(settingsAppliedTimeout);
        reject(err);
        this.disconnect();
      };
      client.on(AgentEvents.Error, errorHandler);
      this.eventHandlers.set('Error', errorHandler);

      // Handle close
      const closeHandler = (closeEvent: any) => {
        console.log('[Deepgram] ⚠️ Close event received:', closeEvent);
        this.onConnectionCallback?.(false);
        this.client = null;
      };
      client.on(AgentEvents.Close, closeHandler);
      this.eventHandlers.set('Close', closeHandler);

      // The SDK should automatically connect when we create the agent client
      // But let's log to confirm we're waiting
      console.log('[Deepgram] ✅ All event handlers registered');
      console.log('[Deepgram] Waiting for Welcome event (WebSocket should connect automatically)...');
      console.log('[Deepgram] Client object:', {
        hasClient: !!client,
        clientType: typeof client,
        clientConstructor: client?.constructor?.name
      });
      
      // Give the SDK a moment to establish the WebSocket connection
      // The SDK should automatically connect, but we'll wait for the Welcome event
      setTimeout(() => {
        console.log('[Deepgram] ⏱️ 5 seconds passed, still waiting for Welcome event...');
      }, 5000);
    });
  }

  async startMicrophone(deviceId?: string, voiceIsolation: boolean = true): Promise<void> {
    console.log('[Deepgram] 🎤 Starting microphone...', { deviceId, voiceIsolation });
    if (!this.client) {
      const error = new Error('Not connected to Deepgram');
      console.error('[Deepgram] ❌', error.message);
      throw error;
    }

    // Configure audio constraints
    const isFirefox = this.isFirefox;
    console.log('[Deepgram] Browser is Firefox:', isFirefox);
    let audioConstraints: MediaTrackConstraints;
    
    if (isFirefox) {
      audioConstraints = {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: voiceIsolation,
        noiseSuppression: false,
      };
    } else {
      audioConstraints = {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: voiceIsolation,
        noiseSuppression: voiceIsolation,
        autoGainControl: voiceIsolation,
        sampleRate: 24000,
        channelCount: 1
      };
    }

    // Remove undefined values (TypeScript-safe way)
    const cleanedConstraints: MediaTrackConstraints = {};
    Object.keys(audioConstraints).forEach(key => {
      const value = audioConstraints[key as keyof MediaTrackConstraints];
      if (value !== undefined) {
        (cleanedConstraints as any)[key] = value;
      }
    });
    const finalConstraints = Object.keys(cleanedConstraints).length > 0 ? cleanedConstraints : audioConstraints;

    console.log('[Deepgram] Requesting microphone access with constraints:', finalConstraints);
    // Get microphone stream
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: finalConstraints
    });
    console.log('[Deepgram] ✅ Microphone access granted');
    this.mediaStream = stream;

    // Create audio context
    console.log('[Deepgram] Creating AudioContext...');
    let audioContext: AudioContext;
    if (isFirefox) {
      audioContext = new AudioContext();
      console.log('[Deepgram] AudioContext created (Firefox), state:', audioContext.state);
      if (audioContext.state === 'suspended') {
        console.log('[Deepgram] Resuming suspended AudioContext...');
        await audioContext.resume();
        await new Promise(resolve => setTimeout(resolve, 100));
        console.log('[Deepgram] AudioContext state after resume:', audioContext.state);
      }
    } else {
      audioContext = new AudioContext({ sampleRate: 24000 });
      console.log('[Deepgram] AudioContext created with 24kHz sample rate, state:', audioContext.state);
    }
    this.audioContext = audioContext;

    // Create source from stream
    const source = audioContext.createMediaStreamSource(stream);
    this.sourceNode = source;
    console.log('[Deepgram] MediaStreamSource created');

    // Load AudioWorklet module
    try {
      console.log('[Deepgram] Loading AudioWorklet module...');
      await audioContext.audioWorklet.addModule('/audio-processor.js');
      console.log('[Deepgram] ✅ AudioWorklet module loaded');
    } catch (error) {
      console.error('[Deepgram] ❌ Failed to load AudioWorklet module:', error);
      throw new Error(`Failed to load AudioWorklet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Create AudioWorkletNode with 8192 buffer size
    // Note: The buffer size is controlled by the AudioWorkletProcessor's process() method
    // We configure it via the processorOptions
    const processorOptions = {
      processorOptions: {
        isFirefox: isFirefox
      },
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1
    };
    
    const processor = new AudioWorkletNode(audioContext, 'deepgram-audio-processor', processorOptions);
    this.processorNode = processor;
    console.log('[Deepgram] AudioWorkletNode created with 8192 buffer size');

    let audioChunkCount = 0;
    this.isMicrophoneActive = true;

    // Handle audio data from AudioWorklet
    processor.port.onmessage = (event) => {
      // CRITICAL: Check if microphone is active BEFORE processing audio
      // This prevents any audio from being sent after stopMicrophone() is called
      if (!this.isMicrophoneActive) {
        console.log('[Deepgram] 🔇 Microphone inactive, dropping audio chunk');
        return; // Don't process or send audio if muted
      }

      // Double-check client exists and is connected
      if (!this.client) {
        // Don't log warning if we're intentionally disconnected (to reduce noise)
        if (this.isDisconnected) {
          return;
        }
        console.warn('[Deepgram] ⚠️ No client available, dropping audio chunk');
        return;
      }
      
      // Triple-check: if disconnected, don't process audio
      if (this.isDisconnected) {
        return;
      }

      if (event.data.type === 'audio') {
        // Triple-check before sending (user might have muted during processing)
        if (!this.isMicrophoneActive) {
          console.log('[Deepgram] 🔇 Microphone inactive during audio processing, dropping chunk');
          return;
        }

        const pcmData = new Int16Array(event.data.data);

        // Send audio to Deepgram
        try {
          this.client.send(pcmData.buffer);
          audioChunkCount++;
          if (audioChunkCount % 100 === 0) {
            console.log('[Deepgram] 🔊 Sent', audioChunkCount, 'audio chunks');
          }
        } catch (error) {
          console.error('[Deepgram] ❌ Error sending audio to agent:', error);
        }
      }
    };

    // Connect audio graph
    source.connect(processor);
    processor.connect(audioContext.destination);
    console.log('[Deepgram] ✅ Audio graph connected, microphone is active');
  }

  private async processAudioQueue(): Promise<void> {
    if (this.audioQueue.length === 0 || !this.audioContext) return;
    
    // Prevent multiple simultaneous processing
    if (this.isProcessingAudio) {
      return;
    }

    this.isProcessingAudio = true;

    try {
      const audioContext = this.audioContext;
      
      // CRITICAL: Resume audio context if suspended (required for audio playback)
      // Browsers suspend AudioContext by default until user interaction
      if (audioContext.state === 'suspended') {
        console.log('[Deepgram] 🔊 AudioContext suspended, resuming for playback...');
        await audioContext.resume();
        console.log('[Deepgram] ✅ AudioContext resumed, state:', audioContext.state);
      }
      
      const currentTime = audioContext.currentTime;

      if (this.nextStartTime < currentTime) {
        this.nextStartTime = currentTime;
      }

      while (this.audioQueue.length > 0) {
        const audioChunk = this.audioQueue.shift()!;
        const audioData = new Int16Array(audioChunk.buffer);
        if (audioData.length === 0) continue;

        // Create AudioBuffer at 24kHz
        const buffer = audioContext.createBuffer(1, audioData.length, 24000);
        const channelData = buffer.getChannelData(0);

        // Convert Int16 → Float32
        for (let i = 0; i < audioData.length; i++) {
          channelData[i] = audioData[i] / 0x7FFF;
        }

        // Create source and schedule playback
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);

        const startTime = this.nextStartTime;
        source.start(startTime);
        this.nextStartTime = startTime + buffer.duration;

        this.currentAudioSource = source;

        source.onended = () => {
          if (audioContext.currentTime >= this.nextStartTime - 0.1) {
            if (this.audioQueue.length === 0) {
              this.currentAudioSource = null;
              this.isProcessingAudio = false;
            } else {
              // Continue processing queue
              this.processAudioQueue();
            }
          }
        };
      }
    } catch (error) {
      console.error('Audio queue processing error', error);
      this.isProcessingAudio = false;
    }
  }

  stopMicrophone(): void {
    console.log('[Deepgram] 🎤 Stopping microphone and closing WebSocket...');

    // Set flags to stop processing IMMEDIATELY (before any other cleanup)
    // This ensures no audio is sent and no events are processed after mute is activated
    this.isDisconnected = true;
    this.isMicrophoneActive = false;

    // CRITICAL: Stop media stream tracks FIRST to prevent new audio capture
    // This stops the audio at the source before any processing
    if (this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach(track => {
          if (track.readyState === 'live') {
            track.stop();
            console.log('[Deepgram] ✅ Stopped track:', track.kind, track.label || 'unnamed');
          }
        });
        this.mediaStream = null;
        console.log('[Deepgram] ✅ Media stream stopped');
      } catch (error) {
        console.warn('[Deepgram] Error stopping media stream:', error);
      }
    }

    // Send stop message to AudioWorklet and clear the message queue
    if (this.processorNode) {
      const processorNode = this.processorNode;

      // Clear the message handler BEFORE sending stop to drop any pending messages
      try {
        processorNode.port.onmessage = null;
        console.log('[Deepgram] ✅ Cleared AudioWorklet message handler');
      } catch (error) {
        console.warn('[Deepgram] Error clearing AudioWorklet onmessage handler:', error);
      }

      try {
        processorNode.port.postMessage({ type: 'stop' });
        console.log('[Deepgram] ✅ Stop message sent to AudioWorklet');
      } catch (error) {
        console.warn('[Deepgram] Error sending stop message to AudioWorklet:', error);
      }

      try {
        processorNode.disconnect();
        console.log('[Deepgram] ✅ Processor node disconnected');
      } catch (error) {
        console.warn('[Deepgram] Error disconnecting processor:', error);
      }
      this.processorNode = null;
    }

    // Disconnect source node
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
        console.log('[Deepgram] ✅ Source node disconnected');
      } catch (error) {
        console.warn('[Deepgram] Error disconnecting source:', error);
      }
      this.sourceNode = null;
    }

    // Close audio context
    if (this.audioContext) {
      try {
        if (this.audioContext.state !== 'closed') {
          this.audioContext.close();
          console.log('[Deepgram] ✅ Audio context closed');
        }
      } catch (error) {
        console.warn('[Deepgram] Error closing audio context:', error);
      }
      this.audioContext = null;
    }

    // CRITICAL: Remove all event listeners BEFORE disconnecting
    // This prevents events from firing after disconnect
    if (this.client) {
      try {
        // Remove all event listeners
        this.eventHandlers.forEach((handler, eventName) => {
          try {
            (this.client as any).off(AgentEvents[eventName as keyof typeof AgentEvents], handler);
            console.log('[Deepgram] ✅ Removed event listener:', eventName);
          } catch (error) {
            console.warn('[Deepgram] Error removing event listener:', eventName, error);
          }
        });
        this.eventHandlers.clear();
        console.log('[Deepgram] ✅ All event listeners removed');
      } catch (error) {
        console.warn('[Deepgram] Error removing event listeners:', error);
      }

      // Close WebSocket connection
      try {
        this.client.disconnect();
        console.log('[Deepgram] ✅ WebSocket disconnected (mute)');
      } catch (error) {
        console.warn('[Deepgram] Error disconnecting WebSocket on mute:', error);
      }
      this.client = null;
    }

    // Clear keep-alive interval
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
      console.log('[Deepgram] ✅ Cleared keep-alive interval');
    }

    // Notify connection callback that we're disconnected
    this.onConnectionCallback?.(false);

    console.log('[Deepgram] ✅ Microphone stopped and WebSocket closed');
  }

  disconnect(): void {
    console.log('[Deepgram] 🔌 Disconnecting...');
    
    // Set disconnect flag FIRST to prevent any new events from being processed
    this.isDisconnected = true;
    
    // Stop microphone first
    this.stopMicrophone();

    // Stop current audio playback
    if (this.currentAudioSource) {
      try {
        this.currentAudioSource.stop();
        this.currentAudioSource = null;
        console.log('[Deepgram] ✅ Stopped current audio source');
      } catch (error) {
        console.warn('[Deepgram] Error stopping audio source:', error);
      }
    }
    
    // Clear audio queue
    this.audioQueue = [];
    this.nextStartTime = 0;
    this.isProcessingAudio = false;

    // Remove all event listeners and disconnect WebSocket
    if (this.client) {
      try {
        // Remove all event listeners
        this.eventHandlers.forEach((handler, eventName) => {
          try {
            (this.client as any).off(AgentEvents[eventName as keyof typeof AgentEvents], handler);
            console.log('[Deepgram] ✅ Removed event listener:', eventName);
          } catch (error) {
            console.warn('[Deepgram] Error removing event listener:', eventName, error);
          }
        });
        this.eventHandlers.clear();
        console.log('[Deepgram] ✅ All event listeners removed');
      } catch (error) {
        console.warn('[Deepgram] Error removing event listeners:', error);
      }

      // Disconnect WebSocket
      try {
        this.client.disconnect();
        console.log('[Deepgram] ✅ Disconnected WebSocket client');
      } catch (error) {
        console.warn('[Deepgram] Error disconnecting client:', error);
      }
      this.client = null;
    }

    // Clear keep-alive
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }

    // Close audio context
    if (this.audioContext) {
      try {
        this.audioContext.close();
        console.log('[Deepgram] ✅ Closed audio context');
      } catch (error) {
        console.warn('[Deepgram] Error closing audio context:', error);
      }
      this.audioContext = null;
    }

    this.onConnectionCallback?.(false);
    console.log('[Deepgram] ✅ Disconnection complete');
  }

  isConnected(): boolean {
    return this.client !== null;
  }
}
