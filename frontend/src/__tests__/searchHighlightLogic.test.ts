import { describe, it, expect } from 'vitest';

/**
 * 搜索高亮组件逻辑测试
 * SearchHighlight 匹配/标记逻辑
 */

interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

function findMatchPositions(text: string, query: string, caseSensitive = false): Array<{ start: number; end: number }> {
  if (!query) return [];
  const positions: Array<{ start: number; end: number }> = [];
  const src = caseSensitive ? text : text.toLowerCase();
  const q = caseSensitive ? query : query.toLowerCase();
  let idx = 0;
  while (true) {
    const pos = src.indexOf(q, idx);
    if (pos === -1) break;
    positions.push({ start: pos, end: pos + q.length });
    idx = pos + 1;
  }
  return positions;
}

function splitByHighlight(text: string, query: string, caseSensitive = false): HighlightSegment[] {
  const positions = findMatchPositions(text, query, caseSensitive);
  if (positions.length === 0) return [{ text, highlighted: false }];

  const segments: HighlightSegment[] = [];
  let lastEnd = 0;

  for (const pos of positions) {
    if (pos.start > lastEnd) {
      segments.push({ text: text.slice(lastEnd, pos.start), highlighted: false });
    }
    segments.push({ text: text.slice(pos.start, pos.end), highlighted: true });
    lastEnd = pos.end;
  }

  if (lastEnd < text.length) {
    segments.push({ text: text.slice(lastEnd), highlighted: false });
  }

  return segments;
}

function highlightText(text: string, query: string, tag = 'mark'): string {
  const segments = splitByHighlight(text, query);
  return segments.map(s =>
    s.highlighted ? `<${tag}>${s.text}</${tag}>` : s.text
  ).join('');
}

function matchCount(text: string, query: string, caseSensitive = false): number {
  return findMatchPositions(text, query, caseSensitive).length;
}

function truncateWithHighlight(
  text: string,
  query: string,
  maxLen: number,
  contextChars = 20
): string {
  const positions = findMatchPositions(text, query);
  if (positions.length === 0) return text.slice(0, maxLen);

  const firstMatch = positions[0];
  const start = Math.max(0, firstMatch.start - contextChars);
  const end = Math.min(text.length, firstMatch.end + contextChars);

  let result = '';
  if (start > 0) result += '...';
  result += text.slice(start, end);
  if (end < text.length) result += '...';
  return result;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fuzzyMatch(text: string, pattern: string): { matched: boolean; score: number } {
  if (!pattern) return { matched: true, score: 1 };
  if (!text) return { matched: false, score: 0 };

  const lowerText = text.toLowerCase();
  const lowerPattern = pattern.toLowerCase();

  let patternIdx = 0;
  let score = 0;
  let lastMatchIdx = -1;

  for (let i = 0; i < lowerText.length && patternIdx < lowerPattern.length; i++) {
    if (lowerText[i] === lowerPattern[patternIdx]) {
      score += 1;
      // Consecutive match bonus
      if (lastMatchIdx === i - 1) score += 2;
      // Start of word bonus
      if (i === 0 || lowerText[i - 1] === ' ' || lowerText[i - 1] === '-') score += 3;
      lastMatchIdx = i;
      patternIdx++;
    }
  }

  return {
    matched: patternIdx === lowerPattern.length,
    score,
  };
}

function buildSearchIndex(items: Array<{ id: string; text: string }>): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const item of items) {
    const words = item.text.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (!index.has(word)) index.set(word, new Set());
      index.get(word)!.add(item.id);
    }
  }
  return index;
}

function searchWithIndex(
  index: Map<string, Set<string>>,
  query: string
): string[] {
  const word = query.toLowerCase().trim();
  return Array.from(index.get(word) || []);
}

