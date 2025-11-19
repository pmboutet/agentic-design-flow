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
   * Reset inactivity timer (called when activity detected)
   */
  resetTimer: () => void;

  /**
   * Record user activity (text input or voice)
   */
  recordUserActivity: () => void;

  /**
   * Record assistant activity (speech output)
   */
  recordAssistantActivity: () => void;

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

  // Refs for stable callbacks
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const onInactiveRef = useRef(onInactive);
  const onActiveRef = useRef(onActive);

  // Update refs when callbacks change
  useEffect(() => {
    onInactiveRef.current = onInactive;
  }, [onInactive]);

  useEffect(() => {
    onActiveRef.current = onActive;
  }, [onActive]);

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
   * Start inactivity timer
   */
  const startTimer = useCallback(() => {
    clearTimer();
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
   * Record user activity
   */
  const recordUserActivity = useCallback(() => {
    const timestamp = new Date().toISOString().split('T')[1].replace('Z', '');
    console.log(`[${timestamp}] [InactivityMonitor] 👤 User activity detected`);
    setLastSpeaker('user');
    resetTimer();
  }, [resetTimer]);

  /**
   * Record assistant activity
   */
  const recordAssistantActivity = useCallback(() => {
    const timestamp = new Date().toISOString().split('T')[1].replace('Z', '');
    console.log(`[${timestamp}] [InactivityMonitor] 🤖 Assistant activity detected`);
    setLastSpeaker('assistant');
    resetTimer();
  }, [resetTimer]);

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
    };
  }, [startTimer, clearTimer]);

  return {
    isInactive,
    lastSpeaker,
    lastActivityTimestamp,
    resetTimer,
    recordUserActivity,
    recordAssistantActivity,
    setInactive: setInactiveManual,
  };
}
