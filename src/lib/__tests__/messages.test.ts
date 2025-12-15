/**
 * Tests for message utilities
 * @jest-environment node
 */

import { normaliseMessageMetadata } from '../messages';

describe('normaliseMessageMetadata', () => {
  describe('with falsy values', () => {
    it('should return undefined for null', () => {
      expect(normaliseMessageMetadata(null)).toBeUndefined();
    });

    it('should return undefined for undefined', () => {
      expect(normaliseMessageMetadata(undefined)).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      expect(normaliseMessageMetadata('')).toBeUndefined();
    });

    it('should return undefined for 0', () => {
      expect(normaliseMessageMetadata(0)).toBeUndefined();
    });

    it('should return undefined for false', () => {
      expect(normaliseMessageMetadata(false)).toBeUndefined();
    });
  });

  describe('with object values', () => {
    it('should return the object as-is for plain object', () => {
      const metadata = { senderName: 'Test User', custom: 'value' };
      expect(normaliseMessageMetadata(metadata)).toEqual(metadata);
    });

    it('should return empty object as-is', () => {
      const metadata = {};
      expect(normaliseMessageMetadata(metadata)).toEqual({});
    });

    it('should return nested object as-is', () => {
      const metadata = {
        senderName: 'Test',
        nested: {
          key: 'value',
          deep: { deeper: true },
        },
      };
      expect(normaliseMessageMetadata(metadata)).toEqual(metadata);
    });

    it('should return array as object', () => {
      const metadata = ['item1', 'item2'];
      expect(normaliseMessageMetadata(metadata)).toEqual(metadata);
    });
  });

  describe('with JSON string values', () => {
    it('should parse valid JSON string', () => {
      const metadata = { senderName: 'Test User' };
      const jsonString = JSON.stringify(metadata);
      expect(normaliseMessageMetadata(jsonString)).toEqual(metadata);
    });

    it('should parse empty JSON object string', () => {
      expect(normaliseMessageMetadata('{}')).toEqual({});
    });

    it('should parse nested JSON string', () => {
      const metadata = {
        senderName: 'Test',
        data: { nested: true },
      };
      const jsonString = JSON.stringify(metadata);
      expect(normaliseMessageMetadata(jsonString)).toEqual(metadata);
    });

    it('should return undefined for invalid JSON string', () => {
      // Suppress console.warn for this test
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      expect(normaliseMessageMetadata('not valid json')).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Unable to parse message metadata',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should return undefined for partial JSON string', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      expect(normaliseMessageMetadata('{ "incomplete"')).toBeUndefined();

      consoleSpy.mockRestore();
    });
  });

  describe('with non-string primitive values', () => {
    it('should return undefined for number (converted to invalid JSON)', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      // Number 123 becomes "123" which is valid JSON
      expect(normaliseMessageMetadata(123)).toBe(123);

      consoleSpy.mockRestore();
    });

    it('should return undefined for boolean true (via String conversion)', () => {
      // Boolean true becomes "true" which is valid JSON
      expect(normaliseMessageMetadata(true)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle object with numeric keys', () => {
      const metadata = { 0: 'first', 1: 'second' };
      expect(normaliseMessageMetadata(metadata)).toEqual(metadata);
    });

    it('should handle object with special characters in keys', () => {
      const metadata = { 'key-with-dash': 'value', 'key.with.dot': 'value' };
      expect(normaliseMessageMetadata(metadata)).toEqual(metadata);
    });

    it('should preserve Date objects in metadata', () => {
      const date = new Date('2024-01-01');
      const metadata = { createdAt: date };
      expect(normaliseMessageMetadata(metadata)).toEqual(metadata);
    });

    it('should preserve function references (unusual but valid)', () => {
      const fn = () => 'test';
      const metadata = { handler: fn };
      const result = normaliseMessageMetadata(metadata);
      expect(result).toBeTruthy();
      expect((result as any).handler).toBe(fn);
    });
  });
});
