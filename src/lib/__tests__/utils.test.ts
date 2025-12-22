/**
 * Unit tests for src/lib/utils.ts
 * Pure utility functions - no database dependencies
 */

import {
  isValidAskKey,
  validateAskKey,
  parseErrorMessage,
  isAskActive,
  formatTimeRemaining,
  formatFileSize,
  validateFileType,
  safeJsonParse,
  deepClone,
  formatRelativeDate,
  getInsightTypeLabel,
  getDeliveryModeLabel,
  getConversationModeDescription,
  isConsultantMode,
  isPermissionDenied,
} from '../utils';

// ============================================================================
// isValidAskKey TESTS
// ============================================================================

describe('isValidAskKey', () => {
  describe('valid keys', () => {
    test('should accept alphanumeric keys', () => {
      expect(isValidAskKey('abc123')).toBe(true);
      expect(isValidAskKey('ABC123')).toBe(true);
      expect(isValidAskKey('test')).toBe(true);
    });

    test('should accept keys with dashes', () => {
      expect(isValidAskKey('my-ask-key')).toBe(true);
      expect(isValidAskKey('project-2024')).toBe(true);
    });

    test('should accept keys with underscores', () => {
      expect(isValidAskKey('my_ask_key')).toBe(true);
      expect(isValidAskKey('project_2024')).toBe(true);
    });

    test('should accept keys with dots', () => {
      expect(isValidAskKey('my.ask.key')).toBe(true);
      expect(isValidAskKey('v1.0.0')).toBe(true);
    });

    test('should accept mixed valid characters', () => {
      expect(isValidAskKey('my-ask_key.v1')).toBe(true);
      expect(isValidAskKey('project-2024_final.draft')).toBe(true);
    });

    test('should accept minimum length (3 chars)', () => {
      expect(isValidAskKey('abc')).toBe(true);
      expect(isValidAskKey('123')).toBe(true);
    });
  });

  describe('invalid keys', () => {
    test('should reject empty string', () => {
      expect(isValidAskKey('')).toBe(false);
    });

    test('should reject whitespace only', () => {
      expect(isValidAskKey('   ')).toBe(false);
      expect(isValidAskKey('\t\n')).toBe(false);
    });

    test('should reject keys shorter than 3 characters', () => {
      expect(isValidAskKey('ab')).toBe(false);
      expect(isValidAskKey('a')).toBe(false);
      expect(isValidAskKey('12')).toBe(false);
    });

    test('should reject keys with spaces', () => {
      expect(isValidAskKey('my ask key')).toBe(false);
      expect(isValidAskKey('hello world')).toBe(false);
    });

    test('should reject keys with special characters', () => {
      expect(isValidAskKey('key@domain')).toBe(false);
      expect(isValidAskKey('key#1')).toBe(false);
      expect(isValidAskKey('key$value')).toBe(false);
      expect(isValidAskKey('key!value')).toBe(false);
      expect(isValidAskKey('key?value')).toBe(false);
    });

    test('should reject keys with only special characters', () => {
      expect(isValidAskKey('---')).toBe(false);
      expect(isValidAskKey('___')).toBe(false);
      expect(isValidAskKey('...')).toBe(false);
    });

    test('should trim whitespace before validation', () => {
      expect(isValidAskKey('  valid  ')).toBe(true);
      expect(isValidAskKey('  ab  ')).toBe(false); // Too short after trim
    });
  });
});

// ============================================================================
// validateAskKey TESTS (enhanced version)
// ============================================================================

