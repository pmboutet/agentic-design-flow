/**
 * Unit tests for src/lib/codex/streaming.ts
 * Streaming content merge utilities - no database dependencies
 */

import { mergeStreamingContent } from '../streaming';

// ============================================================================
// mergeStreamingContent TESTS
// ============================================================================

describe('mergeStreamingContent', () => {
  describe('handling undefined/empty previous', () => {
    test('should return incoming when previous is undefined', () => {
      expect(mergeStreamingContent(undefined, 'Hello')).toBe('Hello');
    });

    test('should return incoming when previous is empty string', () => {
      expect(mergeStreamingContent('', 'Hello')).toBe('Hello');
    });
  });

  describe('handling empty incoming', () => {
    test('should return previous when incoming is empty', () => {
      expect(mergeStreamingContent('Hello', '')).toBe('Hello');
    });

    test('should return previous when incoming is whitespace only', () => {
      // Note: whitespace is truthy so it goes through the merge logic
      expect(mergeStreamingContent('Hello', '   ')).toBe('Hello');
    });
  });

  describe('identical content', () => {
    test('should return previous when content is identical', () => {
      expect(mergeStreamingContent('Hello World', 'Hello World')).toBe('Hello World');
    });

    test('should handle identical single character', () => {
      expect(mergeStreamingContent('a', 'a')).toBe('a');
    });
  });

  describe('prefix/suffix relationships', () => {
    test('should return incoming when it starts with previous (extension)', () => {
      expect(mergeStreamingContent('Hello', 'Hello World')).toBe('Hello World');
    });

    test('should return previous when it starts with incoming (no regression)', () => {
      expect(mergeStreamingContent('Hello World', 'Hello')).toBe('Hello World');
    });

    test('should handle multi-word extensions', () => {
      expect(mergeStreamingContent('The quick', 'The quick brown fox')).toBe('The quick brown fox');
    });

    test('should handle character-by-character streaming', () => {
      let content = '';
      content = mergeStreamingContent(content, 'H');
      expect(content).toBe('H');
      content = mergeStreamingContent(content, 'He');
      expect(content).toBe('He');
      content = mergeStreamingContent(content, 'Hel');
      expect(content).toBe('Hel');
      content = mergeStreamingContent(content, 'Hell');
      expect(content).toBe('Hell');
      content = mergeStreamingContent(content, 'Hello');
      expect(content).toBe('Hello');
    });
  });

  describe('containment relationships', () => {
    test('should return incoming when it contains previous', () => {
      expect(mergeStreamingContent('quick', 'The quick brown fox')).toBe('The quick brown fox');
    });

    test('should return previous when it contains incoming', () => {
      expect(mergeStreamingContent('The quick brown fox', 'quick')).toBe('The quick brown fox');
    });

    test('should handle partial word containment', () => {
      expect(mergeStreamingContent('ello', 'Hello World')).toBe('Hello World');
    });
  });

  describe('concatenation (no relationship)', () => {
    test('should concatenate unrelated strings', () => {
      expect(mergeStreamingContent('Hello', 'World')).toBe('Hello World');
    });

    test('should normalize multiple spaces after concatenation', () => {
      expect(mergeStreamingContent('Hello  ', '  World')).toBe('Hello World');
    });

    test('should trim the result', () => {
      expect(mergeStreamingContent('  Hello', 'World  ')).toBe('Hello World');
    });

    test('should handle sentences', () => {
      expect(mergeStreamingContent('First sentence.', 'Second sentence.')).toBe('First sentence. Second sentence.');
    });
  });

  describe('edge cases', () => {
    test('should handle single characters', () => {
      expect(mergeStreamingContent('a', 'b')).toBe('a b');
    });

    test('should handle numbers', () => {
      expect(mergeStreamingContent('123', '456')).toBe('123 456');
    });

    test('should handle special characters', () => {
      expect(mergeStreamingContent('Hello!', 'World?')).toBe('Hello! World?');
    });

    test('should handle unicode characters', () => {
      expect(mergeStreamingContent('Bonjour', 'café')).toBe('Bonjour café');
    });

    test('should handle emojis', () => {
      expect(mergeStreamingContent('Hello 👋', 'World 🌍')).toBe('Hello 👋 World 🌍');
    });
  });

  describe('realistic streaming scenarios', () => {
    test('should handle typical LLM streaming pattern', () => {
      // Simulates how LLM typically streams content
      let content = '';

      // First chunk
      content = mergeStreamingContent(content, 'I');
      expect(content).toBe('I');

      // Extended chunk
      content = mergeStreamingContent(content, 'I think');
      expect(content).toBe('I think');

      // Further extension
      content = mergeStreamingContent(content, 'I think that');
      expect(content).toBe('I think that');

      // Complete sentence
      content = mergeStreamingContent(content, 'I think that this is a good idea.');
      expect(content).toBe('I think that this is a good idea.');
    });

    test('should handle potential duplicate chunks', () => {
      const content = 'The answer is';

      // Same chunk received again (duplicate)
      const result1 = mergeStreamingContent(content, 'The answer is');
      expect(result1).toBe('The answer is');

      // Extended chunk
      const result2 = mergeStreamingContent(content, 'The answer is 42.');
      expect(result2).toBe('The answer is 42.');
    });

    test('should handle reversed order (later chunk arrives first)', () => {
      // This can happen with network issues
      const later = 'The complete message is here.';
      const earlier = 'The complete';

      // If complete message arrived first
      expect(mergeStreamingContent(later, earlier)).toBe('The complete message is here.');
    });

    test('should handle non-overlapping chunks by concatenation', () => {
      // When chunks don't have prefix/suffix relationship, they are concatenated
      // Note: This function doesn't do smart word-level overlap detection
      expect(mergeStreamingContent('Hello World', 'World is great')).toBe('Hello World World is great');
    });
  });

  describe('multi-line content', () => {
    test('should handle newlines in content', () => {
      expect(mergeStreamingContent('Line 1', 'Line 2')).toBe('Line 1 Line 2');
    });

    test('should preserve newlines in extensions', () => {
      const result = mergeStreamingContent('Line 1', 'Line 1\nLine 2');
      expect(result).toBe('Line 1\nLine 2');
    });
  });
});
