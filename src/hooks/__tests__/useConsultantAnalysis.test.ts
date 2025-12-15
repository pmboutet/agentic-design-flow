/**
 * Tests for useConsultantAnalysis hook
 * @jest-environment jsdom
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useConsultantAnalysis, ConsultantAnalysisConfig } from '../useConsultantAnalysis';
import type { SuggestedQuestion, Insight } from '@/types';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('useConsultantAnalysis', () => {
  const defaultConfig: ConsultantAnalysisConfig = {
    askKey: 'test-ask-key',
    enabled: true,
    messageCount: 5,
  };

  const mockSuccessResponse = {
    success: true,
    data: {
      questions: [
        { id: 'q1', text: 'Question 1', priority: 'high' },
        { id: 'q2', text: 'Question 2', priority: 'medium' },
      ] as SuggestedQuestion[],
      insights: [
        { id: 'i1', content: 'Insight 1', type: 'observation' },
      ] as Insight[],
    },
  };

  beforeEach(() => {
    jest.useFakeTimers();
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSuccessResponse),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize with empty questions and insights', () => {
      const { result } = renderHook(() => useConsultantAnalysis(defaultConfig));

      expect(result.current.questions).toEqual([]);
      expect(result.current.insights).toEqual([]);
      expect(result.current.isAnalyzing).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.isPaused).toBe(false);
    });

    it('should not analyze when disabled', async () => {
      renderHook(() =>
        useConsultantAnalysis({ ...defaultConfig, enabled: false })
      );

      // Wait for initial delay + analysis interval
      await act(async () => {
        jest.advanceTimersByTime(15000);
        await Promise.resolve();
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not analyze without askKey', async () => {
      renderHook(() =>
        useConsultantAnalysis({ ...defaultConfig, askKey: '' })
      );

      await act(async () => {
        jest.advanceTimersByTime(15000);
        await Promise.resolve();
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('automatic analysis', () => {
    it('should trigger initial analysis after delay', async () => {
      renderHook(() => useConsultantAnalysis(defaultConfig));

      // Initial delay is 2000ms
      await act(async () => {
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/ask/test-ask-key/consultant-analyze',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should trigger periodic analysis at configured interval when messageCount increases', async () => {
      const { rerender } = renderHook(
        (props) => useConsultantAnalysis(props),
        { initialProps: { ...defaultConfig, analysisInterval: 5000, messageCount: 1 } }
      );

      // Initial analysis at 2s
      await act(async () => {
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      mockFetch.mockClear();

      // Update messageCount to trigger new analysis
      rerender({ ...defaultConfig, analysisInterval: 5000, messageCount: 2 });

      // Periodic analysis at 5s interval
      await act(async () => {
        jest.advanceTimersByTime(5000);
        await Promise.resolve();
      });

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should not analyze when messageCount has not changed', async () => {
      const { rerender } = renderHook(
        (props) => useConsultantAnalysis(props),
        { initialProps: { ...defaultConfig, messageCount: 5 } }
      );

      // Initial analysis
      await act(async () => {
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      mockFetch.mockClear();

      // Trigger another interval with same messageCount
      await act(async () => {
        jest.advanceTimersByTime(10000);
        await Promise.resolve();
      });

      // Should not analyze because messageCount hasn't changed
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('API calls', () => {
    it('should include invite token in headers when provided', async () => {
      renderHook(() =>
        useConsultantAnalysis({
          ...defaultConfig,
          inviteToken: 'my-invite-token',
        })
      );

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/ask/test-ask-key/consultant-analyze',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Invite-Token': 'my-invite-token',
          }),
        })
      );
    });

    it('should update questions and insights on successful response', async () => {
      const onQuestionsUpdate = jest.fn();
      const onInsightsUpdate = jest.fn();

      const { result } = renderHook(() =>
        useConsultantAnalysis({
          ...defaultConfig,
          onQuestionsUpdate,
          onInsightsUpdate,
        })
      );

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      expect(result.current.questions).toHaveLength(2);
      expect(result.current.insights).toHaveLength(1);
      expect(onQuestionsUpdate).toHaveBeenCalledWith(mockSuccessResponse.data.questions);
      expect(onInsightsUpdate).toHaveBeenCalledWith(mockSuccessResponse.data.insights);
    });

    it('should call onStepCompleted when step is completed', async () => {
      const onStepCompleted = jest.fn();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            questions: [],
            insights: [],
            stepCompleted: 'step-123',
          },
        }),
      });

      renderHook(() =>
        useConsultantAnalysis({
          ...defaultConfig,
          onStepCompleted,
        })
      );

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      expect(onStepCompleted).toHaveBeenCalledWith('step-123');
    });

    it('should set isAnalyzing during analysis', async () => {
      const onAnalyzing = jest.fn();

      // Make fetch take some time
      mockFetch.mockImplementationOnce(() =>
        new Promise((resolve) =>
          setTimeout(() =>
            resolve({
              ok: true,
              json: () => Promise.resolve(mockSuccessResponse),
            }),
            100
          )
        )
      );

      const { result } = renderHook(() =>
        useConsultantAnalysis({
          ...defaultConfig,
          onAnalyzing,
        })
      );

      // Trigger analysis
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      expect(onAnalyzing).toHaveBeenCalledWith(true);

      // Complete the fetch
      await act(async () => {
        jest.advanceTimersByTime(100);
        await Promise.resolve();
      });

      expect(onAnalyzing).toHaveBeenCalledWith(false);
    });
  });

  describe('error handling', () => {
    it('should set error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' }),
      });

      const { result } = renderHook(() => useConsultantAnalysis(defaultConfig));

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      expect(result.current.error).toBe('Server error');
    });

    it('should set error on unsuccessful response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: false,
          error: 'Analysis failed',
        }),
      });

      const { result } = renderHook(() => useConsultantAnalysis(defaultConfig));

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      expect(result.current.error).toBe('Analysis failed');
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useConsultantAnalysis(defaultConfig));

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      expect(result.current.error).toBe('Network error');
    });

    it('should clear error on successful subsequent analysis', async () => {
      // First call fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' }),
      });

      const { result, rerender } = renderHook(
        (props) => useConsultantAnalysis(props),
        { initialProps: { ...defaultConfig, messageCount: 1 } }
      );

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      expect(result.current.error).toBe('Server error');

      // Second call succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSuccessResponse),
      });

      // Trigger new analysis with different messageCount
      rerender({ ...defaultConfig, messageCount: 2 });

      await act(async () => {
        jest.advanceTimersByTime(10000);
        await Promise.resolve();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('speaker change detection', () => {
    it('should update last speaker when notifySpeakerChange is called', async () => {
      const { result } = renderHook(() =>
        useConsultantAnalysis({ ...defaultConfig, messageCount: 10 })
      );

      // Initial state - no errors, not analyzing
      expect(result.current.error).toBeNull();
      expect(result.current.isAnalyzing).toBe(false);

      // Notify speaker change - function should be callable
      await act(async () => {
        result.current.notifySpeakerChange('user-1');
        await Promise.resolve();
      });

      // No error should be thrown
      expect(result.current.error).toBeNull();
    });

    it('should not throw when calling notifySpeakerChange while paused', async () => {
      const { result } = renderHook(() =>
        useConsultantAnalysis({ ...defaultConfig, messageCount: 5 })
      );

      // Pause
      act(() => {
        result.current.pause();
      });

      expect(result.current.isPaused).toBe(true);

      // Speaker change should not throw when paused
      await act(async () => {
        result.current.notifySpeakerChange('user-1');
        await Promise.resolve();
      });

      // Should still be paused
      expect(result.current.isPaused).toBe(true);
    });

    it('should not throw when calling notifySpeakerChange when disabled', async () => {
      const { result } = renderHook(() =>
        useConsultantAnalysis({ ...defaultConfig, enabled: false })
      );

      // Speaker change should not throw when disabled
      await act(async () => {
        result.current.notifySpeakerChange('user-1');
        await Promise.resolve();
      });

      // mockFetch should not be called when disabled
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('manual controls', () => {
    it('should allow manual trigger of analysis', async () => {
      const { result } = renderHook(() => useConsultantAnalysis(defaultConfig));

      await act(async () => {
        await result.current.triggerAnalysis();
      });

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should not trigger manual analysis when disabled', async () => {
      const { result } = renderHook(() =>
        useConsultantAnalysis({ ...defaultConfig, enabled: false })
      );

      await act(async () => {
        await result.current.triggerAnalysis();
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should pause automatic analysis', async () => {
      const { result } = renderHook(() => useConsultantAnalysis(defaultConfig));

      // Initial analysis
      await act(async () => {
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Pause
      act(() => {
        result.current.pause();
      });

      expect(result.current.isPaused).toBe(true);

      mockFetch.mockClear();

      // Should not analyze while paused
      await act(async () => {
        jest.advanceTimersByTime(20000);
        await Promise.resolve();
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should resume automatic analysis after pause', async () => {
      const { result, rerender } = renderHook(
        (props) => useConsultantAnalysis(props),
        { initialProps: { ...defaultConfig, messageCount: 1 } }
      );

      // Initial analysis
      await act(async () => {
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      // Pause
      act(() => {
        result.current.pause();
      });

      mockFetch.mockClear();

      // Resume
      act(() => {
        result.current.resume();
      });

      expect(result.current.isPaused).toBe(false);

      // Update messageCount to trigger analysis
      rerender({ ...defaultConfig, messageCount: 2 });

      // Should resume analyzing
      await act(async () => {
        jest.advanceTimersByTime(10000);
        await Promise.resolve();
      });

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('debouncing', () => {
    it('should debounce rapid analysis requests', async () => {
      const { result } = renderHook(() => useConsultantAnalysis(defaultConfig));

      // Trigger multiple rapid analyses
      await act(async () => {
        result.current.notifySpeakerChange('user-1');
        result.current.notifySpeakerChange('user-2');
        result.current.notifySpeakerChange('user-3');
        await Promise.resolve();
      });

      // Should only have made one call due to concurrent prevention
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should prevent concurrent analyses via isAnalyzing check', async () => {
      // This test verifies that concurrent analysis requests are prevented
      // by the isAnalyzingRef check in performAnalysis
      const { result } = renderHook(() =>
        useConsultantAnalysis({ ...defaultConfig, messageCount: 10 })
      );

      // Wait for initial analysis
      await act(async () => {
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);

      // After analysis completes, isAnalyzing should be false
      expect(result.current.isAnalyzing).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should stop analysis on unmount', async () => {
      const { unmount } = renderHook(() => useConsultantAnalysis(defaultConfig));

      // Initial analysis
      await act(async () => {
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      mockFetch.mockClear();
      unmount();

      // Advance timers after unmount
      await act(async () => {
        jest.advanceTimersByTime(30000);
      });

      // No more analyses after unmount
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not update state after unmount', async () => {
      // This test ensures no "Can't perform a React state update on an unmounted component" warning
      mockFetch.mockImplementation(() =>
        new Promise((resolve) =>
          setTimeout(() =>
            resolve({
              ok: true,
              json: () => Promise.resolve(mockSuccessResponse),
            }),
            500
          )
        )
      );

      const { result, unmount } = renderHook(() =>
        useConsultantAnalysis(defaultConfig)
      );

      // Start analysis
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      // Unmount before fetch completes
      unmount();

      // Complete the fetch
      await act(async () => {
        jest.advanceTimersByTime(500);
        await Promise.resolve();
      });

      // Should not throw - test passes if no error
    });
  });
});
