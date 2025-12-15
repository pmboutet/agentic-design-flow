import {
  shouldUseSharedThread,
  getOrCreateConversationThread,
  getMessagesForThread,
  getInsightsForThread,
  getAskSessionByKey,
  getAskSessionByToken,
  AskSessionConfig,
  ConversationThread,
} from '../asks';
import { isConsultantMode, getConversationModeDescription } from '../utils';
import type { SupabaseClient, PostgrestError } from '@supabase/supabase-js';

// Mock Supabase client factory
function createMockSupabase(overrides: {
  fromSelect?: jest.Mock;
  fromInsert?: jest.Mock;
  rpc?: jest.Mock;
} = {}): SupabaseClient {
  const mockSelect = overrides.fromSelect ?? jest.fn().mockReturnThis();
  const mockInsert = overrides.fromInsert ?? jest.fn().mockReturnThis();
  const mockRpc = overrides.rpc ?? jest.fn();

  const chainable = {
    select: mockSelect,
    insert: mockInsert,
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn(),
    maybeSingle: jest.fn(),
  };

  // Make chainable methods return chainable object
  Object.keys(chainable).forEach(key => {
    if (typeof chainable[key as keyof typeof chainable] === 'function' && key !== 'single' && key !== 'maybeSingle') {
      (chainable[key as keyof typeof chainable] as jest.Mock).mockReturnThis();
    }
  });

  return {
    from: jest.fn().mockReturnValue(chainable),
    rpc: mockRpc,
  } as unknown as SupabaseClient;
}

describe('shouldUseSharedThread', () => {
  describe('with conversation_mode set', () => {
    it('should return false for individual_parallel mode', () => {
      const config: AskSessionConfig = {
        conversation_mode: 'individual_parallel',
      };
      expect(shouldUseSharedThread(config)).toBe(false);
    });

    it('should return true for collaborative mode', () => {
      const config: AskSessionConfig = {
        conversation_mode: 'collaborative',
      };
      expect(shouldUseSharedThread(config)).toBe(true);
    });

    it('should return true for group_reporter mode', () => {
      const config: AskSessionConfig = {
        conversation_mode: 'group_reporter',
      };
      expect(shouldUseSharedThread(config)).toBe(true);
    });

    it('should return true for consultant mode (shared thread with multi-participant support)', () => {
      const config: AskSessionConfig = {
        conversation_mode: 'consultant',
      };
      // Consultant mode uses shared threads for multi-participant support (text or voice)
      // Only the facilitator sees suggested questions, AI doesn't respond automatically
      expect(shouldUseSharedThread(config)).toBe(true);
    });

    it('should handle unknown conversation_mode values as shared', () => {
      const config: AskSessionConfig = {
        conversation_mode: 'some_unknown_mode',
      };
      // Any mode other than 'individual_parallel' should use shared thread
      expect(shouldUseSharedThread(config)).toBe(true);
    });
  });

  describe('with null/undefined values', () => {
    it('should return true for empty config (default to shared)', () => {
      const config: AskSessionConfig = {};
      expect(shouldUseSharedThread(config)).toBe(true);
    });

    it('should return true when conversation_mode is null (default to shared)', () => {
      const config: AskSessionConfig = {
        conversation_mode: null,
      };
      expect(shouldUseSharedThread(config)).toBe(true);
    });

    it('should return true when conversation_mode is undefined (default to shared)', () => {
      const config: AskSessionConfig = {
        conversation_mode: undefined,
      };
      expect(shouldUseSharedThread(config)).toBe(true);
    });
  });
});

describe('isConsultantMode', () => {
  it('should return true for consultant mode', () => {
    expect(isConsultantMode('consultant')).toBe(true);
  });

  it('should return false for other modes', () => {
    expect(isConsultantMode('individual_parallel')).toBe(false);
    expect(isConsultantMode('collaborative')).toBe(false);
    expect(isConsultantMode('group_reporter')).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isConsultantMode(undefined)).toBe(false);
  });
});

