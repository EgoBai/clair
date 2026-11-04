import { describe, it, expect } from 'vitest';

/**
 * 虚拟滚动数据管理逻辑测试
 * 高效大数据集渲染辅助逻辑
 */

interface ChunkConfig {
  chunkSize: number;
  preloadChunks: number;
  totalItems: number;
}

interface ChunkInfo {
  index: number;
  start: number;
  end: number;
  loaded: boolean;
}

function calcChunkIndex(itemIndex: number, chunkSize: number): number {
  return Math.floor(itemIndex / chunkSize);
}

function calcChunkRange(chunkIndex: number, chunkSize: number, totalItems: number): { start: number; end: number } {
  const start = chunkIndex * chunkSize;
  return {
    start,
    end: Math.min(start + chunkSize, totalItems),
  };
}

function getRequiredChunks(config: ChunkConfig, scrollPosition: number, itemHeight: number): number[] {
  const viewportHeight = config.chunkSize * itemHeight;
  const firstVisibleItem = Math.floor(scrollPosition / itemHeight);
  const lastVisibleItem = Math.ceil((scrollPosition + viewportHeight) / itemHeight);

  const firstChunk = calcChunkIndex(firstVisibleItem, config.chunkSize);
  const lastChunk = calcChunkIndex(lastVisibleItem, config.chunkSize);

  const chunks: number[] = [];
  const maxChunk = Math.ceil(config.totalItems / config.chunkSize) - 1;

  for (let i = firstChunk - config.preloadChunks; i <= lastChunk + config.preloadChunks; i++) {
    if (i >= 0 && i <= maxChunk) {
      chunks.push(i);
    }
  }

  return [...new Set(chunks)].sort((a, b) => a - b);
}

function buildChunkMap(config: ChunkConfig): ChunkInfo[] {
  const totalChunks = Math.ceil(config.totalItems / config.chunkSize);
  return Array.from({ length: totalChunks }, (_, i) => {
    const { start, end } = calcChunkRange(i, config.chunkSize, config.totalItems);
    return { index: i, start, end, loaded: false };
  });
}

function markChunksLoaded(chunkMap: ChunkInfo[], chunkIndices: number[]): ChunkInfo[] {
  return chunkMap.map(chunk =>
    chunkIndices.includes(chunk.index) ? { ...chunk, loaded: true } : chunk
  );
}

function getLoadedItemRange(chunkMap: ChunkInfo[]): { start: number; end: number } | null {
  const loaded = chunkMap.filter(c => c.loaded);
  if (loaded.length === 0) return null;
  return {
    start: Math.min(...loaded.map(c => c.start)),
    end: Math.max(...loaded.map(c => c.end)),
  };
}

function calcMemoryEstimate(config: ChunkConfig, bytesPerItem: number): {
  totalBytes: number;
  loadedBytes: number;
  visibleBytes: number;
} {
  const loadedChunks = Math.ceil(config.totalItems / config.chunkSize);
  return {
    totalBytes: config.totalItems * bytesPerItem,
    loadedBytes: loadedChunks * config.chunkSize * bytesPerItem,
    visibleBytes: config.chunkSize * bytesPerItem,
  };
}

function shouldEvictChunk(
  chunkIndex: number,
  currentScrollChunk: number,
  maxDistance: number
): boolean {
  return Math.abs(chunkIndex - currentScrollChunk) > maxDistance;
}

function prioritizeChunks(
  chunks: number[],
  currentChunk: number
): number[] {
  return [...chunks].sort((a, b) => {
    const distA = Math.abs(a - currentChunk);
    const distB = Math.abs(b - currentChunk);
    return distA - distB;
  });
}

function calcScrollToItem(
  itemIndex: number,
  itemHeight: number,
  containerHeight: number,
  totalItems: number
): number {
  const maxScroll = totalItems * itemHeight - containerHeight;
  const targetScroll = itemIndex * itemHeight - containerHeight / 3;
  return Math.max(0, Math.min(maxScroll, targetScroll));
}

function batchItemUpdates<T>(
  items: T[],
  updates: Array<{ index: number; value: T }>
): T[] {
  const result = [...items];
  for (const update of updates) {
    if (update.index >= 0 && update.index < result.length) {
      result[update.index] = update.value;
    }
  }
  return result;
}

function findItemBinarySearch<T>(
  items: T[],
  predicate: (item: T) => number // returns < 0 if target is before, 0 if match, > 0 if after
): number {
  let low = 0;
  let high = items.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const cmp = predicate(items[mid]);
    if (cmp === 0) return mid;
    if (cmp < 0) high = mid - 1;
    else low = mid + 1;
  }
  return -1;
}

