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
  private receivedEndOfUtterance: boolean = false; // Flag to track if EndOfUtterance was received
  private utteranceDebounceTimeout: NodeJS.Timeout | null = null;
  private lastPreviewContent: string | null = null;
  private readonly SILENCE_DETECTION_TIMEOUT = 1500; // Fail-safe timeout (1.5s) if no partial arrives
  private readonly UTTERANCE_FINALIZATION_DELAY = 600; // Wait 0.6s without new partial before finalising
  private readonly MIN_UTTERANCE_CHAR_LENGTH = 20;
  private readonly MIN_UTTERANCE_WORDS = 3;
  private readonly FRAGMENT_ENDINGS = new Set([
    'et','de','des','du','d\'','si','que','qu','le','la','les','nous','vous','je','tu','il','elle','on','mais','ou','donc','or','ni','car','à','en','pour','sur','avec'
  ]);

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
   * This is called every time we receive a new transcript chunk
   * The timeout only triggers if we don't receive any new chunks for SILENCE_DETECTION_TIMEOUT
   */
  resetSilenceTimeout(): void {
    // Clear existing timeout
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
      this.silenceTimeout = null;
    }
    
    // Only set timeout if we have a pending transcript
    // This ensures we wait for all chunks before processing
    if (this.pendingFinalTranscript && this.pendingFinalTranscript.trim()) {
      // Always set timeout - even if EndOfUtterance was received
      // This ensures we respect the full silence period before responding
      this.silenceTimeout = setTimeout(() => {
        console.log('[Transcription] ⏰ Silence timeout - processing message');
        this.processPendingTranscript(true);
      }, this.SILENCE_DETECTION_TIMEOUT);
    }
  }

  /**
   * Mark that EndOfUtterance was received from Speechmatics
   * This signals that the user has finished speaking and we should process the message immediately
   */
  markEndOfUtterance(): void {
    this.receivedEndOfUtterance = true;
    // Force a quick finalisation attempt - but still let buffer validation run
    this.scheduleUtteranceFinalization(true);
  }

  /**
   * Schedule utterance finalisation after a short debounce period
   * This prevents sending multiple fragments when user pauses briefly
   */
  private scheduleUtteranceFinalization(force: boolean = false): void {
    if (this.utteranceDebounceTimeout) {
      clearTimeout(this.utteranceDebounceTimeout);
      this.utteranceDebounceTimeout = null;
    }
    const delay = force ? Math.min(200, this.UTTERANCE_FINALIZATION_DELAY) : this.UTTERANCE_FINALIZATION_DELAY;
    this.utteranceDebounceTimeout = setTimeout(() => {
      this.processPendingTranscript(force);
    }, delay);
  }

  /**
   * Process pending transcript when silence is detected
   */
  async processPendingTranscript(force: boolean = false): Promise<void> {
    // Clear silence timeout
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
      this.silenceTimeout = null;
    }
    if (this.utteranceDebounceTimeout) {
      clearTimeout(this.utteranceDebounceTimeout);
      this.utteranceDebounceTimeout = null;
    }
    
    // Reset EndOfUtterance flag after processing
    this.receivedEndOfUtterance = false;
    
    // Process pending transcript if we have one
    if (this.pendingFinalTranscript && this.pendingFinalTranscript.trim()) {
      let finalMessage = this.cleanTranscript(this.pendingFinalTranscript.trim());
      
      if (!this.isUtteranceComplete(finalMessage, force)) {
        // Not enough content yet - keep waiting unless forced by failsafe
        this.pendingFinalTranscript = finalMessage;
        if (!force) {
          // DON'T reschedule utteranceDebounceTimeout here!
          // It would create an infinite loop where utteranceDebounceTimeout (0.6s)
          // keeps cancelling silenceTimeout (1.5s) before it can trigger.
          // Just recreate the silence timeout and let IT handle finalization.
          this.resetSilenceTimeout();
          return;
        }
      }
      
      // Skip if message is only punctuation (should have been handled in handleFinalTranscript)
      if (this.isOnlyPunctuation(finalMessage)) {
        this.pendingFinalTranscript = null;
        this.lastPartialUserContent = null;
        this.currentStreamingMessageId = null;
        return;
      }
      
      // Skip if this is the same as the last processed message (duplicate)
      if (finalMessage === this.lastProcessedContent) {
        this.pendingFinalTranscript = null;
        this.lastPartialUserContent = null;
        this.currentStreamingMessageId = null;
        return;
      }
      
      // Skip if message is too short (less than 2 characters) - likely noise
      if (finalMessage.length < 2) {
        this.pendingFinalTranscript = null;
        this.lastPartialUserContent = null;
        this.currentStreamingMessageId = null;
        return;
      }
      
      // Skip orphan chunks that are just a single word already present in the previous message
      // This prevents duplicate words from appearing as separate messages
      if (this.lastProcessedContent && this.isOrphanWordRepeat(finalMessage, this.lastProcessedContent)) {
        console.log('[Transcription] ⏸️ Skipping orphan chunk (repeated word from previous message):', finalMessage);
        this.pendingFinalTranscript = null;
        this.lastPartialUserContent = null;
        this.currentStreamingMessageId = null;
        return;
      }
      
      // Skip orphan chunks that are just punctuation already present at the end of previous message
      // Example: previous="OK, je suis reparti de mon côté.", new="." -> skip
      if (this.lastProcessedContent && this.isOrphanPunctuation(finalMessage, this.lastProcessedContent)) {
        console.log('[Transcription] ⏸️ Skipping orphan chunk (repeated punctuation from previous message):', finalMessage);
        this.pendingFinalTranscript = null;
        this.lastPartialUserContent = null;
        this.currentStreamingMessageId = null;
        return;
      }
      
      // Skip fuzzy duplicates at the end of previous message
      if (this.lastProcessedContent && this.isFuzzyEndDuplicate(finalMessage, this.lastProcessedContent)) {
        console.log('[Transcription] ⏸️ Skipping fuzzy duplicate at end:', finalMessage);
        this.pendingFinalTranscript = null;
        this.lastPartialUserContent = null;
        this.currentStreamingMessageId = null;
        return;
      }
      
      if (!/[.!?…]$/.test(finalMessage)) {
        finalMessage = `${finalMessage}.`;
      }
      
      // Store values before clearing
      const messageId = this.currentStreamingMessageId;
      const fullContent = finalMessage;
      
      // Clear state before sending (to prevent race conditions)
      this.pendingFinalTranscript = null;
      this.lastPartialUserContent = null;
      this.lastFinalUserContent = finalMessage;
      this.lastProcessedContent = finalMessage;
      this.currentStreamingMessageId = null;
      this.lastPreviewContent = null;
      
      console.log('[Transcription] ✅ FINAL:', fullContent);
      
      // Add to conversation history
      this.conversationHistory.push({ role: 'user', content: fullContent });
      
      // Notify callback with final message (use fullContent to ensure we send everything)
      this.onMessageCallback?.({
        role: 'user',
        content: fullContent, // Ensure we send the complete accumulated content
        timestamp: new Date().toISOString(),
        isInterim: false,
        messageId: messageId || undefined,
      });

      // Process user message and generate response
      // This will trigger LLM response and TTS
      await this.processUserMessage(fullContent);
    }
  }

  /**
   * Handle partial transcript from Speechmatics
   */
  handlePartialTranscript(transcript: string): void {
    if (!transcript || !transcript.trim()) return;

    const trimmedTranscript = transcript.trim();
    
    // Detect start of a brand new user turn (previous turn was already processed)
    if (!this.pendingFinalTranscript && this.lastProcessedContent) {
      this.lastProcessedContent = null;
      this.lastFinalUserContent = null;
      this.currentStreamingMessageId = null;
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
    
    // Ensure we have a streaming message id for optimistic updates
    if (!this.currentStreamingMessageId) {
      this.currentStreamingMessageId = `stream-${Date.now()}`;
    }
    
    // Keep pending transcript in sync with the latest partial (usually the most complete)
    if (!this.pendingFinalTranscript) {
      this.pendingFinalTranscript = trimmedTranscript;
    } else {
      const pendingTrimmed = this.pendingFinalTranscript.trim();
      // Case 1: incoming contains the pending transcript (complete replacement)
      if (trimmedTranscript.includes(pendingTrimmed)) {
        this.pendingFinalTranscript = trimmedTranscript;
      }
      // Case 2: incoming starts with pending (continuation)
      else if (trimmedTranscript.startsWith(pendingTrimmed)) {
        this.pendingFinalTranscript = trimmedTranscript;
      }
      // Case 3: pending already contains incoming (incoming is fragment) -> keep pending
      else if (pendingTrimmed.includes(trimmedTranscript)) {
        // no-op
      }
      // Case 4: partial overlap -> merge
      else {
        this.pendingFinalTranscript = this.mergeTranscriptSegments(pendingTrimmed, trimmedTranscript);
      }
    }
    
    // Reset timers so we only process after user truly stops talking
    this.resetSilenceTimeout();
    this.scheduleUtteranceFinalization();
    
    const previewContent = this.cleanTranscript(this.pendingFinalTranscript || trimmedTranscript);
    if (!previewContent || previewContent === this.lastPreviewContent) {
      return;
    }
    this.lastPreviewContent = previewContent;

    const messageId = this.currentStreamingMessageId || undefined;
    
    this.onMessageCallback?.({
      role: 'user',
      content: previewContent,
      timestamp: new Date().toISOString(),
      isInterim: true,
      messageId,
    });
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
   * Check if a new message is just an orphan chunk containing a single word
   * that's already present in the previous message
   * Example: previous="OK, je suis reparti de mon côté", new="côté" -> true
   */
  private isOrphanWordRepeat(newMessage: string, previousMessage: string): boolean {
    // Remove punctuation and normalize
    const newClean = newMessage.trim().replace(/[.,!?;:…\-—–'"]+$/g, '').trim();
    const prevClean = previousMessage.trim();
    
    // If new message is empty after cleaning, it's not a word repeat
    if (!newClean || newClean.length < 2) {
      return false;
    }
    
    // Extract words from both messages (case-insensitive)
    const newWords = newClean.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    const prevWords = prevClean.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    
    // If new message has more than 2 words, it's not an orphan chunk
    if (newWords.length > 2) {
      return false;
    }
    
    // Check if all words in new message are already in previous message
    // This catches cases like "côté" or "de mon côté" when "côté" was already in previous
    const allWordsInPrevious = newWords.every(word => prevWords.includes(word));
    
    if (allWordsInPrevious && newWords.length <= 2) {
      // Additional check: if it's just 1-2 words and they appear at the end of previous message,
      // it's definitely an orphan chunk
      const lastWordsOfPrevious = prevWords.slice(-Math.max(2, newWords.length));
      const matchesEnd = newWords.every((word, idx) => 
        lastWordsOfPrevious[lastWordsOfPrevious.length - newWords.length + idx] === word
      );
      
      if (matchesEnd) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Check if a new message is just punctuation that's already present at the end of previous message
   * Example: previous="OK, je suis reparti de mon côté.", new="." -> true
   * Example: previous="OK, je suis reparti de mon côté.", new="..." -> false (different punctuation)
   */
  private isOrphanPunctuation(newMessage: string, previousMessage: string): boolean {
    const newTrimmed = newMessage.trim();
    const prevTrimmed = previousMessage.trim();
    
    // If new message is empty, it's not punctuation
    if (!newTrimmed) {
      return false;
    }
    
    // Check if new message is only punctuation (or punctuation + whitespace)
    const newClean = newTrimmed.replace(/\s+/g, '');
    if (!newClean) {
      return false;
    }
    
    const punctuationRegex = /^[.,!?;:…\-—–'"]+$/;
    if (!punctuationRegex.test(newClean)) {
      return false; // Not just punctuation
    }
    
    // Extract punctuation from the end of previous message
    const prevPunctuationMatch = prevTrimmed.match(/[.,!?;:…\-—–'"]+$/);
    if (!prevPunctuationMatch) {
      return false; // Previous message has no punctuation at the end
    }
    
    const prevEndPunctuation = prevPunctuationMatch[0];
    
    // Check if new punctuation matches or is contained in previous punctuation
    // Example: prev=".", new="." -> true
    // Example: prev="...", new="." -> true (new is subset)
    // Example: prev=".", new="..." -> false (new is different)
    if (prevEndPunctuation.includes(newClean) || newClean === prevEndPunctuation) {
      return true;
    }
    
    return false;
  }

  /**
   * Check if new message is a fuzzy duplicate of the end of previous message
   * Uses similarity matching to catch variations like "fete" vs "fete."
   * Example: previous="alle a la fete", new="fete." -> true (fuzzy match on last words)
   */
  private isFuzzyEndDuplicate(newMessage: string, previousMessage: string): boolean {
    // Remove punctuation and normalize both messages
    const newClean = newMessage.trim().toLowerCase().replace(/[.,!?;:…\-—–'"]+/g, '');
    const prevClean = previousMessage.trim().toLowerCase().replace(/[.,!?;:…\-—–'"]+/g, '');
    
    if (!newClean || newClean.length < 2) return false;
    
    const newWords = newClean.split(/\s+/).filter(w => w.length > 0);
    const prevWords = prevClean.split(/\s+/).filter(w => w.length > 0);
    
    // FIRST: Check for complete duplicate (all words match)
    if (newWords.length === prevWords.length) {
      const similarity = this.calculateSimilarity(newClean, prevClean);
      if (similarity > 0.9) {
        return true; // Complete duplicate
      }
    }
    
    // THEN: Check for short fragments (1-3 words) at the end
    if (newWords.length > 3) return false;
    if (prevWords.length < newWords.length) return false;
    
    const lastPrevWords = prevWords.slice(-newWords.length);
    
    // Calculate similarity between new words and last words of previous
    const similarity = this.calculateSimilarity(newWords.join(' '), lastPrevWords.join(' '));
    
    // If similarity > 80%, consider it a duplicate
    return similarity > 0.8;
  }

  /**
   * Handle final transcript from Speechmatics
   */
  handleFinalTranscript(transcript: string): void {
    if (!transcript || !transcript.trim()) return;

    const trimmedTranscript = transcript.trim();
    
    // Seed pending transcript with the latest partial (usually the full text) if missing
    if (!this.pendingFinalTranscript) {
      this.pendingFinalTranscript = this.lastPartialUserContent || trimmedTranscript;
    }
    
    // Skip if exactly the same as last final transcript (exact duplicate)
    // But only if we don't have a pending transcript (to allow accumulation)
    if (!this.pendingFinalTranscript && trimmedTranscript === this.lastFinalUserContent) {
      return;
    }
    
    // Skip messages that are only punctuation (like ".", "?", "!")
    // These are often sent as separate final messages but should be ignored
    if (this.isOnlyPunctuation(trimmedTranscript)) {
      // If we have a pending transcript, append the punctuation to the END of it
      if (this.pendingFinalTranscript) {
        this.pendingFinalTranscript = this.pendingFinalTranscript.trim() + trimmedTranscript;
      }
      // DON'T store orphan punctuation in pendingPunctuation
      // It causes punctuation to appear at the START of the next message
      // Just ignore orphan punctuation completely
      return;
    }
    
    // Check if this transcript is a continuation or a new segment
    if (this.pendingFinalTranscript) {
      const pendingTrimmed = this.pendingFinalTranscript.trim();
      
      // Case 1: New transcript is a complete continuation (starts with pending)
      // Example: pending="partie 1", new="partie 1 partie 2"
      if (trimmedTranscript.startsWith(pendingTrimmed)) {
        this.pendingFinalTranscript = trimmedTranscript;
        this.lastFinalUserContent = trimmedTranscript;
        this.resetSilenceTimeout();
        this.scheduleUtteranceFinalization(true);
        return;
      }
      
      // Case 2: New transcript is a prefix of pending (pending is longer)
      // Example: pending="partie 1 partie 2", new="partie 1"
      // Keep the longer version (pending)
      if (pendingTrimmed.startsWith(trimmedTranscript)) {
        // Don't update lastFinalUserContent to avoid triggering duplicate check
        this.resetSilenceTimeout();
        this.scheduleUtteranceFinalization(true);
        return;
      }
      
      // Case 3: New transcript is a suffix of pending (pending already contains it)
      // Example: pending="partie 1 partie 2", new="partie 2"
      // Keep the longer version (pending)
      if (pendingTrimmed.endsWith(trimmedTranscript)) {
        this.resetSilenceTimeout();
        this.scheduleUtteranceFinalization(true);
        return;
      }
      
      // Case 4: Check if new transcript contains the pending transcript
      // Example: pending="partie 1", new="avant partie 1 après"
      if (trimmedTranscript.includes(pendingTrimmed)) {
        this.pendingFinalTranscript = trimmedTranscript;
        this.lastFinalUserContent = trimmedTranscript;
        this.resetSilenceTimeout();
        this.scheduleUtteranceFinalization(true);
        return;
      }
      
      // Case 5: Check if pending transcript contains the new transcript
      // Example: pending="avant partie 1 après", new="partie 1"
      // Keep the longer version (pending)
      if (pendingTrimmed.includes(trimmedTranscript)) {
        this.resetSilenceTimeout();
        this.scheduleUtteranceFinalization(true);
        return;
      }
      
      // Case 6: Check similarity (likely a correction or refinement)
      const similarity = this.calculateSimilarity(trimmedTranscript, pendingTrimmed);
      if (similarity > 0.8) {
        // Very similar - likely a correction or refinement
        if (trimmedTranscript.length > pendingTrimmed.length) {
          this.pendingFinalTranscript = trimmedTranscript;
          this.lastFinalUserContent = trimmedTranscript;
        }
        this.resetSilenceTimeout();
        this.scheduleUtteranceFinalization(true);
        return;
      }
      
      // Case 7: Completely different segments - append
      // Example: pending="partie 1", new="partie 2"
      this.pendingFinalTranscript = pendingTrimmed + ' ' + trimmedTranscript;
      this.lastFinalUserContent = trimmedTranscript;
      this.resetSilenceTimeout();
      this.scheduleUtteranceFinalization(true);
      return;
    } else {
      // Start a new pending transcript
      // This is a new message, so reset lastProcessedContent to allow new partials
      this.lastProcessedContent = null;
      this.pendingFinalTranscript = trimmedTranscript;
      this.lastFinalUserContent = trimmedTranscript;
      // Reuse existing messageId if available (continuing same stream)
      // Otherwise create a new one
      if (!this.currentStreamingMessageId) {
        this.currentStreamingMessageId = `stream-${Date.now()}`;
      }
      this.resetSilenceTimeout();
      this.scheduleUtteranceFinalization(true);
    }
  }

  /**
   * Cleanup on disconnect
   */
  cleanup(): void {
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
      this.silenceTimeout = null;
    }
    if (this.utteranceDebounceTimeout) {
      clearTimeout(this.utteranceDebounceTimeout);
      this.utteranceDebounceTimeout = null;
    }
    this.pendingFinalTranscript = null;
    this.lastPartialUserContent = null;
    this.lastFinalUserContent = null;
    this.lastProcessedContent = null;
    this.currentStreamingMessageId = null;
    this.lastPreviewContent = null;
  }

  /**
   * Merge two transcript segments by detecting overlap and appending only the new portion
   */
  private mergeTranscriptSegments(existing: string, incoming: string): string {
    const existingTrimmed = existing.trim();
    const incomingTrimmed = incoming.trim();
    
    const overlap = this.findOverlap(existingTrimmed, incomingTrimmed);
    if (overlap.length > 3) {
      const newPortion = incomingTrimmed.substring(overlap.length);
      return `${existingTrimmed}${newPortion ? ' ' + newPortion : ''}`.replace(/\s+/g, ' ').trim();
    }
    return `${existingTrimmed} ${incomingTrimmed}`.replace(/\s+/g, ' ').trim();
  }

  /**
   * Find the overlapping suffix/prefix between two strings
   */
  private findOverlap(source: string, target: string): string {
    let overlap = '';
    const maxLen = Math.min(source.length, target.length);
    for (let i = 1; i <= maxLen; i++) {
      const suffix = source.substring(source.length - i);
      const prefix = target.substring(0, i);
      if (suffix === prefix) {
        overlap = suffix;
      }
    }
    return overlap;
  }

  private cleanTranscript(text: string): string {
    if (!text) return '';
    let cleaned = text.replace(/\s+/g, ' ').trim();
    cleaned = cleaned.replace(/\s+([,.!?;:])/g, '$1');
    cleaned = cleaned.replace(/([,.!?;:])([^\s])/g, '$1 $2');
    cleaned = cleaned.replace(/([.!?]){2,}/g, '$1');
    cleaned = this.removeConsecutiveWordDuplicates(cleaned);
    cleaned = this.removeConsecutivePhraseDuplicates(cleaned);
    return cleaned.trim();
  }

  private removeConsecutiveWordDuplicates(text: string): string {
    const tokens = text.split(/\s+/);
    const deduped: string[] = [];
    for (const token of tokens) {
      const normalized = token.toLowerCase();
      const prev = deduped[deduped.length - 1];
      if (prev && prev.toLowerCase() === normalized) {
        continue;
      }
      deduped.push(token);
    }
    return deduped.join(' ');
  }

  private removeConsecutivePhraseDuplicates(text: string): string {
    const tokens = text.split(/\s+/);
    const result: string[] = [];
    for (const token of tokens) {
      result.push(token);
      const len = result.length;
      const maxWindow = Math.min(6, Math.floor(len / 2));
      for (let window = maxWindow; window >= 2; window--) {
        const start = len - window * 2;
        if (start < 0) continue;
        const first = result.slice(start, start + window).join(' ').toLowerCase();
        const second = result.slice(start + window, start + window * 2).join(' ').toLowerCase();
        if (first === second) {
          result.splice(start + window, window);
          break;
        }
      }
    }
    return result.join(' ');
  }

  private isUtteranceComplete(text: string, force: boolean): boolean {
    if (!text) return false;
    const cleaned = text.trim();
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (!force) {
      if (cleaned.length < this.MIN_UTTERANCE_CHAR_LENGTH) return false;
      if (words.length < this.MIN_UTTERANCE_WORDS) return false;
      const lastWord = words[words.length - 1]?.toLowerCase() || '';
      if (this.FRAGMENT_ENDINGS.has(lastWord)) return false;
      if (!/[.!?…]$/.test(cleaned)) return false;
    }
    return true;
  }
}

