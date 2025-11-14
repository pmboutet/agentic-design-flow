/**
 * Audio management for Speechmatics Voice Agent
 * Handles microphone input, audio playback, VAD, and barge-in
 */

import { AudioChunkDedupe } from './speechmatics-audio-dedupe';

export class SpeechmaticsAudio {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: AudioWorkletNode | null = null;
  private currentAudioSource: AudioBufferSourceNode | null = null;
  private currentGainNode: GainNode | null = null;
  private audioPlaybackQueue: AudioBuffer[] = [];
  private isPlayingAudio: boolean = false;
  private nextStartTime: number = 0;
  private isMicrophoneActive: boolean = false;
  private isMuted: boolean = false;
  private isFirefox: boolean;
  
  private lastUserSpeechTimestamp: number = 0;
  private lastBargeInTime: number = 0;
  private readonly BARGE_IN_COOLDOWN_MS = 750;
  private readonly BASE_VAD_RMS_THRESHOLD = 0.015; // ~-36 dB threshold (base)
  private vadRmsThreshold: number = 0.015; // Dynamic threshold based on sensitivity
  private readonly VAD_SAMPLE_STRIDE = 4;
  
  // VAD state for continuous voice activity tracking
  private recentVoiceActivity: boolean[] = []; // Sliding window of recent VAD results
  private readonly VAD_WINDOW_SIZE = 5; // Number of chunks to track
  private hasRecentVoiceActivity: boolean = false; // Cached result

  constructor(
    private audioDedupe: AudioChunkDedupe,
    private onAudioChunk: (chunk: Int16Array) => void,
    private ws: WebSocket | null
  ) {
    this.isFirefox = typeof navigator !== 'undefined' && navigator.userAgent.includes('Firefox');
  }

