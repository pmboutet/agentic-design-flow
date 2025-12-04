import { shouldUseSharedThread, AskSessionConfig } from '../asks';

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

    it('should handle unknown conversation_mode values as shared', () => {
      const config: AskSessionConfig = {
        conversation_mode: 'some_unknown_mode',
      };
      // Any mode other than 'individual_parallel' should use shared thread
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
