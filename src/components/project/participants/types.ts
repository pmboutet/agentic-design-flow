import type { AskConversationMode } from "@/types";

/**
 * Progress data for a single participant's conversation plan
 */
export interface ParticipantProgress {
  completedSteps: number;
  totalSteps: number;
  currentStepTitle: string | null;
  planStatus: "active" | "completed" | "abandoned" | null;
  isCompleted: boolean;
  isActive: boolean;
  threadId: string | null;
}

/**
 * Progress data container for all participants in an ask session
 */
export interface ParticipantProgressData {
  /** For individual_parallel mode: progress keyed by participant user_id */
  byParticipant: Record<string, ParticipantProgress>;
  /** For shared modes (collaborative, group_reporter, consultant): single shared progress */
  shared: ParticipantProgress | null;
  /** Conversation mode determines which progress to display */
  mode: AskConversationMode;
}

/**
 * Participant data with optional progress info
 */
export interface ParticipantWithProgress {
  id: string;
  name: string;
  email?: string | null;
  role?: string | null;
  inviteToken?: string | null;
  progress?: ParticipantProgress | null;
}

/**
 * Check if conversation mode uses shared progress
 */
export function isSharedProgressMode(mode: AskConversationMode): boolean {
  return mode === "collaborative" || mode === "group_reporter" || mode === "consultant";
}

/**
 * Get progress for a participant based on conversation mode
 */
export function getParticipantProgress(
  participantId: string,
  progressData: ParticipantProgressData | null | undefined
): ParticipantProgress | null {
  if (!progressData) return null;

  if (isSharedProgressMode(progressData.mode)) {
    return progressData.shared;
  }

  return progressData.byParticipant[participantId] ?? null;
}
