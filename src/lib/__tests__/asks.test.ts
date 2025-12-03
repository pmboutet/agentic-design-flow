import { shouldUseSharedThread, AskSessionConfig } from '../asks';

describe('shouldUseSharedThread', () => {
  describe('with conversation_mode (new logic)', () => {
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

    it('should prioritize conversation_mode over legacy fields', () => {
      const config: AskSessionConfig = {
        conversation_mode: 'individual_parallel',
        // Legacy fields that would return true
        audience_scope: 'group',
        response_mode: 'collective',
      };
      // conversation_mode takes priority, so should return false
      expect(shouldUseSharedThread(config)).toBe(false);
    });

    it('should handle unknown conversation_mode values as shared', () => {
      const config: AskSessionConfig = {
        conversation_mode: 'some_unknown_mode',
      };
      // Any mode other than 'individual_parallel' should use shared thread
      expect(shouldUseSharedThread(config)).toBe(true);
    });
  });

  describe('with legacy fields (backward compatibility)', () => {
    it('should return true when audience_scope=group AND response_mode=collective', () => {
      const config: AskSessionConfig = {
        audience_scope: 'group',
        response_mode: 'collective',
      };
      expect(shouldUseSharedThread(config)).toBe(true);
    });

    it('should return false when audience_scope is not group', () => {
      const config: AskSessionConfig = {
        audience_scope: 'individual',
        response_mode: 'collective',
      };
      expect(shouldUseSharedThread(config)).toBe(false);
    });

    it('should return false when response_mode is not collective', () => {
      const config: AskSessionConfig = {
        audience_scope: 'group',
        response_mode: 'individual',
      };
      expect(shouldUseSharedThread(config)).toBe(false);
    });

    it('should return false when both legacy fields are different', () => {
      const config: AskSessionConfig = {
        audience_scope: 'individual',
        response_mode: 'individual',
      };
      expect(shouldUseSharedThread(config)).toBe(false);
    });
  });

  describe('with null/undefined values', () => {
    it('should return false for empty config (no conversation_mode)', () => {
      const config: AskSessionConfig = {};
      expect(shouldUseSharedThread(config)).toBe(false);
    });

    it('should return false when conversation_mode is null', () => {
      const config: AskSessionConfig = {
        conversation_mode: null,
      };
      expect(shouldUseSharedThread(config)).toBe(false);
    });

    it('should return false when conversation_mode is undefined', () => {
      const config: AskSessionConfig = {
        conversation_mode: undefined,
      };
      expect(shouldUseSharedThread(config)).toBe(false);
    });

    it('should fall back to legacy when conversation_mode is null but legacy fields set', () => {
      const config: AskSessionConfig = {
        conversation_mode: null,
        audience_scope: 'group',
        response_mode: 'collective',
      };
      expect(shouldUseSharedThread(config)).toBe(true);
    });
  });
});
