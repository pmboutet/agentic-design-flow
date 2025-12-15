/**
 * TranscriptionManager - Gestionnaire de transcription pour Speechmatics Voice Agent
 *
 * Ce module gère toute la logique de traitement des transcriptions :
 * - Réception et fusion des transcriptions partielles (partial) et finales
 * - Déduplication intelligente pour éviter les doublons
 * - Détection de silence pour finaliser les messages utilisateur
 * - Nettoyage et normalisation du texte transcrit
 * - Gestion des messages intermédiaires (interim) pour l'affichage en temps réel
 *
 * Architecture :
 * - Utilise un système de timeout pour détecter la fin de la parole
 * - Fusionne les segments de transcription qui se chevauchent
 * - Filtre les fragments incomplets et les doublons
 * - Gère les signaux EndOfUtterance de Speechmatics
 */

/**
 * Helper function to get timestamp for logging
 */
function getTimestamp(): string {
  const now = new Date();
  return now.toISOString().split('T')[1].replace('Z', '');
}

import type { SpeechmaticsMessageCallback } from './speechmatics-types';
import type {
  SemanticTurnDecision,
  SemanticTurnDecisionOptions,
  SemanticTurnMessage,
  SemanticTurnTelemetryEvent,
  SemanticTurnTrigger,
} from './turn-detection';

type SemanticSupportOptions = SemanticTurnDecisionOptions & {
  telemetry?: (event: SemanticTurnTelemetryEvent) => void;
};

/**
 * Classe principale pour la gestion des transcriptions
 * 
 * Coordonne la réception des transcriptions partielles et finales,
 * détecte la fin de la parole de l'utilisateur, et déclenche le traitement
 * des messages une fois qu'ils sont complets.
 */
export class TranscriptionManager {
  // ===== ÉTATS DE SUIVI DES TRANSCRIPTIONS =====
  // Dernier contenu partiel reçu (pour détecter les doublons)
  private lastPartialUserContent: string | null = null;
  // Dernier contenu final reçu (pour détecter les doublons)
  private lastFinalUserContent: string | null = null;
  // Transcription finale en attente de traitement (accumulée depuis les partials et finals)
  private pendingFinalTranscript: string | null = null;
  // ID du message en cours de streaming (pour l'affichage optimiste)
  private currentStreamingMessageId: string | null = null;
  // Dernier contenu traité (pour éviter les doublons lors du traitement)
  private lastProcessedContent: string | null = null;
  // Timeout pour détecter le silence (finalise le message après X ms sans nouvelles transcriptions)
  private silenceTimeout: NodeJS.Timeout | null = null;
  // Flag indiquant si EndOfUtterance a été reçu de Speechmatics
  private receivedEndOfUtterance: boolean = false;
  // Timeout de debounce pour la finalisation de l'énoncé (évite les fragments multiples)
  private utteranceDebounceTimeout: NodeJS.Timeout | null = null;
  // Dernier contenu de prévisualisation envoyé (pour éviter les doublons dans les callbacks)
  private lastPreviewContent: string | null = null;
  // Rate limiting for partial updates to prevent rapid duplicates in display
  private lastPartialUpdateTimestamp: number = 0;
  private readonly MIN_PARTIAL_UPDATE_INTERVAL_MS = 100; // Minimum 100ms between partial updates
  // Gestion de la détection sémantique des fins de tour
  private semanticHoldTimeout: NodeJS.Timeout | null = null;
  private semanticHoldStartedAt: number | null = null;
  private semanticEvaluationInFlight: boolean = false;
  private pendingSemanticTrigger: SemanticTurnTrigger | null = null;
  // Speaker identification from diarization (S1, S2, S3, UU)
  private currentSpeaker: string | undefined = undefined;

  // ===== CONSTANTES DE CONFIGURATION =====
  // Timeout de détection de silence (10s) - wait for user to truly finish speaking
  // 10 seconds is long enough to allow for thinking pauses without triggering premature responses
  // No Mistral/semantic detection needed - just pure silence-based turn detection
  private readonly SILENCE_DETECTION_TIMEOUT = 10000;
  // Timeout plus rapide (5s) quand les partials sont désactivés
  private readonly SILENCE_DETECTION_TIMEOUT_NO_PARTIALS = 5000;
  // Délai de finalisation de l'énoncé (800ms) - réduit grâce à la fonctionnalité abort-on-continue
  // Si l'utilisateur continue de parler après ce délai, la réponse sera annulée
  // 800ms is a good balance: fast enough for responsive feel, slow enough to avoid fragmentation
  private readonly UTTERANCE_FINALIZATION_DELAY = 800;
  // Longueur minimale d'un énoncé en caractères (pour éviter les fragments trop courts)
  private readonly MIN_UTTERANCE_CHAR_LENGTH = 20;
  // Nombre minimal de mots dans un énoncé (pour éviter les fragments trop courts)
  private readonly MIN_UTTERANCE_WORDS = 3;
  // Mots français qui indiquent qu'un fragment n'est pas complet (conjonctions, prépositions, etc.)
  private readonly FRAGMENT_ENDINGS = new Set([
    'et','de','des','du','d\'','si','que','qu','le','la','les','nous','vous','je','tu','il','elle','on','mais','ou','donc','or','ni','car','à','en','pour','sur','avec'
  ]);

