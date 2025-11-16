import type { PromptVariables } from './agent-config';
import type { ConversationPlan } from './conversation-plan';

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

  // Debug: Log messages_json content
  console.log('🔧 buildConversationAgentVariables - Création de messages_json:');
  console.log(`   Input messages: ${context.messages.length}`);
  console.log(`   Payload messages: ${conversationMessagesPayload.length}`);
  const payloadUserCount = conversationMessagesPayload.filter(m => m.senderType === 'user').length;
  const payloadAiCount = conversationMessagesPayload.filter(m => m.senderType === 'ai').length;
  console.log(`   👤 User in payload: ${payloadUserCount}`);
  console.log(`   🤖 AI in payload: ${payloadAiCount}`);

  // Add conversation plan variables if plan is available
  let conversationPlanFormatted = '';
  let currentStepFormatted = '';
  
  if (context.conversationPlan) {
    const { formatPlanForPrompt, formatCurrentStepForPrompt, getCurrentStep } = require('./conversation-plan');
    conversationPlanFormatted = formatPlanForPrompt(context.conversationPlan);
    const currentStep = getCurrentStep(context.conversationPlan);
    currentStepFormatted = formatCurrentStepForPrompt(currentStep);
    
    console.log('📋 Conversation plan available:', {
      planId: context.conversationPlan.id,
      stepsCount: context.conversationPlan.plan_data.steps.length,
      currentStepId: context.conversationPlan.current_step_id,
    });
  }

  return {
    ask_key: context.ask.ask_key,
    ask_question: context.ask.question,
    ask_description: context.ask.description ?? '',
    // String format for backward compatibility with old templates
    participants: participantsSummary,
    // Array format for Handlebars loops (preferred for new templates)
    participants_list: context.participants,
    messages_json: JSON.stringify(conversationMessagesPayload),
    latest_user_message: lastUserMessage?.content ?? '',
    system_prompt_ask: context.ask.system_prompt ?? '',
    system_prompt_project: context.project?.system_prompt ?? '',
    system_prompt_challenge: context.challenge?.system_prompt ?? '',
    // Conversation plan variables
    conversation_plan: conversationPlanFormatted,
    current_step: currentStepFormatted,
  };
}

