import { TranscriptionManager } from '../speechmatics-transcription';

describe('TranscriptionManager silence-based turn detection', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  test('processes message after 2s silence timeout fallback (no EndOfUtterance)', async () => {
    const onMessage = jest.fn();
    const processUserMessage = jest.fn().mockResolvedValue(undefined);

    // Create manager WITHOUT semantic detector (simplified mode)
    const manager = new TranscriptionManager(
      onMessage,
      processUserMessage,
      [
        { role: 'user', content: 'hello there' },
        { role: 'agent', content: 'hi!' },
      ],
      true, // enablePartials
      undefined, // NO semantic options - disabled
    );

    // User says something (with timestamps)
    manager.handlePartialTranscript('je voulais savoir si tu étais dispo demain', 0, 2);

    // Message should NOT be processed yet (silence timeout is 2s)
    expect(processUserMessage).not.toHaveBeenCalled();

    // NOTE: We don't call markEndOfUtterance() here because that triggers
    // fast processing (300ms). This test verifies the silence timeout FALLBACK
    // which kicks in after 2s if no EndOfUtterance signal is received.

    // Fast forward 1 second - still not processed
    jest.advanceTimersByTime(1000);
    expect(processUserMessage).not.toHaveBeenCalled();

    // Fast forward another 1 second (total 2s) - NOW the silence fallback should trigger
    jest.advanceTimersByTime(1000);

    // Need to flush promises for async processing
    await Promise.resolve();

    // Message should have been processed after 2s of silence
    expect(processUserMessage).toHaveBeenCalledTimes(1);
    expect(processUserMessage).toHaveBeenCalledWith(
      expect.stringContaining('je voulais savoir si tu étais dispo demain')
    );

    // Final message callback should have been called
    expect(onMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        role: 'user',
        isInterim: false,
      }),
    );

    // Cleanup
    manager.cleanup();
  });

  test('resets silence timeout when user continues speaking', async () => {
    const onMessage = jest.fn();
    const processUserMessage = jest.fn().mockResolvedValue(undefined);

    const manager = new TranscriptionManager(
      onMessage,
      processUserMessage,
      [],
      true,
      undefined, // NO semantic options
    );

    // User starts speaking
    manager.handlePartialTranscript('Bonjour', 0, 0.5);

    // Wait 1 second (not enough for 2s timeout)
    jest.advanceTimersByTime(1000);
    expect(processUserMessage).not.toHaveBeenCalled();

    // User continues speaking - this resets the timeout (overlapping time range)
    manager.handlePartialTranscript('Bonjour je voulais', 0, 1);

    // Wait another 1 second (total 2s but timeout was reset)
    jest.advanceTimersByTime(1000);
    expect(processUserMessage).not.toHaveBeenCalled();

    // Wait 1 more second (now 2s since last partial)
    jest.advanceTimersByTime(1000);
    await Promise.resolve();

    // NOW it should be processed
    expect(processUserMessage).toHaveBeenCalledTimes(1);

    // Cleanup
    manager.cleanup();
  });

  test('cancels pending finalization when user resumes speaking', async () => {
    const onMessage = jest.fn();
    const processUserMessage = jest.fn().mockResolvedValue(undefined);

    const manager = new TranscriptionManager(
      onMessage,
      processUserMessage,
      [],
      true,
      undefined,
    );

    // User speaks and stops
    manager.handlePartialTranscript('Je pense que', 0, 1);

    // Almost at timeout (9.5s)
    jest.advanceTimersByTime(9500);
    expect(processUserMessage).not.toHaveBeenCalled();

    // User resumes just before timeout! (extended time range)
    manager.handlePartialTranscript('Je pense que c\'est une bonne idée', 0, 2);

    // The timeout should have been cancelled and reset
    // Wait the full 10s from the new partial
    jest.advanceTimersByTime(10000);
    await Promise.resolve();

    // Should process the COMPLETE message, not the fragment
    expect(processUserMessage).toHaveBeenCalledTimes(1);
    expect(processUserMessage).toHaveBeenCalledWith(
      expect.stringContaining('bonne idée')
    );

    // Cleanup
    manager.cleanup();
  });
});
