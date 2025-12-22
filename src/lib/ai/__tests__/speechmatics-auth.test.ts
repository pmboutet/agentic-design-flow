/**
 * Unit tests for src/lib/ai/speechmatics-auth.ts
 * Speechmatics authentication utilities
 */

import { SpeechmaticsAuth } from '../speechmatics-auth';

// ============================================================================
// Mock fetch globally
// ============================================================================

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockClear();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ============================================================================
// SpeechmaticsAuth TESTS
// ============================================================================

describe('SpeechmaticsAuth', () => {
  describe('initial state', () => {
    it('should start with no JWT', () => {
      const auth = new SpeechmaticsAuth();
      expect(auth.getJWT()).toBeNull();
    });

    it('should start with no API key', () => {
      const auth = new SpeechmaticsAuth();
      expect(auth.getApiKey()).toBeNull();
    });

    it('should report hasJWT as false initially', () => {
      const auth = new SpeechmaticsAuth();
      expect(auth.hasJWT()).toBe(false);
    });
  });

  describe('authenticate() with JWT', () => {
    it('should fetch and store JWT successfully', async () => {
      const auth = new SpeechmaticsAuth();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jwt: 'test-jwt-token', ttl: 60 }),
      });

      const result = await auth.authenticate();

      expect(result).toBe('test-jwt-token');
      expect(auth.getJWT()).toBe('test-jwt-token');
      expect(auth.hasJWT()).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('/api/speechmatics-jwt', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
    });

    it('should reuse valid JWT without refetching', async () => {
      const auth = new SpeechmaticsAuth();

      // First call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jwt: 'cached-jwt', ttl: 60 }),
      });

      await auth.authenticate();

      // Second call should reuse cached JWT
      const result = await auth.authenticate();

      expect(result).toBe('cached-jwt');
      expect(mockFetch).toHaveBeenCalledTimes(1); // Only one fetch
    });

    it('should set JWT expiry to 90% of TTL', async () => {
      const auth = new SpeechmaticsAuth();
      const now = Date.now();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jwt: 'test-jwt', ttl: 100 }), // 100 seconds TTL
      });

      await auth.authenticate();

      // JWT should be valid
      expect(auth.hasJWT()).toBe(true);

      // Check that hasJWT respects expiry
      // With TTL of 100s and 90% buffer, expiry should be ~90s from now
      // (100 * 900 = 90000ms = 90s)
    });
  });

  describe('authenticate() fallback to API key', () => {
    it('should fall back to API key when JWT endpoint fails', async () => {
      const auth = new SpeechmaticsAuth();

      // JWT endpoint fails
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          text: async () => 'JWT endpoint error',
        })
        // API key endpoint succeeds
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ apiKey: 'test-api-key' }),
        });

      const result = await auth.authenticate();

      expect(result).toBe('test-api-key');
      expect(auth.getApiKey()).toBe('test-api-key');
      expect(auth.getJWT()).toBeNull();
    });

    it('should fall back to API key when JWT response has no jwt field', async () => {
      const auth = new SpeechmaticsAuth();

      mockFetch
        // JWT endpoint returns no jwt field
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ error: 'no jwt' }),
        })
        // API key endpoint succeeds
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ apiKey: 'fallback-key' }),
        });

      const result = await auth.authenticate();

      expect(result).toBe('fallback-key');
    });

    it('should throw error when both endpoints fail', async () => {
      const auth = new SpeechmaticsAuth();

      mockFetch
        // JWT endpoint fails
        .mockResolvedValueOnce({
          ok: false,
          text: async () => 'JWT error',
        })
        // API key endpoint also fails
        .mockResolvedValueOnce({
          ok: false,
          text: async () => 'API key error',
        });

      await expect(auth.authenticate()).rejects.toThrow(
        'Speechmatics authentication failed: API key error'
      );
    });

    it('should throw error when API key response has no apiKey field', async () => {
      const auth = new SpeechmaticsAuth();

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          text: async () => 'no jwt',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ error: 'no key' }),
        });

      await expect(auth.authenticate()).rejects.toThrow('Failed to get Speechmatics API key');
    });
  });

  describe('getElevenLabsApiKey()', () => {
    it('should fetch ElevenLabs API key successfully', async () => {
      const auth = new SpeechmaticsAuth();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apiKey: 'eleven-labs-key' }),
      });

      const result = await auth.getElevenLabsApiKey();

      expect(result).toBe('eleven-labs-key');
      expect(mockFetch).toHaveBeenCalledWith('/api/elevenlabs-token', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
    });

    it('should throw error when ElevenLabs endpoint fails', async () => {
      const auth = new SpeechmaticsAuth();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: async () => 'ElevenLabs error',
      });

      await expect(auth.getElevenLabsApiKey()).rejects.toThrow(
        'Failed to get ElevenLabs API key: ElevenLabs error'
      );
    });

    it('should throw error when response has no apiKey', async () => {
      const auth = new SpeechmaticsAuth();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await expect(auth.getElevenLabsApiKey()).rejects.toThrow('Failed to get ElevenLabs API key');
    });
  });

  describe('hasJWT() expiry logic', () => {
    it('should return false when JWT is expired', async () => {
      const auth = new SpeechmaticsAuth();

      // Mock Date.now to control time
      const originalNow = Date.now;
      let currentTime = 1000000;
      Date.now = jest.fn(() => currentTime);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jwt: 'expiring-jwt', ttl: 1 }), // 1 second TTL
      });

      await auth.authenticate();

      // JWT should be valid immediately after authentication
      expect(auth.hasJWT()).toBe(true);

      // Advance time past expiry (TTL * 900ms = 900ms, so 1 second should be past)
      currentTime += 2000; // 2 seconds later

      expect(auth.hasJWT()).toBe(false);

      // Restore Date.now
      Date.now = originalNow;
    });

    it('should return true when JWT is within 90% TTL buffer', async () => {
      const auth = new SpeechmaticsAuth();

      const originalNow = Date.now;
      let currentTime = 1000000;
      Date.now = jest.fn(() => currentTime);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jwt: 'valid-jwt', ttl: 100 }), // 100 seconds TTL
      });

      await auth.authenticate();

      // Advance time by 50 seconds (within 90% of 100s = 90s)
      currentTime += 50000;

      expect(auth.hasJWT()).toBe(true);

      // Advance time to 95 seconds (past 90% of TTL)
      currentTime += 45000; // Now at 95s

      expect(auth.hasJWT()).toBe(false);

      Date.now = originalNow;
    });
  });

  describe('re-authentication after expiry', () => {
    it('should refetch JWT when previous one expired', async () => {
      const auth = new SpeechmaticsAuth();

      const originalNow = Date.now;
      let currentTime = 1000000;
      Date.now = jest.fn(() => currentTime);

      // First authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jwt: 'first-jwt', ttl: 1 }),
      });

      await auth.authenticate();
      expect(auth.getJWT()).toBe('first-jwt');

      // Advance time past expiry
      currentTime += 2000;

      // Second authentication should fetch new JWT
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jwt: 'second-jwt', ttl: 60 }),
      });

      await auth.authenticate();
      expect(auth.getJWT()).toBe('second-jwt');
      expect(mockFetch).toHaveBeenCalledTimes(2);

      Date.now = originalNow;
    });
  });

  describe('network error handling', () => {
    it('should handle network errors gracefully', async () => {
      const auth = new SpeechmaticsAuth();

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(auth.authenticate()).rejects.toThrow('Network error');
    });

    it('should handle JSON parse errors', async () => {
      const auth = new SpeechmaticsAuth();

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          text: async () => 'Invalid response',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => {
            throw new Error('JSON parse error');
          },
        });

      await expect(auth.authenticate()).rejects.toThrow('JSON parse error');
    });
  });
});
