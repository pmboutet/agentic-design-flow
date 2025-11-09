/**
 * ElevenLabs Text-to-Speech API integration
 * Provides streaming TTS capabilities for voice agents
 */

export interface ElevenLabsConfig {
  apiKey: string;
  voiceId?: string; // Default voice ID if not specified
  modelId?: string; // TTS model ID (default: "eleven_turbo_v2_5")
  stability?: number; // 0.0 to 1.0
  similarityBoost?: number; // 0.0 to 1.0
  style?: number; // 0.0 to 1.0
  useSpeakerBoost?: boolean;
}

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
}

export class ElevenLabsTTS {
  private config: ElevenLabsConfig;
  private baseUrl = 'https://api.elevenlabs.io/v1';

  constructor(config: ElevenLabsConfig) {
    this.config = {
      voiceId: config.voiceId || '21m00Tcm4TlvDq8ikWAM', // Default: Rachel
      modelId: config.modelId || 'eleven_turbo_v2_5',
      stability: config.stability ?? 0.5,
      similarityBoost: config.similarityBoost ?? 0.75,
      style: config.style ?? 0.0,
      useSpeakerBoost: config.useSpeakerBoost ?? true,
      ...config,
    };
  }

  /**
   * Stream text-to-speech audio
   * Returns a ReadableStream of audio chunks
   */
  async streamTextToSpeech(
    text: string,
    voiceId?: string
  ): Promise<ReadableStream<Uint8Array>> {
    if (!text || text.trim().length === 0) {
      throw new Error('Text is required for text-to-speech');
    }
    
    const voice = voiceId || this.config.voiceId;
    if (!voice) {
      throw new Error('Voice ID is required for ElevenLabs TTS');
    }

    const url = `${this.baseUrl}/text-to-speech/${voice}/stream`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': this.config.apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: this.config.modelId,
        voice_settings: {
          stability: this.config.stability,
          similarity_boost: this.config.similarityBoost,
          style: this.config.style,
          use_speaker_boost: this.config.useSpeakerBoost,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error (${response.status}): ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body from ElevenLabs API');
    }

    // Convert the response stream to Uint8Array chunks
    const reader = response.body.getReader();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              break;
            }
            controller.enqueue(value);
          }
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      },
    });

    return stream;
  }

  /**
   * Get list of available voices
   */
  async getVoices(): Promise<ElevenLabsVoice[]> {
    const response = await fetch(`${this.baseUrl}/voices`, {
      headers: {
        'xi-api-key': this.config.apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data.voices || [];
  }

  /**
   * Convert audio stream to PCM format for Web Audio API
   * This is a simplified version - in production you might want to use a proper MP3 decoder
   */
  async streamToAudioBuffer(
    stream: ReadableStream<Uint8Array>,
    audioContext: AudioContext
  ): Promise<AudioBuffer> {
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

    // Decode MP3 to AudioBuffer
    // Note: This requires the browser to support MP3 decoding
    const audioBuffer = await audioContext.decodeAudioData(combined.buffer);
    return audioBuffer;
  }
}