  /**
   * Constructeur du TranscriptionManager
   * 
   * @param onMessageCallback - Callback appelé pour envoyer les messages (interim et final) à l'interface
   * @param processUserMessage - Fonction appelée pour traiter un message utilisateur finalisé (déclenche LLM + TTS)
   * @param conversationHistory - Historique de conversation (pour le nettoyage et la déduplication)
   * @param enablePartials - Active l'envoi des transcriptions partielles pour l'affichage en temps réel
   */
  constructor(
    private onMessageCallback: SpeechmaticsMessageCallback | null,
    private processUserMessage: (transcript: string) => Promise<void>,
    private conversationHistory: Array<{ role: 'user' | 'agent'; content: string }>,
    private enablePartials: boolean = true,
    private semanticOptions?: SemanticSupportOptions
  ) {}

  // ===== FONCTIONS UTILITAIRES =====
  /**
   * Calcule la similarité entre deux chaînes de caractères
   * 
   * Utilise une mesure basée sur les mots communs (Jaccard-like).
   * Retourne un score entre 0 (pas de similarité) et 1 (identique).
   * 
   * Utilisé pour détecter les doublons et les variations de transcription.
   * 
   * @param str1 - Première chaîne à comparer
   * @param str2 - Deuxième chaîne à comparer
   * @returns Score de similarité entre 0 et 1
   */
  private calculateSimilarity(str1: string, str2: string): number {
    // Extraire les mots (normalisés en minuscules)
    const words1 = str1.toLowerCase().split(/\s+/);
    const words2 = str2.toLowerCase().split(/\s+/);
    // Créer un ensemble de tous les mots uniques
    const allWords = new Set([...words1, ...words2]);
    let commonWords = 0;
    
    // Compter les mots communs
    for (const word of allWords) {
      if (words1.includes(word) && words2.includes(word)) {
        commonWords++;
      }
    }
    
    // Retourner le ratio de mots communs sur le total de mots uniques
    if (allWords.size === 0) return 0;
    return commonWords / allWords.size;
  }

