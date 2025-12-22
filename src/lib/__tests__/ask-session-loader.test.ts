/**
 * @jest-environment node
 */

import {
  buildParticipantName,
  needsDiarization,
} from '../ask-session-loader';

describe('ask-session-loader', () => {
  describe('buildParticipantName', () => {
    it('should return participantName when provided', () => {
      expect(buildParticipantName('Alice', 'alice@test.com', 'part-123')).toBe('Alice');
    });

    it('should trim whitespace from participantName', () => {
      expect(buildParticipantName('  Alice  ', 'alice@test.com', 'part-123')).toBe('Alice');
    });

    it('should fallback to email when participantName is null', () => {
      expect(buildParticipantName(null, 'alice@test.com', 'part-123')).toBe('alice@test.com');
    });

    it('should fallback to email when participantName is empty', () => {
      expect(buildParticipantName('', 'alice@test.com', 'part-123')).toBe('alice@test.com');
    });

    it('should fallback to email when participantName is whitespace only', () => {
      expect(buildParticipantName('   ', 'alice@test.com', 'part-123')).toBe('alice@test.com');
    });

    it('should trim whitespace from email', () => {
      expect(buildParticipantName(null, '  alice@test.com  ', 'part-123')).toBe('alice@test.com');
    });

    it('should fallback to generated ID when both name and email are null', () => {
      expect(buildParticipantName(null, null, 'abc12345-xyz')).toBe('Participant abc12345');
    });

    it('should return generic "Participant" when all values are null', () => {
      expect(buildParticipantName(null, null, null)).toBe('Participant');
    });

    it('should return generic "Participant" when all values are undefined', () => {
      expect(buildParticipantName(undefined, undefined, undefined)).toBe('Participant');
    });

    it('should handle empty strings for all values', () => {
      expect(buildParticipantName('', '', '')).toBe('Participant');
    });
  });

  describe('needsDiarization', () => {
    describe('should return false for text mode regardless of conversation mode', () => {
      const testCases = [
        'individual_parallel',
        'collaborative',
        'group_reporter',
        'consultant',
        null,
        undefined,
      ];

      testCases.forEach((convMode) => {
        it(`conversation mode: ${convMode}`, () => {
          expect(needsDiarization(convMode, 'text')).toBe(false);
        });
      });
    });

    describe('should return true for voice mode with diarization conversation modes', () => {
      const diarizationModes = ['collaborative', 'group_reporter', 'consultant'];

      diarizationModes.forEach((convMode) => {
        it(`conversation mode: ${convMode}`, () => {
          expect(needsDiarization(convMode, 'voice')).toBe(true);
        });
      });
    });

    describe('should return false for voice mode with non-diarization conversation modes', () => {
      const nonDiarizationModes = ['individual_parallel', 'unknown_mode', ''];

      nonDiarizationModes.forEach((convMode) => {
        it(`conversation mode: ${convMode}`, () => {
          expect(needsDiarization(convMode, 'voice')).toBe(false);
        });
      });
    });

    it('should return false for voice mode with null conversation mode', () => {
      expect(needsDiarization(null, 'voice')).toBe(false);
    });

    it('should return false for voice mode with undefined conversation mode', () => {
      expect(needsDiarization(undefined, 'voice')).toBe(false);
    });
  });
});
