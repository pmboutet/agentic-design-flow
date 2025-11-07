import { DeepgramClient, AgentLiveClient, AgentEvents } from '@deepgram/sdk';
import type { AiModelConfig } from '@/types';

export interface DeepgramConfig {
  systemPrompt: string;
  sttModel?: string; // Speech-to-text model, default: "nova-2"
  ttsModel?: string; // Text-to-speech model, default: "aura-thalia-en"
  llmProvider?: "anthropic" | "openai";
  llmModel?: string;
}

export interface DeepgramMessageEvent {
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
}

export type DeepgramMessageCallback = (message: DeepgramMessageEvent) => void;
export type DeepgramErrorCallback = (error: Error) => void;
export type DeepgramConnectionCallback = (connected: boolean) => void;

export class DeepgramVoiceAgent {
  private client: AgentLiveClient | null = null;
  private token: string | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private audioQueue: Uint8Array[] = [];
  private nextStartTime: number = 0;
  private currentAudioSource: AudioBufferSourceNode | null = null;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private isFirefox: boolean;
  private config: DeepgramConfig | null = null;
  
  // Callbacks
  private onMessageCallback: DeepgramMessageCallback | null = null;
  private onErrorCallback: DeepgramErrorCallback | null = null;
  private onConnectionCallback: DeepgramConnectionCallback | null = null;

  constructor() {
    this.isFirefox = typeof navigator !== 'undefined' && navigator.userAgent.includes('Firefox');
  }

  setCallbacks(callbacks: {
    onMessage?: DeepgramMessageCallback;
    onError?: DeepgramErrorCallback;
    onConnection?: DeepgramConnectionCallback;
  }) {
    this.onMessageCallback = callbacks.onMessage || null;
    this.onErrorCallback = callbacks.onError || null;
    this.onConnectionCallback = callbacks.onConnection || null;
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
        
        const settings = {
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
                model: config.sttModel || "nova-2"
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
      client.on(AgentEvents.ConversationText, (message) => {
        console.log('[Deepgram] 💬 ConversationText:', message.role, ':', message.content.substring(0, 100));
        this.onMessageCallback?.({
          role: message.role as 'user' | 'agent',
          content: message.content,
          timestamp: new Date().toISOString()
        });
      });

      // Handle Audio events (agent speaking)
      client.on(AgentEvents.Audio, async (audio: Uint8Array) => {
        console.log('[Deepgram] 🔊 Audio chunk received, size:', audio.length);
        this.audioQueue.push(audio);
        await this.processAudioQueue();
      });

      // Handle user started speaking (interrupt agent)
      client.on(AgentEvents.UserStartedSpeaking, () => {
        console.log('[Deepgram] 👤 User started speaking');
        this.audioQueue = [];
        this.nextStartTime = 0;
        if (this.currentAudioSource) {
          this.currentAudioSource.stop();
          this.currentAudioSource = null;
        }
      });

      // Handle agent started speaking
      client.on(AgentEvents.AgentStartedSpeaking, () => {
        console.log('[Deepgram] 🤖 Agent started speaking');
      });

      // Handle errors
      client.on(AgentEvents.Error, (error) => {
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
      });

      // Handle close
      client.on(AgentEvents.Close, (closeEvent) => {
        console.log('[Deepgram] ⚠️ Close event received:', closeEvent);
        this.onConnectionCallback?.(false);
        this.client = null;
      });

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

  async startMicrophone(): Promise<void> {
    console.log('[Deepgram] 🎤 Starting microphone...');
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
        echoCancellation: true,
        noiseSuppression: false,
      };
    } else {
      audioConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 24000,
        channelCount: 1
      };
    }

    console.log('[Deepgram] Requesting microphone access with constraints:', audioConstraints);
    // Get microphone stream
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints
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

    // Create processor for audio capture
    const processor = audioContext.createScriptProcessor(2048, 1, 1);
    this.processorNode = processor;
    console.log('[Deepgram] ScriptProcessor created');

    let audioChunkCount = 0;
    processor.onaudioprocess = (audioProcessingEvent) => {
      if (!this.client) return;

      const inputBuffer = audioProcessingEvent.inputBuffer;
      const inputData = inputBuffer.getChannelData(0); // Float32Array

      // Handle downsampling for Firefox (48kHz → 24kHz)
      let processedData: Float32Array;
      if (isFirefox) {
        const downsampledLength = Math.floor(inputData.length / 2);
        processedData = new Float32Array(downsampledLength);
        for (let i = 0; i < downsampledLength; i++) {
          processedData[i] = inputData[i * 2];
        }
      } else {
        processedData = inputData;
      }

      // Convert Float32 [-1, 1] → Int16 [-32768, 32767]
      const pcmData = new Int16Array(processedData.length);
      for (let i = 0; i < processedData.length; i++) {
        const sample = Math.max(-1, Math.min(1, processedData[i]));
        pcmData[i] = Math.round(sample * 0x7FFF);
      }

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
    };

    // Connect audio graph
    source.connect(processor);
    processor.connect(audioContext.destination);
    console.log('[Deepgram] ✅ Audio graph connected, microphone is active');
  }

  private async processAudioQueue(): Promise<void> {
    if (this.audioQueue.length === 0 || !this.audioContext) return;

    try {
      const audioContext = this.audioContext;
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
            }
          }
        };
      }
    } catch (error) {
      console.error('Audio queue processing error', error);
    }
  }

  stopMicrophone(): void {
    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  disconnect(): void {
    // Stop microphone
    this.stopMicrophone();

    // Stop audio playback
    if (this.currentAudioSource) {
      this.currentAudioSource.stop();
      this.currentAudioSource = null;
    }
    this.audioQueue = [];
    this.nextStartTime = 0;

    // Disconnect WebSocket
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }

    // Clear keep-alive
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }

    this.onConnectionCallback?.(false);
  }

  isConnected(): boolean {
    return this.client !== null;
  }
}

