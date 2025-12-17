/**
 * @jest-environment node
 */

import { SegmentStore, TimestampedSegment } from '../speechmatics-segment-store';

describe('SegmentStore', () => {
  let store: SegmentStore;

  beforeEach(() => {
    store = new SegmentStore();
  });

  describe('basic operations', () => {
    test('should start empty', () => {
      expect(store.hasSegments()).toBe(false);
      expect(store.size()).toBe(0);
      expect(store.getFullTranscript()).toBe('');
    });

    test('should store a segment', () => {
      store.upsert({
        startTime: 0,
        endTime: 1.5,
        transcript: 'Hello world',
        isFinal: false,
        receivedAt: Date.now(),
      });

      expect(store.hasSegments()).toBe(true);
      expect(store.size()).toBe(1);
      expect(store.getFullTranscript()).toBe('Hello world');
    });

    test('should ignore invalid time ranges', () => {
      store.upsert({
        startTime: -1,
        endTime: 1,
        transcript: 'Invalid start',
        isFinal: false,
        receivedAt: Date.now(),
      });

      store.upsert({
        startTime: 0,
        endTime: -1,
        transcript: 'Invalid end',
        isFinal: false,
        receivedAt: Date.now(),
      });

      store.upsert({
        startTime: 2,
        endTime: 1,
        transcript: 'End before start',
        isFinal: false,
        receivedAt: Date.now(),
      });

      expect(store.hasSegments()).toBe(false);
    });

    test('should clear all segments', () => {
      store.upsert({
        startTime: 0,
        endTime: 1,
        transcript: 'Test',
        isFinal: false,
        receivedAt: Date.now(),
      });

      store.clear();

      expect(store.hasSegments()).toBe(false);
      expect(store.size()).toBe(0);
    });
  });

  describe('time ordering', () => {
    test('should concatenate segments in time order', () => {
      // Add segments out of order
      store.upsert({
        startTime: 2,
        endTime: 3,
        transcript: 'third',
        isFinal: false,
        receivedAt: Date.now(),
      });

      store.upsert({
        startTime: 0,
        endTime: 1,
        transcript: 'first',
        isFinal: false,
        receivedAt: Date.now(),
      });

      store.upsert({
        startTime: 1,
        endTime: 2,
        transcript: 'second',
        isFinal: false,
        receivedAt: Date.now(),
      });

      expect(store.getFullTranscript()).toBe('first second third');
    });

    test('should get all segments ordered', () => {
      store.upsert({
        startTime: 2,
        endTime: 3,
        transcript: 'B',
        isFinal: false,
        receivedAt: Date.now(),
      });

      store.upsert({
        startTime: 0,
        endTime: 1,
        transcript: 'A',
        isFinal: false,
        receivedAt: Date.now(),
      });

      const ordered = store.getAllOrdered();
      expect(ordered.length).toBe(2);
      expect(ordered[0].transcript).toBe('A');
      expect(ordered[1].transcript).toBe('B');
    });

    test('should get latest end time', () => {
      store.upsert({
        startTime: 0,
        endTime: 1.5,
        transcript: 'First',
        isFinal: false,
        receivedAt: Date.now(),
      });

      store.upsert({
        startTime: 1.5,
        endTime: 3.2,
        transcript: 'Second',
        isFinal: false,
        receivedAt: Date.now(),
      });

      expect(store.getLatestEndTime()).toBe(3.2);
    });
  });

  describe('partial transcript handling', () => {
    test('should replace partial with same time range', () => {
      store.upsert({
        startTime: 0,
        endTime: 1,
        transcript: 'Hel',
        isFinal: false,
        receivedAt: Date.now(),
      });

      store.upsert({
        startTime: 0,
        endTime: 1,
        transcript: 'Hello',
        isFinal: false,
        receivedAt: Date.now(),
      });

      expect(store.size()).toBe(1);
      expect(store.getFullTranscript()).toBe('Hello');
    });

    test('should keep non-overlapping partials', () => {
      store.upsert({
        startTime: 0,
        endTime: 1,
        transcript: 'Hello',
        isFinal: false,
        receivedAt: Date.now(),
      });

      store.upsert({
        startTime: 1,
        endTime: 2,
        transcript: 'world',
        isFinal: false,
        receivedAt: Date.now(),
      });

      expect(store.size()).toBe(2);
      expect(store.getFullTranscript()).toBe('Hello world');
    });
  });

  describe('final transcript handling', () => {
    test('should replace overlapping partials with final', () => {
      // Add several partials
      store.upsert({
        startTime: 0,
        endTime: 0.5,
        transcript: 'Hel',
        isFinal: false,
        receivedAt: Date.now(),
      });

      store.upsert({
        startTime: 0,
        endTime: 1,
        transcript: 'Hello',
        isFinal: false,
        receivedAt: Date.now(),
      });

      store.upsert({
        startTime: 0.5,
        endTime: 1.5,
        transcript: 'lo wo',
        isFinal: false,
        receivedAt: Date.now(),
      });

      // Now add a final that covers the entire range
      store.upsert({
        startTime: 0,
        endTime: 2,
        transcript: 'Hello world',
        isFinal: true,
        receivedAt: Date.now(),
      });

      // Should have only the final
      expect(store.size()).toBe(1);
      expect(store.getFullTranscript()).toBe('Hello world');

      const segments = store.getAllOrdered();
      expect(segments[0].isFinal).toBe(true);
    });

    test('should not replace final with partial', () => {
      // Add final first
      store.upsert({
        startTime: 0,
        endTime: 1,
        transcript: 'Final text',
        isFinal: true,
        receivedAt: Date.now(),
      });

      // Try to add partial for same range
      store.upsert({
        startTime: 0,
        endTime: 1,
        transcript: 'Partial text',
        isFinal: false,
        receivedAt: Date.now(),
      });

      // Final should be preserved
      expect(store.size()).toBe(1);
      expect(store.getFullTranscript()).toBe('Final text');
    });

    test('should replace final with new final', () => {
      store.upsert({
        startTime: 0,
        endTime: 1,
        transcript: 'First final',
        isFinal: true,
        receivedAt: Date.now(),
      });

      store.upsert({
        startTime: 0,
        endTime: 1,
        transcript: 'Second final',
        isFinal: true,
        receivedAt: Date.now(),
      });

      expect(store.size()).toBe(1);
      expect(store.getFullTranscript()).toBe('Second final');
    });

    test('should keep non-overlapping finals', () => {
      store.upsert({
        startTime: 0,
        endTime: 1,
        transcript: 'First',
        isFinal: true,
        receivedAt: Date.now(),
      });

      store.upsert({
        startTime: 1,
        endTime: 2,
        transcript: 'Second',
        isFinal: true,
        receivedAt: Date.now(),
      });

      expect(store.size()).toBe(2);
      expect(store.getFullTranscript()).toBe('First Second');
    });
  });

  describe('overlap detection', () => {
    test('should detect partial overlap at start', () => {
      store.upsert({
        startTime: 0,
        endTime: 2,
        transcript: 'Hello world',
        isFinal: false,
        receivedAt: Date.now(),
      });

      // Final that overlaps the end
      store.upsert({
        startTime: 1,
        endTime: 3,
        transcript: 'world friend',
        isFinal: true,
        receivedAt: Date.now(),
      });

      // Partial should be removed due to overlap
      expect(store.size()).toBe(1);
      expect(store.getFullTranscript()).toBe('world friend');
    });

    test('should detect partial overlap at end', () => {
      store.upsert({
        startTime: 1,
        endTime: 3,
        transcript: 'world friend',
        isFinal: false,
        receivedAt: Date.now(),
      });

      // Final that overlaps the start
      store.upsert({
        startTime: 0,
        endTime: 2,
        transcript: 'Hello world',
        isFinal: true,
        receivedAt: Date.now(),
      });

      // Partial should be removed due to overlap
      expect(store.size()).toBe(1);
      expect(store.getFullTranscript()).toBe('Hello world');
    });

    test('should detect complete containment', () => {
      // Smaller partial inside
      store.upsert({
        startTime: 0.5,
        endTime: 1.5,
        transcript: 'inner',
        isFinal: false,
        receivedAt: Date.now(),
      });

      // Larger final that contains it
      store.upsert({
        startTime: 0,
        endTime: 2,
        transcript: 'outer',
        isFinal: true,
        receivedAt: Date.now(),
      });

      expect(store.size()).toBe(1);
      expect(store.getFullTranscript()).toBe('outer');
    });

    test('should not remove adjacent non-overlapping segments', () => {
      store.upsert({
        startTime: 0,
        endTime: 1,
        transcript: 'first',
        isFinal: false,
        receivedAt: Date.now(),
      });

      // Exactly adjacent (no overlap)
      store.upsert({
        startTime: 1,
        endTime: 2,
        transcript: 'second',
        isFinal: true,
        receivedAt: Date.now(),
      });

      expect(store.size()).toBe(2);
      expect(store.getFullTranscript()).toBe('first second');
    });
  });

  describe('speaker handling', () => {
    test('should track speaker per segment', () => {
      store.upsert({
        startTime: 0,
        endTime: 1,
        transcript: 'Hello',
        isFinal: false,
        speaker: 'S1',
        receivedAt: Date.now(),
      });

      const segments = store.getAllOrdered();
      expect(segments[0].speaker).toBe('S1');
    });

    test('should get latest speaker', () => {
      store.upsert({
        startTime: 0,
        endTime: 1,
        transcript: 'Hello',
        isFinal: false,
        speaker: 'S1',
        receivedAt: Date.now(),
      });

      store.upsert({
        startTime: 1,
        endTime: 2,
        transcript: 'World',
        isFinal: false,
        speaker: 'S2',
        receivedAt: Date.now(),
      });

      expect(store.getLatestSpeaker()).toBe('S2');
    });

    test('should return undefined speaker when no segments', () => {
      expect(store.getLatestSpeaker()).toBeUndefined();
    });

    test('should return undefined speaker when no segments have speaker', () => {
      store.upsert({
        startTime: 0,
        endTime: 1,
        transcript: 'Hello',
        isFinal: false,
        receivedAt: Date.now(),
      });

      expect(store.getLatestSpeaker()).toBeUndefined();
    });
  });

  describe('stale segment removal', () => {
    test('should remove segments older than max age', () => {
      const now = Date.now();

      store.upsert({
        startTime: 0,
        endTime: 1,
        transcript: 'Old',
        isFinal: false,
        receivedAt: now - 5000, // 5 seconds ago
      });

      store.upsert({
        startTime: 1,
        endTime: 2,
        transcript: 'New',
        isFinal: false,
        receivedAt: now,
      });

      store.removeStale(3000); // Remove segments older than 3 seconds

      expect(store.size()).toBe(1);
      expect(store.getFullTranscript()).toBe('New');
    });

    test('should keep all segments if none are stale', () => {
      const now = Date.now();

      store.upsert({
        startTime: 0,
        endTime: 1,
        transcript: 'First',
        isFinal: false,
        receivedAt: now - 1000,
      });

      store.upsert({
        startTime: 1,
        endTime: 2,
        transcript: 'Second',
        isFinal: false,
        receivedAt: now,
      });

      store.removeStale(5000); // 5 seconds - both are newer

      expect(store.size()).toBe(2);
    });
  });

  describe('realistic scenarios', () => {
    test('should handle typical Speechmatics flow: partials then final', () => {
      // Speechmatics sends multiple partials as transcription progresses
      store.upsert({
        startTime: 0,
        endTime: 0.5,
        transcript: 'Bon',
        isFinal: false,
        receivedAt: Date.now(),
      });

      store.upsert({
        startTime: 0,
        endTime: 1.0,
        transcript: 'Bonjour',
        isFinal: false,
        receivedAt: Date.now(),
      });

      store.upsert({
        startTime: 0,
        endTime: 1.5,
        transcript: 'Bonjour je',
        isFinal: false,
        receivedAt: Date.now(),
      });

      store.upsert({
        startTime: 0,
        endTime: 2.0,
        transcript: 'Bonjour je suis',
        isFinal: false,
        receivedAt: Date.now(),
      });

      // Final arrives
      store.upsert({
        startTime: 0,
        endTime: 2.5,
        transcript: 'Bonjour je suis Pierre',
        isFinal: true,
        receivedAt: Date.now(),
      });

      // Should have only the final
      expect(store.size()).toBe(1);
      expect(store.getFullTranscript()).toBe('Bonjour je suis Pierre');
    });

    test('should handle speaker changes during conversation', () => {
      // Speaker 1 says something
      store.upsert({
        startTime: 0,
        endTime: 2,
        transcript: "Comment allez-vous?",
        isFinal: true,
        speaker: 'S1',
        receivedAt: Date.now(),
      });

      // Speaker 2 responds
      store.upsert({
        startTime: 2,
        endTime: 4,
        transcript: "Tres bien merci",
        isFinal: true,
        speaker: 'S2',
        receivedAt: Date.now(),
      });

      expect(store.size()).toBe(2);
      expect(store.getFullTranscript()).toBe("Comment allez-vous? Tres bien merci");

      const segments = store.getAllOrdered();
      expect(segments[0].speaker).toBe('S1');
      expect(segments[1].speaker).toBe('S2');
    });

    test('should handle refinement: Speechmatics corrects transcription', () => {
      // Initial partial with error
      store.upsert({
        startTime: 0,
        endTime: 1.5,
        transcript: 'dans le jeu ou il faut',
        isFinal: false,
        receivedAt: Date.now(),
      });

      // Corrected partial (Speechmatics improved recognition)
      store.upsert({
        startTime: 0,
        endTime: 1.5,
        transcript: 'dans le jeu ou il fait semblant',
        isFinal: false,
        receivedAt: Date.now(),
      });

      // Same time range = replacement, not duplication
      expect(store.size()).toBe(1);
      expect(store.getFullTranscript()).toBe('dans le jeu ou il fait semblant');
    });

    test('should handle gaps in audio', () => {
      // First segment
      store.upsert({
        startTime: 0,
        endTime: 1,
        transcript: 'First',
        isFinal: true,
        receivedAt: Date.now(),
      });

      // Gap in audio (1-3 seconds silence)

      // Second segment after gap
      store.upsert({
        startTime: 3,
        endTime: 4,
        transcript: 'Second',
        isFinal: true,
        receivedAt: Date.now(),
      });

      expect(store.size()).toBe(2);
      expect(store.getFullTranscript()).toBe('First Second');
    });
  });

  describe('edge cases', () => {
    test('should handle zero-length time range', () => {
      store.upsert({
        startTime: 1,
        endTime: 1, // Same start and end
        transcript: 'Instant',
        isFinal: false,
        receivedAt: Date.now(),
      });

      // This is technically valid (a point in time)
      expect(store.hasSegments()).toBe(true);
    });

    test('should handle very small time differences', () => {
      store.upsert({
        startTime: 0,
        endTime: 0.001,
        transcript: 'A',
        isFinal: false,
        receivedAt: Date.now(),
      });

      store.upsert({
        startTime: 0.001,
        endTime: 0.002,
        transcript: 'B',
        isFinal: false,
        receivedAt: Date.now(),
      });

      expect(store.size()).toBe(2);
    });

    test('should normalize whitespace in full transcript', () => {
      store.upsert({
        startTime: 0,
        endTime: 1,
        transcript: '  Hello  ',
        isFinal: false,
        receivedAt: Date.now(),
      });

      store.upsert({
        startTime: 1,
        endTime: 2,
        transcript: '  world  ',
        isFinal: false,
        receivedAt: Date.now(),
      });

      expect(store.getFullTranscript()).toBe('Hello world');
    });
  });
});