describe('getConversationModeDescription', () => {
  it('should return correct description for consultant mode', () => {
    expect(getConversationModeDescription('consultant')).toBe('Mode consultant (écoute IA)');
  });

  it('should return correct description for individual_parallel', () => {
    expect(getConversationModeDescription('individual_parallel')).toBe('Réponses individuelles en parallèle');
  });

  it('should return correct description for collaborative', () => {
    expect(getConversationModeDescription('collaborative')).toBe('Conversation collaborative');
  });

  it('should return correct description for group_reporter', () => {
    expect(getConversationModeDescription('group_reporter')).toBe('Groupe avec porte-parole');
  });

  it('should return default description for undefined', () => {
    expect(getConversationModeDescription(undefined)).toBe('Conversation collaborative');
  });
});

describe('getOrCreateConversationThread', () => {
  const mockThread: ConversationThread = {
    id: 'thread-123',
    ask_session_id: 'ask-session-456',
    user_id: null,
    is_shared: true,
    created_at: '2024-01-01T00:00:00Z',
  };

  describe('shared thread modes (collaborative, group_reporter, consultant)', () => {
    it('should find existing shared thread for collaborative mode', async () => {
      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [mockThread],
          error: null,
        }),
      });

      const supabase = { from: mockFrom } as unknown as SupabaseClient;

      const result = await getOrCreateConversationThread(
        supabase,
        'ask-session-456',
        'user-123',
        { conversation_mode: 'collaborative' }
      );

      expect(result.thread).toEqual(mockThread);
      expect(result.error).toBeNull();
      // Should query for shared thread (user_id is null)
      expect(mockFrom).toHaveBeenCalledWith('conversation_threads');
    });

    it('should find existing shared thread for consultant mode', async () => {
      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [mockThread],
          error: null,
        }),
      });

      const supabase = { from: mockFrom } as unknown as SupabaseClient;

      const result = await getOrCreateConversationThread(
        supabase,
        'ask-session-456',
        'user-123',
        { conversation_mode: 'consultant' }
      );

      expect(result.thread).toEqual(mockThread);
      expect(result.error).toBeNull();
    });

    it('should create shared thread when none exists', async () => {
      const newThread = { ...mockThread, id: 'new-thread-789' };

      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: newThread,
              error: null,
            }),
          }),
        }),
      });

      const supabase = { from: mockFrom } as unknown as SupabaseClient;

      const result = await getOrCreateConversationThread(
        supabase,
        'ask-session-456',
        'user-123',
        { conversation_mode: 'collaborative' }
      );

      expect(result.thread).toEqual(newThread);
      expect(result.error).toBeNull();
    });
  });

  describe('individual thread mode (individual_parallel)', () => {
    it('should find existing individual thread for specific user', async () => {
      const individualThread: ConversationThread = {
        ...mockThread,
        user_id: 'user-123',
        is_shared: false,
      };

      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [individualThread],
          error: null,
        }),
      });

      const supabase = { from: mockFrom } as unknown as SupabaseClient;

      const result = await getOrCreateConversationThread(
        supabase,
        'ask-session-456',
        'user-123',
        { conversation_mode: 'individual_parallel' }
      );

      expect(result.thread).toEqual(individualThread);
      expect(result.thread?.is_shared).toBe(false);
      expect(result.thread?.user_id).toBe('user-123');
    });

    it('should create individual thread when none exists', async () => {
      const newIndividualThread: ConversationThread = {
        id: 'new-individual-thread',
        ask_session_id: 'ask-session-456',
        user_id: 'user-123',
        is_shared: false,
        created_at: '2024-01-01T00:00:00Z',
      };

      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: newIndividualThread,
              error: null,
            }),
          }),
        }),
      });

      const supabase = { from: mockFrom } as unknown as SupabaseClient;

      const result = await getOrCreateConversationThread(
        supabase,
        'ask-session-456',
        'user-123',
        { conversation_mode: 'individual_parallel' }
      );

      expect(result.thread).toEqual(newIndividualThread);
      expect(result.thread?.is_shared).toBe(false);
    });

    it('should fallback to shared thread when no userId provided in individual mode', async () => {
      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [mockThread],
          error: null,
        }),
      });

      const supabase = { from: mockFrom } as unknown as SupabaseClient;

      const result = await getOrCreateConversationThread(
        supabase,
        'ask-session-456',
        null, // No user ID
        { conversation_mode: 'individual_parallel' }
      );

      expect(result.thread).toEqual(mockThread);
      expect(result.thread?.is_shared).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should return error when find query fails', async () => {
      const mockError: PostgrestError = {
        code: 'PGRST001',
        message: 'Database error',
        details: null,
        hint: null,
      };

      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: null,
          error: mockError,
        }),
      });

      const supabase = { from: mockFrom } as unknown as SupabaseClient;

      const result = await getOrCreateConversationThread(
        supabase,
        'ask-session-456',
        'user-123',
        { conversation_mode: 'collaborative' }
      );

      expect(result.thread).toBeNull();
      expect(result.error).toEqual(mockError);
    });

    it('should return error when create fails', async () => {
      const mockError: PostgrestError = {
        code: 'PGRST002',
        message: 'Insert failed',
        details: null,
        hint: null,
      };

      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: mockError,
            }),
          }),
        }),
      });

      const supabase = { from: mockFrom } as unknown as SupabaseClient;

      const result = await getOrCreateConversationThread(
        supabase,
        'ask-session-456',
        'user-123',
        { conversation_mode: 'collaborative' }
      );

      expect(result.thread).toBeNull();
      expect(result.error).toEqual(mockError);
    });
  });
});