describe('validateAskKey', () => {
  test('should return valid for good keys', () => {
    const result = validateAskKey('my-valid-key');
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test('should return error for empty key', () => {
    const result = validateAskKey('');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('ASK key cannot be empty');
    expect(result.suggestion).toBeDefined();
  });

  test('should return error for too short key', () => {
    const result = validateAskKey('ab');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('ASK key is too short');
  });

  test('should return error for too long key', () => {
    const longKey = 'a'.repeat(101);
    const result = validateAskKey(longKey);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('ASK key is too long');
  });

  test('should return error for invalid characters', () => {
    const result = validateAskKey('key@invalid');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('ASK key contains invalid characters');
  });

  test('should return error for only special characters', () => {
    const result = validateAskKey('---');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('ASK key must contain at least one letter or number');
  });
});

// ============================================================================
// parseErrorMessage TESTS
// ============================================================================

describe('parseErrorMessage', () => {
  test('should return string directly', () => {
    expect(parseErrorMessage('An error occurred')).toBe('An error occurred');
  });

  test('should extract message from Error instance', () => {
    const error = new Error('Something went wrong');
    expect(parseErrorMessage(error)).toBe('Something went wrong');
  });

  test('should extract message from object with message property', () => {
    const error = { message: 'Custom error message', code: 500 };
    expect(parseErrorMessage(error)).toBe('Custom error message');
  });

  test('should return default message for null', () => {
    expect(parseErrorMessage(null)).toBe('An unexpected error occurred');
  });

  test('should return default message for undefined', () => {
    expect(parseErrorMessage(undefined)).toBe('An unexpected error occurred');
  });

  test('should return default message for number', () => {
    expect(parseErrorMessage(404)).toBe('An unexpected error occurred');
  });

  test('should return default message for empty object', () => {
    expect(parseErrorMessage({})).toBe('An unexpected error occurred');
  });

  test('should handle nested error-like objects', () => {
    // When message is an object, String() is called on it
    const nestedError = { message: { value: 'nested' } };
    // String({ value: 'nested' }) returns '[object Object]'
    expect(parseErrorMessage(nestedError)).toBe('[object Object]');
  });
});

// ============================================================================
// isAskActive TESTS
// ============================================================================

describe('isAskActive', () => {
  test('should return true for future date', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString(); // +1 day
    expect(isAskActive(futureDate)).toBe(true);
  });

  test('should return false for past date', () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString(); // -1 day
    expect(isAskActive(pastDate)).toBe(false);
  });

  test('should return false for current moment (edge case)', () => {
    const now = new Date().toISOString();
    // Due to execution time, this might be slightly in the past
    expect(isAskActive(now)).toBe(false);
  });

  test('should return true for date far in future', () => {
    const farFuture = '2099-12-31T23:59:59.999Z';
    expect(isAskActive(farFuture)).toBe(true);
  });

  test('should return false for date far in past', () => {
    const farPast = '2000-01-01T00:00:00.000Z';
    expect(isAskActive(farPast)).toBe(false);
  });

  test('should handle invalid date string', () => {
    // Invalid date returns NaN which is always false when compared
    expect(isAskActive('not-a-date')).toBe(false);
  });
});

// ============================================================================
// formatTimeRemaining TESTS
// ============================================================================

describe('formatTimeRemaining', () => {
  test('should return "Expired" for past date', () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    expect(formatTimeRemaining(pastDate)).toBe('Expired');
  });

  test('should format days and hours for distant future', () => {
    const futureDate = new Date(Date.now() + 3 * 86400000 + 5 * 3600000).toISOString(); // +3d 5h
    const result = formatTimeRemaining(futureDate);
    expect(result).toMatch(/3d \d+h remaining/);
  });

  test('should format hours and minutes when less than a day', () => {
    const futureDate = new Date(Date.now() + 5 * 3600000 + 30 * 60000).toISOString(); // +5h 30m
    const result = formatTimeRemaining(futureDate);
    expect(result).toMatch(/5h \d+m remaining/);
  });

  test('should format only minutes when less than an hour', () => {
    const futureDate = new Date(Date.now() + 45 * 60000).toISOString(); // +45m
    const result = formatTimeRemaining(futureDate);
    expect(result).toMatch(/\d+m remaining/);
  });

  test('should return "Less than 1m remaining" for very short time', () => {
    const futureDate = new Date(Date.now() + 30000).toISOString(); // +30s
    expect(formatTimeRemaining(futureDate)).toBe('Less than 1m remaining');
  });
});

// ============================================================================
// formatFileSize TESTS
// ============================================================================

describe('formatFileSize', () => {
  test('should return "0 Bytes" for 0', () => {
    expect(formatFileSize(0)).toBe('0 Bytes');
  });

  test('should format bytes', () => {
    expect(formatFileSize(500)).toBe('500 Bytes');
  });

  test('should format kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(2560)).toBe('2.5 KB');
  });

  test('should format megabytes', () => {
    expect(formatFileSize(1048576)).toBe('1 MB');
    expect(formatFileSize(5242880)).toBe('5 MB');
  });

  test('should format gigabytes', () => {
    expect(formatFileSize(1073741824)).toBe('1 GB');
  });
});

