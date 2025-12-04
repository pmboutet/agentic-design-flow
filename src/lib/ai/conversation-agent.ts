import type { PromptVariables } from './agent-config';
import type { ConversationPlan } from './conversation-plan';
import type { Insight } from '@/types';

export interface ConversationParticipantSummary {
  name: string;
  role?: string | null;
}

export interface ConversationMessageSummary {
  id: string;
  senderType: string;
  senderName?: string | null;
  content: string;
  timestamp: string;
  planStepId?: string | null; // Optional: link to conversation plan step
}

export interface ConversationAgentContext {
  ask: {
    ask_key: string;
    question: string;
    description?: string | null;
    system_prompt?: string | null;
  };
  project?: { system_prompt?: string | null } | null;
  challenge?: { system_prompt?: string | null } | null;
  messages: ConversationMessageSummary[];
  participants: ConversationParticipantSummary[];
  conversationPlan?: ConversationPlan | null;
  // Optional: for insight detection and other specialized use cases
  insights?: Insight[];
  insightTypes?: string;
  latestAiResponse?: string;
}

function buildParticipantsSummary(participants: ConversationParticipantSummary[]): string {
  return participants
    .map(participant => {
      const baseName = participant.name?.trim();
      if (!baseName) {
        return null;
      }
      return participant.role
        ? `${baseName} (${participant.role})`
        : baseName;
    })
    .filter((value): value is string => Boolean(value))
    .join(', ');
}

/**
 * Helper function to format message history as text (legacy format)
 */
function formatMessageHistory(messages: ConversationMessageSummary[]): string {
  return messages
    .map(message => {
      const senderLabel = message.senderType === 'ai' ? 'Agent' : (message.senderName || 'Participant');
      return `${senderLabel}: ${message.content}`;
    })
    .join('\n');
}

/**
 * Helper function to format step messages for prompt
 * Filters messages by the current active step's plan_step_id
 */
function formatStepMessages(
  messages: ConversationMessageSummary[],
  currentStepId: string | null,
  planSteps?: Array<{ id: string; step_identifier: string }> | null
): string {
  if (!currentStepId || !planSteps || planSteps.length === 0) {
    // No plan or no current step - return all messages as fallback
    return formatMessageHistory(messages);
  }

  // Find the step record that matches the current step identifier
  const currentStepRecord = planSteps.find(step => step.step_identifier === currentStepId);
  if (!currentStepRecord) {
    return formatMessageHistory(messages);
  }

  // Filter messages that belong to this step
  const stepMessages = messages.filter(msg => msg.planStepId === currentStepRecord.id);

  if (stepMessages.length === 0) {
    return 'Aucun message pour cette étape.';
  }

  return stepMessages
    .map(message => {
      const senderLabel = message.senderType === 'ai' ? 'Agent' : (message.senderName || 'Participant');
      const timestamp = new Date(message.timestamp).toLocaleString('fr-FR');
      return `[${timestamp}] ${senderLabel}:\n${message.content}`;
    })
    .join('\n\n---\n\n');
}

/**
 * Helper function to serialize insights for prompt (complete version)
 */
function serialiseInsightsForPrompt(insights?: Insight[]): string {
  if (!insights || insights.length === 0) {
    return '[]';
  }

  const payload = insights.map((insight) => {
    const authors = (insight.authors ?? []).map((author) => ({
      userId: author.userId ?? null,
      name: author.name ?? null,
    }));

    const kpiEstimations = (insight.kpis ?? []).map((kpi) => ({
      name: kpi.label,
      description: kpi.description ?? null,
      metric_data: kpi.value ?? null,
    }));

    const entry: Record<string, unknown> = {
      id: insight.id,
      type: insight.type,
      content: insight.content,
      summary: insight.summary ?? null,
      category: insight.category ?? null,
      priority: insight.priority ?? null,
      status: insight.status,
      challengeId: insight.challengeId ?? null,
      relatedChallengeIds: insight.relatedChallengeIds ?? [],
      sourceMessageId: insight.sourceMessageId ?? null,
    };

    if (insight.authorId) {
      entry.authorId = insight.authorId;
    }

    if (insight.authorName) {
      entry.authorName = insight.authorName;
    }

    if (authors.length > 0) {
      entry.authors = authors;
    }

    if (kpiEstimations.length > 0) {
      entry.kpi_estimations = kpiEstimations;
    }

    return entry;
  });

  return JSON.stringify(payload);
}

/**
 * Unified function to build variables for AI agents
 * Supports both conversation agents and insight detection agents
 * 
 * @param context - Complete context with ask, messages, participants, and optional features
 * @returns PromptVariables object ready for Handlebars compilation
 */
