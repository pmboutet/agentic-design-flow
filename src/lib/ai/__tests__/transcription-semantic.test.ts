import { TranscriptionManager } from '../speechmatics-transcription';

describe('TranscriptionManager silence-based turn detection', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  test('processes message after 10s silence timeout (no semantic detection)', async () => {
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

    // User says something
    manager.handlePartialTranscript('je voulais savoir si tu étais dispo demain');

    // Message should NOT be processed yet (silence timeout is 10s)
    expect(processUserMessage).not.toHaveBeenCalled();

    // End of utterance from Speechmatics - should NOT trigger processing
    // (we now wait for full silence timeout)
    manager.markEndOfUtterance();
    expect(processUserMessage).not.toHaveBeenCalled();

    // Fast forward 5 seconds - still not processed
    jest.advanceTimersByTime(5000);
    expect(processUserMessage).not.toHaveBeenCalled();

    // Fast forward another 5 seconds (total 10s) - NOW it should process
    jest.advanceTimersByTime(5000);

    // Need to flush promises for async processing
    await Promise.resolve();

    // Message should have been processed after 10s of silence
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
    manager.handlePartialTranscript('Bonjour');

    // Wait 8 seconds (not enough for 10s timeout)
    jest.advanceTimersByTime(8000);
    expect(processUserMessage).not.toHaveBeenCalled();

    // User continues speaking - this resets the timeout
    manager.handlePartialTranscript('Bonjour je voulais');

    // Wait another 8 seconds (total 16s but timeout was reset)
    jest.advanceTimersByTime(8000);
    expect(processUserMessage).not.toHaveBeenCalled();

    // Wait 2 more seconds (now 10s since last partial)
    jest.advanceTimersByTime(2000);
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
    manager.handlePartialTranscript('Je pense que');

    // Almost at timeout (9.5s)
    jest.advanceTimersByTime(9500);
    expect(processUserMessage).not.toHaveBeenCalled();

    // User resumes just before timeout!
    manager.handlePartialTranscript('Je pense que c\'est une bonne idée');

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