// ============================================================================
// validateFileType TESTS
// ============================================================================

describe('validateFileType', () => {
  const createFile = (type: string): File => {
    return { type } as File;
  };

  test('should accept JPEG images', () => {
    const result = validateFileType(createFile('image/jpeg'));
    expect(result.isValid).toBe(true);
    expect(result.type).toBe('image');
  });

  test('should accept PNG images', () => {
    const result = validateFileType(createFile('image/png'));
    expect(result.isValid).toBe(true);
    expect(result.type).toBe('image');
  });

  test('should accept MP3 audio', () => {
    const result = validateFileType(createFile('audio/mpeg'));
    expect(result.isValid).toBe(true);
    expect(result.type).toBe('audio');
  });

  test('should accept PDF documents', () => {
    const result = validateFileType(createFile('application/pdf'));
    expect(result.isValid).toBe(true);
    expect(result.type).toBe('document');
  });

  test('should reject unsupported file types', () => {
    const result = validateFileType(createFile('application/zip'));
    expect(result.isValid).toBe(false);
    expect(result.type).toBeNull();
    expect(result.error).toBeDefined();
  });

  test('should reject unknown MIME types', () => {
    const result = validateFileType(createFile('unknown/type'));
    expect(result.isValid).toBe(false);
  });
});

// ============================================================================
// safeJsonParse TESTS
// ============================================================================

describe('safeJsonParse', () => {
  test('should parse valid JSON', () => {
    const result = safeJsonParse('{"key": "value"}', {});
    expect(result).toEqual({ key: 'value' });
  });

  test('should return fallback for invalid JSON', () => {
    const fallback = { default: true };
    const result = safeJsonParse('not valid json', fallback);
    expect(result).toEqual(fallback);
  });

  test('should parse arrays', () => {
    const result = safeJsonParse('[1, 2, 3]', []);
    expect(result).toEqual([1, 2, 3]);
  });

  test('should handle empty string', () => {
    const result = safeJsonParse('', 'fallback');
    expect(result).toBe('fallback');
  });

  test('should parse primitives', () => {
    expect(safeJsonParse('true', false)).toBe(true);
    expect(safeJsonParse('42', 0)).toBe(42);
    expect(safeJsonParse('"string"', '')).toBe('string');
  });
});

// ============================================================================
// deepClone TESTS
// ============================================================================

describe('deepClone', () => {
  test('should clone simple objects', () => {
    const original = { a: 1, b: 2 };
    const cloned = deepClone(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
  });

  test('should clone nested objects', () => {
    const original = { a: { b: { c: 1 } } };
    const cloned = deepClone(original);
    expect(cloned).toEqual(original);
    expect(cloned.a).not.toBe(original.a);
    expect(cloned.a.b).not.toBe(original.a.b);
  });

  test('should clone arrays', () => {
    const original = [1, 2, [3, 4]];
    const cloned = deepClone(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    expect(cloned[2]).not.toBe(original[2]);
  });

  test('should clone Date objects', () => {
    const original = new Date('2024-01-01');
    const cloned = deepClone(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
  });

  test('should return primitives as-is', () => {
    expect(deepClone(42)).toBe(42);
    expect(deepClone('string')).toBe('string');
    expect(deepClone(null)).toBe(null);
    expect(deepClone(undefined)).toBe(undefined);
  });
});

// ============================================================================
// formatRelativeDate TESTS
// ============================================================================

describe('formatRelativeDate', () => {
  test('should return "à l\'instant" for very recent', () => {
    const now = new Date().toISOString();
    expect(formatRelativeDate(now)).toBe("à l'instant");
  });

  test('should format minutes', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60000).toISOString();
    expect(formatRelativeDate(fiveMinutesAgo)).toBe('5 min');
  });

  test('should format hours', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600000).toISOString();
    expect(formatRelativeDate(twoHoursAgo)).toBe('2 h');
  });

  test('should format days', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
    expect(formatRelativeDate(threeDaysAgo)).toBe('3 j');
  });

  test('should return full date for old dates', () => {
    const oldDate = new Date(Date.now() - 60 * 86400000).toISOString(); // 60 days ago
    const result = formatRelativeDate(oldDate);
    expect(result).not.toMatch(/\d+ [jhm]/); // Should be full date, not relative
  });

  test('should return original value for invalid date', () => {
    expect(formatRelativeDate('not-a-date')).toBe('not-a-date');
  });
});

