/**
 * useSessionTimer - Hook for intelligent session timer with persistence
 *
 * Tracks active session time with smart pause/resume logic:
 * - Timer runs while AI is streaming
 * - Timer runs while user is typing or speaking
 * - Timer continues for 30 seconds after activity stops
 * - Timer pauses if no activity after 30 seconds
 * - Timer resumes when activity starts again
 *
 * Persistence:
 * - Saves to localStorage for instant restore on page refresh
 * - Syncs to server periodically (every 30s) and on pause
 */

import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * Timer state: 'running' when active, 'paused' when waiting for activity
 */
export type TimerState = 'running' | 'paused';

/**
 * Storage key prefix for localStorage
 */
const STORAGE_KEY_PREFIX = 'session_timer_';

/**
 * Server sync interval in milliseconds (30 seconds)
 */
const SERVER_SYNC_INTERVAL = 30000;

export interface SessionTimerConfig {
  /**
   * Inactivity timeout before pausing (in ms). Default: 30000 (30s)
   */
  inactivityTimeout?: number;

  /**
   * Initial elapsed time in seconds (for resuming sessions)
   * @deprecated Use askKey instead for automatic persistence
   */
  initialElapsedSeconds?: number;

  /**
   * ASK key for persistence (localStorage + server sync)
   * When provided, the timer will:
   * - Load initial value from localStorage (instant)
   * - Fetch server value and use the higher one
   * - Save to localStorage on every tick
   * - Sync to server periodically
   */
  askKey?: string;

  /**
   * Invite token for authenticated API calls
   */
  inviteToken?: string | null;

  /**
   * Callback when timer syncs to server
   */
  onServerSync?: (elapsedSeconds: number, success: boolean) => void;
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
   * Whether the timer is syncing to server
   */
  isSyncing: boolean;

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

  /**
   * Force sync to server immediately
   */
  syncToServer: () => Promise<boolean>;
}

/**
 * Get the localStorage key for a given ASK key
 */
function getStorageKey(askKey: string): string {
  return `${STORAGE_KEY_PREFIX}${askKey}`;
}

/**
 * Get the last activity timestamp key for localStorage
 */
function getLastActivityKey(askKey: string): string {
  return `${STORAGE_KEY_PREFIX}${askKey}_last_activity`;
}

/**
 * Save last activity timestamp to localStorage
 */
function saveLastActivity(askKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getLastActivityKey(askKey), String(Date.now()));
  } catch (error) {
    // Silent fail
  }
}

/**
 * Load last activity timestamp from localStorage
 */
function loadLastActivity(askKey: string): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(getLastActivityKey(askKey));
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
  } catch (error) {
    // Silent fail
  }
  return null;
}

/**
 * Load elapsed seconds from localStorage
 */
function loadFromLocalStorage(askKey: string): number {
  if (typeof window === 'undefined') return 0;
  try {
    const stored = localStorage.getItem(getStorageKey(askKey));
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        return parsed;
      }
    }
  } catch (error) {
    console.warn('Failed to load timer from localStorage:', error);
  }
  return 0;
}

/**
 * Save elapsed seconds to localStorage
 */
function saveToLocalStorage(askKey: string, elapsedSeconds: number): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getStorageKey(askKey), String(Math.floor(elapsedSeconds)));
  } catch (error) {
    console.warn('Failed to save timer to localStorage:', error);
  }
}

/**
 * Fetch elapsed seconds from server
 */
async function fetchFromServer(askKey: string, inviteToken?: string | null): Promise<number | null> {
  try {
    const headers: Record<string, string> = {};
    if (inviteToken) {
      headers['X-Invite-Token'] = inviteToken;
    }

    const response = await fetch(`/api/ask/${askKey}/timer`, { headers });
    if (!response.ok) {
      console.warn('Failed to fetch timer from server:', response.status);
      return null;
    }

    const result = await response.json();
    if (result.success && typeof result.data?.elapsedActiveSeconds === 'number') {
      return result.data.elapsedActiveSeconds;
    }
  } catch (error) {
    console.warn('Failed to fetch timer from server:', error);
  }
  return null;
}

/**
 * Save elapsed seconds to server
 */
async function saveToServer(
  askKey: string,
  elapsedSeconds: number,
  inviteToken?: string | null
): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (inviteToken) {
      headers['X-Invite-Token'] = inviteToken;
    }

    const response = await fetch(`/api/ask/${askKey}/timer`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ elapsedActiveSeconds: elapsedSeconds }),
    });

    return response.ok;
  } catch (error) {
    console.warn('Failed to save timer to server:', error);
    return false;
  }
}

