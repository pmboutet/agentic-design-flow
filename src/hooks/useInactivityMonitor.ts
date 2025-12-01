/**
 * useInactivityMonitor - Hook to monitor user and assistant activity
 *
 * Tracks:
 * - User text input
 * - Microphone packets (voice activity)
 * - Assistant speech timestamps
 *
 * After 20 seconds of inactivity, triggers blur/mute state
 * Tracks last speaker to determine resume behavior
 */

import { useEffect, useRef, useCallback, useState } from 'react';

export type Speaker = 'user' | 'assistant' | null;

export interface InactivityMonitorConfig {
  /**
   * Inactivity timeout in milliseconds (default: 20000 = 20s)
   */
  timeout?: number;

  /**
   * Callback fired when inactivity is detected
   */
  onInactive: () => void;

  /**
   * Callback fired when activity resumes after inactivity
   */
  onActive?: () => void;
}

export interface InactivityMonitorState {
  /**
   * Whether the user is currently inactive
   */
  isInactive: boolean;

  /**
   * Last speaker (user or assistant)
   */
  lastSpeaker: Speaker;

  /**
   * Timestamp of last activity (ms since epoch)
   */
  lastActivityTimestamp: number | null;

  /**
   * Whether the timer is currently paused (e.g., while assistant is speaking)
   */
  isPaused: boolean;

  /**
   * Reset inactivity timer (called when activity detected)
   */
  resetTimer: () => void;

  /**
   * Record user activity (text input or voice)
   */
  recordUserActivity: () => void;

  /**
   * Record assistant activity (speech output)
   * @param isFinal - Whether this is the final message (not interim)
   */
  recordAssistantActivity: (isFinal?: boolean) => void;

  /**
   * Pause the inactivity timer (e.g., while assistant is speaking)
   */
  pauseTimer: () => void;

  /**
   * Resume the inactivity timer after a delay
   * @param delayMs - Delay in milliseconds before resuming (default: 0)
   */
  resumeTimerAfterDelay: (delayMs?: number) => void;

  /**
   * Manually set inactive state
   */
  setInactive: (inactive: boolean) => void;
}

