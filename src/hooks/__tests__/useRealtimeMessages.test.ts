/**
 * Tests for useRealtimeMessages hook
 * @jest-environment jsdom
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useRealtimeMessages, UseRealtimeMessagesConfig } from '../useRealtimeMessages';
import type { Message } from '@/types';

// Mock Supabase client
const mockSubscribe = jest.fn();
const mockOn = jest.fn().mockReturnThis();
const mockChannel = jest.fn().mockReturnValue({
  on: mockOn,
  subscribe: mockSubscribe,
});
const mockRemoveChannel = jest.fn();

jest.mock('@/lib/supabaseClient', () => ({
  supabase: {
    channel: (...args: unknown[]) => mockChannel(...args),
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
  },
}));

// Mock fetch for polling tests
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('useRealtimeMessages', () => {
  const defaultConfig: UseRealtimeMessagesConfig = {
    conversationThreadId: 'thread-123',
    askKey: 'test-ask',
    enabled: true,
    onNewMessage: jest.fn(),
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    // Reset localStorage
    localStorage.clear();

    // Default mock - subscribe immediately succeeds
    mockSubscribe.mockImplementation((callback) => {
      if (callback) {
        callback('SUBSCRIBED', null);
      }
      return { on: mockOn, subscribe: mockSubscribe };
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize with idle status when disabled', () => {
      const { result } = renderHook(() =>
        useRealtimeMessages({ ...defaultConfig, enabled: false })
      );

      expect(result.current.subscriptionStatus).toBe('idle');
      expect(result.current.isSubscribed).toBe(false);
    });

    it('should initialize with idle status when no thread ID', () => {
      const { result } = renderHook(() =>
        useRealtimeMessages({ ...defaultConfig, conversationThreadId: null })
      );

      expect(result.current.subscriptionStatus).toBe('idle');
    });

    it('should not have any errors initially', () => {
      const { result } = renderHook(() => useRealtimeMessages(defaultConfig));

      expect(result.current.lastError).toBeNull();
    });
  });

  describe('subscription lifecycle', () => {
    it('should create a channel with correct name', () => {
      renderHook(() => useRealtimeMessages(defaultConfig));

      expect(mockChannel).toHaveBeenCalledWith('messages:thread:thread-123');
    });

    it('should subscribe to INSERT events on messages table', () => {
      renderHook(() => useRealtimeMessages(defaultConfig));

      expect(mockOn).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: 'conversation_thread_id=eq.thread-123',
        }),
        expect.any(Function)
      );
    });

    it('should set subscribed status on successful subscription', () => {
      const { result } = renderHook(() => useRealtimeMessages(defaultConfig));

      expect(result.current.subscriptionStatus).toBe('subscribed');
      expect(result.current.isSubscribed).toBe(true);
    });

    it('should set error status on subscription failure', () => {
      mockSubscribe.mockImplementation((callback) => {
        callback('CHANNEL_ERROR', { message: 'Connection failed' });
        return { on: mockOn, subscribe: mockSubscribe };
      });

      const { result } = renderHook(() =>
        useRealtimeMessages({ ...defaultConfig, conversationThreadId: 'error-thread' })
      );

      // Wait for retries to complete
      act(() => {
        jest.advanceTimersByTime(30000);
      });

      expect(result.current.subscriptionStatus).toBe('error');
      expect(result.current.lastError).toBe('Connection failed');
    });

    it('should detect JWT token expiration and set isTokenExpired', () => {
      mockSubscribe.mockImplementation((callback) => {
        callback('CHANNEL_ERROR', { message: 'InvalidJWTToken: Token has expired 5847 seconds ago' });
        return { on: mockOn, subscribe: mockSubscribe };
      });

      const { result } = renderHook(() =>
        useRealtimeMessages({ ...defaultConfig, conversationThreadId: 'expired-token-thread' })
      );

      // Wait for retries to complete
      act(() => {
        jest.advanceTimersByTime(30000);
      });

      expect(result.current.subscriptionStatus).toBe('error');
      expect(result.current.isTokenExpired).toBe(true);
      expect(result.current.lastError).toContain('Token has expired');
    });

    it('should detect various JWT expiration error formats', () => {
      // Test different error message formats
      const errorFormats = [
        'jwt expired',
        'Token expired',
        'InvalidJWTToken: expired',
        'token has expired 123 seconds ago',
      ];

      for (const errorMessage of errorFormats) {
        mockSubscribe.mockImplementation((callback) => {
          callback('CHANNEL_ERROR', { message: errorMessage });
          return { on: mockOn, subscribe: mockSubscribe };
        });

        const { result, unmount } = renderHook(() =>
          useRealtimeMessages({ ...defaultConfig, conversationThreadId: `test-${errorMessage}` })
        );

        act(() => {
          jest.advanceTimersByTime(30000);
        });

        expect(result.current.isTokenExpired).toBe(true);
        unmount();
      }
    });

    it('should remove channel on unmount', () => {
      const { unmount } = renderHook(() => useRealtimeMessages(defaultConfig));

      unmount();

      expect(mockRemoveChannel).toHaveBeenCalled();
    });

    it('should remove old channel when thread ID changes', () => {
      const { rerender } = renderHook(
        (props) => useRealtimeMessages(props),
        { initialProps: defaultConfig }
      );

      mockRemoveChannel.mockClear();

      rerender({ ...defaultConfig, conversationThreadId: 'new-thread-456' });

      expect(mockRemoveChannel).toHaveBeenCalled();
      expect(mockChannel).toHaveBeenCalledWith('messages:thread:new-thread-456');
    });
  });

  describe('message handling', () => {
    it('should call onNewMessage when a new message arrives', () => {
      const onNewMessage = jest.fn();
      renderHook(() =>
        useRealtimeMessages({ ...defaultConfig, onNewMessage })
      );

      // Get the message handler from the mock
      const messageHandler = mockOn.mock.calls[0][2];

      // Simulate a new message
      const dbMessage = {
        id: 'msg-1',
        ask_session_id: 'session-1',
        conversation_thread_id: 'thread-123',
        user_id: 'user-1',
        sender_type: 'user',
        content: 'Hello world',
        message_type: 'text',
        metadata: { senderName: 'Test User' },
        created_at: '2024-01-01T00:00:00Z',
        parent_message_id: null,
        plan_step_id: null,
      };

      act(() => {
        messageHandler({ new: dbMessage });
      });

      expect(onNewMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'msg-1',
          askKey: 'test-ask',
          content: 'Hello world',
          senderType: 'user',
          senderName: 'Test User',
        })
      );
    });

    it('should deduplicate messages with the same ID', () => {
      const onNewMessage = jest.fn();
      renderHook(() =>
        useRealtimeMessages({ ...defaultConfig, onNewMessage })
      );

      const messageHandler = mockOn.mock.calls[0][2];
      const dbMessage = {
        id: 'msg-duplicate',
        ask_session_id: 'session-1',
        conversation_thread_id: 'thread-123',
        user_id: 'user-1',
        sender_type: 'user',
        content: 'Duplicate message',
        message_type: 'text',
        metadata: null,
        created_at: '2024-01-01T00:00:00Z',
        parent_message_id: null,
        plan_step_id: null,
      };

      // Send same message twice
      act(() => {
        messageHandler({ new: dbMessage });
        messageHandler({ new: dbMessage });
      });

      expect(onNewMessage).toHaveBeenCalledTimes(1);
    });

    it('should format AI messages with default sender name', () => {
      const onNewMessage = jest.fn();
      renderHook(() =>
        useRealtimeMessages({ ...defaultConfig, onNewMessage })
      );

      const messageHandler = mockOn.mock.calls[0][2];
      const aiMessage = {
        id: 'msg-ai',
        ask_session_id: 'session-1',
        conversation_thread_id: 'thread-123',
        user_id: null,
        sender_type: 'ai',
        content: 'AI response',
        message_type: 'text',
        metadata: null,
        created_at: '2024-01-01T00:00:00Z',
        parent_message_id: null,
        plan_step_id: null,
      };

      act(() => {
        messageHandler({ new: aiMessage });
      });

      expect(onNewMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          senderType: 'ai',
          senderName: 'Agent',
        })
      );
    });

    it('should limit processed IDs set to prevent memory leaks', () => {
      const onNewMessage = jest.fn();
      renderHook(() =>
        useRealtimeMessages({ ...defaultConfig, onNewMessage })
      );

      const messageHandler = mockOn.mock.calls[0][2];

      // Send more than 1000 unique messages
      act(() => {
        for (let i = 0; i < 1100; i++) {
          messageHandler({
            new: {
              id: `msg-${i}`,
              ask_session_id: 'session-1',
              conversation_thread_id: 'thread-123',
              user_id: 'user-1',
              sender_type: 'user',
              content: `Message ${i}`,
              message_type: 'text',
              metadata: null,
              created_at: '2024-01-01T00:00:00Z',
              parent_message_id: null,
              plan_step_id: null,
            },
          });
        }
      });

      // All 1100 messages should have been processed
      expect(onNewMessage).toHaveBeenCalledTimes(1100);
    });
  });

  describe('retry logic', () => {
    it('should retry on CHANNEL_ERROR with exponential backoff', () => {
      let callCount = 0;
      mockSubscribe.mockImplementation((callback) => {
        callCount++;
        if (callCount <= 3) {
          callback('CHANNEL_ERROR', { message: 'Connection failed' });
        } else {
          callback('SUBSCRIBED', null);
        }
        return { on: mockOn, subscribe: mockSubscribe };
      });

      const { result } = renderHook(() => useRealtimeMessages(defaultConfig));

      // First attempt fails immediately
      expect(result.current.subscriptionStatus).toBe('subscribing');

      // Advance through retry delays (2s, 4s, 8s)
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      act(() => {
        jest.advanceTimersByTime(4000);
      });
      act(() => {
        jest.advanceTimersByTime(8000);
      });

      // After 3 retries, max retries exceeded
      expect(callCount).toBe(4); // Initial + 3 retries
    });

    it('should retry on TIMED_OUT status', () => {
      let callCount = 0;
      mockSubscribe.mockImplementation((callback) => {
        callCount++;
        if (callCount === 1) {
          callback('TIMED_OUT', null);
        } else {
          callback('SUBSCRIBED', null);
        }
        return { on: mockOn, subscribe: mockSubscribe };
      });

      renderHook(() => useRealtimeMessages(defaultConfig));

      act(() => {
        jest.advanceTimersByTime(2000);
      });

      expect(callCount).toBe(2);
    });

    it('should stop retrying after max retries', () => {
      mockSubscribe.mockImplementation((callback) => {
        callback('CHANNEL_ERROR', { message: 'Connection failed' });
        return { on: mockOn, subscribe: mockSubscribe };
      });

      const { result } = renderHook(() => useRealtimeMessages(defaultConfig));

      // Advance through all retry delays
      act(() => {
        jest.advanceTimersByTime(20000);
      });

      expect(result.current.subscriptionStatus).toBe('error');
    });
  });

  describe('polling fallback', () => {
    beforeEach(() => {
      // Enable dev mode for polling
      localStorage.setItem('dev_mode_override', 'true');

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { messages: [] },
        }),
      });
    });

    it('should start polling when realtime subscription fails in dev mode', async () => {
      mockSubscribe.mockImplementation((callback) => {
        callback('CHANNEL_ERROR', { message: 'Failed' });
        return { on: mockOn, subscribe: mockSubscribe };
      });

      const { result } = renderHook(() =>
        useRealtimeMessages({
          ...defaultConfig,
          enablePolling: true,
        })
      );

      // Wait for subscription to fail and polling to start
      await act(async () => {
        jest.advanceTimersByTime(20000);
      });

      // Polling should have started
      expect(result.current.isPolling).toBe(true);
    });

    it('should poll for messages at regular intervals', async () => {
      mockSubscribe.mockImplementation((callback) => {
        // Never succeeds - force polling
        return { on: mockOn, subscribe: mockSubscribe };
      });

      renderHook(() =>
        useRealtimeMessages({
          ...defaultConfig,
          enablePolling: true,
          inviteToken: 'test-token',
        })
      );

      // Wait for polling to start (2s delay)
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      // Advance to trigger poll
      await act(async () => {
        jest.advanceTimersByTime(3000);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/ask/test-ask/messages')
      );
    });

    it('should include invite token in polling requests', async () => {
      mockSubscribe.mockImplementation(() => {
        return { on: mockOn, subscribe: mockSubscribe };
      });

      renderHook(() =>
        useRealtimeMessages({
          ...defaultConfig,
          enablePolling: true,
          inviteToken: 'my-token-123',
        })
      );

      await act(async () => {
        jest.advanceTimersByTime(5000);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('token=my-token-123')
      );
    });

    it('should process new messages from polling', async () => {
      const onNewMessage = jest.fn();

      mockSubscribe.mockImplementation(() => {
        return { on: mockOn, subscribe: mockSubscribe };
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            messages: [
              {
                id: 'polled-msg-1',
                askKey: 'test-ask',
                content: 'Polled message',
                type: 'text',
                senderType: 'user',
                timestamp: '2024-01-01T00:00:00Z',
              },
            ],
          },
        }),
      });

      renderHook(() =>
        useRealtimeMessages({
          ...defaultConfig,
          enablePolling: true,
          onNewMessage,
        })
      );

      // Wait for polling to start and process
      await act(async () => {
        jest.advanceTimersByTime(5000);
        await Promise.resolve();
      });

      expect(onNewMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'polled-msg-1',
          content: 'Polled message',
        })
      );
    });

    it('should not duplicate messages between polling requests', async () => {
      const onNewMessage = jest.fn();

      mockSubscribe.mockImplementation(() => {
        return { on: mockOn, subscribe: mockSubscribe };
      });

      const pollResponse = {
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            messages: [
              {
                id: 'same-msg',
                askKey: 'test-ask',
                content: 'Same message',
                type: 'text',
                senderType: 'user',
                timestamp: '2024-01-01T00:00:00Z',
              },
            ],
          },
        }),
      };

      mockFetch.mockResolvedValue(pollResponse);

      renderHook(() =>
        useRealtimeMessages({
          ...defaultConfig,
          enablePolling: true,
          onNewMessage,
        })
      );

      // First poll
      await act(async () => {
        jest.advanceTimersByTime(5000);
        await Promise.resolve();
      });

      // Second poll with same message
      await act(async () => {
        jest.advanceTimersByTime(3000);
        await Promise.resolve();
      });

      // Should only process once
      expect(onNewMessage).toHaveBeenCalledTimes(1);
    });

    it('should stop polling on unmount', async () => {
      mockSubscribe.mockImplementation(() => {
        return { on: mockOn, subscribe: mockSubscribe };
      });

      const { unmount } = renderHook(() =>
        useRealtimeMessages({
          ...defaultConfig,
          enablePolling: true,
        })
      );

      await act(async () => {
        jest.advanceTimersByTime(5000);
      });

      mockFetch.mockClear();
      unmount();

      await act(async () => {
        jest.advanceTimersByTime(10000);
      });

      // No more fetch calls after unmount
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('thread change handling', () => {
    it('should clear processed IDs when thread changes', () => {
      const onNewMessage = jest.fn();
      const { rerender } = renderHook(
        (props) => useRealtimeMessages(props),
        { initialProps: { ...defaultConfig, onNewMessage } }
      );

      const messageHandler = mockOn.mock.calls[0][2];

      // Process a message
      act(() => {
        messageHandler({
          new: {
            id: 'msg-1',
            ask_session_id: 'session-1',
            conversation_thread_id: 'thread-123',
            user_id: 'user-1',
            sender_type: 'user',
            content: 'Message 1',
            message_type: 'text',
            metadata: null,
            created_at: '2024-01-01T00:00:00Z',
            parent_message_id: null,
            plan_step_id: null,
          },
        });
      });

      expect(onNewMessage).toHaveBeenCalledTimes(1);

      // Change thread
      onNewMessage.mockClear();
      rerender({ ...defaultConfig, conversationThreadId: 'new-thread', onNewMessage });

      // Get new message handler after rerender
      const newMessageHandler = mockOn.mock.calls[mockOn.mock.calls.length - 1][2];

      // Same message ID should be processable again (different thread)
      act(() => {
        newMessageHandler({
          new: {
            id: 'msg-1',
            ask_session_id: 'session-1',
            conversation_thread_id: 'new-thread',
            user_id: 'user-1',
            sender_type: 'user',
            content: 'Message 1 in new thread',
            message_type: 'text',
            metadata: null,
            created_at: '2024-01-01T00:00:00Z',
            parent_message_id: null,
            plan_step_id: null,
          },
        });
      });

      expect(onNewMessage).toHaveBeenCalledTimes(1);
    });
  });
});
