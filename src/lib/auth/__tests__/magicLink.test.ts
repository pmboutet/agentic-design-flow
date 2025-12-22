/**
 * Unit tests for src/lib/auth/magicLink.ts
 * Magic link URL generation - no database dependencies
 */

import { generateMagicLinkUrl } from '../magicLink';

// ============================================================================
// generateMagicLinkUrl TESTS
// ============================================================================

describe('generateMagicLinkUrl', () => {
  // Store original env
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset env for each test
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('with participant token', () => {
    it('should generate URL with token parameter when participantToken is provided', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';

      const result = generateMagicLinkUrl('user@example.com', 'my-ask-key', 'abc123token');

      expect(result).toBe('https://app.example.com/?token=abc123token');
    });

    it('should ignore askKey when participantToken is provided', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';

      const result = generateMagicLinkUrl('user@example.com', 'my-ask-key', 'mytoken');

      expect(result).not.toContain('key=');
      expect(result).toContain('token=mytoken');
    });

    it('should handle long participant tokens', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';

      const longToken = 'a'.repeat(64);
      const result = generateMagicLinkUrl('user@example.com', 'key', longToken);

      expect(result).toBe(`https://app.example.com/?token=${longToken}`);
    });

    it('should handle tokens with special characters (should be pre-encoded)', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';

      // Note: In real usage, tokens should be URL-safe characters
      const result = generateMagicLinkUrl('user@example.com', 'key', 'abc-123_def');

      expect(result).toBe('https://app.example.com/?token=abc-123_def');
    });
  });

  describe('without participant token (using askKey)', () => {
    it('should generate URL with key parameter when no participantToken', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';

      const result = generateMagicLinkUrl('user@example.com', 'my-ask-key');

      expect(result).toBe('https://app.example.com/?key=my-ask-key');
    });

    it('should use askKey when participantToken is undefined', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';

      const result = generateMagicLinkUrl('user@example.com', 'project-2024', undefined);

      expect(result).toBe('https://app.example.com/?key=project-2024');
    });

    it('should use askKey when participantToken is empty string', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';

      // Empty string is falsy, so should fall back to askKey
      const result = generateMagicLinkUrl('user@example.com', 'my-key', '');

      expect(result).toBe('https://app.example.com/?key=my-key');
    });

    it('should handle askKey with dots and dashes', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';

      const result = generateMagicLinkUrl('user@example.com', 'project-2024.v1');

      expect(result).toBe('https://app.example.com/?key=project-2024.v1');
    });
  });

  describe('base URL resolution', () => {
    it('should use NEXT_PUBLIC_APP_URL when set', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://production.example.com';

      const result = generateMagicLinkUrl('user@example.com', 'my-key');

      expect(result).toStartWith('https://production.example.com/');
    });

    it('should fallback to localhost:3000 when NEXT_PUBLIC_APP_URL is not set', () => {
      delete process.env.NEXT_PUBLIC_APP_URL;

      const result = generateMagicLinkUrl('user@example.com', 'my-key');

      expect(result).toBe('http://localhost:3000/?key=my-key');
    });

    it('should fallback to localhost:3000 when NEXT_PUBLIC_APP_URL is empty', () => {
      process.env.NEXT_PUBLIC_APP_URL = '';

      const result = generateMagicLinkUrl('user@example.com', 'my-key');

      expect(result).toBe('http://localhost:3000/?key=my-key');
    });

    it('should handle base URL with trailing slash', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com/';

      const result = generateMagicLinkUrl('user@example.com', 'my-key');

      // Note: This might result in double slash, but that's valid
      expect(result).toContain('key=my-key');
    });

    it('should handle base URL with path', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com/app';

      const result = generateMagicLinkUrl('user@example.com', 'my-key');

      expect(result).toBe('https://app.example.com/app/?key=my-key');
    });
  });

  describe('email parameter (for display purposes)', () => {
    it('should accept email but not include it in URL', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';

      const result = generateMagicLinkUrl('user@example.com', 'my-key');

      expect(result).not.toContain('email');
      expect(result).not.toContain('user@example.com');
    });

    it('should work with various email formats', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';

      // These should all work - email is just for display
      expect(() => generateMagicLinkUrl('simple@example.com', 'key')).not.toThrow();
      expect(() => generateMagicLinkUrl('user+tag@example.com', 'key')).not.toThrow();
      expect(() => generateMagicLinkUrl('user.name@subdomain.example.com', 'key')).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle empty askKey', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';

      const result = generateMagicLinkUrl('user@example.com', '');

      expect(result).toBe('https://app.example.com/?key=');
    });

    it('should handle special characters in askKey', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';

      // Note: askKey should be validated elsewhere, but function should not crash
      const result = generateMagicLinkUrl('user@example.com', 'key_with-special.chars');

      expect(result).toContain('key=key_with-special.chars');
    });

    it('should handle unicode in email', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';

      // Unicode email (for display purposes)
      const result = generateMagicLinkUrl('用户@example.com', 'my-key');

      // Should work - email is not included in URL
      expect(result).toBe('https://app.example.com/?key=my-key');
    });
  });
});

// Custom matcher for cleaner tests
expect.extend({
  toStartWith(received: string, expected: string) {
    const pass = received.startsWith(expected);
    return {
      message: () =>
        pass
          ? `expected ${received} not to start with ${expected}`
          : `expected ${received} to start with ${expected}`,
      pass,
    };
  },
});

declare global {
  namespace jest {
    interface Matchers<R> {
      toStartWith(expected: string): R;
    }
  }
}