  private handleSilenceTimeout(): void {
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
      this.silenceTimeout = null;
    }
    // SIMPLIFIED: No more Mistral/semantic detection - just process after silence
    // 10 seconds of silence is long enough to be confident user is done
    void this.processPendingTranscript(true);
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
      const timeoutDuration = this.enablePartials
        ? this.SILENCE_DETECTION_TIMEOUT
        : this.SILENCE_DETECTION_TIMEOUT_NO_PARTIALS;
      // Always set timeout - even if EndOfUtterance was received
      // This ensures we respect the full silence period before responding
      this.silenceTimeout = setTimeout(() => {
        this.handleSilenceTimeout();
      }, timeoutDuration);
    }
  }

  /**
   * Mark that EndOfUtterance was received from Speechmatics
   * This signals that the user has finished speaking and we should process the message immediately
   */
  markEndOfUtterance(): void {
    this.receivedEndOfUtterance = true;
    // SIMPLIFIED: Don't trigger Mistral check on end_of_utterance
    // Just mark it and let the 10s silence timeout handle processing
    // This gives user plenty of time to continue if they're just thinking
    // Don't schedule anything - let the silence timeout (10s) do its job
  }

  /**
   * Schedule utterance finalisation after a short debounce period
   * This prevents sending multiple fragments when user pauses briefly
   * IMPORTANT: Uses semantic detection if available to avoid sending incomplete utterances
   *
   * @param force If true, reduces delay and relaxes min char/word requirements
   * @param absoluteFailsafe If true, bypasses ALL checks including fragment endings (maxHoldMs only)
   */
  private scheduleUtteranceFinalization(force: boolean = false, absoluteFailsafe: boolean = false): void {
    if (this.utteranceDebounceTimeout) {
      clearTimeout(this.utteranceDebounceTimeout);
      this.utteranceDebounceTimeout = null;
    }
    const defaultDelay = this.enablePartials
      ? this.UTTERANCE_FINALIZATION_DELAY
      : this.SILENCE_DETECTION_TIMEOUT_NO_PARTIALS;
    const delay = force && this.enablePartials
      ? Math.min(200, defaultDelay)
      : defaultDelay;
    this.utteranceDebounceTimeout = setTimeout(() => {
      // CRITICAL FIX: Use semantic detection if enabled instead of sending directly
      // This ensures incomplete utterances are held until user truly finishes
      if (this.semanticOptions?.detector && !force && !absoluteFailsafe) {
        this.triggerSemanticEvaluation('utterance_debounce');
      } else {
        this.processPendingTranscript(force, absoluteFailsafe);
      }
    }, delay);
  }

  /**
   * Process pending transcript when silence is detected
   *
   * @param force If true, relaxes min char/word requirements but still checks fragment endings
   * @param absoluteFailsafe If true, bypasses ALL checks (only used for maxHoldMs timeout)
   */
  async processPendingTranscript(force: boolean = false, absoluteFailsafe: boolean = false): Promise<void> {
    // Clear silence timeout
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
      this.silenceTimeout = null;
    }
    if (this.utteranceDebounceTimeout) {
      clearTimeout(this.utteranceDebounceTimeout);
      this.utteranceDebounceTimeout = null;
    }
    this.clearSemanticHold();

    // Reset EndOfUtterance flag after processing
    this.receivedEndOfUtterance = false;

    // Process pending transcript if we have one
    if (this.pendingFinalTranscript && this.pendingFinalTranscript.trim()) {
      let finalMessage = this.cleanTranscript(this.pendingFinalTranscript.trim());

      // Trim overlap with the previous user message to avoid duplicated openings
      finalMessage = this.removeOverlapWithPreviousMessage(finalMessage);

      if (!this.isUtteranceComplete(finalMessage, force, absoluteFailsafe)) {
        // Not enough content yet - keep waiting unless forced by absolute failsafe
        this.pendingFinalTranscript = finalMessage;
        if (!force && !absoluteFailsafe) {
          // DON'T reschedule utteranceDebounceTimeout here!
          // It would create an infinite loop where utteranceDebounceTimeout
          // keeps cancelling silenceTimeout before it can trigger.
          // Just recreate the silence timeout and let IT handle finalization.
          this.resetSilenceTimeout();
          return;
        } else if (absoluteFailsafe) {
          // Absolute failsafe mode (maxHoldMs timeout) - send anyway
        } else {
          // Force mode but not absolute - continue waiting if ends with fragment
          // This happens when semantic model says "end of turn" but message ends with fragment
          this.resetSilenceTimeout();
          return;
        }
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
        this.pendingFinalTranscript = null;
        this.lastPartialUserContent = null;
        this.currentStreamingMessageId = null;
        return;
      }

      // Skip fuzzy duplicates at the end of previous message
      if (this.lastProcessedContent && this.isFuzzyEndDuplicate(finalMessage, this.lastProcessedContent)) {
        this.pendingFinalTranscript = null;
        this.lastPartialUserContent = null;
        this.currentStreamingMessageId = null;
        return;
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

      // Add to conversation history
      this.conversationHistory.push({ role: 'user', content: fullContent });

      // Notify callback with final message (use fullContent to ensure we send everything)
      this.onMessageCallback?.({
        role: 'user',
        content: fullContent, // Ensure we send the complete accumulated content
        timestamp: new Date().toISOString(),
        isInterim: false,
        messageId: messageId || undefined,
        speaker: this.currentSpeaker,
      });

      // Process user message and generate response
      // This will trigger LLM response and TTS
      await this.processUserMessage(fullContent);
    }
  }

  /**
   * Handle partial transcript from Speechmatics
   * @param transcript - The partial transcript text
   * @param speaker - Optional speaker identifier from diarization (S1, S2, UU, etc.)
   */
  handlePartialTranscript(transcript: string, speaker?: string): void {
    if (!transcript || !transcript.trim()) return;

    const trimmedTranscript = transcript.trim();

    // CRITICAL: Cancel any pending utterance finalization when user continues speaking
    // This prevents sending incomplete messages if user resumes after a brief pause
    // (e.g., after end_of_utterance + high Mistral probability but user continues)
    this.cancelUtteranceDebounce();
    this.clearSemanticHold();

    // SPEAKER CHANGE DETECTION: If speaker changes, finalize the previous speaker's message
    // This is critical for consultant mode where we want to track different speakers
    if (speaker && this.currentSpeaker && speaker !== this.currentSpeaker && this.pendingFinalTranscript) {
      // Process the pending transcript from the previous speaker immediately
      void this.processPendingTranscript(true, false);
    }

    // Update current speaker if provided
    if (speaker) {
      this.currentSpeaker = speaker;
    }

    // Detect start of a brand new user turn (previous turn was already processed)
    if (!this.pendingFinalTranscript && this.lastProcessedContent) {
      this.lastProcessedContent = null;
      this.lastFinalUserContent = null;
      this.currentStreamingMessageId = null;
    }

    // DEDUPLICATION: Skip if exactly the same as last partial
    if (trimmedTranscript === this.lastPartialUserContent) {
      return;
    }

    // DEDUPLICATION: Normalize both transcripts for more robust comparison
    const normalizedNew = this.normalizeForComparison(trimmedTranscript);
    const normalizedLast = this.lastPartialUserContent ? this.normalizeForComparison(this.lastPartialUserContent) : '';

    // Skip if normalized versions are identical (catches "hello" vs "Hello!")
    if (normalizedNew === normalizedLast) {
      return;
    }

    // Skip if very similar to last partial (using word-based similarity)
    if (normalizedLast && normalizedNew.length > 5 && normalizedLast.length > 5) {
      const similarity = this.calculateSimilarity(normalizedNew, normalizedLast);
      // Lowered threshold from 0.9 to 0.85 to catch more near-duplicates
      if (similarity > 0.85) {
        return; // Skip duplicate
      }
    }

    // Skip if new partial is just a prefix or suffix of the last one (unchanged content)
    if (this.lastPartialUserContent) {
      const lastLower = this.lastPartialUserContent.toLowerCase();
      const newLower = trimmedTranscript.toLowerCase();
      if (lastLower.includes(newLower) || newLower.includes(lastLower)) {
        // Only update if it's actually longer (more content)
        if (trimmedTranscript.length <= this.lastPartialUserContent.length) {
          return; // Skip shorter or equal content
        }
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
      // Case 4: Check if this is a "refinement" (Speechmatics correcting/improving the same utterance)
      // Speechmatics often sends variations like "dans le jeu où il faut" → "dans le jeu ou le fait semblant"
      // These share many words but aren't simple prefix/suffix - they're refinements, not continuations
      else {
        const pendingWords = pendingTrimmed.toLowerCase().split(/\s+/);
        const incomingWords = trimmedTranscript.toLowerCase().split(/\s+/);

        // Count shared words (order doesn't matter)
        const pendingSet = new Set(pendingWords);
        const sharedWords = incomingWords.filter(w => pendingSet.has(w)).length;
        const overlapRatio = sharedWords / Math.max(pendingWords.length, incomingWords.length);

        // If >50% word overlap, it's likely a refinement - use the longer/newer one
        if (overlapRatio > 0.5) {
          // Use the longer version, or the new one if similar length
          if (trimmedTranscript.length >= pendingTrimmed.length * 0.8) {
            this.pendingFinalTranscript = trimmedTranscript;
          }
          // else keep pending (it's longer)
        }
        // Low overlap - check for suffix/prefix continuation
        else {
          this.pendingFinalTranscript = this.mergeTranscriptSegments(pendingTrimmed, trimmedTranscript);
        }
      }
    }
    
    // Reset silence timeout - this is the primary mechanism for detecting end of speech
    // We DON'T call scheduleUtteranceFinalization() here because it was causing premature
    // semantic evaluations (every 800ms) even while user is still speaking.
    // Instead, let the silence timeout (2s) naturally trigger processing when user truly stops.
    // Semantic evaluation will fire on silence_timeout or end_of_utterance events only.
    this.resetSilenceTimeout();
    
    const previewContent = this.cleanTranscript(this.pendingFinalTranscript || trimmedTranscript);
    if (!previewContent) {
      return;
    }

    // DEDUPLICATION: Normalize preview content for comparison
    const normalizedPreview = this.normalizeForComparison(previewContent);
    const normalizedLastPreview = this.lastPreviewContent ? this.normalizeForComparison(this.lastPreviewContent) : '';

    // Skip if preview content is the same (after normalization)
    if (normalizedPreview === normalizedLastPreview) {
      return;
    }

    // RATE LIMITING: Prevent too many updates per second
    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastPartialUpdateTimestamp;
    if (timeSinceLastUpdate < this.MIN_PARTIAL_UPDATE_INTERVAL_MS) {
      // Too soon - skip this update but still update pending state
      // The next partial will show the accumulated content
      return;
    }

    this.lastPreviewContent = previewContent;
    this.lastPartialUpdateTimestamp = now;

    // Respect config flag to disable partial streaming
    if (!this.enablePartials) {
      return;
    }

    const messageId = this.currentStreamingMessageId || undefined;

    this.onMessageCallback?.({
      role: 'user',
      content: previewContent,
      timestamp: new Date().toISOString(),
      isInterim: true,
      messageId,
      speaker: this.currentSpeaker,
    });
  }

  /**
   * ====== SEMANTIC TURN DETECTION SUPPORT ======
   */
  private triggerSemanticEvaluation(trigger: SemanticTurnTrigger): void {
    if (!this.semanticOptions?.detector) {
      this.emitSemanticTelemetry('skipped', trigger, null, 'detector-disabled');
      const shouldForce = this.enablePartials;
      this.scheduleUtteranceFinalization(shouldForce);
      return;
    }

    if (this.semanticEvaluationInFlight) {
      this.pendingSemanticTrigger = trigger;
      return;
    }

    this.semanticEvaluationInFlight = true;
    void this.runSemanticEvaluation(trigger);
  }

  private async runSemanticEvaluation(trigger: SemanticTurnTrigger): Promise<void> {
    try {
      const options = this.semanticOptions;
      if (!options?.detector) {
        return;
      }

      const pendingContent = this.getPendingTranscriptForSemantics();
      if (!pendingContent) {
        this.emitSemanticTelemetry('fallback', trigger, null, 'no-pending-transcript');
        this.scheduleUtteranceFinalization(this.enablePartials);
        return;
      }

      const messages = this.buildSemanticMessages(options.maxContextMessages);
      if (!messages.length) {
        this.emitSemanticTelemetry('fallback', trigger, null, 'no-context');
        this.scheduleUtteranceFinalization(this.enablePartials);
        return;
      }

      const probability = await options.detector.getSemanticEotProb(messages);

      if (typeof probability === 'number' && probability >= options.threshold) {
        // HIGH PROBABILITY: Mistral says user is done speaking → process immediately
        this.emitSemanticTelemetry('dispatch', trigger, probability);
        this.clearSemanticHold();
        // DO NOT use absoluteFailsafe here - we want to check fragment endings
        // even when semantic model says "end of turn". User might still be talking.
        this.scheduleUtteranceFinalization(true, false);
        return;
      }

      if (probability === null) {
        // Mistral error or timeout - fall back to silence_timeout
        this.emitSemanticTelemetry('fallback', trigger, probability, 'detector-null');
        this.clearSemanticHold();
        this.resetSilenceTimeout();
        return;
      }

      // LOW PROBABILITY: Mistral says user is NOT done speaking
      // Instead of re-checking every 900ms (which caused too many Mistral calls),
      // just wait for silence_timeout (2s) to naturally trigger processing.
      this.emitSemanticTelemetry('hold', trigger, probability, 'probability-below-threshold-waiting-silence');
      this.clearSemanticHold();
      this.resetSilenceTimeout();
    } catch (error) {
      console.error('[Transcription] Semantic detector error', error);
      this.emitSemanticTelemetry('fallback', trigger, null, 'detector-error');
      this.clearSemanticHold();
      this.resetSilenceTimeout();
    } finally {
      this.semanticEvaluationInFlight = false;
      if (this.pendingSemanticTrigger) {
        const nextTrigger = this.pendingSemanticTrigger;
        this.pendingSemanticTrigger = null;
        this.triggerSemanticEvaluation(nextTrigger);
      }
    }
  }

  private extendSemanticHold(trigger: SemanticTurnTrigger, probability: number | null): boolean {
    const options = this.semanticOptions;
    if (!options || typeof probability !== 'number') {
      return false;
    }

    const now = Date.now();
    if (!this.semanticHoldStartedAt) {
      this.semanticHoldStartedAt = now;
    }

    const elapsed = now - this.semanticHoldStartedAt;
    if (elapsed >= options.maxHoldMs) {
      return false;
    }

    this.cancelUtteranceDebounce();
    if (this.semanticHoldTimeout) {
      clearTimeout(this.semanticHoldTimeout);
    }

    this.semanticHoldTimeout = setTimeout(() => {
      this.semanticHoldTimeout = null;
      this.triggerSemanticEvaluation('semantic_grace');
    }, options.gracePeriodMs);

    return true;
  }

  private clearSemanticHold(): void {
    if (this.semanticHoldTimeout) {
      clearTimeout(this.semanticHoldTimeout);
      this.semanticHoldTimeout = null;
    }
    this.semanticHoldStartedAt = null;
    this.pendingSemanticTrigger = null;
  }

  private emitSemanticTelemetry(
    decision: SemanticTurnDecision,
    trigger: SemanticTurnTrigger,
    probability: number | null,
    reason?: string
  ): void {
    if (!this.semanticOptions?.telemetry) {
      return;
    }
    const pending = this.getPendingTranscriptForSemantics() || '';
    const words = pending ? pending.split(/\s+/).filter(Boolean).length : 0;
    this.semanticOptions.telemetry({
      trigger,
      probability,
      decision,
      reason,
      threshold: this.semanticOptions.threshold,
      pendingChars: pending.length,
      pendingWords: words,
      holdMs: this.getSemanticHoldDuration(),
      timestamp: new Date().toISOString(),
    });
  }

  private getPendingTranscriptForSemantics(): string | null {
    const source = this.pendingFinalTranscript || this.lastPartialUserContent;
    if (!source || !source.trim()) {
      return null;
    }
    return this.cleanTranscript(source.trim());
  }

  private buildSemanticMessages(limit: number): SemanticTurnMessage[] {
    const recentHistory: SemanticTurnMessage[] = this.conversationHistory.slice(-limit).map(entry => ({
      role: (entry.role === 'agent' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: entry.content,
    }));
    const pending = this.getPendingTranscriptForSemantics();
    if (pending) {
      recentHistory.push({ role: 'user', content: pending });
    }
    return recentHistory.slice(-limit);
  }

  private getSemanticHoldDuration(): number {
    if (!this.semanticHoldStartedAt) {
      return 0;
    }
    return Date.now() - this.semanticHoldStartedAt;
  }

  private cancelUtteranceDebounce(): void {
    if (this.utteranceDebounceTimeout) {
      clearTimeout(this.utteranceDebounceTimeout);
      this.utteranceDebounceTimeout = null;
    }
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
   * @param transcript - The final transcript text
   * @param speaker - Optional speaker identifier from diarization (S1, S2, UU, etc.)
   */
  handleFinalTranscript(transcript: string, speaker?: string): void {
    if (!transcript || !transcript.trim()) return;

    const trimmedTranscript = transcript.trim();
    this.clearSemanticHold();

    // SPEAKER CHANGE DETECTION: If speaker changes, finalize the previous speaker's message
    // This is critical for consultant mode where we want to track different speakers
    if (speaker && this.currentSpeaker && speaker !== this.currentSpeaker && this.pendingFinalTranscript) {
      // Process the pending transcript from the previous speaker immediately
      void this.processPendingTranscript(true, false);
    }

    // Update current speaker if provided
    if (speaker) {
      this.currentSpeaker = speaker;
    }

    // Seed pending transcript with the latest partial (usually the full text) if missing
    if (!this.pendingFinalTranscript) {
      this.pendingFinalTranscript = this.lastPartialUserContent || trimmedTranscript;
    }
    
    // Skip if exactly the same as last final transcript (exact duplicate)
    // But only if we don't have a pending transcript (to allow accumulation)
    if (!this.pendingFinalTranscript && trimmedTranscript === this.lastFinalUserContent) {
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
        this.scheduleUtteranceFinalization();
        return;
      }
      
      // Case 2: New transcript is a prefix of pending (pending is longer)
      // Example: pending="partie 1 partie 2", new="partie 1"
      // Keep the longer version (pending)
      if (pendingTrimmed.startsWith(trimmedTranscript)) {
        // Don't update lastFinalUserContent to avoid triggering duplicate check
        this.resetSilenceTimeout();
        this.scheduleUtteranceFinalization();
        return;
      }
      
      // Case 3: New transcript is a suffix of pending (pending already contains it)
      // Example: pending="partie 1 partie 2", new="partie 2"
      // Keep the longer version (pending)
      if (pendingTrimmed.endsWith(trimmedTranscript)) {
        this.resetSilenceTimeout();
        this.scheduleUtteranceFinalization();
        return;
      }
      
      // Case 4: Check if new transcript contains the pending transcript
      // Example: pending="partie 1", new="avant partie 1 après"
      if (trimmedTranscript.includes(pendingTrimmed)) {
        this.pendingFinalTranscript = trimmedTranscript;
        this.lastFinalUserContent = trimmedTranscript;
        this.resetSilenceTimeout();
        this.scheduleUtteranceFinalization();
        return;
      }
      
      // Case 5: Check if pending transcript contains the new transcript
      // Example: pending="avant partie 1 après", new="partie 1"
      // Keep the longer version (pending)
      if (pendingTrimmed.includes(trimmedTranscript)) {
        this.resetSilenceTimeout();
        this.scheduleUtteranceFinalization();
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
        this.scheduleUtteranceFinalization();
        return;
      }
      
      // Case 7: Check if this is a "refinement" before appending
      // Speechmatics sends variations like "dans le jeu où il faut" → "dans le jeu ou le fait semblant"
      const pendingWords = pendingTrimmed.toLowerCase().split(/\s+/);
      const incomingWords = trimmedTranscript.toLowerCase().split(/\s+/);
      const pendingSet = new Set(pendingWords);
      const sharedWords = incomingWords.filter(w => pendingSet.has(w)).length;
      const overlapRatio = sharedWords / Math.max(pendingWords.length, incomingWords.length);

      // If >50% word overlap, it's a refinement - use the longer/newer one
      if (overlapRatio > 0.5) {
        if (trimmedTranscript.length >= pendingTrimmed.length * 0.8) {
          this.pendingFinalTranscript = trimmedTranscript;
          this.lastFinalUserContent = trimmedTranscript;
        }
        // else keep pending
      } else {
        // Low overlap - true continuation, merge segments
        this.pendingFinalTranscript = this.mergeTranscriptSegments(pendingTrimmed, trimmedTranscript);
        this.lastFinalUserContent = trimmedTranscript;
      }
      this.resetSilenceTimeout();
      this.scheduleUtteranceFinalization();
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
      this.scheduleUtteranceFinalization();
    }
  }

  /**
   * Discard pending transcript - called when echo is detected
   * This prevents sending transcribed audio that is actually TTS playback
   * being picked up by the microphone
   */
  discardPendingTranscript(): void {
    const hadPending = !!this.pendingFinalTranscript;
    const pendingPreview = this.pendingFinalTranscript?.substring(0, 50) || '';

    // Clear all pending state
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
      this.silenceTimeout = null;
    }
    if (this.utteranceDebounceTimeout) {
      clearTimeout(this.utteranceDebounceTimeout);
      this.utteranceDebounceTimeout = null;
    }
    this.clearSemanticHold();
    this.pendingFinalTranscript = null;
    this.lastPartialUserContent = null;
    this.lastFinalUserContent = null;
    this.currentStreamingMessageId = null;
    this.lastPreviewContent = null;
    // Don't reset currentSpeaker here - we want to keep speaker context for echo detection

  }

  /**
   * Get the current speaker identifier from diarization
   * Used for echo detection - if speaker changes during TTS playback, it might be echo
   */
  getCurrentSpeaker(): string | undefined {
    return this.currentSpeaker;
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
    this.clearSemanticHold();
    this.pendingFinalTranscript = null;
    this.lastPartialUserContent = null;
    this.lastFinalUserContent = null;
    this.lastProcessedContent = null;
    this.currentStreamingMessageId = null;
    this.lastPreviewContent = null;
    this.lastPartialUpdateTimestamp = 0;
    this.currentSpeaker = undefined;
  }

  /**
   * Merge two transcript segments by detecting overlap and appending only the new portion
   * Improved to handle word-level overlap detection for better accuracy
   */
  private mergeTranscriptSegments(existing: string, incoming: string): string {
    const existingTrimmed = existing.trim();
    const incomingTrimmed = incoming.trim();

    // First try character-level overlap detection
    const charOverlap = this.findOverlap(existingTrimmed, incomingTrimmed);
    if (charOverlap.length > 3) {
      const newPortion = incomingTrimmed.substring(charOverlap.length);
      return `${existingTrimmed}${newPortion ? ' ' + newPortion : ''}`.replace(/\s+/g, ' ').trim();
    }

    // Try word-level overlap detection (more robust for speech)
    const existingWords = existingTrimmed.split(/\s+/);
    const incomingWords = incomingTrimmed.split(/\s+/);

    // Look for word-level overlap at the end of existing / start of incoming
    let maxOverlapWords = 0;
    const maxCheck = Math.min(existingWords.length, incomingWords.length, 5); // Check up to 5 words

    for (let i = 1; i <= maxCheck; i++) {
      const existingEnd = existingWords.slice(-i).join(' ').toLowerCase();
      const incomingStart = incomingWords.slice(0, i).join(' ').toLowerCase();
      if (existingEnd === incomingStart) {
        maxOverlapWords = i;
      }
    }

    if (maxOverlapWords > 0) {
      // Found word overlap - append only the non-overlapping part
      const newWords = incomingWords.slice(maxOverlapWords);
      if (newWords.length > 0) {
        return `${existingTrimmed} ${newWords.join(' ')}`.replace(/\s+/g, ' ').trim();
      }
      return existingTrimmed; // Incoming was fully contained in overlap
    }

    // No overlap found - just append (this is a true continuation)
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
    const normalizedHistory: string[] = [];
    for (const token of tokens) {
      if (!token) continue;
      const normalized = this.normalizeToken(token);
      const prevNormalized = normalizedHistory[normalizedHistory.length - 1];
      if (normalized && prevNormalized && prevNormalized === normalized) {
        continue;
      }
      deduped.push(token);
      normalizedHistory.push(normalized);
    }
    return deduped.join(' ');
  }

  private removeConsecutivePhraseDuplicates(text: string): string {
    const tokens = text.split(/\s+/);
    const result: string[] = [];
    const normalizedResult: string[] = [];
    for (const token of tokens) {
      result.push(token);
      normalizedResult.push(this.normalizeToken(token));
      const len = result.length;
      const maxWindow = Math.min(6, Math.floor(len / 2));
      for (let window = maxWindow; window >= 2; window--) {
        const start = len - window * 2;
        if (start < 0) continue;
        const firstNormalized = normalizedResult.slice(start, start + window).join(' ');
        const secondNormalized = normalizedResult.slice(start + window, start + window * 2).join(' ');
        if (!firstNormalized.trim() || !secondNormalized.trim()) {
          continue;
        }
        if (firstNormalized === secondNormalized) {
          result.splice(start + window, window);
          normalizedResult.splice(start + window, window);
          break;
        }
      }
    }
    return result.join(' ');
  }

  private normalizeToken(token: string): string {
    return token
      .toLowerCase()
      .replace(/^[\s.,!?;:…'"()\-]+/g, '')
      .replace(/[\s.,!?;:…'"()\-]+$/g, '');
  }

  /**
   * Normalize text for robust comparison (deduplication)
   * Removes punctuation, accents, extra spaces, and converts to lowercase
   */
  private normalizeForComparison(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[.,!?;:'"«»\-–—…()[\]{}]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Remove duplicated openings that repeat the end of the previous user message.
   * Speechmatics sometimes echoes the last few words when a new utterance starts.
   */
  private removeOverlapWithPreviousMessage(message: string): string {
    if (!message || !message.trim()) {
      return message;
    }

    const previousIndex = this.findLastUserMessageIndex();
    if (previousIndex === -1) {
      return message;
    }

    const previousMessage = this.conversationHistory[previousIndex]?.content || '';
    if (!previousMessage || !previousMessage.trim()) {
      return message;
    }

    const previousWords = previousMessage.trim().split(/\s+/).filter(Boolean);
    const newWords = message.trim().split(/\s+/).filter(Boolean);
    if (previousWords.length === 0 || newWords.length === 0) {
      return message;
    }

    const maxOverlap = Math.min(previousWords.length, newWords.length - 1, 12);
    if (maxOverlap < 2) {
      return message;
    }

    for (let size = maxOverlap; size >= 2; size--) {
      const prevSlice = previousWords.slice(-size).map(word => this.normalizeToken(word)).join(' ');
      const newSlice = newWords.slice(0, size).map(word => this.normalizeToken(word)).join(' ');
      if (prevSlice && prevSlice.length > 0 && prevSlice === newSlice) {
        const trimmed = newWords.slice(size).join(' ').trim();
        if (trimmed.length > 0) {
          return trimmed;
        }
      }
    }

    return message;
  }

  /**
   * Check if an utterance is complete and ready to be sent.
   *
   * @param text The transcript text to check
   * @param force If true, relaxes min char/word requirements but STILL checks fragment endings
   * @param absoluteFailsafe If true, bypasses ALL checks (only used for maxHoldMs timeout)
   * @returns true if the utterance is ready to be sent
   */
  private isUtteranceComplete(text: string, force: boolean, absoluteFailsafe: boolean = false): boolean {
    if (!text) return false;
    const cleaned = text.trim();
    if (!cleaned) return false;

    // ABSOLUTE FAILSAFE: Only bypass all checks when maxHoldMs is exceeded
    // This prevents infinite loops when the user keeps talking with fragment endings
    if (absoluteFailsafe) {
      return true;
    }

    const words = cleaned.split(/\s+/).filter(Boolean);
    const lastWord = words[words.length - 1]?.toLowerCase().replace(/[.,!?;:…\-—–'"]+$/g, '');

    // CRITICAL: ALWAYS check fragment endings, even with force=true
    // This prevents sending incomplete phrases like "En fait je pense que" when user is still talking.
    // The semantic model may return high probability for the preceding sentence,
    // but the user is continuing with a connector word.
    // Only absoluteFailsafe (maxHoldMs timeout) can bypass this.
    if (this.FRAGMENT_ENDINGS.has(lastWord)) {
      return false;
    }

    if (force) {
      return true;
    }

    const relaxedMode = !this.enablePartials;

    const minChars = relaxedMode
      ? Math.max(6, Math.floor(this.MIN_UTTERANCE_CHAR_LENGTH / 2))
      : this.MIN_UTTERANCE_CHAR_LENGTH;
    const minWords = relaxedMode
      ? Math.max(1, this.MIN_UTTERANCE_WORDS - 1)
      : this.MIN_UTTERANCE_WORDS;

    if (cleaned.length < minChars) return false;
    if (words.length < minWords) return false;

    if (relaxedMode) {
      // In total transcription mode we can accept shorter chunks,
      // but still avoid finalizing on obvious connector words.
      if (words.length <= 2 && this.FRAGMENT_ENDINGS.has(lastWord)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Find the index of the last user message in the conversation history.
   */
  private findLastUserMessageIndex(): number {
    for (let i = this.conversationHistory.length - 1; i >= 0; i--) {
      if (this.conversationHistory[i]?.role === 'user') {
        return i;
      }
    }
    return -1;
  }
}
