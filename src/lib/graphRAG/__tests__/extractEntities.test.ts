/**
 * Unit tests for Entity Extraction Variables
 * Tests buildEntityExtractionVariables function
 */

import { buildEntityExtractionVariables, type EntityExtractionVariables } from '../extractEntities';

// ============================================================================
// MOCK SUPABASE
// ============================================================================

interface MockQueryResult<T> {
  data: T | null;
  error: Error | null;
}

function createMockSupabase(options: {
  askSession?: { question: string; description: string | null } | null;
  challenge?: { name: string; description: string | null } | null;
} = {}) {
  const { askSession = null, challenge = null } = options;

  return {
    from: jest.fn((table: string) => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn(async (): Promise<MockQueryResult<any>> => {
            if (table === 'ask_sessions') {
              return { data: askSession, error: null };
            }
            if (table === 'challenges') {
              return { data: challenge, error: null };
            }
            return { data: null, error: null };
          }),
        })),
      })),
    })),
  } as any;
}

// ============================================================================
// TEST CASES
// ============================================================================

describe('buildEntityExtractionVariables', () => {
  describe('basic insight data', () => {
    it('should return insight content and type', async () => {
      const supabase = createMockSupabase();

      const result = await buildEntityExtractionVariables(supabase, {
        content: 'This is a test insight about productivity',
        summary: 'Test summary',
        type: 'pain',
        category: 'efficiency',
        askSessionId: 'ask-123',
      });

      expect(result.content).toBe('This is a test insight about productivity');
      expect(result.summary).toBe('Test summary');
      expect(result.type).toBe('pain');
      expect(result.category).toBe('efficiency');
    });

    it('should handle null summary and category', async () => {
      const supabase = createMockSupabase();

      const result = await buildEntityExtractionVariables(supabase, {
        content: 'Test content',
        summary: null,
        type: 'idea',
        category: null,
        askSessionId: 'ask-123',
      });

      expect(result.summary).toBe('');
      expect(result.category).toBe('');
    });
  });

  describe('ASK context', () => {
    it('should fetch and include ASK question and description', async () => {
      const supabase = createMockSupabase({
        askSession: {
          question: 'How can we improve ticket management?',
          description: 'Analysis of multiservice intervention tickets',
        },
      });

      const result = await buildEntityExtractionVariables(supabase, {
        content: 'Manual process is time-consuming',
        type: 'pain',
        askSessionId: 'ask-123',
      });

      expect(result.ask_question).toBe('How can we improve ticket management?');
      expect(result.ask_description).toBe('Analysis of multiservice intervention tickets');
    });

    it('should handle missing ASK session', async () => {
      const supabase = createMockSupabase({
        askSession: null,
      });

      const result = await buildEntityExtractionVariables(supabase, {
        content: 'Test content',
        type: 'idea',
        askSessionId: 'non-existent-ask',
      });

      expect(result.ask_question).toBe('');
      expect(result.ask_description).toBe('');
    });

    it('should handle ASK session with null description', async () => {
      const supabase = createMockSupabase({
        askSession: {
          question: 'Main question',
          description: null,
        },
      });

      const result = await buildEntityExtractionVariables(supabase, {
        content: 'Test content',
        type: 'gain',
        askSessionId: 'ask-456',
      });

      expect(result.ask_question).toBe('Main question');
      expect(result.ask_description).toBe('');
    });
  });

  describe('challenge context', () => {
    it('should fetch and include challenge context when challengeId provided', async () => {
      const supabase = createMockSupabase({
        askSession: { question: 'Main question', description: null },
        challenge: {
          name: 'Optimize Operations',
          description: 'Reduce operational costs by 20%',
        },
      });

      const result = await buildEntityExtractionVariables(supabase, {
        content: 'Cost reduction opportunity',
        type: 'opportunity',
        askSessionId: 'ask-123',
        challengeId: 'challenge-456',
      });

      expect(result.challenge_name).toBe('Optimize Operations');
      expect(result.challenge_description).toBe('Reduce operational costs by 20%');
    });

    it('should not fetch challenge when challengeId is null', async () => {
      const supabase = createMockSupabase({
        askSession: { question: 'Main question', description: null },
      });

      const result = await buildEntityExtractionVariables(supabase, {
        content: 'Test content',
        type: 'signal',
        askSessionId: 'ask-123',
        challengeId: null,
      });

      expect(result.challenge_name).toBe('');
      expect(result.challenge_description).toBe('');
    });

    it('should handle missing challenge', async () => {
      const supabase = createMockSupabase({
        askSession: { question: 'Main question', description: null },
        challenge: null,
      });

      const result = await buildEntityExtractionVariables(supabase, {
        content: 'Test content',
        type: 'risk',
        askSessionId: 'ask-123',
        challengeId: 'non-existent-challenge',
      });

      expect(result.challenge_name).toBe('');
      expect(result.challenge_description).toBe('');
    });
  });

  describe('complete variable set', () => {
    it('should return all 8 variables with complete context', async () => {
      const supabase = createMockSupabase({
        askSession: {
          question: 'How to optimize ticket flow?',
          description: 'Multiservice ticket analysis',
        },
        challenge: {
          name: 'Operational Excellence',
          description: 'Improve service delivery',
        },
      });

      const result = await buildEntityExtractionVariables(supabase, {
        content: 'Bottleneck detected in client connections',
        summary: 'Connection bottleneck issue',
        type: 'pain',
        category: 'operations',
        askSessionId: 'ask-789',
        challengeId: 'challenge-123',
      });

      // Verify all 8 variables are present
      const keys = Object.keys(result);
      expect(keys).toContain('content');
      expect(keys).toContain('summary');
      expect(keys).toContain('type');
      expect(keys).toContain('category');
      expect(keys).toContain('ask_question');
      expect(keys).toContain('ask_description');
      expect(keys).toContain('challenge_name');
      expect(keys).toContain('challenge_description');
      expect(keys.length).toBe(8);

      // Verify values
      expect(result.content).toBe('Bottleneck detected in client connections');
      expect(result.summary).toBe('Connection bottleneck issue');
      expect(result.type).toBe('pain');
      expect(result.category).toBe('operations');
      expect(result.ask_question).toBe('How to optimize ticket flow?');
      expect(result.ask_description).toBe('Multiservice ticket analysis');
      expect(result.challenge_name).toBe('Operational Excellence');
      expect(result.challenge_description).toBe('Improve service delivery');
    });
  });

  describe('type safety', () => {
    it('should return properly typed EntityExtractionVariables', async () => {
      const supabase = createMockSupabase();

      const result: EntityExtractionVariables = await buildEntityExtractionVariables(supabase, {
        content: 'Test',
        type: 'idea',
        askSessionId: 'ask-123',
      });

      // TypeScript compile-time check - these should all be strings
      const content: string = result.content;
      const summary: string = result.summary;
      const type: string = result.type;
      const category: string = result.category;
      const askQuestion: string = result.ask_question;
      const askDescription: string = result.ask_description;
      const challengeName: string = result.challenge_name;
      const challengeDescription: string = result.challenge_description;

      expect(typeof content).toBe('string');
      expect(typeof summary).toBe('string');
      expect(typeof type).toBe('string');
      expect(typeof category).toBe('string');
      expect(typeof askQuestion).toBe('string');
      expect(typeof askDescription).toBe('string');
      expect(typeof challengeName).toBe('string');
      expect(typeof challengeDescription).toBe('string');
    });
  });
});
