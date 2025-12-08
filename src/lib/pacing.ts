/**
 * Conversation pacing utilities
 *
 * Based on attention research data:
 * - 8-12 min: sustained attention sweet spot (5-7 questions)
 * - 15-20 min: requires 2 blocks + synthesis (8-12 questions)
 * - 25-35 min: requires 3 blocks + attention restarts (12-18 questions)
 * - >35 min: discouraged - attention collapses without support changes
 */

import type { PacingConfig, PacingLevel, PacingAlertLevel } from '@/types';

/**
 * Duration thresholds for alerts (in minutes)
 */
export const PACING_THRESHOLDS = {
  WARNING: 8,   // Orange alert - slight attention loss risk
  CRITICAL: 16, // Red alert - attention drop, suggest splitting
} as const;

/**
 * Duration labels for UI display
 */
export const DURATION_LABELS: Record<number, string> = {
  1: "1 min - Ultra-rapide",
  2: "2 min - Très rapide",
  3: "3 min - Rapide",
  5: "5 min - Court",
  8: "8 min - Standard",
  10: "10 min - Modéré",
  12: "12 min - Approfondi",
  15: "15 min - Détaillé",
  20: "20 min - Exploration",
  25: "25 min - Long",
  30: "30 min - Très long",
};

/**
 * Get the display label for a duration value
 */
export function getDurationLabel(minutes: number): string {
  // Find exact match or closest lower value
  const keys = Object.keys(DURATION_LABELS).map(Number).sort((a, b) => a - b);
  let closestKey = keys[0];

  for (const key of keys) {
    if (key <= minutes) {
      closestKey = key;
    } else {
      break;
    }
  }

  if (DURATION_LABELS[minutes]) {
    return DURATION_LABELS[minutes];
  }

  return `${minutes} min`;
}

/**
 * Determine the pacing level based on expected duration
 */
export function getPacingLevel(durationMinutes: number): PacingLevel {
  if (durationMinutes <= 7) {
    return 'intensive';
  }
  if (durationMinutes <= 15) {
    return 'standard';
  }
  return 'deep';
}

/**
 * Get the alert level for a given duration
 */
export function getAlertLevel(durationMinutes: number): PacingAlertLevel {
  if (durationMinutes >= PACING_THRESHOLDS.CRITICAL) {
    return 'critical';
  }
  if (durationMinutes >= PACING_THRESHOLDS.WARNING) {
    return 'warning';
  }
  return 'none';
}

/**
 * Get alert configuration for UI display
 */
export function getDurationAlert(minutes: number): {
  level: PacingAlertLevel;
  color: string;
  bgColor: string;
  borderColor: string;
  message: string;
} {
  if (minutes >= PACING_THRESHOLDS.CRITICAL) {
    return {
      level: 'critical',
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      message: "Risque de baisse d'attention. Envisagez de diviser en plusieurs ASKs plus courts."
    };
  }
  if (minutes >= PACING_THRESHOLDS.WARNING) {
    return {
      level: 'warning',
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
      message: "Légère perte d'attention possible. Prévoyez des micro-synthèses pour maintenir l'engagement."
    };
  }
  return {
    level: 'none',
    color: '',
    bgColor: '',
    borderColor: '',
    message: ''
  };
}

/**
 * Get optimal question count range based on duration
 * Based on attention research data provided
 */
export function getOptimalQuestionCount(durationMinutes: number): {
  min: number;
  max: number;
  format: string;
} {
  if (durationMinutes <= 7) {
    return {
      min: 3,
      max: 5,
      format: "questions directes, peu de relances"
    };
  }
  if (durationMinutes <= 12) {
    return {
      min: 5,
      max: 7,
      format: "mix équilibré ouvert/simple"
    };
  }
  if (durationMinutes <= 20) {
    return {
      min: 8,
      max: 12,
      format: "2 blocs + 1 synthèse intermédiaire"
    };
  }
  if (durationMinutes <= 35) {
    return {
      min: 12,
      max: 18,
      format: "3 blocs + 2 redémarrages d'attention"
    };
  }
  return {
    min: 0,
    max: 0,
    format: "déconseillé - diviser la session"
  };
}

/**
 * Calculate complete pacing configuration
 */
export function calculatePacingConfig(
  expectedDurationMinutes: number,
  totalSteps: number
): PacingConfig {
  const durationPerStep = totalSteps > 0
    ? Math.round((expectedDurationMinutes / totalSteps) * 10) / 10
    : expectedDurationMinutes;

  const pacingLevel = getPacingLevel(expectedDurationMinutes);
  const alertLevel = getAlertLevel(expectedDurationMinutes);
  const optimalQuestions = getOptimalQuestionCount(expectedDurationMinutes);
  const alert = getDurationAlert(expectedDurationMinutes);

  return {
    expectedDurationMinutes,
    totalSteps,
    durationPerStep,
    pacingLevel,
    optimalQuestionsMin: optimalQuestions.min,
    optimalQuestionsMax: optimalQuestions.max,
    alertLevel,
    alertMessage: alert.message || undefined,
  };
}

/**
 * Get pacing instructions text for prompt variables
 */