describe('虚拟滚动数据管理逻辑', () => {
  describe('calcChunkIndex', () => {
    it('should calculate chunk index', () => {
      expect(calcChunkIndex(0, 100)).toBe(0);
      expect(calcChunkIndex(99, 100)).toBe(0);
      expect(calcChunkIndex(100, 100)).toBe(1);
      expect(calcChunkIndex(250, 100)).toBe(2);
    });
  });

  describe('calcChunkRange', () => {
    it('should calculate range', () => {
      expect(calcChunkRange(0, 100, 1000)).toEqual({ start: 0, end: 100 });
      expect(calcChunkRange(5, 100, 1000)).toEqual({ start: 500, end: 600 });
    });

    it('should clamp to total', () => {
      expect(calcChunkRange(9, 100, 950)).toEqual({ start: 900, end: 950 });
    });
  });

  describe('getRequiredChunks', () => {
    it('should include visible and preloaded chunks', () => {
      const config: ChunkConfig = { chunkSize: 100, preloadChunks: 1, totalItems: 1000 };
      const chunks = getRequiredChunks(config, 0, 50);
      expect(chunks).toContain(0);
      expect(chunks).toContain(1); // preload
    });

    it('should not include negative chunks', () => {
      const config: ChunkConfig = { chunkSize: 100, preloadChunks: 5, totalItems: 1000 };
      const chunks = getRequiredChunks(config, 0, 50);
      expect(chunks.every(c => c >= 0)).toBe(true);
    });

    it('should not exceed max chunk', () => {
      const config: ChunkConfig = { chunkSize: 100, preloadChunks: 10, totalItems: 500 };
      const chunks = getRequiredChunks(config, 450 * 50, 50);
      expect(chunks.every(c => c <= 4)).toBe(true); // 500/100 - 1 = 4
    });
  });

  describe('buildChunkMap', () => {
    it('should build correct number of chunks', () => {
      const map = buildChunkMap({ chunkSize: 100, preloadChunks: 0, totalItems: 350 });
      expect(map).toHaveLength(4); // ceil(350/100)
    });

    it('should calculate ranges', () => {
      const map = buildChunkMap({ chunkSize: 100, preloadChunks: 0, totalItems: 250 });
      expect(map[0]).toEqual({ index: 0, start: 0, end: 100, loaded: false });
      expect(map[2]).toEqual({ index: 2, start: 200, end: 250, loaded: false });
    });
  });

  describe('markChunksLoaded', () => {
    it('should mark specified chunks', () => {
      const map = buildChunkMap({ chunkSize: 100, preloadChunks: 0, totalItems: 300 });
      const updated = markChunksLoaded(map, [0, 1]);
      expect(updated[0].loaded).toBe(true);
      expect(updated[1].loaded).toBe(true);
      expect(updated[2].loaded).toBe(false);
    });
  });

  describe('getLoadedItemRange', () => {
    it('should return range of loaded items', () => {
      const map = buildChunkMap({ chunkSize: 100, preloadChunks: 0, totalItems: 300 });
      const loaded = markChunksLoaded(map, [1]);
      expect(getLoadedItemRange(loaded)).toEqual({ start: 100, end: 200 });
    });

    it('should return null when nothing loaded', () => {
      const map = buildChunkMap({ chunkSize: 100, preloadChunks: 0, totalItems: 300 });
      expect(getLoadedItemRange(map)).toBeNull();
    });
  });

  describe('calcMemoryEstimate', () => {
    it('should estimate memory', () => {
      const estimate = calcMemoryEstimate({ chunkSize: 100, preloadChunks: 0, totalItems: 1000 }, 64);
      expect(estimate.totalBytes).toBe(64000);
    });
  });

  describe('shouldEvictChunk', () => {
    it('should evict distant chunks', () => {
      expect(shouldEvictChunk(0, 5, 2)).toBe(true);
      expect(shouldEvictChunk(4, 5, 2)).toBe(false);
    });
  });

  describe('prioritizeChunks', () => {
    it('should sort by distance to current', () => {
      const prioritized = prioritizeChunks([0, 5, 2, 8], 3);
      expect(prioritized[0]).toBe(2);
      expect(prioritized[1]).toBe(5);
    });
  });

  describe('calcScrollToItem', () => {
    it('should scroll to item with offset', () => {
      const scroll = calcScrollToItem(50, 50, 500, 100);
      expect(scroll).toBeGreaterThan(0);
    });

    it('should not go negative', () => {
      expect(calcScrollToItem(0, 50, 500, 100)).toBe(0);
    });

    it('should not exceed max scroll', () => {
      const scroll = calcScrollToItem(99, 50, 500, 100);
      expect(scroll).toBeLessThanOrEqual(100 * 50 - 500);
    });
  });

  describe('batchItemUpdates', () => {
    it('should apply updates', () => {
      const items = [1, 2, 3, 4, 5];
      const result = batchItemUpdates(items, [
        { index: 0, value: 10 },
        { index: 4, value: 50 },
      ]);
      expect(result).toEqual([10, 2, 3, 4, 50]);
    });

    it('should not mutate original', () => {
      const items = [1, 2, 3];
      batchItemUpdates(items, [{ index: 0, value: 99 }]);
      expect(items[0]).toBe(1);
    });

    it('should ignore out-of-bounds', () => {
      const items = [1, 2, 3];
      const result = batchItemUpdates(items, [{ index: 10, value: 99 }]);
      expect(result).toEqual([1, 2, 3]);
    });
  });

  describe('findItemBinarySearch', () => {
    it('should find item', () => {
      const items = [10, 20, 30, 40, 50];
      const idx = findItemBinarySearch(items, (item) => item - 30);
      expect(idx).toBe(2);
    });

    it('should return -1 for not found', () => {
      const items = [10, 20, 30];
      expect(findItemBinarySearch(items, (item) => item - 25)).toBe(-1);
    });
  });
});
