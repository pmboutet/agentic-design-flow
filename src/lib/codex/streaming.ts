/**
 * Merge helper that keeps streaming text stable while avoiding duplicates.
 */
export function mergeStreamingContent(previous: string | undefined, incoming: string): string {
  if (!previous) return incoming;
  if (!incoming) return previous;
  if (incoming === previous) return previous;
  if (incoming.startsWith(previous)) return incoming;
  if (previous.startsWith(incoming)) return previous;
  if (incoming.includes(previous)) return incoming;
  if (previous.includes(incoming)) return previous;
  return `${previous} ${incoming}`.replace(/\s+/g, ' ').trim();
}
