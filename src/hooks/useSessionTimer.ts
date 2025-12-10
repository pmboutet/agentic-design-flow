/**
 * useSessionTimer - Hook for intelligent session timer
 *
 * Tracks active session time with smart pause/resume logic:
 * - Timer runs while AI is streaming
 * - Timer runs while user is typing or speaking
 * - Timer continues for 30 seconds after activity stops
 * - Timer pauses if no activity after 30 seconds
 * - Timer resumes when activity starts again
 */

import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * Timer state: 'running' when active, 'paused' when waiting for activity
 */
export type TimerState = 'running' | 'paused';

export interface SessionTimerConfig {
  /**
   * Inactivity timeout before pausing (in ms). Default: 30000 (30s)
   */
  inactivityTimeout?: number;

  /**
   * Initial elapsed time in seconds (for resuming sessions)
   */
  initialElapsedSeconds?: number;
}

export interface SessionTimerState {
  /**
   * Elapsed time in seconds
   */
  elapsedSeconds: number;

  /**
   * Elapsed time in minutes (for display)
   */
  elapsedMinutes: number;

  /**
   * Current timer state
   */
  timerState: TimerState;

  /**
   * Whether the timer is paused
   */
  isPaused: boolean;

  /**
   * Notify that AI is streaming (keeps timer active)
   */
  notifyAiStreaming: (isStreaming: boolean) => void;

  /**
   * Notify that user is typing (keeps timer active)
   */
  notifyUserTyping: (isTyping: boolean) => void;

  /**
   * Notify that user is speaking/voice active (keeps timer active)
   */
  notifyVoiceActive: (isActive: boolean) => void;

  /**
   * Notify that a message was submitted (resets inactivity countdown)
   */
  notifyMessageSubmitted: () => void;

  /**
   * Manually start the timer
   */
  start: () => void;

  /**
   * Manually pause the timer
   */
  pause: () => void;

  /**
   * Reset the timer to zero
   */
  reset: () => void;
}

export function useSessionTimer(config: SessionTimerConfig = {}): SessionTimerState {
  const {
    inactivityTimeout = 30000, // 30 seconds
    initialElapsedSeconds = 0,
  } = config;

  // State
  const [elapsedSeconds, setElapsedSeconds] = useState(initialElapsedSeconds);
  const [timerState, setTimerState] = useState<TimerState>('running');

  // Activity tracking refs
  const isAiStreamingRef = useRef(false);
  const isUserTypingRef = useRef(false);
  const isVoiceActiveRef = useRef(false);

  // Timer refs
  const tickIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const inactivityTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityTimestampRef = useRef<number>(Date.now());

  /**
   * Check if any activity is currently happening
   */
  const hasActiveActivity = useCallback(() => {
    return isAiStreamingRef.current || isUserTypingRef.current || isVoiceActiveRef.current;
  }, []);

  /**
   * Clear the inactivity timeout
   */
  const clearInactivityTimeout = useCallback(() => {
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current);
      inactivityTimeoutRef.current = null;
    }
  }, []);

  /**
   * Start the inactivity countdown (30s until pause)
   */
  const startInactivityCountdown = useCallback(() => {
    clearInactivityTimeout();

    // Only start countdown if no active activity
    if (hasActiveActivity()) {
      return;
    }

    inactivityTimeoutRef.current = setTimeout(() => {
      // Double-check no activity before pausing
      if (!hasActiveActivity()) {
        setTimerState('paused');
      }
    }, inactivityTimeout);
  }, [clearInactivityTimeout, hasActiveActivity, inactivityTimeout]);

  /**
   * Update activity and manage timer state
   */
  const updateActivityState = useCallback(() => {
    lastActivityTimestampRef.current = Date.now();

    if (hasActiveActivity()) {
      // Activity detected - ensure timer is running
      clearInactivityTimeout();
      setTimerState('running');
    } else {
      // No active activity - start countdown to pause
      startInactivityCountdown();
    }
  }, [hasActiveActivity, clearInactivityTimeout, startInactivityCountdown]);

  /**
   * Notify that AI is streaming
   */
  const notifyAiStreaming = useCallback((isStreaming: boolean) => {
    isAiStreamingRef.current = isStreaming;
    updateActivityState();
  }, [updateActivityState]);

  /**
   * Notify that user is typing
   */
  const notifyUserTyping = useCallback((isTyping: boolean) => {
    isUserTypingRef.current = isTyping;
    updateActivityState();
  }, [updateActivityState]);

  /**
   * Notify that voice is active
   */
  const notifyVoiceActive = useCallback((isActive: boolean) => {
    isVoiceActiveRef.current = isActive;
    updateActivityState();
  }, [updateActivityState]);

  /**
   * Notify that a message was submitted
   */
  const notifyMessageSubmitted = useCallback(() => {
    lastActivityTimestampRef.current = Date.now();
    clearInactivityTimeout();
    setTimerState('running');
    // Start countdown since submit is a one-time event
    startInactivityCountdown();
  }, [clearInactivityTimeout, startInactivityCountdown]);

  /**
   * Manually start the timer
   */
  const start = useCallback(() => {
    setTimerState('running');
    lastActivityTimestampRef.current = Date.now();
    startInactivityCountdown();
  }, [startInactivityCountdown]);

  /**
   * Manually pause the timer
   */
  const pause = useCallback(() => {
    setTimerState('paused');
    clearInactivityTimeout();
  }, [clearInactivityTimeout]);

  /**
   * Reset the timer
   */
  const reset = useCallback(() => {
    setElapsedSeconds(0);
    setTimerState('running');
    lastActivityTimestampRef.current = Date.now();
    clearInactivityTimeout();
    startInactivityCountdown();
  }, [clearInactivityTimeout, startInactivityCountdown]);

  // Tick interval - increment elapsed time every second when running
  useEffect(() => {
    if (timerState === 'running') {
      tickIntervalRef.current = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
    }

    return () => {
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
    };
  }, [timerState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearInactivityTimeout();
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
      }
    };
  }, [clearInactivityTimeout]);

  // Start inactivity countdown on mount
  useEffect(() => {
    startInactivityCountdown();
  }, [startInactivityCountdown]);

  // Calculate elapsed minutes with 1 decimal precision
  const elapsedMinutes = Math.round((elapsedSeconds / 60) * 10) / 10;

  return {
    elapsedSeconds,
    elapsedMinutes,
    timerState,
    isPaused: timerState === 'paused',
    notifyAiStreaming,
    notifyUserTyping,
    notifyVoiceActive,
    notifyMessageSubmitted,
    start,
    pause,
    reset,
  };
}