export function useInactivityMonitor(
  config: InactivityMonitorConfig
): InactivityMonitorState {
  const { timeout = 20000, onInactive, onActive } = config;

  // State
  const [isInactive, setIsInactive] = useState(false);
  const [lastSpeaker, setLastSpeaker] = useState<Speaker>(null);
  const [lastActivityTimestamp, setLastActivityTimestamp] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  // Refs for stable callbacks
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const resumeDelayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isPausedRef = useRef(false);
  const onInactiveRef = useRef(onInactive);
  const onActiveRef = useRef(onActive);

  // Update refs when callbacks change
  useEffect(() => {
    onInactiveRef.current = onInactive;
  }, [onInactive]);

  useEffect(() => {
    onActiveRef.current = onActive;
  }, [onActive]);

  // Keep isPausedRef in sync
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  /**
   * Clear existing timer
   */
  const clearTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  /**
   * Clear resume delay timer
   */
  const clearResumeDelayTimer = useCallback(() => {
    if (resumeDelayTimerRef.current) {
      clearTimeout(resumeDelayTimerRef.current);
      resumeDelayTimerRef.current = null;
    }
  }, []);

  /**
   * Start inactivity timer (only if not paused)
   */
  const startTimer = useCallback(() => {
    clearTimer();
    // Don't start timer if paused
    if (isPausedRef.current) {
      const timestamp = new Date().toISOString().split('T')[1].replace('Z', '');
      console.log(`[${timestamp}] [InactivityMonitor] ⏸️ Timer paused, not starting`);
      return;
    }
    inactivityTimerRef.current = setTimeout(() => {
      const timestamp = new Date().toISOString().split('T')[1].replace('Z', '');
      console.log(`[${timestamp}] [InactivityMonitor] ⏰ Inactivity timeout - triggering inactive state`);
      setIsInactive(true);
      onInactiveRef.current();
    }, timeout);
  }, [clearTimer, timeout]);

  /**
   * Reset timer (called on any activity)
   */
  const resetTimer = useCallback(() => {
    const wasInactive = isInactive;

    if (wasInactive) {
      const timestamp = new Date().toISOString().split('T')[1].replace('Z', '');
      console.log(`[${timestamp}] [InactivityMonitor] ✅ Activity resumed after inactivity`);
      setIsInactive(false);
      onActiveRef.current?.();
    }

    setLastActivityTimestamp(Date.now());
    startTimer();
  }, [isInactive, startTimer]);

  /**
   * Pause the inactivity timer (e.g., while assistant is speaking)
   */
  const pauseTimer = useCallback(() => {
    const timestamp = new Date().toISOString().split('T')[1].replace('Z', '');
    console.log(`[${timestamp}] [InactivityMonitor] ⏸️ Pausing timer (assistant speaking)`);
    setIsPaused(true);
    isPausedRef.current = true;
    clearTimer();
    clearResumeDelayTimer();
  }, [clearTimer, clearResumeDelayTimer]);

  /**
   * Resume the inactivity timer after a delay
   */
  const resumeTimerAfterDelay = useCallback((delayMs: number = 0) => {
    clearResumeDelayTimer();

    if (delayMs === 0) {
      const timestamp = new Date().toISOString().split('T')[1].replace('Z', '');
      console.log(`[${timestamp}] [InactivityMonitor] ▶️ Resuming timer immediately`);
      setIsPaused(false);
      isPausedRef.current = false;
      startTimer();
    } else {
      const timestamp = new Date().toISOString().split('T')[1].replace('Z', '');
      console.log(`[${timestamp}] [InactivityMonitor] ⏳ Will resume timer in ${delayMs}ms`);
      resumeDelayTimerRef.current = setTimeout(() => {
        const ts = new Date().toISOString().split('T')[1].replace('Z', '');
        console.log(`[${ts}] [InactivityMonitor] ▶️ Resuming timer after delay`);
        setIsPaused(false);
        isPausedRef.current = false;
        startTimer();
      }, delayMs);
    }
  }, [clearResumeDelayTimer, startTimer]);

  /**
   * Record user activity
   */
  const recordUserActivity = useCallback(() => {
    const timestamp = new Date().toISOString().split('T')[1].replace('Z', '');
    console.log(`[${timestamp}] [InactivityMonitor] 👤 User activity detected`);
    setLastSpeaker('user');
    // User activity cancels any pending resume and resets immediately
    clearResumeDelayTimer();
    setIsPaused(false);
    isPausedRef.current = false;
    resetTimer();
  }, [resetTimer, clearResumeDelayTimer]);

  /**
   * Record assistant activity
   * @param isFinal - Whether this is the final message (not interim)
   */
  const recordAssistantActivity = useCallback((isFinal: boolean = false) => {
    const timestamp = new Date().toISOString().split('T')[1].replace('Z', '');
    console.log(`[${timestamp}] [InactivityMonitor] 🤖 Assistant activity detected (isFinal: ${isFinal})`);
    setLastSpeaker('assistant');
    setLastActivityTimestamp(Date.now());

    if (!isFinal) {
      // Interim message: pause the timer while assistant is speaking
      pauseTimer();
    } else {
      // Final message: resume timer after a delay to account for TTS playback
      // Estimate ~3 seconds for TTS to finish playing
      resumeTimerAfterDelay(3000);
    }
  }, [pauseTimer, resumeTimerAfterDelay]);

  /**
   * Manually set inactive state
   */
  const setInactiveManual = useCallback((inactive: boolean) => {
    if (inactive) {
      clearTimer();
      setIsInactive(true);
    } else {
      setIsInactive(false);
      startTimer();
    }
  }, [clearTimer, startTimer]);

  // Start timer on mount
  useEffect(() => {
    startTimer();

    return () => {
      clearTimer();
      clearResumeDelayTimer();
    };
  }, [startTimer, clearTimer, clearResumeDelayTimer]);

  return {
    isInactive,
    lastSpeaker,
    lastActivityTimestamp,
    isPaused,
    resetTimer,
    recordUserActivity,
    recordAssistantActivity,
    pauseTimer,
    resumeTimerAfterDelay,
    setInactive: setInactiveManual,
  };
}
