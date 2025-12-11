import { shouldUseSharedThread, AskSessionConfig } from '../asks';
import { isConsultantMode, getConversationModeDescription } from '../utils';

describe('shouldUseSharedThread', () => {
  describe('with conversation_mode set', () => {
    it('should return false for individual_parallel mode', () => {
      const config: AskSessionConfig = {
        conversation_mode: 'individual_parallel',
      };
      expect(shouldUseSharedThread(config)).toBe(false);
    });

    it('should return true for collaborative mode', () => {
      const config: AskSessionConfig = {
        conversation_mode: 'collaborative',
      };
      expect(shouldUseSharedThread(config)).toBe(true);
    });

    it('should return true for group_reporter mode', () => {
      const config: AskSessionConfig = {
        conversation_mode: 'group_reporter',
      };
      expect(shouldUseSharedThread(config)).toBe(true);
    });

    it('should return false for consultant mode (individual thread like individual_parallel)', () => {
      const config: AskSessionConfig = {
        conversation_mode: 'consultant',
      };
      // Consultant mode uses individual threads (same as individual_parallel)
      expect(shouldUseSharedThread(config)).toBe(false);
    });

    it('should handle unknown conversation_mode values as shared', () => {
      const config: AskSessionConfig = {
        conversation_mode: 'some_unknown_mode',
      };
      // Any mode other than 'individual_parallel' or 'consultant' should use shared thread
      expect(shouldUseSharedThread(config)).toBe(true);
    });
  });

  describe('with null/undefined values', () => {
    it('should return true for empty config (default to shared)', () => {
      const config: AskSessionConfig = {};
      expect(shouldUseSharedThread(config)).toBe(true);
    });

    it('should return true when conversation_mode is null (default to shared)', () => {
      const config: AskSessionConfig = {
        conversation_mode: null,
      };
      expect(shouldUseSharedThread(config)).toBe(true);
    });

    it('should return true when conversation_mode is undefined (default to shared)', () => {
      const config: AskSessionConfig = {
        conversation_mode: undefined,
      };
      expect(shouldUseSharedThread(config)).toBe(true);
    });
  });
});

describe('isConsultantMode', () => {
  it('should return true for consultant mode', () => {
    expect(isConsultantMode('consultant')).toBe(true);
  });

  it('should return false for other modes', () => {
    expect(isConsultantMode('individual_parallel')).toBe(false);
    expect(isConsultantMode('collaborative')).toBe(false);
    expect(isConsultantMode('group_reporter')).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isConsultantMode(undefined)).toBe(false);
  });
});

describe('getConversationModeDescription', () => {
  it('should return correct description for consultant mode', () => {
    expect(getConversationModeDescription('consultant')).toBe('Mode consultant (écoute IA)');
  });

  it('should return correct description for individual_parallel', () => {
    expect(getConversationModeDescription('individual_parallel')).toBe('Réponses individuelles en parallèle');
  });

  it('should return correct description for collaborative', () => {
    expect(getConversationModeDescription('collaborative')).toBe('Conversation collaborative');
  });

  it('should return correct description for group_reporter', () => {
    expect(getConversationModeDescription('group_reporter')).toBe('Groupe avec porte-parole');
  });

  it('should return default description for undefined', () => {
    expect(getConversationModeDescription(undefined)).toBe('Conversation collaborative');
  });
});