// ============================================================================
// getInsightTypeLabel TESTS
// ============================================================================

describe('getInsightTypeLabel', () => {
  test('should return correct labels', () => {
    expect(getInsightTypeLabel('pain')).toBe('Pain');
    expect(getInsightTypeLabel('gain')).toBe('Gain');
    expect(getInsightTypeLabel('opportunity')).toBe('Opportunité');
    expect(getInsightTypeLabel('risk')).toBe('Risque');
    expect(getInsightTypeLabel('signal')).toBe('Signal');
    expect(getInsightTypeLabel('idea')).toBe('Idée');
  });

  test('should return type as-is for unknown types', () => {
    expect(getInsightTypeLabel('unknown')).toBe('unknown');
    expect(getInsightTypeLabel('custom_type')).toBe('custom_type');
  });
});

// ============================================================================
// getDeliveryModeLabel TESTS
// ============================================================================

describe('getDeliveryModeLabel', () => {
  test('should return "Session physique" for physical', () => {
    expect(getDeliveryModeLabel('physical')).toBe('Session physique');
  });

  test('should return "Session digitale" for digital', () => {
    expect(getDeliveryModeLabel('digital')).toBe('Session digitale');
  });

  test('should return "Mode hybride" for undefined', () => {
    expect(getDeliveryModeLabel(undefined)).toBe('Mode hybride');
  });

  test('should return "Mode hybride" for unknown mode', () => {
    expect(getDeliveryModeLabel('unknown')).toBe('Mode hybride');
  });
});

// ============================================================================
// getConversationModeDescription TESTS
// ============================================================================

describe('getConversationModeDescription', () => {
  test('should return correct descriptions', () => {
    expect(getConversationModeDescription('individual_parallel')).toBe('Réponses individuelles en parallèle');
    expect(getConversationModeDescription('collaborative')).toBe('Conversation collaborative');
    expect(getConversationModeDescription('group_reporter')).toBe('Groupe avec porte-parole');
    expect(getConversationModeDescription('consultant')).toBe('Mode consultant (écoute IA)');
  });

  test('should return default for undefined', () => {
    expect(getConversationModeDescription(undefined)).toBe('Conversation collaborative');
  });

  test('should return default for unknown mode', () => {
    expect(getConversationModeDescription('unknown')).toBe('Conversation collaborative');
  });
});

// ============================================================================
// isConsultantMode TESTS
// ============================================================================

describe('isConsultantMode', () => {
  test('should return true for consultant mode', () => {
    expect(isConsultantMode('consultant')).toBe(true);
  });

  test('should return false for other modes', () => {
    expect(isConsultantMode('individual_parallel')).toBe(false);
    expect(isConsultantMode('collaborative')).toBe(false);
    expect(isConsultantMode('group_reporter')).toBe(false);
  });

  test('should return false for undefined', () => {
    expect(isConsultantMode(undefined)).toBe(false);
  });
});

// ============================================================================
// isPermissionDenied TESTS
// ============================================================================

describe('isPermissionDenied', () => {
  test('should return true for PGRST301 code', () => {
    expect(isPermissionDenied({ code: 'PGRST301' })).toBe(true);
  });

  test('should return true for "permission denied" message', () => {
    expect(isPermissionDenied({ message: 'permission denied for table' })).toBe(true);
  });

  test('should return true for RLS policy violation', () => {
    expect(isPermissionDenied({ message: 'new row violates row-level security policy' })).toBe(true);
  });

  test('should return false for null', () => {
    expect(isPermissionDenied(null)).toBe(false);
  });

  test('should return false for undefined', () => {
    expect(isPermissionDenied(undefined)).toBe(false);
  });

  test('should return false for non-object', () => {
    expect(isPermissionDenied('error')).toBe(false);
    expect(isPermissionDenied(500)).toBe(false);
  });

  test('should return false for unrelated error', () => {
    expect(isPermissionDenied({ message: 'Connection timeout' })).toBe(false);
    expect(isPermissionDenied({ code: 'PGRST116' })).toBe(false);
  });

  test('should be case-insensitive for message check', () => {
    expect(isPermissionDenied({ message: 'PERMISSION DENIED' })).toBe(true);
  });
});
