/**
 * Utility functions for AdminDashboard
 * Extracted for better maintainability and reusability
 */

/**
 * Format a date string with time for display
 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

/**
 * Generate a URL-friendly key from a base string
 */
export function generateAskKey(base: string): string {
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
  const randomSuffix = Math.random().toString(36).slice(2, 6);
  return `${slug || "ask"}-${randomSuffix}`;
}

/**
 * Convert a date string to ISO format for input fields
 */
export function toInputDate(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString();
}

/**
 * Format a value for display, handling various empty states
 */
export function formatDisplayValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toString() : "—";
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "—";
}
