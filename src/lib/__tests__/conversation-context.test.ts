/**
 * @jest-environment node
 */

import {
  buildParticipantDisplayName,
  buildMessageSenderName,
  buildMessageSummary,
  buildDetailedMessage,
  buildParticipantSummary,
  type ParticipantRow,
  type UserRow,
  type MessageRow,
} from '../conversation-context';

describe('conversation-context', () => {
  describe('buildParticipantDisplayName', () => {
    it('should return participant_name when provided', () => {
      const participant: ParticipantRow = {
        id: '1',
        participant_name: 'John Doe',
        user_id: null,
      };

      expect(buildParticipantDisplayName(participant, null, 0)).toBe('John Doe');
    });

    it('should trim participant_name', () => {
      const participant: ParticipantRow = {
        id: '1',
        participant_name: '  Jane Smith  ',
        user_id: null,
      };

      expect(buildParticipantDisplayName(participant, null, 0)).toBe('Jane Smith');
    });

    it('should return user full_name when no participant_name', () => {
      const participant: ParticipantRow = {
        id: '1',
        user_id: 'user-1',
      };
      const user: UserRow = {
        id: 'user-1',
        full_name: 'Alice Johnson',
      };

      expect(buildParticipantDisplayName(participant, user, 0)).toBe('Alice Johnson');
    });

    it('should return first_name + last_name when no full_name', () => {
      const participant: ParticipantRow = {
        id: '1',
        user_id: 'user-1',
      };
      const user: UserRow = {
        id: 'user-1',
        first_name: 'Bob',
        last_name: 'Williams',
      };

      expect(buildParticipantDisplayName(participant, user, 0)).toBe('Bob Williams');
    });

    it('should return email when no names available', () => {
      const participant: ParticipantRow = {
        id: '1',
        user_id: 'user-1',
      };
      const user: UserRow = {
        id: 'user-1',
        email: 'test@example.com',
      };

      expect(buildParticipantDisplayName(participant, user, 0)).toBe('test@example.com');
    });

    it('should return fallback when no data available', () => {
      const participant: ParticipantRow = {
        id: '1',
      };

      expect(buildParticipantDisplayName(participant, null, 2)).toBe('Participant 3');
    });

    it('should skip empty participant_name and use user data', () => {
      const participant: ParticipantRow = {
        id: '1',
        participant_name: '   ',
        user_id: 'user-1',
      };
      const user: UserRow = {
        id: 'user-1',
        full_name: 'Charlie Brown',
      };

      expect(buildParticipantDisplayName(participant, user, 0)).toBe('Charlie Brown');
    });
  });

  describe('buildMessageSenderName', () => {
    it('should return metadata.senderName when provided', () => {
      const message: MessageRow = {
        id: '1',
        ask_session_id: 'ask-1',
        content: 'Hello',
        metadata: { senderName: 'Custom Name' },
      };

      expect(buildMessageSenderName(message, null, 0)).toBe('Custom Name');
    });

    it('should return "Agent" for AI messages', () => {
      const message: MessageRow = {
        id: '1',
        ask_session_id: 'ask-1',
        content: 'Hello',
        sender_type: 'ai',
      };

      expect(buildMessageSenderName(message, null, 0)).toBe('Agent');
    });

    it('should return user full_name for user messages', () => {
      const message: MessageRow = {
        id: '1',
        ask_session_id: 'ask-1',
        content: 'Hello',
        sender_type: 'user',
        user_id: 'user-1',
      };
      const user: UserRow = {
        id: 'user-1',
        full_name: 'Diana Prince',
      };

      expect(buildMessageSenderName(message, user, 0)).toBe('Diana Prince');
    });

    it('should return fallback for user messages without user data', () => {
      const message: MessageRow = {
        id: '1',
        ask_session_id: 'ask-1',
        content: 'Hello',
        sender_type: 'user',
      };

      expect(buildMessageSenderName(message, null, 3)).toBe('Participant 4');
    });

    it('should prioritize metadata.senderName over AI sender_type', () => {
      const message: MessageRow = {
        id: '1',
        ask_session_id: 'ask-1',
        content: 'Hello',
        sender_type: 'ai',
        metadata: { senderName: 'Custom Agent' },
      };

      expect(buildMessageSenderName(message, null, 0)).toBe('Custom Agent');
    });
  });

  describe('buildMessageSummary', () => {
    it('should build complete message summary with planStepId', () => {
      const message: MessageRow = {
        id: 'msg-1',
        ask_session_id: 'ask-1',
        content: 'Hello world',
        sender_type: 'user',
        created_at: '2024-01-01T12:00:00Z',
        plan_step_id: 'step-1',
        user_id: 'user-1',
      };
      const user: UserRow = {
        id: 'user-1',
        full_name: 'Test User',
      };

      const result = buildMessageSummary(message, user, 0);

      expect(result).toEqual({
        id: 'msg-1',
        senderType: 'user',
        senderName: 'Test User',
        content: 'Hello world',
        timestamp: '2024-01-01T12:00:00Z',
        planStepId: 'step-1',
      });
    });

    it('should include planStepId as null when not present', () => {
      const message: MessageRow = {
        id: 'msg-1',
        ask_session_id: 'ask-1',
        content: 'Hello world',
        sender_type: 'ai',
      };

      const result = buildMessageSummary(message, null, 0);

      expect(result.planStepId).toBeNull();
      expect(result.senderName).toBe('Agent');
    });

    it('should use current timestamp when created_at is missing', () => {
      const message: MessageRow = {
        id: 'msg-1',
        ask_session_id: 'ask-1',
        content: 'Test',
      };

      const result = buildMessageSummary(message, null, 0);

      // Should be a valid ISO timestamp
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });

    it('should default sender_type to "user"', () => {
      const message: MessageRow = {
        id: 'msg-1',
        ask_session_id: 'ask-1',
        content: 'Test',
      };

      const result = buildMessageSummary(message, null, 0);

      expect(result.senderType).toBe('user');
    });
  });

  describe('buildDetailedMessage', () => {
    it('should build complete detailed message with all fields', () => {
      const message: MessageRow = {
        id: 'msg-1',
        ask_session_id: 'ask-1',
        content: 'Hello world',
        sender_type: 'user',
        message_type: 'text',
        created_at: '2024-01-01T12:00:00Z',
        plan_step_id: 'step-1',
        user_id: 'user-1',
        metadata: { custom: 'data' },
      };
      const user: UserRow = {
        id: 'user-1',
        full_name: 'Test User',
      };

      const result = buildDetailedMessage(message, user, 0, 'ASK-123');

      expect(result).toEqual({
        id: 'msg-1',
        askKey: 'ASK-123',
        askSessionId: 'ask-1',
        content: 'Hello world',
        type: 'text',
        senderType: 'user',
        senderId: 'user-1',
        senderName: 'Test User',
        timestamp: '2024-01-01T12:00:00Z',
        metadata: { custom: 'data' },
        planStepId: 'step-1',
      });
    });

    it('should include planStepId as null when not present', () => {
      const message: MessageRow = {
        id: 'msg-1',
        ask_session_id: 'ask-1',
        content: 'Hello world',
        sender_type: 'ai',
      };

      const result = buildDetailedMessage(message, null, 0);

      expect(result.planStepId).toBeNull();
    });

    it('should use same sender name logic as buildMessageSummary', () => {
      const message: MessageRow = {
        id: 'msg-1',
        ask_session_id: 'ask-1',
        content: 'Hello',
        sender_type: 'user',
        user_id: 'user-1',
      };
      const user: UserRow = {
        id: 'user-1',
        full_name: 'Same User',
      };

      const summary = buildMessageSummary(message, user, 0);
      const detailed = buildDetailedMessage(message, user, 0);

      expect(summary.senderName).toBe(detailed.senderName);
    });
  });

  describe('buildParticipantSummary', () => {
    it('should build participant summary with all fields', () => {
      const participant: ParticipantRow = {
        id: '1',
        participant_name: 'John Doe',
        role: 'Developer',
        user_id: 'user-1',
      };
      const user: UserRow = {
        id: 'user-1',
        description: 'Senior developer at Company X',
      };

      const result = buildParticipantSummary(participant, user, 0);

      expect(result).toEqual({
        name: 'John Doe',
        role: 'Developer',
        description: 'Senior developer at Company X',
      });
    });

    it('should return null for missing role', () => {
      const participant: ParticipantRow = {
        id: '1',
        participant_name: 'Jane Doe',
      };

      const result = buildParticipantSummary(participant, null, 0);

      expect(result.role).toBeNull();
    });

    it('should return null for missing description', () => {
      const participant: ParticipantRow = {
        id: '1',
        participant_name: 'Jane Doe',
      };
      const user: UserRow = {
        id: 'user-1',
        // No description
      };

      const result = buildParticipantSummary(participant, user, 0);

      expect(result.description).toBeNull();
    });

    it('should use buildParticipantDisplayName for name', () => {
      const participant: ParticipantRow = {
        id: '1',
        user_id: 'user-1',
      };
      const user: UserRow = {
        id: 'user-1',
        full_name: 'Derived Name',
      };

      const result = buildParticipantSummary(participant, user, 0);

      expect(result.name).toBe('Derived Name');
    });
  });

  describe('consistency between modes', () => {
    it('should produce same message format regardless of mode', () => {
      // This test ensures that buildMessageSummary produces
      // consistent output that can be used by buildConversationAgentVariables
      const message: MessageRow = {
        id: 'msg-1',
        ask_session_id: 'ask-1',
        content: 'Hello',
        sender_type: 'user',
        user_id: 'user-1',
        created_at: '2024-01-01T12:00:00Z',
        plan_step_id: 'step-1',
        metadata: { senderName: 'Custom Name' },
      };
      const user: UserRow = {
        id: 'user-1',
        full_name: 'User Name',
      };

      // Text mode would use buildDetailedMessage
      const textModeMessage = buildDetailedMessage(message, user, 0, 'ASK-KEY');

      // Voice mode would use buildMessageSummary
      const voiceModeMessage = buildMessageSummary(message, user, 0);

      // Test mode would use buildMessageSummary
      const testModeMessage = buildMessageSummary(message, user, 0);

      // All should have the same core fields
      expect(textModeMessage.senderName).toBe(voiceModeMessage.senderName);
      expect(textModeMessage.senderName).toBe(testModeMessage.senderName);
      expect(textModeMessage.planStepId).toBe(voiceModeMessage.planStepId);
      expect(textModeMessage.planStepId).toBe(testModeMessage.planStepId);
      expect(textModeMessage.content).toBe(voiceModeMessage.content);
      expect(textModeMessage.senderType).toBe(voiceModeMessage.senderType);
    });

    it('should always include planStepId in message summaries', () => {
      const messageWithStep: MessageRow = {
        id: 'msg-1',
        ask_session_id: 'ask-1',
        content: 'With step',
        plan_step_id: 'step-123',
      };

      const messageWithoutStep: MessageRow = {
        id: 'msg-2',
        ask_session_id: 'ask-1',
        content: 'Without step',
      };

      const withStep = buildMessageSummary(messageWithStep, null, 0);
      const withoutStep = buildMessageSummary(messageWithoutStep, null, 0);

      // Both should have planStepId field
      expect(withStep).toHaveProperty('planStepId');
      expect(withoutStep).toHaveProperty('planStepId');

      expect(withStep.planStepId).toBe('step-123');
      expect(withoutStep.planStepId).toBeNull();
    });
  });
});
