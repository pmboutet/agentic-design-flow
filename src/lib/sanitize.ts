const forbiddenPattern = /[<>]/g;

export function sanitizeText(value: string): string {
  return value.replace(forbiddenPattern, " ").trim();
}

export function sanitizeOptional(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  return sanitizeText(value);
}