describe('getMessagesForThread', () => {
  it('should fetch messages ordered by created_at', async () => {
    const mockMessages = [
      { id: 'msg-1', content: 'Hello', created_at: '2024-01-01T00:00:00Z' },
      { id: 'msg-2', content: 'World', created_at: '2024-01-01T00:01:00Z' },
    ];

    const mockFrom = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({
        data: mockMessages,
        error: null,
      }),
    });

    const supabase = { from: mockFrom } as unknown as SupabaseClient;

    const result = await getMessagesForThread(supabase, 'thread-123');

    expect(result.messages).toEqual(mockMessages);
    expect(result.error).toBeNull();
    expect(mockFrom).toHaveBeenCalledWith('messages');
  });

  it('should return empty array on error', async () => {
    const mockError: PostgrestError = {
      code: 'PGRST001',
      message: 'Error fetching messages',
      details: null,
      hint: null,
    };

    const mockFrom = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({
        data: null,
        error: mockError,
      }),
    });

    const supabase = { from: mockFrom } as unknown as SupabaseClient;

    const result = await getMessagesForThread(supabase, 'thread-123');

    expect(result.messages).toEqual([]);
    expect(result.error).toEqual(mockError);
  });
});

describe('getInsightsForThread', () => {
  it('should fetch insights ordered by created_at', async () => {
    const mockInsights = [
      { id: 'insight-1', content: 'Insight 1', created_at: '2024-01-01T00:00:00Z' },
      { id: 'insight-2', content: 'Insight 2', created_at: '2024-01-01T00:01:00Z' },
    ];

    const mockFrom = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({
        data: mockInsights,
        error: null,
      }),
    });

    const supabase = { from: mockFrom } as unknown as SupabaseClient;

    const result = await getInsightsForThread(supabase, 'thread-123');

    expect(result.insights).toEqual(mockInsights);
    expect(result.error).toBeNull();
    expect(mockFrom).toHaveBeenCalledWith('insights');
  });

  it('should return empty array on error', async () => {
    const mockError: PostgrestError = {
      code: 'PGRST001',
      message: 'Error fetching insights',
      details: null,
      hint: null,
    };

    const mockFrom = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({
        data: null,
        error: mockError,
      }),
    });

    const supabase = { from: mockFrom } as unknown as SupabaseClient;

    const result = await getInsightsForThread(supabase, 'thread-123');

    expect(result.insights).toEqual([]);
    expect(result.error).toEqual(mockError);
  });
});