export function getPacingInstructions(pacingLevel: PacingLevel): string {
  switch (pacingLevel) {
    case 'intensive':
      return `Mode INTENSIF (conversation courte):
- Une question = une réponse, on avance
- Maximum 1 relance par sujet
- Pas de bavardage, droit au but
- Si la réponse est "suffisante", on passe à la suite
- Ne pas demander d'exemples sauf si critique`;

    case 'standard':
      return `Mode STANDARD (conversation équilibrée):
- 1-2 relances autorisées par point clé
- Brève reconnaissance avant la question suivante
- Demander UN exemple max par étape
- Avancer dès qu'on a une compréhension solide`;

    case 'deep':
      return `Mode APPROFONDI (exploration):
- 2-3 relances si elles apportent de la valeur
- Insérer une micro-synthèse tous les 3-4 échanges
- Explorer les nuances quand elles émergent
- Mais surveiller les signes de fatigue`;
  }
}

/**
 * Format pacing config as prompt variables
 */
export function formatPacingVariables(config: PacingConfig): Record<string, string> {
  return {
    expected_duration_minutes: String(config.expectedDurationMinutes),
    duration_per_step: String(config.durationPerStep),
    optimal_questions_min: String(config.optimalQuestionsMin),
    optimal_questions_max: String(config.optimalQuestionsMax),
    pacing_level: config.pacingLevel,
    pacing_instructions: getPacingInstructions(config.pacingLevel),
  };
}

/**
 * Time tracking statistics for real-time pacing
 */
export interface TimeTrackingStats {
  conversationElapsedMinutes: number;
  stepElapsedMinutes: number;
  questionsAskedTotal: number;
  questionsAskedInStep: number;
  timeRemainingMinutes: number;
  isOvertime: boolean;
  overtimeMinutes: number;
  stepIsOvertime: boolean;
  stepOvertimeMinutes: number;
}

/**
 * Message format for time tracking calculations
 */
interface MessageForTimeTracking {
  senderType: string;
  timestamp: string;
  planStepId?: string | null;
}

/**
 * Calculate real-time time tracking statistics
 *
 * @param messages - Array of messages with timestamps and sender types
 * @param expectedDurationMinutes - Target session duration
 * @param durationPerStep - Time budget per step
 * @param currentStepId - ID of the current active step (plan_step.id)
 * @param stepActivatedAt - When the current step was activated (optional, falls back to first step message)
 */
export function calculateTimeTrackingStats(
  messages: MessageForTimeTracking[],
  expectedDurationMinutes: number,
  durationPerStep: number,
  currentStepId?: string | null,
  stepActivatedAt?: string | null
): TimeTrackingStats {
  const now = new Date();

  // Find first message timestamp for conversation start
  const sortedMessages = [...messages].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const firstMessage = sortedMessages[0];
  const conversationStartTime = firstMessage
    ? new Date(firstMessage.timestamp)
    : now;

  // Calculate elapsed time since conversation start
  const conversationElapsedMs = now.getTime() - conversationStartTime.getTime();
  const conversationElapsedMinutes = Math.round((conversationElapsedMs / 60000) * 10) / 10;

  // Count AI questions (assistant messages) in total conversation
  const questionsAskedTotal = messages.filter(m => m.senderType === 'ai').length;

  // Calculate step-specific metrics
  let stepElapsedMinutes = 0;
  let questionsAskedInStep = 0;

  if (currentStepId) {
    // Filter messages for current step
    const stepMessages = messages.filter(m => m.planStepId === currentStepId);

    // Find step start time
    let stepStartTime: Date;
    if (stepActivatedAt) {
      stepStartTime = new Date(stepActivatedAt);
    } else {
      // Fallback: use first message in step or now
      const firstStepMessage = stepMessages.sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      )[0];
      stepStartTime = firstStepMessage ? new Date(firstStepMessage.timestamp) : now;
    }

    const stepElapsedMs = now.getTime() - stepStartTime.getTime();
    stepElapsedMinutes = Math.round((stepElapsedMs / 60000) * 10) / 10;

    // Count AI questions in current step
    questionsAskedInStep = stepMessages.filter(m => m.senderType === 'ai').length;
  }

  // Calculate remaining time
  const timeRemainingMinutes = Math.max(0, expectedDurationMinutes - conversationElapsedMinutes);
  const isOvertime = conversationElapsedMinutes > expectedDurationMinutes;
  const overtimeMinutes = isOvertime
    ? Math.round((conversationElapsedMinutes - expectedDurationMinutes) * 10) / 10
    : 0;

  // Step overtime calculations
  const stepIsOvertime = stepElapsedMinutes > durationPerStep;
  const stepOvertimeMinutes = stepIsOvertime
    ? Math.round((stepElapsedMinutes - durationPerStep) * 10) / 10
    : 0;

  return {
    conversationElapsedMinutes,
    stepElapsedMinutes,
    questionsAskedTotal,
    questionsAskedInStep,
    timeRemainingMinutes,
    isOvertime,
    overtimeMinutes,
    stepIsOvertime,
    stepOvertimeMinutes,
  };
}

/**
 * Format time tracking stats as prompt variables
 */
export function formatTimeTrackingVariables(stats: TimeTrackingStats): Record<string, string> {
  return {
    conversation_elapsed_minutes: String(stats.conversationElapsedMinutes),
    step_elapsed_minutes: String(stats.stepElapsedMinutes),
    questions_asked_total: String(stats.questionsAskedTotal),
    questions_asked_in_step: String(stats.questionsAskedInStep),
    time_remaining_minutes: String(stats.timeRemainingMinutes),
    is_overtime: String(stats.isOvertime),
    overtime_minutes: String(stats.overtimeMinutes),
    step_is_overtime: String(stats.stepIsOvertime),
    step_overtime_minutes: String(stats.stepOvertimeMinutes),
  };
}
