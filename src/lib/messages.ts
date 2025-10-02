export function normaliseMessageMetadata(value: unknown): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }

  try {
    return JSON.parse(String(value));
  } catch (error) {
    console.warn('Unable to parse message metadata', error);
    return undefined;
  }
}
