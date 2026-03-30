import { describe, it, expect } from 'vitest';

// Search Highlight Logic
interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

function highlightMatches(text: string, query: string, caseSensitive = false): HighlightSegment[] {
  if (!query || !text) return [{ text, highlighted: false }];

  const segments: HighlightSegment[] = [];
  const searchText = caseSensitive ? text : text.toLowerCase();
  const searchQuery = caseSensitive ? query : query.toLowerCase();

  let lastIndex = 0;
  let index = searchText.indexOf(searchQuery);

  while (index !== -1) {
    if (index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, index), highlighted: false });
    }
    segments.push({ text: text.slice(index, index + query.length), highlighted: true });
    lastIndex = index + query.length;
    index = searchText.indexOf(searchQuery, lastIndex);
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), highlighted: false });
  }

  return segments.length > 0 ? segments : [{ text, highlighted: false }];
}

function fuzzyMatch(text: string, query: string): { matched: boolean; score: number; positions: number[] } {
  if (!query) return { matched: true, score: 1, positions: [] };
  if (!text) return { matched: false, score: 0, positions: [] };

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const positions: number[] = [];
  let qi = 0;
  let score = 0;
  let lastMatchIndex = -1;

  for (let ti = 0; ti < lowerText.length && qi < lowerQuery.length; ti++) {
    if (lowerText[ti] === lowerQuery[qi]) {
      positions.push(ti);
      // Consecutive match bonus
      if (lastMatchIndex === ti - 1) score += 2;
      // Start of word bonus
      if (ti === 0 || lowerText[ti - 1] === ' ' || lowerText[ti - 1] === '-') score += 3;
      else score += 1;
      lastMatchIndex = ti;
      qi++;
    }
  }

  return {
    matched: qi === lowerQuery.length,
    score: qi === lowerQuery.length ? score : 0,
    positions,
  };
}