  async startMicrophone(deviceId?: string, voiceIsolation: boolean = true): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to Speechmatics');
    }

    // Configure audio constraints
    let audioConstraints: MediaTrackConstraints;
    
    if (this.isFirefox) {
      audioConstraints = {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: voiceIsolation,
        noiseSuppression: false, // Firefox doesn't support noiseSuppression well
      };
    } else {
      audioConstraints = {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: voiceIsolation,
        noiseSuppression: voiceIsolation,
        autoGainControl: voiceIsolation,
        sampleRate: 16000,
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

    // Get microphone stream
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: finalConstraints
    });
    this.mediaStream = stream;

    // Create audio context
    let audioContext: AudioContext;
    if (this.isFirefox) {
      audioContext = new AudioContext();
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } else {
      audioContext = new AudioContext({ sampleRate: 16000 });
    }
    this.audioContext = audioContext;

    // Create source from stream
    const source = audioContext.createMediaStreamSource(stream);
    this.sourceNode = source;

    // Load AudioWorklet module
    try {
      await audioContext.audioWorklet.addModule('/speechmatics-audio-processor.js');
    } catch (error) {
      console.error('[Speechmatics] ❌ Failed to load AudioWorklet module:', error);
      throw new Error(`Failed to load AudioWorklet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Create AudioWorkletNode
    const processorOptions = {
      processorOptions: {
        isFirefox: this.isFirefox
      },
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1
    };
    
    const processor = new AudioWorkletNode(audioContext, 'speechmatics-audio-processor', processorOptions);
    this.processorNode = processor;

    this.isMicrophoneActive = true;
    this.isMuted = false;
    this.lastUserSpeechTimestamp = 0;
    this.lastBargeInTime = 0;
    
    // Reset VAD state
    this.recentVoiceActivity = [];
    this.hasRecentVoiceActivity = false;
    
    // Reset dedupe cache
    this.audioDedupe.reset();

    // Handle audio data from AudioWorklet
    processor.port.onmessage = (event) => {
      // CRITICAL: Check flags FIRST to prevent any audio from being sent after disconnect
      // According to Speechmatics API: "Protocol specification doesn't allow adding audio after EndOfStream"
      if (!this.isMicrophoneActive || this.isMuted) {
        return; // Stop immediately if microphone is inactive or muted
      }

      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return; // Stop if WebSocket is not open
      }

      if (event.data.type === 'audio') {
        // Triple-check microphone state (race condition protection)
        // This ensures no audio is sent after stopMicrophone() is called
        if (!this.isMicrophoneActive || this.isMuted) {
          return;
        }

        const pcmData = new Int16Array(event.data.data);
        
        // Check for barge-in
        if (!this.isMuted && this.isPlayingAudio && this.detectVoiceActivity(pcmData)) {
          this.handleBargeIn();
        }
        
        // Update VAD sliding window
        const hasVoiceActivity = this.detectVoiceActivity(pcmData);
        this.recentVoiceActivity.push(hasVoiceActivity);
        if (this.recentVoiceActivity.length > this.VAD_WINDOW_SIZE) {
          this.recentVoiceActivity.shift();
        }
        
        // Calculate if we have recent voice activity (at least 2 out of last 5 chunks)
        const activeChunks = this.recentVoiceActivity.filter(v => v).length;
        this.hasRecentVoiceActivity = activeChunks >= 2;
        
        // VAD filter: Only send audio chunks if we have recent voice activity
        // This filters out background noise and distant conversations while allowing
        // natural speech pauses (we send a few chunks after voice stops)
        if (!this.hasRecentVoiceActivity && !hasVoiceActivity) {
          return; // Skip silent/background audio chunks
        }
        
        // Deduplicate and send
        const signature = this.audioDedupe.computeChunkSignature(pcmData);
        if (this.audioDedupe.shouldSkipChunk(signature)) {
          return;
        }

        // Send audio to WebSocket (chunks with voice activity or recent voice activity)
        try {
          if (this.ws) {
            this.ws.send(pcmData.buffer);
          }
        } catch (error) {
          console.error('[Speechmatics] ❌ Error sending audio:', error);
        }
      }
    };

    // Connect audio graph
    source.connect(processor);
    processor.connect(audioContext.destination);
  }

  async stopMicrophone(): Promise<void> {
    console.log('[Speechmatics] 🎤 stopMicrophone() called', {
      timestamp: new Date().toISOString(),
      isMicrophoneActive: this.isMicrophoneActive,
      isMuted: this.isMuted,
      hasProcessor: !!this.processorNode,
      hasMediaStream: !!this.mediaStream,
    });
    
    // CRITICAL: Set flags FIRST to stop any audio from being sent
    // This must happen before we stop the stream to prevent race conditions
    this.isMicrophoneActive = false;
    this.isMuted = false;
    this.stopAgentSpeech(false);
    console.log('[Speechmatics] ✅ Flags set: isMicrophoneActive=false, isMuted=false');

    // Clear AudioWorklet handler FIRST to stop processing new audio chunks
    // This prevents any audio from being sent after we start disconnecting
    if (this.processorNode) {
      try {
        console.log('[Speechmatics] 🧹 Clearing AudioWorklet handler...');
        // Clear the message handler FIRST - this stops all audio processing
        this.processorNode.port.onmessage = null;
        console.log('[Speechmatics] ✅ AudioWorklet handler cleared');
        // Then send stop message to AudioWorklet
        this.processorNode.port.postMessage({ type: 'stop' });
        // Finally disconnect
        this.processorNode.disconnect();
        this.processorNode = null;
        console.log('[Speechmatics] ✅ AudioWorklet processor disconnected');
      } catch (error) {
        console.warn('[Speechmatics] ❌ Error stopping processor:', error);
      }
    } else {
      console.log('[Speechmatics] ℹ️ No processor node to stop');
    }

    // Stop media stream tracks AFTER clearing handler
    // This ensures no new audio chunks are generated
    // CRITICAL: Stop ALL tracks (audio + video if present) to fully release the microphone
    if (this.mediaStream) {
      try {
        console.log('[Speechmatics] 🛑 Stopping media stream tracks...');
        const tracks = this.mediaStream.getTracks();
        tracks.forEach(track => {
          if (track.readyState === 'live') {
            track.stop();
            console.log('[Speechmatics] ✅ Track stopped:', track.kind, track.label);
          }
        });
        this.mediaStream = null;
        console.log('[Speechmatics] ✅ Media stream cleared', { trackCount: tracks.length });
      } catch (error) {
        console.warn('[Speechmatics] ❌ Error stopping media stream:', error);
      }
    } else {
      console.log('[Speechmatics] ℹ️ No media stream to stop');
    }

    // CRITICAL: Disconnect ALL AudioNodes before closing AudioContext
    // This ensures no audio graph connections remain active
    // Order matters: disconnect nodes before closing context
    
    // Disconnect gain node if present (from audio playback)
    if (this.currentGainNode) {
      try {
        this.currentGainNode.disconnect();
        this.currentGainNode = null;
        console.log('[Speechmatics] ✅ Gain node disconnected');
      } catch (error) {
        console.warn('[Speechmatics] ⚠️ Error disconnecting gain node:', error);
      }
    }

    // Disconnect source node
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
        this.sourceNode = null;
        console.log('[Speechmatics] ✅ Source node disconnected');
      } catch (error) {
        console.warn('[Speechmatics] ⚠️ Error disconnecting source node:', error);
      }
    }

    // Close audio context AFTER all nodes are disconnected
    if (this.audioContext) {
      try {
        if (this.audioContext.state !== 'closed') {
          // audioContext.close() returns a Promise, but we don't need to await it
          // The context will close asynchronously, which is fine for cleanup
          this.audioContext.close().catch(() => {
            // Ignore errors during close
          });
          console.log('[Speechmatics] ✅ Audio context closing');
        }
        this.audioContext = null;
      } catch (error) {
        console.warn('[Speechmatics] ⚠️ Error closing audio context:', error);
      }
    }

    // NOTE: enumerateDevices() is now called AFTER WebSocket disconnect in speechmatics.ts
    // This ensures all resources are fully released before forcing browser cleanup
  }

  setMicrophoneMuted(muted: boolean): void {
    this.isMuted = muted;
    const hasStream = Boolean(this.mediaStream);
    this.isMicrophoneActive = !muted && hasStream;

    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach(track => {
        if (track.readyState === 'live') {
          track.enabled = !muted;
        }
      });
    }

    if (muted) {
      this.stopAgentSpeech(true);
    } else if (!hasStream) {
      this.isMicrophoneActive = false;
    }
  }

  /**
   * Set microphone sensitivity
   * @param sensitivity Multiplier for VAD threshold (0.5 = more sensitive, 2.0 = less sensitive)
   * Higher values = less sensitive = ignores distant/quieter sounds
   */
  setMicrophoneSensitivity(sensitivity: number = 1.0): void {
    // Clamp sensitivity between 0.3 and 3.0
    const clampedSensitivity = Math.max(0.3, Math.min(3.0, sensitivity));
    this.vadRmsThreshold = this.BASE_VAD_RMS_THRESHOLD * clampedSensitivity;
    console.log('[Speechmatics] 🎚️ Microphone sensitivity set:', {
      sensitivity: clampedSensitivity,
      vadThreshold: this.vadRmsThreshold,
      description: clampedSensitivity > 1.0 ? 'Less sensitive (ignores distant sounds)' : 'More sensitive (captures quieter sounds)'
    });
  }

  async playAudio(audioData: Uint8Array): Promise<void> {
    if (!this.audioContext) {
      console.warn('[Speechmatics] ⚠️ No audio context for playback');
      return;
    }

    try {
      const buffer = await this.audioDataToBuffer(audioData);
      this.audioPlaybackQueue.push(buffer);
      if (!this.isPlayingAudio) {
        this.playAudioBuffer();
      }
    } catch (error) {
      console.error('[Speechmatics] ❌ Error playing audio:', error);
      this.isPlayingAudio = false;
    }
  }

  private playAudioBuffer(): void {
    if (!this.audioContext) {
      return;
    }

    const nextBuffer = this.audioPlaybackQueue.shift();
    if (!nextBuffer) {
      this.isPlayingAudio = false;
      this.currentAudioSource = null;
      this.currentGainNode = null;
      this.nextStartTime = this.audioContext.currentTime;
      return;
    }

    this.isPlayingAudio = true;

    const source = this.audioContext.createBufferSource();
    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = 1.0;

    source.buffer = nextBuffer;
    source.playbackRate.value = 1.0;
    source.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    this.currentAudioSource = source;
    this.currentGainNode = gainNode;

    source.onended = () => {
      if (this.currentGainNode) {
        this.currentGainNode.disconnect();
      }
      source.disconnect();
      this.currentAudioSource = null;
      this.currentGainNode = null;

      if (this.audioPlaybackQueue.length > 0) {
        this.playAudioBuffer();
      } else {
        this.isPlayingAudio = false;
        this.nextStartTime = this.audioContext ? this.audioContext.currentTime : 0;
      }
    };

    source.start();
  }

  private stopAgentSpeech(applyFade: boolean): void {
    if (!this.audioContext) {
      this.audioPlaybackQueue = [];
      this.isPlayingAudio = false;
      this.currentAudioSource = null;
      this.currentGainNode = null;
      return;
    }

    if (!this.currentAudioSource) {
      this.audioPlaybackQueue = [];
      this.isPlayingAudio = false;
      return;
    }

    const source = this.currentAudioSource;
    const gainNode = this.currentGainNode;
    source.onended = null;
    this.audioPlaybackQueue = [];
    this.isPlayingAudio = false;
    this.nextStartTime = this.audioContext.currentTime;

    try {
      if (gainNode) {
        const now = this.audioContext.currentTime;
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);

        if (applyFade) {
          const fadeEnd = now + 0.1;
          gainNode.gain.linearRampToValueAtTime(0.0001, fadeEnd);
          source.stop(fadeEnd);
        } else {
          source.stop();
        }

        gainNode.disconnect();
      } else {
        source.stop();
      }
    } catch (error) {
      console.warn('[Speechmatics] Error stopping agent speech:', error);
      try {
        source.stop();
      } catch {
        // Ignore additional errors
      }
    } finally {
      source.disconnect();
      this.currentAudioSource = null;
      this.currentGainNode = null;
    }
  }

  private detectVoiceActivity(chunk: Int16Array): boolean {
    if (!chunk.length) {
      return false;
    }

    let sumSquares = 0;
    let samples = 0;

    for (let i = 0; i < chunk.length; i += this.VAD_SAMPLE_STRIDE) {
      const sample = chunk[i] / 32768;
      sumSquares += sample * sample;
      samples++;
    }

    if (samples === 0) {
      return false;
    }

    const rms = Math.sqrt(sumSquares / samples);
    return rms > this.vadRmsThreshold;
  }

  private handleBargeIn(): void {
    if (!this.isPlayingAudio) {
      return;
    }

    const now = Date.now();
    if (now - this.lastBargeInTime < this.BARGE_IN_COOLDOWN_MS) {
      return;
    }

    this.lastBargeInTime = now;
    this.lastUserSpeechTimestamp = now;
    this.stopAgentSpeech(true);
  }

  private async audioDataToBuffer(audioData: Uint8Array): Promise<AudioBuffer> {
    if (!this.audioContext) {
      throw new Error('No audio context');
    }

    try {
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

  async streamToUint8Array(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
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

    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    return combined;
  }

  updateWebSocket(ws: WebSocket | null): void {
    this.ws = ws;
  }
}