export function buildConversationAgentVariables(context: ConversationAgentContext): PromptVariables {
  const participantsSummary = buildParticipantsSummary(context.participants);

  const conversationMessagesPayload = context.messages.map(message => ({
    id: message.id,
    senderType: message.senderType,
    senderName: message.senderName ?? (message.senderType === 'ai' ? 'Agent' : 'Participant'),
    content: message.content,
    timestamp: message.timestamp,
  }));

  // Find the last user message
  const lastUserMessage = [...context.messages].reverse().find(message => message.senderType === 'user');

  // Add conversation plan variables if plan is available
  let conversationPlanFormatted = '';
  let currentStepFormatted = '';
  let currentStepId = '';
  // Default value: always provide a message, even if no plan exists
  let completedStepsSummaryFormatted = 'Aucune étape complétée pour le moment';
  let planProgressFormatted = '';
  let stepMessagesFormatted = '';
  let stepMessagesJson = '[]';
  let planSteps: Array<{ id: string; step_identifier: string }> | null = null;

  if (context.conversationPlan) {
    const {
      formatPlanForPrompt,
      formatCurrentStepForPrompt,
      formatCompletedStepsForPrompt,
      formatPlanProgress,
      getCurrentStep
    } = require('./conversation-plan');

    conversationPlanFormatted = formatPlanForPrompt(context.conversationPlan);
    const currentStep = getCurrentStep(context.conversationPlan);
    currentStepFormatted = formatCurrentStepForPrompt(currentStep);
    currentStepId = context.conversationPlan.current_step_id || '';
    // This will always return a non-empty string (either "Aucune étape complétée pour le moment" or the formatted list)
    completedStepsSummaryFormatted = formatCompletedStepsForPrompt(context.conversationPlan);
    planProgressFormatted = formatPlanProgress(context.conversationPlan);

    // Handle both normalized and legacy structures
    const stepsCount = 'steps' in context.conversationPlan && Array.isArray(context.conversationPlan.steps)
      ? context.conversationPlan.steps.length
      : context.conversationPlan.plan_data?.steps.length || 0;

    // Get plan steps for step_messages filtering
    if ('steps' in context.conversationPlan && Array.isArray(context.conversationPlan.steps)) {
      planSteps = context.conversationPlan.steps.map((step: any) => ({
        id: step.id,
        step_identifier: step.step_identifier,
      }));
    }

    // Format step_messages (only messages from the current step)
    stepMessagesFormatted = formatStepMessages(context.messages, currentStepId, planSteps);

    // Create JSON version of step messages for current step
    if (currentStepId && planSteps) {
      const currentStepRecord = planSteps.find(step => step.step_identifier === currentStepId);
      if (currentStepRecord) {
        const stepMessages = context.messages.filter(msg => msg.planStepId === currentStepRecord.id);
        stepMessagesJson = JSON.stringify(stepMessages.map(msg => ({
          id: msg.id,
          senderType: msg.senderType,
          senderName: msg.senderName ?? (msg.senderType === 'ai' ? 'Agent' : 'Participant'),
          content: msg.content,
          timestamp: msg.timestamp,
        })));
      }
    }

  } else {
    // Fallback: use all messages as step_messages when no plan exists
    stepMessagesFormatted = formatMessageHistory(context.messages);
    stepMessagesJson = JSON.stringify(conversationMessagesPayload);
  }

  // Build base variables
  const variables: PromptVariables = {
    ask_key: context.ask.ask_key,
    ask_question: context.ask.question,
    ask_description: context.ask.description ?? '',
    // Participants (dual format for backward compatibility)
    participants: participantsSummary,
    participants_list: context.participants,
    participant_name: lastUserMessage?.senderName ?? '',
    // Messages (modern JSON format)
    messages_json: JSON.stringify(conversationMessagesPayload),
    // Internal: messages as array for Handlebars helpers (recentMessages)
    messages_array: conversationMessagesPayload,
    latest_user_message: lastUserMessage?.content ?? '',
    // System prompts
    system_prompt_ask: context.ask.system_prompt ?? '',
    system_prompt_project: context.project?.system_prompt ?? '',
    system_prompt_challenge: context.challenge?.system_prompt ?? '',
    // Conversation plan variables
    conversation_plan: conversationPlanFormatted,
    current_step: currentStepFormatted,
    current_step_id: currentStepId,
    completed_steps_summary: completedStepsSummaryFormatted,
    plan_progress: planProgressFormatted,
    // Step-specific messages (filtered by current step's plan_step_id)
    step_messages: stepMessagesFormatted,
    step_messages_json: stepMessagesJson,
  };

  // Add legacy message_history for backward compatibility
  variables.message_history = formatMessageHistory(context.messages);

  // Add optional variables for insight detection
  if (context.latestAiResponse !== undefined) {
    variables.latest_ai_response = context.latestAiResponse ?? '';
  }

  if (context.insights !== undefined) {
    variables.existing_insights_json = serialiseInsightsForPrompt(context.insights);
  }

  if (context.insightTypes !== undefined) {
    variables.insight_types = context.insightTypes ?? 'pain, idea, solution, opportunity, risk, feedback, question';
  }

  return variables;
}

