// AudioWorkletProcessor pour traiter l'audio du microphone pour Speechmatics
// Speechmatics nécessite PCM16 16kHz mono
// Accumule les buffers jusqu'à 8192 samples avant d'envoyer

class SpeechmaticsAudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.isActive = true;
    this.isFirefox = options.processorOptions?.isFirefox || false;
    this.bufferAccumulator = new Float32Array(0); // Accumulateur pour atteindre 8192 samples
    this.targetBufferSize = 8192; // Taille cible du buffer
    this.targetSampleRate = 16000; // Speechmatics nécessite 16kHz
    
    // Écouter les messages du thread principal
    this.port.onmessage = (event) => {
      if (event.data.type === 'stop') {
        this.isActive = false;
        // CRITICAL: Clear the buffer immediately instead of flushing it
        // We don't want to send any more audio data when muted
        this.bufferAccumulator = new Float32Array(0);
        console.log('[SpeechmaticsAudioWorklet] Stopped and cleared buffer');
      } else if (event.data.type === 'start') {
        this.isActive = true;
        console.log('[SpeechmaticsAudioWorklet] Started');
      }
    };
  }

  flushBuffer() {
    if (this.bufferAccumulator.length > 0) {
      // Convert Float32 [-1, 1] → Int16 [-32768, 32767]
      const pcmData = new Int16Array(this.bufferAccumulator.length);
      for (let i = 0; i < this.bufferAccumulator.length; i++) {
        const sample = Math.max(-1, Math.min(1, this.bufferAccumulator[i]));
        pcmData[i] = Math.round(sample * 0x7FFF);
      }

      // Envoyer les données audio au thread principal
      this.port.postMessage({
        type: 'audio',
        data: pcmData.buffer
      }, [pcmData.buffer]);

      this.bufferAccumulator = new Float32Array(0);
    }
  }

  // Downsample to 16kHz
  downsampleTo16kHz(inputData, inputSampleRate) {
    const ratio = inputSampleRate / this.targetSampleRate;
    const outputLength = Math.floor(inputData.length / ratio);
    const output = new Float32Array(outputLength);
    
    for (let i = 0; i < outputLength; i++) {
      const sourceIndex = Math.floor(i * ratio);
      output[i] = inputData[sourceIndex];
    }
    
    return output;
  }

  process(inputs, outputs) {
    if (!this.isActive) {
      return true; // Continue le processing même si inactif
    }

    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }

    const inputChannel = input[0]; // Float32Array
    if (!inputChannel || inputChannel.length === 0) {
      return true;
    }

    // Get the actual sample rate from the AudioContext
    // We need to downsample to 16kHz for Speechmatics
    // The AudioContext is created with 16kHz, but browsers may provide different rates
    let processedData;
    
    // Downsample if needed (handle Firefox 48kHz or other sample rates)
    if (this.isFirefox) {
      // Firefox typically provides 48kHz, downsample to 16kHz
      processedData = this.downsampleTo16kHz(inputChannel, 48000);
    } else {
      // Most browsers will provide the requested sample rate, but we downsample to be safe
      // If AudioContext is 16kHz, no downsampling needed
      // If it's higher (e.g., 44.1kHz or 48kHz), downsample
      const currentSampleRate = sampleRate || 44100; // Default fallback
      if (currentSampleRate > this.targetSampleRate) {
        processedData = this.downsampleTo16kHz(inputChannel, currentSampleRate);
      } else {
        processedData = inputChannel;
      }
    }

    // Accumuler les données jusqu'à atteindre targetBufferSize
    const newLength = this.bufferAccumulator.length + processedData.length;
    const combinedBuffer = new Float32Array(newLength);
    combinedBuffer.set(this.bufferAccumulator);
    combinedBuffer.set(processedData, this.bufferAccumulator.length);
    this.bufferAccumulator = combinedBuffer;

    // Si on a atteint ou dépassé la taille cible, envoyer
    while (this.bufferAccumulator.length >= this.targetBufferSize) {
      // Double-check that we're still active before sending
      // This prevents race conditions where stop message arrives between checks
      if (!this.isActive) {
        this.bufferAccumulator = new Float32Array(0);
        break;
      }

      const chunkToSend = this.bufferAccumulator.slice(0, this.targetBufferSize);

      // Convert Float32 [-1, 1] → Int16 [-32768, 32767]
      const pcmData = new Int16Array(this.targetBufferSize);
      for (let i = 0; i < this.targetBufferSize; i++) {
        const sample = Math.max(-1, Math.min(1, chunkToSend[i]));
        pcmData[i] = Math.round(sample * 0x7FFF);
      }

      // Triple-check before actually sending the message
      if (!this.isActive) {
        this.bufferAccumulator = new Float32Array(0);
        break;
      }

      // Envoyer les données audio au thread principal
      this.port.postMessage({
        type: 'audio',
        data: pcmData.buffer
      }, [pcmData.buffer]);

      // Garder le reste pour le prochain cycle
      this.bufferAccumulator = this.bufferAccumulator.slice(this.targetBufferSize);
    }

    return true; // Continue le processing
  }
}

registerProcessor('speechmatics-audio-processor', SpeechmaticsAudioProcessor);

