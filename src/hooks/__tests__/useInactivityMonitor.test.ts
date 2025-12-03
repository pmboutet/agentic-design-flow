/**
 * Tests for useInactivityMonitor hook
 * @jest-environment jsdom
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useInactivityMonitor } from '../useInactivityMonitor';

describe('useInactivityMonitor', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should initialize with active state', () => {
    const onInactive = jest.fn();
    const { result } = renderHook(() =>
      useInactivityMonitor({ timeout: 20000, onInactive })
    );

    expect(result.current.isInactive).toBe(false);
    expect(result.current.lastSpeaker).toBe(null);
    // lastActivityTimestamp starts as null until activity is recorded
    expect(result.current.lastActivityTimestamp).toBe(null);
  });

  it('should trigger onInactive after timeout', () => {
    const onInactive = jest.fn();
    const { result } = renderHook(() =>
      useInactivityMonitor({ timeout: 20000, onInactive })
    );

    expect(result.current.isInactive).toBe(false);

    // Fast-forward time to trigger inactivity
    act(() => {
      jest.advanceTimersByTime(20000);
    });

    expect(result.current.isInactive).toBe(true);
    expect(onInactive).toHaveBeenCalledTimes(1);
  });

  it('should reset timer on user activity', () => {
    const onInactive = jest.fn();
    const { result } = renderHook(() =>
      useInactivityMonitor({ timeout: 20000, onInactive })
    );

    // Advance time partway
    act(() => {
      jest.advanceTimersByTime(10000);
    });

    expect(result.current.isInactive).toBe(false);

    // Record user activity
    act(() => {
      result.current.recordUserActivity();
    });

    expect(result.current.lastSpeaker).toBe('user');

    // Advance time past original timeout (should not trigger)
    act(() => {
      jest.advanceTimersByTime(15000);
    });

    expect(result.current.isInactive).toBe(false);
    expect(onInactive).not.toHaveBeenCalled();

    // Advance to full timeout from reset (should trigger)
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(result.current.isInactive).toBe(true);
    expect(onInactive).toHaveBeenCalledTimes(1);
  });

  it('should track last speaker correctly', () => {
    const onInactive = jest.fn();
    const { result } = renderHook(() =>
      useInactivityMonitor({ timeout: 20000, onInactive })
    );

    // Record user activity
    act(() => {
      result.current.recordUserActivity();
    });

    expect(result.current.lastSpeaker).toBe('user');

    // Record assistant activity
    act(() => {
      result.current.recordAssistantActivity();
    });

    expect(result.current.lastSpeaker).toBe('assistant');
  });

  it('should call onActive when activity resumes after inactivity', () => {
    const onInactive = jest.fn();
    const onActive = jest.fn();
    const { result } = renderHook(() =>
      useInactivityMonitor({ timeout: 20000, onInactive, onActive })
    );

    // Trigger inactivity
    act(() => {
      jest.advanceTimersByTime(20000);
    });

    expect(result.current.isInactive).toBe(true);
    expect(onInactive).toHaveBeenCalledTimes(1);

    // Resume activity
    act(() => {
      result.current.recordUserActivity();
    });

    expect(result.current.isInactive).toBe(false);
    expect(onActive).toHaveBeenCalledTimes(1);
  });

  it('should allow manual control of inactive state', () => {
    const onInactive = jest.fn();
    const { result } = renderHook(() =>
      useInactivityMonitor({ timeout: 20000, onInactive })
    );

    // Manually set inactive
    act(() => {
      result.current.setInactive(true);
    });

    expect(result.current.isInactive).toBe(true);

    // Manually set active
    act(() => {
      result.current.setInactive(false);
    });

    expect(result.current.isInactive).toBe(false);
  });

  it('should update lastActivityTimestamp on activity', () => {
    const onInactive = jest.fn();
    const { result } = renderHook(() =>
      useInactivityMonitor({ timeout: 20000, onInactive })
    );

    const initialTimestamp = result.current.lastActivityTimestamp;

    // Wait a bit
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Record activity
    act(() => {
      result.current.recordUserActivity();
    });

    expect(result.current.lastActivityTimestamp).not.toBe(initialTimestamp);
    expect(result.current.lastActivityTimestamp).toBeGreaterThan(initialTimestamp || 0);
  });

  it('should use custom timeout value', () => {
    const onInactive = jest.fn();
    const customTimeout = 5000;
    const { result } = renderHook(() =>
      useInactivityMonitor({ timeout: customTimeout, onInactive })
    );

    expect(result.current.isInactive).toBe(false);

    // Advance to custom timeout
    act(() => {
      jest.advanceTimersByTime(customTimeout);
    });

    expect(result.current.isInactive).toBe(true);
    expect(onInactive).toHaveBeenCalledTimes(1);
  });

  it('should clean up timer on unmount', () => {
    const onInactive = jest.fn();
    const { unmount } = renderHook(() =>
      useInactivityMonitor({ timeout: 20000, onInactive })
    );

    unmount();

    // Advance time after unmount
    act(() => {
      jest.advanceTimersByTime(20000);
    });

    // Should not trigger callback after unmount
    expect(onInactive).not.toHaveBeenCalled();
  });
});
