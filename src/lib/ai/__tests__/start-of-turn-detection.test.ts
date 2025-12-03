/**
 * Unit tests for Start-of-Turn Detection module
 * Tests LLM-based validation for barge-in detection
 */

import {
  createStartOfTurnDetector,
  resolveStartOfTurnDetectorConfig,
  type StartOfTurnDetectorConfig,
  type StartOfTurnValidationResult,
} from '../start-of-turn-detection';

// ============================================================================
// MOCK SETUP
// ============================================================================

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockFetch.mockReset();
  // Reset environment variables
  delete process.env.NEXT_PUBLIC_START_OF_TURN_ENABLED;
  delete process.env.START_OF_TURN_ENABLED;
  delete process.env.NEXT_PUBLIC_START_OF_TURN_PROVIDER;
  delete process.env.START_OF_TURN_PROVIDER;
  delete process.env.NEXT_PUBLIC_START_OF_TURN_MODEL;
  delete process.env.START_OF_TURN_MODEL;
  delete process.env.NEXT_PUBLIC_START_OF_TURN_TIMEOUT_MS;
  delete process.env.START_OF_TURN_TIMEOUT_MS;
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ============================================================================
// TESTS
// ============================================================================

describe('Start-of-Turn Detection', () => {
  describe('createStartOfTurnDetector', () => {
    test('should return null when disabled', () => {
      const config: StartOfTurnDetectorConfig = {
        enabled: false,
        provider: 'anthropic',
        model: 'claude-3-5-haiku-latest',
        requestTimeoutMs: 800,
      };

      const detector = createStartOfTurnDetector(config);

      expect(detector).toBeNull();
    });

    test('should return detector when enabled', () => {
      const config: StartOfTurnDetectorConfig = {
        enabled: true,
        provider: 'anthropic',
        model: 'claude-3-5-haiku-latest',
        requestTimeoutMs: 800,
      };

      const detector = createStartOfTurnDetector(config);

      expect(detector).not.toBeNull();
      expect(detector?.validateStartOfTurn).toBeDefined();
    });
  });

  describe('resolveStartOfTurnDetectorConfig', () => {
    test('should use default values when no env vars set', () => {
      const config = resolveStartOfTurnDetectorConfig();

      expect(config.enabled).toBe(true);
      expect(config.provider).toBe('anthropic');
      expect(config.model).toBe('claude-3-5-haiku-latest');
      expect(config.requestTimeoutMs).toBe(800);
    });

    test('should respect NEXT_PUBLIC_START_OF_TURN_ENABLED', () => {
      process.env.NEXT_PUBLIC_START_OF_TURN_ENABLED = 'false';

      const config = resolveStartOfTurnDetectorConfig();

      expect(config.enabled).toBe(false);
    });

    test('should respect START_OF_TURN_ENABLED', () => {
      process.env.START_OF_TURN_ENABLED = 'false';

      const config = resolveStartOfTurnDetectorConfig();

      expect(config.enabled).toBe(false);
    });

    test('should respect provider env var for OpenAI', () => {
      process.env.NEXT_PUBLIC_START_OF_TURN_PROVIDER = 'openai';

      const config = resolveStartOfTurnDetectorConfig();

      expect(config.provider).toBe('openai');
      expect(config.model).toBe('gpt-4o-mini'); // Default OpenAI model
    });

    test('should use custom model when specified', () => {
      process.env.NEXT_PUBLIC_START_OF_TURN_MODEL = 'claude-3-opus';

      const config = resolveStartOfTurnDetectorConfig();

      expect(config.model).toBe('claude-3-opus');
    });

    test('should use custom timeout when specified', () => {
      process.env.NEXT_PUBLIC_START_OF_TURN_TIMEOUT_MS = '1500';

      const config = resolveStartOfTurnDetectorConfig();

      expect(config.requestTimeoutMs).toBe(1500);
    });

    test('should be case insensitive for enabled', () => {
      process.env.NEXT_PUBLIC_START_OF_TURN_ENABLED = 'TRUE';

      const config = resolveStartOfTurnDetectorConfig();

      expect(config.enabled).toBe(true);
    });

    test('should be case insensitive for provider', () => {
      process.env.NEXT_PUBLIC_START_OF_TURN_PROVIDER = 'ANTHROPIC';

      const config = resolveStartOfTurnDetectorConfig();

      expect(config.provider).toBe('anthropic');
    });
  });

  describe('LLMStartOfTurnDetector.validateStartOfTurn', () => {
    test('should return valid start when detector is disabled', async () => {
      const config: StartOfTurnDetectorConfig = {
        enabled: false,
        provider: 'anthropic',
        model: 'claude-3-5-haiku-latest',
        requestTimeoutMs: 800,
      };

      // Create detector with enabled: true to get instance, then test disabled path
      const enabledConfig = { ...config, enabled: true };
      const detector = createStartOfTurnDetector(enabledConfig);

      // We can't directly test the disabled path through the public API
      // since createStartOfTurnDetector returns null when disabled
      // Instead, we test the factory behavior
      const disabledDetector = createStartOfTurnDetector(config);
      expect(disabledDetector).toBeNull();
    });

    test('should call Anthropic API endpoint', async () => {
      const config: StartOfTurnDetectorConfig = {
        enabled: true,
        provider: 'anthropic',
        model: 'claude-3-5-haiku-latest',
        requestTimeoutMs: 800,
      };

      const mockResult: StartOfTurnValidationResult = {
        isValidStart: true,
        isEcho: false,
        confidence: 0.9,
        reason: 'Valid user input',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
      });

      const detector = createStartOfTurnDetector(config)!;
      const result = await detector.validateStartOfTurn(
        'Hello there',
        'I was just saying...',
        [{ role: 'assistant', content: 'Hello!' }]
      );

      expect(result.isValidStart).toBe(true);
      expect(result.isEcho).toBe(false);
      expect(result.confidence).toBe(0.9);

      expect(mockFetch).toHaveBeenCalledWith('/api/start-of-turn', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }));

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.userTranscript).toBe('Hello there');
      expect(callBody.currentAssistantSpeech).toBe('I was just saying...');
      expect(callBody.provider).toBe('anthropic');
    });

    test('should call OpenAI API endpoint', async () => {
      const config: StartOfTurnDetectorConfig = {
        enabled: true,
        provider: 'openai',
        model: 'gpt-4o-mini',
        requestTimeoutMs: 800,
      };

      const mockResult: StartOfTurnValidationResult = {
        isValidStart: false,
        isEcho: true,
        confidence: 0.85,
        reason: 'Echo detected',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
      });

      const detector = createStartOfTurnDetector(config)!;
      const result = await detector.validateStartOfTurn(
        'same text as assistant',
        'same text as assistant',
        []
      );

      expect(result.isValidStart).toBe(false);
      expect(result.isEcho).toBe(true);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.provider).toBe('openai');
    });

    test('should handle API error gracefully', async () => {
      const config: StartOfTurnDetectorConfig = {
        enabled: true,
        provider: 'anthropic',
        model: 'claude-3-5-haiku-latest',
        requestTimeoutMs: 800,
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal error' }),
      });

      const detector = createStartOfTurnDetector(config)!;
      const result = await detector.validateStartOfTurn('test', 'assistant speech', []);

      // Should return valid start on error (fail open)
      expect(result.isValidStart).toBe(true);
      expect(result.isEcho).toBe(false);
      expect(result.confidence).toBe(0.5);
      expect(result.reason).toContain('Error');
    });

    test('should handle timeout gracefully', async () => {
      jest.useFakeTimers();

      const config: StartOfTurnDetectorConfig = {
        enabled: true,
        provider: 'anthropic',
        model: 'claude-3-5-haiku-latest',
        requestTimeoutMs: 100, // Short timeout
      };

      // Create a promise that never resolves to simulate timeout
      mockFetch.mockImplementationOnce(() => {
        return new Promise((resolve, reject) => {
          // Simulate abort error after timeout
          setTimeout(() => {
            const error = new Error('Aborted');
            error.name = 'AbortError';
            reject(error);
          }, 200);
        });
      });

      const detector = createStartOfTurnDetector(config)!;
      const resultPromise = detector.validateStartOfTurn('test', 'speech', []);

      // Advance timers
      jest.advanceTimersByTime(300);

      const result = await resultPromise;

      // Should return valid start on timeout (fail open)
      expect(result.isValidStart).toBe(true);
      expect(result.isEcho).toBe(false);
      expect(result.reason).toContain('Timeout');

      jest.useRealTimers();
    });

    test('should pass conversation history to API', async () => {
      const config: StartOfTurnDetectorConfig = {
        enabled: true,
        provider: 'anthropic',
        model: 'claude-3-5-haiku-latest',
        requestTimeoutMs: 800,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          isValidStart: true,
          isEcho: false,
          confidence: 0.9,
        }),
      });

      const conversationHistory = [
        { role: 'user' as const, content: 'Hello' },
        { role: 'assistant' as const, content: 'Hi there!' },
        { role: 'user' as const, content: 'How are you?' },
      ];

      const detector = createStartOfTurnDetector(config)!;
      await detector.validateStartOfTurn('test', 'speech', conversationHistory);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.conversationHistory).toEqual(conversationHistory);
    });

    test('should include model in API request', async () => {
      const config: StartOfTurnDetectorConfig = {
        enabled: true,
        provider: 'anthropic',
        model: 'claude-3-opus',
        requestTimeoutMs: 800,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          isValidStart: true,
          isEcho: false,
          confidence: 0.9,
        }),
      });

      const detector = createStartOfTurnDetector(config)!;
      await detector.validateStartOfTurn('test', 'speech', []);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.model).toBe('claude-3-opus');
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty user transcript', async () => {
      const config: StartOfTurnDetectorConfig = {
        enabled: true,
        provider: 'anthropic',
        model: 'claude-3-5-haiku-latest',
        requestTimeoutMs: 800,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          isValidStart: false,
          isEcho: false,
          confidence: 0.1,
          reason: 'Empty input',
        }),
      });

      const detector = createStartOfTurnDetector(config)!;
      const result = await detector.validateStartOfTurn('', 'speech', []);

      expect(result.isValidStart).toBe(false);
    });

    test('should handle empty assistant speech', async () => {
      const config: StartOfTurnDetectorConfig = {
        enabled: true,
        provider: 'anthropic',
        model: 'claude-3-5-haiku-latest',
        requestTimeoutMs: 800,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          isValidStart: true,
          isEcho: false,
          confidence: 0.95,
        }),
      });

      const detector = createStartOfTurnDetector(config)!;
      const result = await detector.validateStartOfTurn('hello', '', []);

      expect(result.isValidStart).toBe(true);
      expect(result.isEcho).toBe(false);
    });

    test('should handle special characters in transcript', async () => {
      const config: StartOfTurnDetectorConfig = {
        enabled: true,
        provider: 'anthropic',
        model: 'claude-3-5-haiku-latest',
        requestTimeoutMs: 800,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          isValidStart: true,
          isEcho: false,
          confidence: 0.9,
        }),
      });

      const detector = createStartOfTurnDetector(config)!;
      await detector.validateStartOfTurn(
        'Test with special chars: éàüö <>&"\'',
        'Assistant response',
        []
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.userTranscript).toContain('éàüö');
      expect(callBody.userTranscript).toContain('<>&');
    });

    test('should handle network error', async () => {
      const config: StartOfTurnDetectorConfig = {
        enabled: true,
        provider: 'anthropic',
        model: 'claude-3-5-haiku-latest',
        requestTimeoutMs: 800,
      };

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const detector = createStartOfTurnDetector(config)!;
      const result = await detector.validateStartOfTurn('test', 'speech', []);

      // Should fail open
      expect(result.isValidStart).toBe(true);
      expect(result.reason).toContain('Error');
    });

    test('should handle malformed JSON response', async () => {
      const config: StartOfTurnDetectorConfig = {
        enabled: true,
        provider: 'anthropic',
        model: 'claude-3-5-haiku-latest',
        requestTimeoutMs: 800,
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => { throw new Error('Invalid JSON'); },
      });

      const detector = createStartOfTurnDetector(config)!;
      const result = await detector.validateStartOfTurn('test', 'speech', []);

      // Should fail open
      expect(result.isValidStart).toBe(true);
    });
  });
});
