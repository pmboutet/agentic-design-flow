/**
 * Constants and configuration for the ProjectJourneyBoard
 * Extracted for better maintainability
 */

import type { Components } from "react-markdown";
import type {
  AskConversationMode,
  AskDeliveryMode,
  ProjectChallengeNode,
  ProjectParticipantInsight,
} from "@/types";

// ===== Status Options =====

export type ChallengeStatus = "open" | "in_progress" | "active" | "closed" | "archived";

export const challengeStatusOptions: { value: ChallengeStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "active", label: "Active" },
  { value: "closed", label: "Closed" },
  { value: "archived", label: "Archived" },
];

export const askStatusOptions = ["active", "inactive", "draft", "closed"] as const;
export type AskStatus = (typeof askStatusOptions)[number];

export const askDeliveryModes: AskDeliveryMode[] = ["physical", "digital"];
export const askConversationModes: AskConversationMode[] = ["individual_parallel", "collaborative", "group_reporter"];

// ===== Impact Labels & Classes =====

export const impactLabels: Record<ProjectChallengeNode["impact"], string> = {
  low: "Low impact",
  medium: "Moderate impact",
  high: "High impact",
  critical: "Critical impact",
};

export const impactClasses: Record<ProjectChallengeNode["impact"], string> = {
  low: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
  medium: "border-amber-400/40 bg-amber-500/10 text-amber-200",
  high: "border-indigo-400/40 bg-indigo-500/10 text-indigo-200",
  critical: "border-rose-400/40 bg-rose-500/10 text-rose-200",
};

// ===== Insight Type Classes =====

export const insightTypeClasses: Record<ProjectParticipantInsight["type"], string> = {
  pain: "border-rose-400/40 bg-rose-500/10 text-rose-200",
  gain: "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
  signal: "border-sky-400/40 bg-sky-500/10 text-sky-200",
  idea: "border-amber-400/40 bg-amber-500/10 text-amber-200",
};

// ===== Markdown Components =====

export const challengeMarkdownComponents: Components = {
  p: ({ children }) => (
    <p className="text-sm text-slate-200 leading-relaxed">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc space-y-1 pl-4 text-sm text-slate-200 leading-relaxed marker:text-indigo-200/80">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal space-y-1 pl-4 text-sm text-slate-200 leading-relaxed marker:text-indigo-200/80">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="text-sm text-slate-200 leading-relaxed">{children}</li>
  ),
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({ children }) => <em className="italic text-slate-200">{children}</em>,
  a: ({ children, ...props }) => (
    <a
      {...props}
      className="text-sm text-indigo-200 underline decoration-indigo-200/70 underline-offset-4 hover:text-indigo-100"
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-indigo-300/50 bg-indigo-500/10 px-3 py-2 text-sm italic text-slate-100">
      {children}
    </blockquote>
  ),
};

// ===== Environment Flags =====

export const USE_MOCK_JOURNEY = process.env.NEXT_PUBLIC_USE_MOCK_PROJECT_JOURNEY === "true";
