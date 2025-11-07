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
    const response = await fetch('/api/token', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Authentication failed: ${errorText}`);
    }

    const data = await response.json();
    this.token = data.token;
    if (!this.token) {
      throw new Error('Failed to get Deepgram token');
    }
    return this.token;
  }

  async connect(config: DeepgramConfig): Promise<void> {
    if (!this.token) {
      await this.authenticate();
    }

    if (!this.token) {
      throw new Error('No token available');
    }

    this.config = config;
    const client = new DeepgramClient({ accessToken: this.token }).agent();
    this.client = client;

    // Handle Welcome event
    client.once(AgentEvents.Welcome, (welcomeMessage) => {
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
              model: config.ttsModel || "aura-thalia-en"
            }
          },
          think: {
            provider: {
              type: config.llmProvider || "anthropic",
              model: config.llmModel || (config.llmProvider === "openai" ? "gpt-4o" : "claude-3-5-sonnet-20241022")
            },
            prompt: config.systemPrompt
          }
        }
      };
      client.configure(settings);
    });

    // Handle SettingsApplied event
    client.once(AgentEvents.SettingsApplied, () => {
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
    });

    // Handle ConversationText events (transcriptions and agent responses)
    client.on(AgentEvents.ConversationText, (message) => {
      this.onMessageCallback?.({
        role: message.role as 'user' | 'agent',
        content: message.content,
        timestamp: new Date().toISOString()
      });
    });

    // Handle Audio events (agent speaking)
    client.on(AgentEvents.Audio, async (audio: Uint8Array) => {
      this.audioQueue.push(audio);
      await this.processAudioQueue();
    });

    // Handle user started speaking (interrupt agent)
    client.on(AgentEvents.UserStartedSpeaking, () => {
      this.audioQueue = [];
      this.nextStartTime = 0;
      if (this.currentAudioSource) {
        this.currentAudioSource.stop();
        this.currentAudioSource = null;
      }
    });

    // Handle errors
    client.on(AgentEvents.Error, (error) => {
      const err = new Error(`Deepgram Agent error: ${error.message}`);
      this.onErrorCallback?.(err);
      this.disconnect();
    });

    // Handle close
    client.on(AgentEvents.Close, () => {
      this.onConnectionCallback?.(false);
      this.client = null;
    });
  }

  async startMicrophone(): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected to Deepgram');
    }

    // Configure audio constraints
    const isFirefox = this.isFirefox;
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

    // Get microphone stream
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints
    });
    this.mediaStream = stream;

    // Create audio context
    let audioContext: AudioContext;
    if (isFirefox) {
      audioContext = new AudioContext();
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } else {
      audioContext = new AudioContext({ sampleRate: 24000 });
    }
    this.audioContext = audioContext;

    // Create source from stream
    const source = audioContext.createMediaStreamSource(stream);
    this.sourceNode = source;

    // Create processor for audio capture
    const processor = audioContext.createScriptProcessor(2048, 1, 1);
    this.processorNode = processor;

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
      } catch (error) {
        console.error('Error sending audio to agent:', error);
      }
    };

    // Connect audio graph
    source.connect(processor);
    processor.connect(audioContext.destination);
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

