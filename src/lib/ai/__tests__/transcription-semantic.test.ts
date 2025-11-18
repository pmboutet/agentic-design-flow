import { TranscriptionManager } from '../speechmatics-transcription';

const flushAsync = () => new Promise(resolve => setImmediate(resolve));

describe('TranscriptionManager + semantic EOT integration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test('delays processing until semantic probability crosses threshold', async () => {
    const onMessage = jest.fn();
    const processUserMessage = jest.fn().mockResolvedValue(undefined);
    const detector = {
      getSemanticEotProb: jest
        .fn()
        .mockResolvedValueOnce(0.42)
        .mockResolvedValueOnce(0.81),
    };
    const telemetry = jest.fn();

    const manager = new TranscriptionManager(
      onMessage,
      processUserMessage,
      [
        { role: 'user', content: 'hello there' },
        { role: 'agent', content: 'hi!' },
      ],
      true,
      {
        detector,
        threshold: 0.7,
        gracePeriodMs: 25,
        maxHoldMs: 200,
        fallbackMode: 'force-send',
        maxContextMessages: 6,
        telemetry,
      },
    );

    manager.handlePartialTranscript('je voulais savoir si tu étais dispo demain');
    manager.markEndOfUtterance();

    await flushAsync();
    expect(detector.getSemanticEotProb).toHaveBeenCalledTimes(1);
    expect(telemetry).toHaveBeenCalledWith(expect.objectContaining({ decision: 'hold' }));

    jest.advanceTimersByTime(30);
    await flushAsync();
    expect(detector.getSemanticEotProb).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(220);
    await flushAsync();

    expect(processUserMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        role: 'user',
        isInterim: false,
      }),
    );
    expect(telemetry).toHaveBeenLastCalledWith(
      expect.objectContaining({
        decision: 'dispatch',
      }),
    );
  });
});