describe('搜索高亮逻辑', () => {
  describe('findMatchPositions', () => {
    it('should find all matches', () => {
      const positions = findMatchPositions('abc abc abc', 'abc');
      expect(positions).toHaveLength(3);
    });

    it('should be case insensitive by default', () => {
      const positions = findMatchPositions('ABC abc', 'abc');
      expect(positions).toHaveLength(2);
    });

    it('should respect case sensitive mode', () => {
      const positions = findMatchPositions('ABC abc', 'abc', true);
      expect(positions).toHaveLength(1);
    });

    it('should return empty for no match', () => {
      expect(findMatchPositions('hello', 'xyz')).toHaveLength(0);
    });

    it('should return empty for empty query', () => {
      expect(findMatchPositions('hello', '')).toHaveLength(0);
    });

    it('should return correct positions', () => {
      const positions = findMatchPositions('hello world', 'world');
      expect(positions[0]).toEqual({ start: 6, end: 11 });
    });
  });

  describe('splitByHighlight', () => {
    it('should split into segments', () => {
      const segments = splitByHighlight('hello world hello', 'hello');
      expect(segments).toHaveLength(3);
      expect(segments[0]).toEqual({ text: 'hello', highlighted: true });
      expect(segments[1]).toEqual({ text: ' world ', highlighted: false });
      expect(segments[2]).toEqual({ text: 'hello', highlighted: true });
    });

    it('should return single non-highlighted segment for no match', () => {
      const segments = splitByHighlight('hello', 'xyz');
      expect(segments).toEqual([{ text: 'hello', highlighted: false }]);
    });
  });

  describe('highlightText', () => {
    it('should wrap matches with tags', () => {
      expect(highlightText('hello world', 'world')).toBe('hello <mark>world</mark>');
    });

    it('should support custom tags', () => {
      expect(highlightText('hello world', 'world', 'span')).toBe('hello <span>world</span>');
    });

    it('should handle multiple matches', () => {
      expect(highlightText('a b a', 'a')).toBe('<mark>a</mark> b <mark>a</mark>');
    });
  });

  describe('matchCount', () => {
    it('should count matches', () => {
      expect(matchCount('abc abc abc', 'abc')).toBe(3);
    });

    it('should be case insensitive', () => {
      expect(matchCount('ABC abc Abc', 'abc')).toBe(3);
    });

    it('should respect case sensitive', () => {
      expect(matchCount('ABC abc', 'abc', true)).toBe(1);
    });
  });

  describe('truncateWithHighlight', () => {
    it('should show context around match', () => {
      const result = truncateWithHighlight(
        'The quick brown fox jumps over the lazy dog',
        'fox',
        100
      );
      expect(result).toContain('fox');
    });

    it('should truncate long text', () => {
      const text = 'a'.repeat(100) + 'match' + 'b'.repeat(100);
      const result = truncateWithHighlight(text, 'match', 50);
      expect(result.length).toBeLessThan(text.length);
      expect(result).toContain('match');
    });

    it('should add ellipsis when truncated', () => {
      const text = 'a'.repeat(100) + 'match' + 'b'.repeat(100);
      const result = truncateWithHighlight(text, 'match', 30);
      expect(result).toContain('...');
    });
  });

  describe('escapeRegex', () => {
    it('should escape special characters', () => {
      expect(escapeRegex('a.b*c+d?e')).toBe('a\\.b\\*c\\+d\\?e');
    });

    it('should escape brackets', () => {
      expect(escapeRegex('[test](url)')).toBe('\\[test\\]\\(url\\)');
    });
  });

  describe('fuzzyMatch', () => {
    it('should match exact substring', () => {
      const result = fuzzyMatch('Guizhou Maotai', 'maotai');
      expect(result.matched).toBe(true);
      expect(result.score).toBeGreaterThan(0);
    });

    it('should match scattered characters', () => {
      const result = fuzzyMatch('Guizhou Maotai', 'gzt');
      expect(result.matched).toBe(true);
    });

    it('should return false for no match', () => {
      expect(fuzzyMatch('hello', 'xyz').matched).toBe(false);
    });

    it('should handle empty pattern', () => {
      expect(fuzzyMatch('hello', '').matched).toBe(true);
    });

    it('should handle empty text', () => {
      expect(fuzzyMatch('', 'a').matched).toBe(false);
    });

    it('should give higher score for consecutive matches', () => {
      const consecutive = fuzzyMatch('abcde', 'bcd');
      const scattered = fuzzyMatch('abcde', 'bce');
      expect(consecutive.score).toBeGreaterThan(scattered.score);
    });
  });

  describe('buildSearchIndex / searchWithIndex', () => {
    it('should build index from items', () => {
      const index = buildSearchIndex([
        { id: '1', text: 'Guizhou Maotai' },
        { id: '2', text: 'Wuliangye Liquor' },
      ]);
      expect(index.get('guizhou')).toContain('1');
      expect(index.get('wuliangye')).toContain('2');
    });

    it('should search with index', () => {
      const index = buildSearchIndex([
        { id: '1', text: 'Guizhou Maotai' },
        { id: '2', text: 'Wuliangye Liquor' },
      ]);
      const results = searchWithIndex(index, 'maotai');
      expect(results).toContain('1');
    });
  });
});
