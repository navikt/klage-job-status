import { describe, expect, it } from 'bun:test';
import { AcceptType, type AcceptValue, getAcceptValues, preferred } from '@api/accept';

describe('Accept Header', () => {
  describe('Parsing', () => {
    it('should parse the Accept header correctly', () => {
      const header = 'text/event-stream;q=0.9,application/json;q=0.8,*/*;q=0.7';
      const result = getAcceptValues(header);

      expect(result).toEqual([
        { type: AcceptType.SSE, quality: 0.9 },
        { type: AcceptType.JSON, quality: 0.8 },
        { type: AcceptType.ANY, quality: 0.7 },
      ]);
    });

    it('should return an empty array for missing Accept header', () => {
      const result = getAcceptValues(null);
      expect(result).toEqual([]);
    });
  });

  describe('Preferred', () => {
    it('should return the preferred type', () => {
      const accept: AcceptValue[] = [
        { type: AcceptType.SSE, quality: 0.9 },
        { type: AcceptType.JSON, quality: 0.8 },
      ];

      const types = [AcceptType.SSE, AcceptType.JSON];
      const result = preferred(accept, types);

      expect(result).toEqual(AcceptType.SSE);
    });

    it('should return server preferred if client accepts wildcard more than any other available type', () => {
      const accept: AcceptValue[] = [
        { type: 'text/html', quality: 0.9 },
        { type: AcceptType.ANY, quality: 0.8 },
        { type: AcceptType.JSON, quality: 0.7 },
      ];

      const types = [AcceptType.SSE, AcceptType.JSON];
      const result = preferred(accept, types);

      expect(result).toEqual(AcceptType.SSE);
    });

    it('should return null if no preferred type is found', () => {
      const accept: AcceptValue[] = [
        { type: 'text/html', quality: 0.9 },
        { type: 'image/jpeg', quality: 0.8 },
      ];

      const types = [AcceptType.SSE, AcceptType.JSON];
      const result = preferred(accept, types);

      expect(result).toEqual(null);
    });
  });
});
