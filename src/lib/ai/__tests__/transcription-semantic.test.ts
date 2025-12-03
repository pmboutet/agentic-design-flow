import { TranscriptionManager } from '../speechmatics-transcription';

describe('TranscriptionManager + semantic EOT integration', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('delays processing until semantic probability crosses threshold', async () => {
    // Use real timers but with controlled delays via mock
    const onMessage = jest.fn();
    const processUserMessage = jest.fn().mockResolvedValue(undefined);

    // Track call order and control timing
    let evaluationCount = 0;
    const detector = {
      getSemanticEotProb: jest.fn().mockImplementation(async () => {
        evaluationCount++;
        // First call returns below threshold, second returns above
        return evaluationCount === 1 ? 0.42 : 0.81;
      }),
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
        gracePeriodMs: 10,    // Short grace period for testing
        maxHoldMs: 100,       // Short max hold for testing
        fallbackMode: 'force-send',
        maxContextMessages: 6,
        telemetry,
      },
    );

    // Start a transcript and mark end of utterance
    manager.handlePartialTranscript('je voulais savoir si tu étais dispo demain');
    manager.markEndOfUtterance();

    // Wait for the async semantic evaluation to complete
    // The evaluation is triggered immediately by markEndOfUtterance
    await new Promise(resolve => setTimeout(resolve, 50));

    // First call should have been made, and since prob (0.42) < threshold (0.7), it should hold
    expect(detector.getSemanticEotProb).toHaveBeenCalled();
    expect(telemetry).toHaveBeenCalledWith(expect.objectContaining({ decision: 'hold' }));

    // Wait for grace period to trigger second evaluation
    await new Promise(resolve => setTimeout(resolve, 50));

    // Second semantic evaluation should happen
    expect(detector.getSemanticEotProb.mock.calls.length).toBeGreaterThanOrEqual(2);

    // Wait for finalization
    await new Promise(resolve => setTimeout(resolve, 300));

    // Message should have been processed and dispatched
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
  }, 10000); // Increase timeout to 10s for this async test
});