describe('getAskSessionByKey', () => {
  const mockRpcResult = {
    ask_session_id: 'session-123',
    ask_key: 'my-ask-key',
    question: 'Test question',
    description: 'Test description',
    status: 'active',
    project_id: null,
    challenge_id: null,
    conversation_mode: 'collaborative',
    expected_duration_minutes: 30,
    system_prompt: null,
    is_anonymous: false,
    name: 'Test Session',
    delivery_mode: 'text',
    start_date: null,
    end_date: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };

  it('should fetch session via RPC function', async () => {
    const mockRpc = jest.fn().mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue({
        data: mockRpcResult,
        error: null,
      }),
    });

    const supabase = { rpc: mockRpc, from: jest.fn() } as unknown as SupabaseClient;

    const result = await getAskSessionByKey(supabase, 'my-ask-key', '*');

    expect(result.row).toBeTruthy();
    expect((result.row as any).id).toBe('session-123');
    expect((result.row as any).ask_key).toBe('my-ask-key');
    expect((result.row as any).conversation_mode).toBe('collaborative');
    expect(result.error).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith('get_ask_session_by_key', { p_key: 'my-ask-key' });
  });

  it('should return null for empty key', async () => {
    const supabase = { rpc: jest.fn(), from: jest.fn() } as unknown as SupabaseClient;

    const result = await getAskSessionByKey(supabase, '   ', '*');

    expect(result.row).toBeNull();
    expect(result.error).toBeNull();
  });

  it('should fallback to direct query when RPC not found', async () => {
    const mockRpcError: PostgrestError = {
      code: 'PGRST202',
      message: 'Function not found',
      details: null,
      hint: null,
    };

    const mockDirectResult = {
      id: 'session-123',
      ask_key: 'my-ask-key',
      question: 'Test',
    };

    const mockRpc = jest.fn().mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue({
        data: null,
        error: mockRpcError,
      }),
    });

    const mockFrom = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: mockDirectResult,
        error: null,
      }),
    });

    const supabase = { rpc: mockRpc, from: mockFrom } as unknown as SupabaseClient;

    const result = await getAskSessionByKey(supabase, 'my-ask-key', '*');

    expect(result.row).toEqual(mockDirectResult);
    expect(mockFrom).toHaveBeenCalledWith('ask_sessions');
  });

  it('should return error for non-PGRST202 RPC errors', async () => {
    const mockRpcError: PostgrestError = {
      code: 'PGRST500',
      message: 'Internal error',
      details: null,
      hint: null,
    };

    const mockRpc = jest.fn().mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue({
        data: null,
        error: mockRpcError,
      }),
    });

    const supabase = { rpc: mockRpc, from: jest.fn() } as unknown as SupabaseClient;

    const result = await getAskSessionByKey(supabase, 'my-ask-key', '*');

    expect(result.row).toBeNull();
    expect(result.error).toEqual(mockRpcError);
  });
});

describe('getAskSessionByToken', () => {
  it('should fetch session by invite token', async () => {
    const mockParticipant = {
      ask_session_id: 'session-123',
      id: 'participant-456',
    };

    const mockSession = {
      id: 'session-123',
      ask_key: 'my-ask',
      question: 'Test question',
    };

    let callCount = 0;
    const mockFrom = jest.fn().mockImplementation((table: string) => {
      callCount++;
      if (table === 'ask_participants') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: mockParticipant,
            error: null,
          }),
        };
      } else if (table === 'ask_sessions') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: mockSession,
            error: null,
          }),
        };
      }
    });

    const supabase = { from: mockFrom } as unknown as SupabaseClient;

    const result = await getAskSessionByToken(supabase, 'my-invite-token', '*');

    expect(result.row).toEqual(mockSession);
    expect(result.participantId).toBe('participant-456');
    expect(result.error).toBeNull();
  });

  it('should return null for empty token', async () => {
    const supabase = { from: jest.fn() } as unknown as SupabaseClient;

    const result = await getAskSessionByToken(supabase, '   ', '*');

    expect(result.row).toBeNull();
    expect(result.participantId).toBeNull();
    expect(result.error).toBeNull();
  });

  it('should return null when token not found', async () => {
    const mockFrom = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
    });

    const supabase = { from: mockFrom } as unknown as SupabaseClient;

    const result = await getAskSessionByToken(supabase, 'invalid-token', '*');

    expect(result.row).toBeNull();
    expect(result.participantId).toBeNull();
    expect(result.error).toBeNull();
  });

  it('should return error when participant query fails', async () => {
    const mockError: PostgrestError = {
      code: 'PGRST001',
      message: 'Query failed',
      details: null,
      hint: null,
    };

    const mockFrom = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: null,
        error: mockError,
      }),
    });

    const supabase = { from: mockFrom } as unknown as SupabaseClient;

    const result = await getAskSessionByToken(supabase, 'some-token', '*');

    expect(result.row).toBeNull();
    expect(result.participantId).toBeNull();
    expect(result.error).toEqual(mockError);
  });
});
