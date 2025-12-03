/**
 * Unit tests for ElevenLabs TTS module
 * Tests text-to-speech streaming and voice management
 */

import { ElevenLabsTTS, type ElevenLabsConfig } from '../elevenlabs';

// ============================================================================
// MOCK SETUP
// ============================================================================

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ============================================================================
// TESTS
// ============================================================================

describe('ElevenLabsTTS', () => {
  describe('constructor', () => {
    test('should use default values when not provided', () => {
      const config: ElevenLabsConfig = {
        apiKey: 'test-api-key',
      };

      const tts = new ElevenLabsTTS(config);

      // Access private config through testing - we verify through API behavior
      expect(tts).toBeDefined();
    });

    test('should accept custom configuration', () => {
      const config: ElevenLabsConfig = {
        apiKey: 'test-api-key',
        voiceId: 'custom-voice-id',
        modelId: 'eleven_multilingual_v2',
        stability: 0.7,
        similarityBoost: 0.8,
        style: 0.5,
        useSpeakerBoost: false,
      };

      const tts = new ElevenLabsTTS(config);

      expect(tts).toBeDefined();
    });
  });

  describe('streamTextToSpeech', () => {
    test('should throw error for empty text', async () => {
      const tts = new ElevenLabsTTS({ apiKey: 'test-key' });

      await expect(tts.streamTextToSpeech('')).rejects.toThrow('Text is required');
    });

    test('should throw error for whitespace-only text', async () => {
      const tts = new ElevenLabsTTS({ apiKey: 'test-key' });

      await expect(tts.streamTextToSpeech('   ')).rejects.toThrow('Text is required');
    });

    test('should call ElevenLabs API with correct parameters', async () => {
      const config: ElevenLabsConfig = {
        apiKey: 'test-api-key',
        voiceId: 'voice-123',
        modelId: 'eleven_turbo_v2_5',
        stability: 0.5,
        similarityBoost: 0.75,
        style: 0.0,
        useSpeakerBoost: true,
      };

      // Mock readable stream
      const mockReadableStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: mockReadableStream,
      });

      const tts = new ElevenLabsTTS(config);
      await tts.streamTextToSpeech('Hello world');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.elevenlabs.io/v1/text-to-speech/voice-123/stream',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': 'test-api-key',
          },
        })
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.text).toBe('Hello world');
      expect(callBody.model_id).toBe('eleven_turbo_v2_5');
      expect(callBody.voice_settings.stability).toBe(0.5);
      expect(callBody.voice_settings.similarity_boost).toBe(0.75);
      expect(callBody.voice_settings.style).toBe(0.0);
      expect(callBody.voice_settings.use_speaker_boost).toBe(true);
    });

    test('should use custom voice ID when provided', async () => {
      const tts = new ElevenLabsTTS({
        apiKey: 'test-key',
        voiceId: 'default-voice',
      });

      const mockStream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: mockStream,
      });

      await tts.streamTextToSpeech('Test', 'custom-voice-override');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('custom-voice-override'),
        expect.anything()
      );
    });

    test('should throw error on API failure', async () => {
      const tts = new ElevenLabsTTS({ apiKey: 'test-key' });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(tts.streamTextToSpeech('Hello')).rejects.toThrow(
        'ElevenLabs API error (401): Unauthorized'
      );
    });

    test('should throw error when no response body', async () => {
      const tts = new ElevenLabsTTS({ apiKey: 'test-key' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: null,
      });

      await expect(tts.streamTextToSpeech('Hello')).rejects.toThrow(
        'No response body from ElevenLabs API'
      );
    });

    test('should return readable stream on success', async () => {
      const tts = new ElevenLabsTTS({ apiKey: 'test-key' });

      const mockChunks = [
        new Uint8Array([1, 2, 3]),
        new Uint8Array([4, 5, 6]),
      ];

      let chunkIndex = 0;
      const mockStream = new ReadableStream({
        pull(controller) {
          if (chunkIndex < mockChunks.length) {
            controller.enqueue(mockChunks[chunkIndex++]);
          } else {
            controller.close();
          }
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: mockStream,
      });

      const resultStream = await tts.streamTextToSpeech('Hello');

      expect(resultStream).toBeInstanceOf(ReadableStream);

      // Read the stream
      const reader = resultStream.getReader();
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      expect(chunks).toHaveLength(2);
    });

    test('should handle rate limit error', async () => {
      const tts = new ElevenLabsTTS({ apiKey: 'test-key' });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      });

      await expect(tts.streamTextToSpeech('Hello')).rejects.toThrow(
        'ElevenLabs API error (429): Rate limit exceeded'
      );
    });

    test('should handle quota exceeded error', async () => {
      const tts = new ElevenLabsTTS({ apiKey: 'test-key' });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 402,
        text: async () => 'Quota exceeded',
      });

      await expect(tts.streamTextToSpeech('Hello')).rejects.toThrow(
        'ElevenLabs API error (402): Quota exceeded'
      );
    });
  });

  describe('getVoices', () => {
    test('should fetch and return voices list', async () => {
      const tts = new ElevenLabsTTS({ apiKey: 'test-key' });

      const mockVoices = [
        { voice_id: 'voice-1', name: 'Rachel', category: 'premade' },
        { voice_id: 'voice-2', name: 'Adam', category: 'premade' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ voices: mockVoices }),
      });

      const voices = await tts.getVoices();

      expect(voices).toEqual(mockVoices);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.elevenlabs.io/v1/voices',
        expect.objectContaining({
          headers: {
            'xi-api-key': 'test-key',
          },
        })
      );
    });

    test('should return empty array when no voices', async () => {
      const tts = new ElevenLabsTTS({ apiKey: 'test-key' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ voices: null }),
      });

      const voices = await tts.getVoices();

      expect(voices).toEqual([]);
    });

    test('should throw error on API failure', async () => {
      const tts = new ElevenLabsTTS({ apiKey: 'test-key' });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Invalid API key',
      });

      await expect(tts.getVoices()).rejects.toThrow(
        'ElevenLabs API error (401): Invalid API key'
      );
    });
  });

  describe('streamToAudioBuffer', () => {
    test('should combine chunks and decode audio', async () => {
      const tts = new ElevenLabsTTS({ apiKey: 'test-key' });

      // Create mock stream
      const chunks = [
        new Uint8Array([1, 2, 3]),
        new Uint8Array([4, 5, 6]),
        new Uint8Array([7, 8, 9]),
      ];

      let chunkIndex = 0;
      const mockStream = new ReadableStream({
        pull(controller) {
          if (chunkIndex < chunks.length) {
            controller.enqueue(chunks[chunkIndex++]);
          } else {
            controller.close();
          }
        },
      });

      // Mock AudioContext
      const mockAudioBuffer = {
        duration: 1.5,
        numberOfChannels: 2,
        sampleRate: 44100,
      };

      const mockAudioContext = {
        decodeAudioData: jest.fn().mockResolvedValue(mockAudioBuffer),
      } as unknown as AudioContext;

      const result = await tts.streamToAudioBuffer(mockStream, mockAudioContext);

      expect(result).toBe(mockAudioBuffer);
      expect(mockAudioContext.decodeAudioData).toHaveBeenCalledTimes(1);

      // Verify combined data
      const callArg = (mockAudioContext.decodeAudioData as jest.Mock).mock.calls[0][0];
      expect(callArg.byteLength).toBe(9); // 3 + 3 + 3 bytes
    });

    test('should handle empty stream', async () => {
      const tts = new ElevenLabsTTS({ apiKey: 'test-key' });

      const mockStream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      const mockAudioBuffer = {};
      const mockAudioContext = {
        decodeAudioData: jest.fn().mockResolvedValue(mockAudioBuffer),
      } as unknown as AudioContext;

      const result = await tts.streamToAudioBuffer(mockStream, mockAudioContext);

      expect(result).toBe(mockAudioBuffer);

      // Verify empty buffer was passed
      const callArg = (mockAudioContext.decodeAudioData as jest.Mock).mock.calls[0][0];
      expect(callArg.byteLength).toBe(0);
    });

    test('should handle decode error', async () => {
      const tts = new ElevenLabsTTS({ apiKey: 'test-key' });

      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      });

      const mockAudioContext = {
        decodeAudioData: jest.fn().mockRejectedValue(new Error('Invalid audio data')),
      } as unknown as AudioContext;

      await expect(tts.streamToAudioBuffer(mockStream, mockAudioContext)).rejects.toThrow(
        'Invalid audio data'
      );
    });
  });

  describe('Edge Cases', () => {
    test('should handle very long text', async () => {
      const tts = new ElevenLabsTTS({ apiKey: 'test-key' });

      const longText = 'A'.repeat(10000);

      const mockStream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: mockStream,
      });

      await tts.streamTextToSpeech(longText);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.text).toBe(longText);
    });

    test('should handle special characters in text', async () => {
      const tts = new ElevenLabsTTS({ apiKey: 'test-key' });

      const specialText = 'Hello! How are you? Ça va? 你好 🎤';

      const mockStream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: mockStream,
      });

      await tts.streamTextToSpeech(specialText);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.text).toBe(specialText);
    });

    test('should handle text with newlines', async () => {
      const tts = new ElevenLabsTTS({ apiKey: 'test-key' });

      const multilineText = 'First line\nSecond line\nThird line';

      const mockStream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: mockStream,
      });

      await tts.streamTextToSpeech(multilineText);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.text).toBe(multilineText);
    });

    test('should use default Rachel voice when no voice specified', async () => {
      const tts = new ElevenLabsTTS({ apiKey: 'test-key' });

      const mockStream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: mockStream,
      });

      await tts.streamTextToSpeech('Hello');

      // Default Rachel voice ID
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('21m00Tcm4TlvDq8ikWAM'),
        expect.anything()
      );
    });

    test('should use default turbo model', async () => {
      const tts = new ElevenLabsTTS({ apiKey: 'test-key' });

      const mockStream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: mockStream,
      });

      await tts.streamTextToSpeech('Hello');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.model_id).toBe('eleven_turbo_v2_5');
    });
  });
});
