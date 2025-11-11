/**
 * Transcription management for Speechmatics Voice Agent
 * Handles partial and final transcripts, deduplication, and message processing
 */

import type { SpeechmaticsMessageCallback } from './speechmatics-types';

export class TranscriptionManager {
  private lastPartialUserContent: string | null = null;
  private lastFinalUserContent: string | null = null;
  private pendingFinalTranscript: string | null = null;
  private currentStreamingMessageId: string | null = null;
  private lastProcessedContent: string | null = null;
  private silenceTimeout: NodeJS.Timeout | null = null;
  private readonly SILENCE_DETECTION_TIMEOUT = 1000; // 1 second of silence before processing

  constructor(
    private onMessageCallback: SpeechmaticsMessageCallback | null,
    private processUserMessage: (transcript: string) => Promise<void>,
    private conversationHistory: Array<{ role: 'user' | 'agent'; content: string }>
  ) {}

  /**
   * Calculate similarity between two strings
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const words1 = str1.toLowerCase().split(/\s+/);
    const words2 = str2.toLowerCase().split(/\s+/);
    const allWords = new Set([...words1, ...words2]);
    let commonWords = 0;
    
    for (const word of allWords) {
      if (words1.includes(word) && words2.includes(word)) {
        commonWords++;
      }
    }
    
    if (allWords.size === 0) return 0;
    return commonWords / allWords.size;
  }

  /**
   * Reset silence timeout
   */
  resetSilenceTimeout(): void {
    // Clear existing timeout
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
      this.silenceTimeout = null;
    }
    
