import {
  calculateTrackedProbability,
  createSemanticTurnDetector,
  formatMessagesAsChatML,
} from '../turn-detection';
import type { SemanticTurnDetectorConfig } from '../turn-detection-config';

describe('Semantic turn detection helper', () => {
  beforeEach(() => {
    (global as any).fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('formats messages in ChatML order', () => {
    const prompt = formatMessagesAsChatML([
      { role: 'user', content: 'Salut' },
      { role: 'assistant', content: 'Bonjour !' },
    ]);
    expect(prompt).toContain('<|im_start|>user');
    expect(prompt).toContain('<|im_start|>assistant');
    expect(prompt.trim().endsWith('<|im_start|>assistant')).toBe(true);
  });

  test('sums tracked probabilities from logprobs map', () => {
    const logprobs = {
      '<|im_end|>': Math.log(0.45),
      '.': Math.log(0.25),
    };
    const probability = calculateTrackedProbability(logprobs, ['<|im_end|>', '.']);
    expect(probability).toBeCloseTo(0.7, 2);
  });

  test('requests token probabilities from HTTP provider', async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            logprobs: {
              top_logprobs: [
                {
                  '<|im_end|>': Math.log(0.6),
                  '.': Math.log(0.2),
                },
              ],
            },
          },
        ],
      }),
    });

    const config: SemanticTurnDetectorConfig = {
      enabled: true,
      provider: 'http',
      model: 'mini',
      baseUrl: 'http://localhost:9999',
      apiKey: undefined,
      requestTimeoutMs: 1000,
      topLogprobs: 5,
      trackedTokens: ['<|im_end|>', '.'],
      probabilityThreshold: 0.7,
      gracePeriodMs: 200,
      maxHoldMs: 500,
      fallbackMode: 'force-send',
      contextMessages: 6,
    };

    const detector = createSemanticTurnDetector(config);
    expect(detector).toBeTruthy();
    const probability = await detector!.getSemanticEotProb([
      { role: 'user', content: 'Bonjour' },
      { role: 'assistant', content: 'Salut !' },
    ]);
    expect(probability).toBeCloseTo(0.8, 2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
