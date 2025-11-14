/**
 * Audio chunk deduplication system for Speechmatics Voice Agent
 * Prevents duplicate audio chunks from being sent to the WebSocket
 */

export class AudioChunkDedupe {
  private chunkDedupeCache: Map<string, number> = new Map(); // Hash -> timestamp
  private readonly DEDUPE_WINDOW_MS = 3000; // 3 seconds window for duplicate detection
  private readonly DEDUPE_CACHE_MAX_SIZE = 100; // Maximum number of hashes to keep in cache
  private readonly DEDUPE_LOG_INTERVAL = 50; // Log duplicate detection every N occurrences
  private duplicateLogCounter: number = 0; // Counter for logging throttling

  /**
   * Compute a robust hash signature for an audio chunk
   * Uses multiple sampling points and a simple but effective hash function
   * Time complexity: O(1) - constant number of operations regardless of chunk size
   */
  computeChunkSignature(chunk: Int16Array): string {
    const length = chunk.length;
    if (length === 0) return 'empty';
    
    // Sample multiple points across the chunk for robustness
    const samplePoints = [
      0,                                    // First sample
      Math.floor(length * 0.1),            // 10%
      Math.floor(length * 0.25),           // 25%
      Math.floor(length * 0.5),            // 50%
      Math.floor(length * 0.75),           // 75%
      Math.floor(length * 0.9),            // 90%
      length - 1                           // Last sample
    ];
    
    // Extract sample values
    const samples = samplePoints.map(idx => chunk[idx] || 0);
    
    // Simple but effective hash: combine length, samples, and a checksum
    let hash = length;
    let checksum = 0;
    
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      hash = ((hash << 5) - hash) + sample; // hash * 31 + sample
      hash = hash & hash; // Convert to 32-bit integer
      checksum += sample;
    }
    
    // Combine hash with checksum for extra robustness
    const finalHash = ((hash << 16) | (checksum & 0xFFFF)).toString(36);
    
    return `${length}-${finalHash}`;
  }

  /**
   * Check if a chunk should be skipped (is a duplicate)
   * Uses a time-windowed cache to detect duplicates within a configurable period
   */
  shouldSkipChunk(signature: string): boolean {
    const now = Date.now();
    
    // Clean up expired entries periodically
    if (this.chunkDedupeCache.size > this.DEDUPE_CACHE_MAX_SIZE) {
      this.cleanupDedupeCache(now);
    }
    
    // Check if this signature exists in cache and is within the dedupe window
    const cachedTimestamp = this.chunkDedupeCache.get(signature);
    if (cachedTimestamp !== undefined) {
      const age = now - cachedTimestamp;
      if (age < this.DEDUPE_WINDOW_MS) {
        // Duplicate detected within window
        this.duplicateLogCounter++;
        if (this.duplicateLogCounter % this.DEDUPE_LOG_INTERVAL === 0) {
          // Skipping duplicate audio chunk (throttled logging)
        }
        return true; // Skip this chunk
      }
      // Entry exists but is expired, update timestamp
      this.chunkDedupeCache.set(signature, now);
      return false;
    }
    
    // New signature, add to cache
    this.chunkDedupeCache.set(signature, now);
    return false; // Don't skip
  }

  /**
   * Clean up expired entries from the dedupe cache
   */
  private cleanupDedupeCache(now: number): void {
    const expiredKeys: string[] = [];
    
    for (const [signature, timestamp] of this.chunkDedupeCache.entries()) {
      if (now - timestamp >= this.DEDUPE_WINDOW_MS) {
        expiredKeys.push(signature);
      }
    }
    
    // Remove expired entries
    for (const key of expiredKeys) {
      this.chunkDedupeCache.delete(key);
    }
    
    // If still too large, remove oldest entries (FIFO)
    if (this.chunkDedupeCache.size > this.DEDUPE_CACHE_MAX_SIZE) {
      const entries = Array.from(this.chunkDedupeCache.entries())
        .sort((a, b) => a[1] - b[1]); // Sort by timestamp
      
      const toRemove = entries.slice(0, entries.length - this.DEDUPE_CACHE_MAX_SIZE);
      for (const [key] of toRemove) {
        this.chunkDedupeCache.delete(key);
      }
    }
  }

  /**
   * Reset the deduplication cache (useful on reconnection)
   */
  reset(): void {
    this.chunkDedupeCache.clear();
    this.duplicateLogCounter = 0;
  }
}