    // Set new timeout to detect end of speech
    this.silenceTimeout = setTimeout(() => {
      this.processPendingTranscript();
    }, this.SILENCE_DETECTION_TIMEOUT);
  }

  /**
   * Process pending transcript when silence is detected
   */
  async processPendingTranscript(): Promise<void> {
    // Clear silence timeout
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
      this.silenceTimeout = null;
    }
    
    // Process pending transcript if we have one
    if (this.pendingFinalTranscript && this.pendingFinalTranscript.trim()) {
      const finalMessage = this.pendingFinalTranscript.trim();
      
      // Skip if message is only punctuation (should have been handled in handleFinalTranscript)
      if (this.isOnlyPunctuation(finalMessage)) {
        console.log('[Transcription] ⏸️ Skipping punctuation-only final message:', finalMessage);
        this.pendingFinalTranscript = null;
        this.lastPartialUserContent = null;
        this.currentStreamingMessageId = null;
        return;
      }
      
      // Skip if this is the same as the last processed message (duplicate)
      if (finalMessage === this.lastProcessedContent) {
        console.log('[Transcription] ⏸️ Skipping duplicate final message:', finalMessage.substring(0, 30));
        this.pendingFinalTranscript = null;
        this.lastPartialUserContent = null;
        this.currentStreamingMessageId = null;
        return;
      }
      
      // Skip if message is too short (less than 2 characters) - likely noise
      if (finalMessage.length < 2) {
        console.log('[Transcription] ⏸️ Skipping too-short message:', finalMessage);
        this.pendingFinalTranscript = null;
        this.lastPartialUserContent = null;
        this.currentStreamingMessageId = null;
        return;
      }
      
      this.pendingFinalTranscript = null;
      this.lastPartialUserContent = null;
      this.lastFinalUserContent = finalMessage;
      this.lastProcessedContent = finalMessage;
      const messageId = this.currentStreamingMessageId;
      this.currentStreamingMessageId = null;
      
      console.log('[Transcription] ✅ Sending FINAL message:', {
        messageId,
        content: finalMessage.substring(0, 50) + '...',
        length: finalMessage.length,
      });
      
      // Add to conversation history
      this.conversationHistory.push({ role: 'user', content: finalMessage });
      
      // Notify callback with final message
      this.onMessageCallback?.({
        role: 'user',
        content: finalMessage,
        timestamp: new Date().toISOString(),
        isInterim: false,
        messageId: messageId || undefined,
      });

      // Process user message and generate response
      // This will trigger LLM response and TTS
      await this.processUserMessage(finalMessage);
    }
  }

  /**
   * Handle partial transcript from Speechmatics
   */
  handlePartialTranscript(transcript: string): void {
    if (!transcript || !transcript.trim()) return;

    const trimmedTranscript = transcript.trim();
    
    // Skip if we've already processed a final message for this session
    // This prevents new partials from appearing after a message was finalized
    if (this.lastProcessedContent && !this.pendingFinalTranscript) {
      // Only skip if we don't have a pending transcript (new message starting)
      // If we have a pending transcript, we're still in the same message flow
      return;
    }
    
    // Skip if exactly the same as last partial (duplicate)
    if (trimmedTranscript === this.lastPartialUserContent) {
      return;
    }
    
    // Skip if very similar to last partial
    if (this.lastPartialUserContent && 
        trimmedTranscript.length > 10 && 
        this.lastPartialUserContent.length > 10) {
      const similarity = this.calculateSimilarity(trimmedTranscript, this.lastPartialUserContent);
      if (similarity > 0.9) {
        return; // Skip duplicate
      }
    }
    
    this.lastPartialUserContent = trimmedTranscript;
    
    // Only update UI if we don't have a pending final transcript
    // Final transcripts are more accurate, so we prioritize them
    if (!this.pendingFinalTranscript) {
      // Create or update streaming message with same ID
      // Reuse existing ID if available (same message stream)
      if (!this.currentStreamingMessageId) {
        this.currentStreamingMessageId = `stream-${Date.now()}`;
      }
      
      const messageId = this.currentStreamingMessageId || undefined;
      console.log('[Transcription] 📝 Sending PARTIAL message:', {
        messageId,
        content: trimmedTranscript.substring(0, 50) + '...',
        hasPendingFinal: !!this.pendingFinalTranscript,
        lastProcessed: this.lastProcessedContent?.substring(0, 30),
      });
      
      this.onMessageCallback?.({
        role: 'user',
        content: trimmedTranscript,
        timestamp: new Date().toISOString(),
        isInterim: true,
        messageId,
      });
    } else {
      console.log('[Transcription] ⏸️ Skipping partial (has pending final):', {
        content: trimmedTranscript.substring(0, 50) + '...',
        pendingFinal: this.pendingFinalTranscript?.substring(0, 50) + '...',
      });
    }
  }

  /**
   * Check if a transcript is only punctuation
   */
  private isOnlyPunctuation(text: string): boolean {
    // Remove whitespace and check if only punctuation remains
    const cleaned = text.trim().replace(/\s+/g, '');
    if (cleaned.length === 0) return true;
    
    // Check if all characters are punctuation (common punctuation marks)
    // Allow up to 10 characters to catch cases like "...." or "???"
    const punctuationRegex = /^[.,!?;:…\-—–'"]+$/;
    return punctuationRegex.test(cleaned) && cleaned.length <= 10;
  }

  /**
   * Handle final transcript from Speechmatics
   */
  handleFinalTranscript(transcript: string): void {
    if (!transcript || !transcript.trim()) return;

    const trimmedTranscript = transcript.trim();
    
    // Skip messages that are only punctuation (like ".", "?", "!")
    // These are often sent as separate final messages but should be ignored
    if (this.isOnlyPunctuation(trimmedTranscript)) {
      console.log('[Transcription] ⏸️ Skipping punctuation-only message:', trimmedTranscript);
      
      // If we have a pending transcript, append the punctuation to it instead
      if (this.pendingFinalTranscript) {
        this.pendingFinalTranscript += trimmedTranscript;
        console.log('[Transcription] 📝 Appended punctuation to pending transcript');
      }
      return;
    }
    
    // Skip if exactly the same as last final transcript
    if (trimmedTranscript === this.lastFinalUserContent) {
      return;
    }
    
    // Skip if very similar to last final transcript
    if (this.lastFinalUserContent && 
        trimmedTranscript.length > 10 && 
        this.lastFinalUserContent.length > 10) {
      const similarity = this.calculateSimilarity(trimmedTranscript, this.lastFinalUserContent);
      if (similarity > 0.95) {
        return; // Skip duplicate
      }
    }
    
    // Check if this transcript is a continuation or a new segment
    if (this.pendingFinalTranscript) {
      const pendingTrimmed = this.pendingFinalTranscript.trim();
      
      // Check if the new transcript is a continuation
      if (trimmedTranscript.startsWith(pendingTrimmed)) {
        this.pendingFinalTranscript = trimmedTranscript;
      } else if (pendingTrimmed.startsWith(trimmedTranscript)) {
        // New transcript is prefix of pending, keep longer version
        return;
      } else if (pendingTrimmed.endsWith(trimmedTranscript)) {
        // New transcript is suffix of pending, keep longer version
        return;
      } else {
        // Check similarity
        const similarity = this.calculateSimilarity(trimmedTranscript, pendingTrimmed);
        if (similarity > 0.8) {
          // Very similar - likely a correction
          if (trimmedTranscript.length > pendingTrimmed.length) {
            this.pendingFinalTranscript = trimmedTranscript;
          } else {
            return; // Keep longer version
          }
        } else {
          // New segment - append
          this.pendingFinalTranscript += ' ' + trimmedTranscript;
        }
      }
    } else {
      // Start a new pending transcript
      // This is a new message, so reset lastProcessedContent to allow new partials
      this.lastProcessedContent = null;
      this.pendingFinalTranscript = trimmedTranscript;
      // Reuse existing messageId if available (continuing same stream)
      // Otherwise create a new one
      if (!this.currentStreamingMessageId) {
        this.currentStreamingMessageId = `stream-${Date.now()}`;
      }
    }
    
    // Update lastFinalUserContent
    this.lastFinalUserContent = trimmedTranscript;
    
    // Reset silence timeout - wait for more input or silence
    this.resetSilenceTimeout();
  }

  /**
   * Cleanup on disconnect
   */
  cleanup(): void {
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
      this.silenceTimeout = null;
    }
    this.pendingFinalTranscript = null;
    this.lastPartialUserContent = null;
    this.lastFinalUserContent = null;
    this.lastProcessedContent = null;
    this.currentStreamingMessageId = null;
  }
}

