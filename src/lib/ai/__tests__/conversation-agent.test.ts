/**
 * Unit tests for Conversation Agent Variables
 * Tests step_messages, step_messages_json, and completed_steps_summary
 */

import { buildConversationAgentVariables } from '../conversation-agent';
import type { ConversationPlanStep, ConversationPlanWithSteps } from '../conversation-plan';

// ============================================================================
// MOCK DATA FACTORIES
// ============================================================================

function createMockStep(overrides: Partial<ConversationPlanStep> = {}): ConversationPlanStep {
  return {
    id: 'step-uuid-1',
    plan_id: 'plan-uuid-1',
    step_identifier: 'step_1',
    step_order: 1,
    title: 'Introduction',
    objective: 'Get to know the participants',
    status: 'pending',
    summary: null,
    created_at: '2024-01-15T10:00:00Z',
    activated_at: null,
    completed_at: null,
    ...overrides,
  };
}

function createMockPlanWithSteps(
  steps: ConversationPlanStep[],
  currentStepId: string | null = 'step_1'
): ConversationPlanWithSteps {
  return {
    id: 'plan-uuid-1',
    conversation_thread_id: 'thread-uuid-1',
    title: 'Test Plan',
    objective: 'Test Objective',
    total_steps: steps.length,
    completed_steps: steps.filter(s => s.status === 'completed').length,
    status: 'active',
    current_step_id: currentStepId,
    plan_data: null,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
    steps,
  };
}