export function useSessionTimer(config: SessionTimerConfig = {}): SessionTimerState {
  const {
    inactivityTimeout = 30000, // 30 seconds
    initialElapsedSeconds = 0,
    askKey,
    inviteToken,
    onServerSync,
  } = config;

  // Determine initial value from localStorage if askKey is provided
  const getInitialElapsedSeconds = () => {
    if (askKey) {
      const localValue = loadFromLocalStorage(askKey);
      return Math.max(localValue, initialElapsedSeconds);
    }
    return initialElapsedSeconds;
  };

  // Determine if we should start paused (user was away for longer than inactivity timeout)
  const shouldStartPaused = (): boolean => {
    if (!askKey) return false;
    const lastActivity = loadLastActivity(askKey);
    if (lastActivity === null) return false;
    const timeSinceLastActivity = Date.now() - lastActivity;
    // If user was away for more than inactivity timeout, start paused
    return timeSinceLastActivity > inactivityTimeout;
  };

  // State
  const [elapsedSeconds, setElapsedSeconds] = useState(getInitialElapsedSeconds);
  const [timerState, setTimerState] = useState<TimerState>(() => shouldStartPaused() ? 'paused' : 'running');
  const [isSyncing, setIsSyncing] = useState(false);

  // Activity tracking refs
  const isAiStreamingRef = useRef(false);
  const isUserTypingRef = useRef(false);
  const isVoiceActiveRef = useRef(false);

  // Timer refs
  const tickIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const inactivityTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const serverSyncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityTimestampRef = useRef<number>(Date.now());
  const lastServerSyncRef = useRef<number>(0);

  // Track elapsed seconds for server sync
  const elapsedSecondsRef = useRef(elapsedSeconds);
  useEffect(() => {
    elapsedSecondsRef.current = elapsedSeconds;
  }, [elapsedSeconds]);

  /**
   * Sync to server
   */
  const syncToServer = useCallback(async (): Promise<boolean> => {
    if (!askKey) return false;

    setIsSyncing(true);
    try {
      const success = await saveToServer(askKey, elapsedSecondsRef.current, inviteToken);
      lastServerSyncRef.current = Date.now();
      onServerSync?.(elapsedSecondsRef.current, success);
      return success;
    } finally {
      setIsSyncing(false);
    }
  }, [askKey, inviteToken, onServerSync]);

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
        // Sync to server when pausing
        if (askKey) {
          syncToServer();
        }
      }
    }, inactivityTimeout);
  }, [clearInactivityTimeout, hasActiveActivity, inactivityTimeout, askKey, syncToServer]);

  /**
   * Update activity and manage timer state
   */
  const updateActivityState = useCallback(() => {
    lastActivityTimestampRef.current = Date.now();
    // Save last activity to localStorage for detecting long absences on page reload
    if (askKey) {
      saveLastActivity(askKey);
    }

    if (hasActiveActivity()) {
      // Activity detected - ensure timer is running
      clearInactivityTimeout();
      setTimerState('running');
    } else {
      // No active activity - start countdown to pause
      startInactivityCountdown();
    }
  }, [hasActiveActivity, clearInactivityTimeout, startInactivityCountdown, askKey]);

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
    // Save last activity to localStorage
    if (askKey) {
      saveLastActivity(askKey);
    }
    clearInactivityTimeout();
    setTimerState('running');
    // Start countdown since submit is a one-time event
    startInactivityCountdown();
  }, [clearInactivityTimeout, startInactivityCountdown, askKey]);

  /**
   * Manually start the timer
   */
  const start = useCallback(() => {
    setTimerState('running');
    lastActivityTimestampRef.current = Date.now();
    if (askKey) {
      saveLastActivity(askKey);
    }
    startInactivityCountdown();
  }, [startInactivityCountdown, askKey]);

  /**
   * Manually pause the timer
   */
  const pause = useCallback(() => {
    setTimerState('paused');
    clearInactivityTimeout();
    // Sync to server when manually pausing
    if (askKey) {
      syncToServer();
    }
  }, [clearInactivityTimeout, askKey, syncToServer]);

  /**
   * Reset the timer
   */
  const reset = useCallback(() => {
    setElapsedSeconds(0);
    setTimerState('running');
    lastActivityTimestampRef.current = Date.now();
    clearInactivityTimeout();
    startInactivityCountdown();
    // Clear localStorage and sync reset to server
    if (askKey) {
      saveToLocalStorage(askKey, 0);
      syncToServer();
    }
  }, [clearInactivityTimeout, startInactivityCountdown, askKey, syncToServer]);

  // Load from server on mount (async, uses higher value)
  useEffect(() => {
    if (!askKey) return;

    let mounted = true;

    const loadServerValue = async () => {
      const serverValue = await fetchFromServer(askKey, inviteToken);
      if (mounted && serverValue !== null) {
        setElapsedSeconds(prev => {
          const maxValue = Math.max(prev, serverValue);
          // Update localStorage with the max value
          saveToLocalStorage(askKey, maxValue);
          return maxValue;
        });
      }
    };

    loadServerValue();

    return () => {
      mounted = false;
    };
  }, [askKey, inviteToken]);

  // Save to localStorage on every change
  useEffect(() => {
    if (askKey) {
      saveToLocalStorage(askKey, elapsedSeconds);
    }
  }, [askKey, elapsedSeconds]);

  // Periodic server sync
  useEffect(() => {
    if (!askKey) return;

    serverSyncIntervalRef.current = setInterval(() => {
      // Only sync if timer is running and there's been activity recently
      if (timerState === 'running') {
        syncToServer();
      }
    }, SERVER_SYNC_INTERVAL);

    return () => {
      if (serverSyncIntervalRef.current) {
        clearInterval(serverSyncIntervalRef.current);
        serverSyncIntervalRef.current = null;
      }
    };
  }, [askKey, timerState, syncToServer]);

  // Sync on unmount or page unload
  useEffect(() => {
    if (!askKey) return;

    const handleUnload = () => {
      // Use sendBeacon for reliable delivery on page unload
      if (navigator.sendBeacon) {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        const blob = new Blob(
          [JSON.stringify({ elapsedActiveSeconds: elapsedSecondsRef.current })],
          { type: 'application/json' }
        );
        navigator.sendBeacon(`/api/ask/${askKey}/timer`, blob);
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
      // Final sync on unmount
      syncToServer();
    };
  }, [askKey, syncToServer]);

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
      if (serverSyncIntervalRef.current) {
        clearInterval(serverSyncIntervalRef.current);
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
    isSyncing,
    notifyAiStreaming,
    notifyUserTyping,
    notifyVoiceActive,
    notifyMessageSubmitted,
    start,
    pause,
    reset,
    syncToServer,
  };
}
