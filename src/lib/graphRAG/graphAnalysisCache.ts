/**
 * In-memory cache for graph analytics
 * Uses TTL-based expiration to avoid stale data
 */

import type { GraphAnalyticsResult, CommunityInfo } from "./graphAnalysis";

// ============================================================================
// TYPES
// ============================================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttlMs: number;
}

// ============================================================================
// CACHE STORES
// ============================================================================

const analyticsCache = new Map<string, CacheEntry<GraphAnalyticsResult>>();
const communityCache = new Map<string, CacheEntry<CommunityInfo[]>>();

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// ANALYTICS CACHE
// ============================================================================

/**
 * Get cached analytics for a project
 * Returns null if not cached or expired
 */
export function getCachedAnalytics(projectId: string): GraphAnalyticsResult | null {
  const entry = analyticsCache.get(projectId);

  if (!entry) {
    return null;
  }

  // Check if expired
  if (Date.now() - entry.timestamp > entry.ttlMs) {
    analyticsCache.delete(projectId);
    return null;
  }

  return entry.data;
}

/**
 * Cache analytics for a project
 */
export function setCachedAnalytics(
  projectId: string,
  data: GraphAnalyticsResult,
  ttlMs: number = DEFAULT_TTL_MS
): void {
  analyticsCache.set(projectId, {
    data,
    timestamp: Date.now(),
    ttlMs,
  });
}

// ============================================================================
// COMMUNITY CACHE
// ============================================================================

/**
 * Get cached communities for a project
 */
export function getCachedCommunities(projectId: string): CommunityInfo[] | null {
  const entry = communityCache.get(projectId);

  if (!entry) {
    return null;
  }

  if (Date.now() - entry.timestamp > entry.ttlMs) {
    communityCache.delete(projectId);
    return null;
  }

  return entry.data;
}

/**
 * Cache communities for a project
 */
export function setCachedCommunities(
  projectId: string,
  data: CommunityInfo[],
  ttlMs: number = DEFAULT_TTL_MS
): void {
  communityCache.set(projectId, {
    data,
    timestamp: Date.now(),
    ttlMs,
  });
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Invalidate all caches for a specific project
 * Call this when graph data changes (new insights, edges, etc.)
 */
export function invalidateCache(projectId: string): void {
  analyticsCache.delete(projectId);
  communityCache.delete(projectId);
}

/**
 * Invalidate all cached data
 * Use sparingly, e.g., during deployments or data migrations
 */
export function invalidateAllCaches(): void {
  analyticsCache.clear();
  communityCache.clear();
}

/**
 * Get cache stats for monitoring
 */
export function getCacheStats(): {
  analyticsCount: number;
  communityCount: number;
  projectIds: string[];
} {
  const projectIds = new Set<string>([
    ...analyticsCache.keys(),
    ...communityCache.keys(),
  ]);

  return {
    analyticsCount: analyticsCache.size,
    communityCount: communityCache.size,
    projectIds: Array.from(projectIds),
  };
}
