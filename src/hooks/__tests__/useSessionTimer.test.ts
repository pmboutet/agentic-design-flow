/**
 * Tests for useSessionTimer hook
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { useSessionTimer } from '../useSessionTimer';

describe('useSessionTimer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize with running state', () => {
      const { result } = renderHook(() => useSessionTimer());

      expect(result.current.timerState).toBe('running');
      expect(result.current.isPaused).toBe(false);
      expect(result.current.elapsedSeconds).toBe(0);
      expect(result.current.elapsedMinutes).toBe(0);
    });

    it('should accept initial elapsed seconds', () => {
      const { result } = renderHook(() =>
        useSessionTimer({ initialElapsedSeconds: 120 })
      );

      expect(result.current.elapsedSeconds).toBe(120);
      expect(result.current.elapsedMinutes).toBe(2);
    });
  });

  describe('time tracking', () => {
    it('should increment elapsed time every second when running', () => {
      const { result } = renderHook(() => useSessionTimer());

      expect(result.current.elapsedSeconds).toBe(0);

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(result.current.elapsedSeconds).toBe(1);

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(result.current.elapsedSeconds).toBe(6);
    });

    it('should calculate elapsed minutes with 1 decimal precision', () => {
      const { result } = renderHook(() =>
        useSessionTimer({ initialElapsedSeconds: 90 })
      );

      expect(result.current.elapsedMinutes).toBe(1.5);
    });

    it('should not increment time when paused', () => {
      const { result } = renderHook(() => useSessionTimer());

      // Advance to pause state (30s inactivity)
      act(() => {
        jest.advanceTimersByTime(30000);
      });

      expect(result.current.isPaused).toBe(true);
      const secondsAtPause = result.current.elapsedSeconds;

      // Advance more time - should not increment
      act(() => {
        jest.advanceTimersByTime(10000);
      });

      expect(result.current.elapsedSeconds).toBe(secondsAtPause);
    });
  });

  describe('inactivity pause', () => {
    it('should pause after 30 seconds of inactivity by default', () => {
      const { result } = renderHook(() => useSessionTimer());

      expect(result.current.isPaused).toBe(false);

      act(() => {
        jest.advanceTimersByTime(30000);
      });

      expect(result.current.isPaused).toBe(true);
      expect(result.current.timerState).toBe('paused');
    });

    it('should respect custom inactivity timeout', () => {
      const { result } = renderHook(() =>
        useSessionTimer({ inactivityTimeout: 10000 })
      );

      expect(result.current.isPaused).toBe(false);

      act(() => {
        jest.advanceTimersByTime(10000);
      });

      expect(result.current.isPaused).toBe(true);
    });
  });

  describe('AI streaming activity', () => {
    it('should keep timer running while AI is streaming', () => {
      const { result } = renderHook(() =>
        useSessionTimer({ inactivityTimeout: 5000 })
      );

      // Start AI streaming
      act(() => {
        result.current.notifyAiStreaming(true);
      });

      // Advance past inactivity timeout
      act(() => {
        jest.advanceTimersByTime(10000);
      });

      // Should still be running because AI is streaming
      expect(result.current.isPaused).toBe(false);

      // Stop AI streaming
      act(() => {
        result.current.notifyAiStreaming(false);
      });

      // Now advance to trigger pause
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(result.current.isPaused).toBe(true);
    });
  });

  describe('user typing activity', () => {
    it('should keep timer running while user is typing', () => {
      const { result } = renderHook(() =>
        useSessionTimer({ inactivityTimeout: 5000 })
      );

      // Start typing
      act(() => {
        result.current.notifyUserTyping(true);
      });

      // Advance past inactivity timeout
      act(() => {
        jest.advanceTimersByTime(10000);
      });

      // Should still be running because user is typing
      expect(result.current.isPaused).toBe(false);
    });

    it('should resume timer when user starts typing after pause', () => {
      const { result } = renderHook(() =>
        useSessionTimer({ inactivityTimeout: 5000 })
      );

      // Let it pause
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(result.current.isPaused).toBe(true);

      // Start typing - should resume
      act(() => {
        result.current.notifyUserTyping(true);
      });

      expect(result.current.isPaused).toBe(false);
      expect(result.current.timerState).toBe('running');
    });
  });

  describe('voice activity', () => {
    it('should keep timer running while voice is active', () => {
      const { result } = renderHook(() =>
        useSessionTimer({ inactivityTimeout: 5000 })
      );

      // Activate voice
      act(() => {
        result.current.notifyVoiceActive(true);
      });

      // Advance past inactivity timeout
      act(() => {
        jest.advanceTimersByTime(10000);
      });

      // Should still be running because voice is active
      expect(result.current.isPaused).toBe(false);
    });
  });

  describe('message submission', () => {
    it('should resume timer and reset inactivity countdown on message submit', () => {
      const { result } = renderHook(() =>
        useSessionTimer({ inactivityTimeout: 5000 })
      );

      // Let it pause
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(result.current.isPaused).toBe(true);

      // Submit message - should resume
      act(() => {
        result.current.notifyMessageSubmitted();
      });

      expect(result.current.isPaused).toBe(false);

      // Advance partially - should still be running
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      expect(result.current.isPaused).toBe(false);

      // Complete the inactivity timeout - should pause
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      expect(result.current.isPaused).toBe(true);
    });
  });

  describe('manual controls', () => {
    it('should allow manual start', () => {
      const { result } = renderHook(() =>
        useSessionTimer({ inactivityTimeout: 5000 })
      );

      // Let it pause
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(result.current.isPaused).toBe(true);

      // Manual start
      act(() => {
        result.current.start();
      });

      expect(result.current.isPaused).toBe(false);
    });

    it('should allow manual pause', () => {
      const { result } = renderHook(() => useSessionTimer());

      expect(result.current.isPaused).toBe(false);

      act(() => {
        result.current.pause();
      });

      expect(result.current.isPaused).toBe(true);
    });

    it('should allow reset', () => {
      const { result } = renderHook(() =>
        useSessionTimer({ initialElapsedSeconds: 100 })
      );

      expect(result.current.elapsedSeconds).toBe(100);

      act(() => {
        result.current.reset();
      });

      expect(result.current.elapsedSeconds).toBe(0);
      expect(result.current.isPaused).toBe(false);
    });
  });

  describe('multiple activity sources', () => {
    it('should stay running if any activity source is active', () => {
      const { result } = renderHook(() =>
        useSessionTimer({ inactivityTimeout: 5000 })
      );

      // Both typing and AI streaming active
      act(() => {
        result.current.notifyUserTyping(true);
        result.current.notifyAiStreaming(true);
      });

      // Stop typing but AI still streaming
      act(() => {
        result.current.notifyUserTyping(false);
      });

      act(() => {
        jest.advanceTimersByTime(10000);
      });

      // Should still be running because AI is streaming
      expect(result.current.isPaused).toBe(false);

      // Stop AI streaming
      act(() => {
        result.current.notifyAiStreaming(false);
      });

      // Now should pause after timeout
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(result.current.isPaused).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should cleanup timers on unmount', () => {
      const { result, unmount } = renderHook(() => useSessionTimer());

      // Start some activity
      act(() => {
        result.current.notifyUserTyping(true);
        result.current.notifyUserTyping(false);
      });

      unmount();

      // Should not throw or cause issues
      act(() => {
        jest.advanceTimersByTime(100000);
      });
    });
  });
});