function buildSearchRegex(query: string): RegExp | null {
  if (!query) return null;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(${escaped})`, 'gi');
}

function countMatches(text: string, query: string): number {
  if (!query || !text) return 0;
  const lower = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let count = 0;
  let pos = 0;
  while ((pos = lower.indexOf(lowerQuery, pos)) !== -1) {
    count++;
    pos += lowerQuery.length;
  }
  return count;
}

function truncateWithHighlight(text: string, query: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerQuery);

  if (matchIndex === -1) return text.slice(0, maxLength) + '...';

  const start = Math.max(0, matchIndex - Math.floor((maxLength - query.length) / 2));
  const end = Math.min(text.length, start + maxLength);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';
  return prefix + text.slice(start, end) + suffix;
}

describe('Search Highlight', () => {
  describe('highlightMatches', () => {
    it('should highlight single match', () => {
      const segments = highlightMatches('贵州茅台', '茅台');
      expect(segments).toHaveLength(2);
      expect(segments[0]).toEqual({ text: '贵州', highlighted: false });
      expect(segments[1]).toEqual({ text: '茅台', highlighted: true });
    });

    it('should highlight multiple matches', () => {
      const segments = highlightMatches('abc def abc', 'abc');
      const highlighted = segments.filter(s => s.highlighted);
      expect(highlighted).toHaveLength(2);
    });

    it('should handle case-insensitive by default', () => {
      const segments = highlightMatches('Hello World', 'hello');
      expect(segments.some(s => s.highlighted)).toBe(true);
    });

    it('should support case-sensitive mode', () => {
      const segments = highlightMatches('Hello World', 'hello', true);
      expect(segments.some(s => s.highlighted)).toBe(false);
    });

    it('should return non-highlighted for no match', () => {
      const segments = highlightMatches('abc', 'xyz');
      expect(segments).toHaveLength(1);
      expect(segments[0].highlighted).toBe(false);
    });

    it('should handle empty query', () => {
      const segments = highlightMatches('test', '');
      expect(segments).toHaveLength(1);
      expect(segments[0].highlighted).toBe(false);
    });

    it('should handle empty text', () => {
      const segments = highlightMatches('', 'test');
      expect(segments).toHaveLength(1);
    });

    it('should handle match at start', () => {
      const segments = highlightMatches('茅台酒', '茅台');
      expect(segments[0].highlighted).toBe(true);
    });

    it('should handle match at end', () => {
      const segments = highlightMatches('买入茅台', '茅台');
      expect(segments[segments.length - 1].highlighted).toBe(true);
    });
  });

  describe('fuzzyMatch', () => {
    it('should match exact substring', () => {
      const result = fuzzyMatch('贵州茅台', '茅台');
      expect(result.matched).toBe(true);
      expect(result.score).toBeGreaterThan(0);
    });

    it('should match scattered characters', () => {
      const result = fuzzyMatch('GZMT', 'GM');
      expect(result.matched).toBe(true);
    });

    it('should not match when chars not in order', () => {
      const result = fuzzyMatch('abc', 'cb');
      expect(result.matched).toBe(false);
    });

    it('should score consecutive matches higher', () => {
      const consecutive = fuzzyMatch('abcdef', 'abc');
      const scattered = fuzzyMatch('axbxcx', 'abc');
      expect(consecutive.score).toBeGreaterThan(scattered.score);
    });

    it('should score word-start matches higher', () => {
      const wordStart = fuzzyMatch('hello-world', 'hw');
      const midWord = fuzzyMatch('xhxw', 'hw');
      expect(wordStart.score).toBeGreaterThan(midWord.score);
    });

    it('should return empty positions for empty query', () => {
      const result = fuzzyMatch('test', '');
      expect(result.matched).toBe(true);
      expect(result.positions).toHaveLength(0);
    });

    it('should not match empty text', () => {
      const result = fuzzyMatch('', 'test');
      expect(result.matched).toBe(false);
    });

    it('should be case-insensitive', () => {
      const result = fuzzyMatch('HELLO', 'hello');
      expect(result.matched).toBe(true);
    });

    it('should return correct positions', () => {
      const result = fuzzyMatch('abcdef', 'ace');
      expect(result.positions).toEqual([0, 2, 4]);
    });
  });

  describe('buildSearchRegex', () => {
    it('should build regex for simple query', () => {
      const regex = buildSearchRegex('test');
      expect(regex).not.toBeNull();
      expect(regex!.test('this is a test')).toBe(true);
    });

    it('should escape special characters', () => {
      const regex = buildSearchRegex('a.b*c+');
      expect(regex).not.toBeNull();
      expect(regex!.test('a.b*c+')).toBe(true);
      expect(regex!.test('axbxxc')).toBe(false);
    });

    it('should return null for empty query', () => {
      expect(buildSearchRegex('')).toBeNull();
    });

    it('should be case-insensitive', () => {
      const regex = buildSearchRegex('Test')!;
      expect(regex.test('TEST')).toBe(true);
    });
  });

  describe('countMatches', () => {
    it('should count non-overlapping matches', () => {
      expect(countMatches('aaa', 'aa')).toBe(1); // non-overlapping: positions 0-1, advances to 2
      expect(countMatches('aaaa', 'aa')).toBe(2); // positions 0-1, 2-3
    });

    it('should return 0 for no matches', () => {
      expect(countMatches('abc', 'xyz')).toBe(0);
    });

    it('should handle empty inputs', () => {
      expect(countMatches('', 'test')).toBe(0);
      expect(countMatches('test', '')).toBe(0);
    });

    it('should count exact match', () => {
      expect(countMatches('hello world hello', 'hello')).toBe(2);
    });

    it('should be case-insensitive', () => {
      expect(countMatches('Hello HELLO hello', 'hello')).toBe(3);
    });
  });

  describe('truncateWithHighlight', () => {
    it('should not truncate short text', () => {
      expect(truncateWithHighlight('abc', 'b', 10)).toBe('abc');
    });

    it('should center truncation around match', () => {
      const result = truncateWithHighlight('abcdefghijk', 'ef', 7);
      expect(result).toContain('ef');
      expect(result).toContain('...');
    });

    it('should add ellipsis when truncated', () => {
      const result = truncateWithHighlight('abcdefghijklmnop', 'ef', 5);
      expect(result).toContain('...');
    });

    it('should handle no match', () => {
      const result = truncateWithHighlight('abcdefghijklmnop', 'xyz', 5);
      expect(result).toBe('abcde...');
    });
  });
});