function createMockMessage(
  overrides: Partial<{
    id: string;
    senderType: string;
    senderName: string | null;
    content: string;
    timestamp: string;
    planStepId: string | null;
  }> = {}
) {
  return {
    id: 'msg-1',
    senderType: 'user',
    senderName: 'Alice',
    content: 'Test message',
    timestamp: '2024-01-15T10:30:00Z',
    planStepId: null,
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Conversation Agent Variables', () => {
  describe('step_messages and step_messages_json', () => {
    it('should filter messages to only current step when plan exists', () => {
      const step1 = createMockStep({
        id: 'step-uuid-1',
        step_identifier: 'step_1',
        step_order: 1,
        status: 'completed',
        summary: 'First step done',
      });
      const step2 = createMockStep({
        id: 'step-uuid-2',
        step_identifier: 'step_2',
        step_order: 2,
        status: 'active',
        title: 'Discussion',
      });

      const messages = [
        createMockMessage({ id: 'msg-1', planStepId: 'step-uuid-1', content: 'Message from step 1' }),
        createMockMessage({ id: 'msg-2', planStepId: 'step-uuid-2', content: 'Message from step 2 - user' }),
        createMockMessage({ id: 'msg-3', planStepId: 'step-uuid-2', senderType: 'ai', senderName: null, content: 'AI response in step 2' }),
      ];

      const plan = createMockPlanWithSteps([step1, step2], 'step_2');

      const variables = buildConversationAgentVariables({
        ask: { ask_key: 'test', question: 'Test question' },
        messages,
        participants: [{ name: 'Alice', role: 'Developer' }],
        conversationPlan: plan,
      });

      // step_messages should only contain step 2 messages
      expect(variables.step_messages).toContain('Message from step 2 - user');
      expect(variables.step_messages).toContain('AI response in step 2');
      expect(variables.step_messages).not.toContain('Message from step 1');

      // step_messages_json should be a valid JSON with only step 2 messages
      const stepMessagesArray = JSON.parse(variables.step_messages_json as string);
      expect(stepMessagesArray).toHaveLength(2);
      expect(stepMessagesArray[0].content).toBe('Message from step 2 - user');
      expect(stepMessagesArray[1].content).toBe('AI response in step 2');
    });

    it('should return empty array/message when no messages for current step', () => {
      const step1 = createMockStep({
        id: 'step-uuid-1',
        step_identifier: 'step_1',
        step_order: 1,
        status: 'active',
      });

      const messages = [
        createMockMessage({ id: 'msg-1', planStepId: 'step-uuid-other', content: 'Message from other step' }),
      ];

      const plan = createMockPlanWithSteps([step1], 'step_1');

      const variables = buildConversationAgentVariables({
        ask: { ask_key: 'test', question: 'Test question' },
        messages,
        participants: [],
        conversationPlan: plan,
      });

      expect(variables.step_messages).toBe('Aucun message pour cette étape.');
      expect(variables.step_messages_json).toBe('[]');
    });

    it('should fall back to all messages when no plan exists', () => {
      const messages = [
        createMockMessage({ id: 'msg-1', content: 'First message' }),
        createMockMessage({ id: 'msg-2', content: 'Second message' }),
      ];

      const variables = buildConversationAgentVariables({
        ask: { ask_key: 'test', question: 'Test question' },
        messages,
        participants: [],
        conversationPlan: null,
      });

      // Should contain all messages
      expect(variables.step_messages).toContain('First message');
      expect(variables.step_messages).toContain('Second message');

      const stepMessagesArray = JSON.parse(variables.step_messages_json as string);
      expect(stepMessagesArray).toHaveLength(2);
    });

    it('should format step_messages with timestamps', () => {
      const step1 = createMockStep({
        id: 'step-uuid-1',
        step_identifier: 'step_1',
        step_order: 1,
        status: 'active',
      });

      const messages = [
        createMockMessage({
          id: 'msg-1',
          planStepId: 'step-uuid-1',
          content: 'Hello world',
          timestamp: '2024-01-15T14:30:00Z',
          senderName: 'Bob',
        }),
      ];

      const plan = createMockPlanWithSteps([step1], 'step_1');

      const variables = buildConversationAgentVariables({
        ask: { ask_key: 'test', question: 'Test' },
        messages,
        participants: [{ name: 'Bob', role: null }],
        conversationPlan: plan,
      });

      // Should contain formatted timestamp and content
      expect(variables.step_messages).toContain('Bob:');
      expect(variables.step_messages).toContain('Hello world');
    });
  });

  describe('completed_steps_summary', () => {
    it('should include summaries from completed steps', () => {
      const step1 = createMockStep({
        id: 'step-uuid-1',
        step_identifier: 'step_1',
        step_order: 1,
        status: 'completed',
        title: 'Introduction',
        summary: 'Les participants se sont présentés et ont partagé leur contexte.',
      });
      const step2 = createMockStep({
        id: 'step-uuid-2',
        step_identifier: 'step_2',
        step_order: 2,
        status: 'completed',
        title: 'Défis',
        summary: 'Trois défis majeurs ont été identifiés.',
      });
      const step3 = createMockStep({
        id: 'step-uuid-3',
        step_identifier: 'step_3',
        step_order: 3,
        status: 'active',
        title: 'Solutions',
      });

      const plan = createMockPlanWithSteps([step1, step2, step3], 'step_3');

      const variables = buildConversationAgentVariables({
        ask: { ask_key: 'test', question: 'Test question' },
        messages: [],
        participants: [],
        conversationPlan: plan,
      });

      expect(variables.completed_steps_summary).toContain('Étapes complétées');
      expect(variables.completed_steps_summary).toContain('2/3');
      expect(variables.completed_steps_summary).toContain('Introduction');
      expect(variables.completed_steps_summary).toContain('Les participants se sont présentés');
      expect(variables.completed_steps_summary).toContain('Défis');
      expect(variables.completed_steps_summary).toContain('Trois défis majeurs');
      // Should not include active step
      expect(variables.completed_steps_summary).not.toContain('Solutions');
    });

    it('should show default message when no steps completed', () => {
      const step1 = createMockStep({
        id: 'step-uuid-1',
        step_identifier: 'step_1',
        step_order: 1,
        status: 'active',
      });

      const plan = createMockPlanWithSteps([step1], 'step_1');

      const variables = buildConversationAgentVariables({
        ask: { ask_key: 'test', question: 'Test' },
        messages: [],
        participants: [],
        conversationPlan: plan,
      });

      expect(variables.completed_steps_summary).toBe('Aucune étape complétée pour le moment');
    });

    it('should show fallback when summary is null', () => {
      const step1 = createMockStep({
        id: 'step-uuid-1',
        step_identifier: 'step_1',
        step_order: 1,
        status: 'completed',
        title: 'Step without summary',
        summary: null,
      });

      const plan = createMockPlanWithSteps([step1], null);

      const variables = buildConversationAgentVariables({
        ask: { ask_key: 'test', question: 'Test' },
        messages: [],
        participants: [],
        conversationPlan: plan,
      });

      expect(variables.completed_steps_summary).toContain('Pas de résumé disponible');
    });

    it('should show default message when no plan exists', () => {
      const variables = buildConversationAgentVariables({
        ask: { ask_key: 'test', question: 'Test' },
        messages: [],
        participants: [],
        conversationPlan: null,
      });

      expect(variables.completed_steps_summary).toBe('Aucune étape complétée pour le moment');
    });
  });

  describe('messages_json vs step_messages_json', () => {
    it('messages_json should contain ALL messages, step_messages_json only current step', () => {
      const step1 = createMockStep({
        id: 'step-uuid-1',
        step_identifier: 'step_1',
        step_order: 1,
        status: 'completed',
      });
      const step2 = createMockStep({
        id: 'step-uuid-2',
        step_identifier: 'step_2',
        step_order: 2,
        status: 'active',
      });

      const messages = [
        createMockMessage({ id: 'msg-1', planStepId: 'step-uuid-1', content: 'Step 1 message' }),
        createMockMessage({ id: 'msg-2', planStepId: 'step-uuid-2', content: 'Step 2 message' }),
      ];

      const plan = createMockPlanWithSteps([step1, step2], 'step_2');

      const variables = buildConversationAgentVariables({
        ask: { ask_key: 'test', question: 'Test' },
        messages,
        participants: [],
        conversationPlan: plan,
      });

      // messages_json should have both
      const allMessages = JSON.parse(variables.messages_json as string);
      expect(allMessages).toHaveLength(2);

      // step_messages_json should only have step 2
      const stepMessages = JSON.parse(variables.step_messages_json as string);
      expect(stepMessages).toHaveLength(1);
      expect(stepMessages[0].content).toBe('Step 2 message');
    });
  });
});
