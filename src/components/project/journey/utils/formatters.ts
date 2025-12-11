/**
 * Formatting utility functions for the ProjectJourneyBoard
 * Extracted for better maintainability and reusability
 */

import type { ProjectParticipantSummary } from "@/types";

/**
 * Merge two arrays of contributors, deduplicating by ID or name
 */
export function mergeContributors(
  existing: ProjectParticipantSummary[],
  additions: ProjectParticipantSummary[],
): ProjectParticipantSummary[] {
  const merged = new Map<string, ProjectParticipantSummary>();
  [...existing, ...additions].forEach(person => {
    const key = person.id || person.name;
    if (!merged.has(key)) {
      merged.set(key, person);
    }
  });
  return Array.from(merged.values());
}

/**
 * Format a date string for display (e.g., "05 Dec 2024")
 */
export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

/**
 * Format a date string with medium date style (e.g., "Dec 5, 2024")
 * Returns null if value is empty or invalid
 */
export function formatFullDate(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

/**
 * Format a timeframe from start and end dates
 * Returns "Start – End" or just the available date
 */
export function formatTimeframe(startDate?: string | null, endDate?: string | null): string | null {
  if (!startDate && !endDate) {
    return null;
  }
  const startLabel = formatFullDate(startDate);
  const endLabel = formatFullDate(endDate);
  if (startLabel && endLabel) {
    return `${startLabel} – ${endLabel}`;
  }
  return startLabel ?? endLabel;
}

/**
 * Convert a date string to ISO format for input fields
 */
export function toInputDate(value?: string | null): string {
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
