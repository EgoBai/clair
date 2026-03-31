import { describe, it, expect } from 'vitest';
import {
  calculateVirtualRange,
  buildDynamicLayout,
  binarySearchStartIndex,
  ScrollPositionManager,
} from '../utils/virtualScroll';

describe('calculateVirtualRange', () => {
  it('should calculate correct range for first visible items', () => {
    const result = calculateVirtualRange({
      itemHeight: 40,
      containerHeight: 400,
      overscan: 2,
      totalCount: 1000,
      scrollTop: 0,
    });
    expect(result.startIndex).toBe(0);
    expect(result.visibleItems).toBe(10);
    expect(result.endIndex).toBe(12); // 10 visible + 2 overscan
  });

  it('should calculate correct range when scrolled', () => {
    const result = calculateVirtualRange({
      itemHeight: 40,
      containerHeight: 400,
      overscan: 2,
      totalCount: 1000,
      scrollTop: 400,
    });
    expect(result.startIndex).toBe(8); // 10 - 2 overscan
    expect(result.endIndex).toBe(22); // 20 + 2 overscan
  });

  it('should calculate total height', () => {
    const result = calculateVirtualRange({
      itemHeight: 50,
      containerHeight: 500,
      overscan: 0,
      totalCount: 100,
      scrollTop: 0,
    });
    expect(result.totalHeight).toBe(5000);
  });

  it('should not exceed total count', () => {
    const result = calculateVirtualRange({
      itemHeight: 40,
      containerHeight: 400,
      overscan: 5,
      totalCount: 10,
      scrollTop: 0,
    });
    expect(result.endIndex).toBe(9); // max index
  });

  it('should not go below 0', () => {
    const result = calculateVirtualRange({
      itemHeight: 40,
      containerHeight: 400,
      overscan: 5,
      totalCount: 100,
      scrollTop: 0,
    });
    expect(result.startIndex).toBe(0);
  });

  it('should generate correct items array', () => {
    const result = calculateVirtualRange({
      itemHeight: 40,
      containerHeight: 200,
      overscan: 0,
      totalCount: 100,
      scrollTop: 0,
    });
    expect(result.items).toHaveLength(6); // ceil(200/40) = 5 visible + 1 partial = 6
    expect(result.items[0].index).toBe(0);
    expect(result.items[0].top).toBe(0);
    expect(result.items[0].height).toBe(40);
  });

  it('should calculate offsetY for rendering', () => {
    const result = calculateVirtualRange({
      itemHeight: 40,
      containerHeight: 400,
      overscan: 2,
      totalCount: 100,
      scrollTop: 800,
    });
    expect(result.offsetY).toBe(result.startIndex * 40);
  });
});

describe('buildDynamicLayout', () => {
  it('should handle equal heights', () => {
    const heights = Array(100).fill(40);
    const result = buildDynamicLayout(heights, 400, 0);
    expect(result.totalHeight).toBe(4000);
    expect(result.startIndex).toBe(0);
  });

  it('should handle varying heights', () => {
    const heights = [50, 30, 60, 40, 20];
    const result = buildDynamicLayout(heights, 100, 0);
    expect(result.totalHeight).toBe(200);
    expect(result.items.length).toBeGreaterThan(0);
  });

  it('should compute correct offsets', () => {
    const heights = [50, 30, 60];
    const result = buildDynamicLayout(heights, 500, 0);
    // offsets should be: 0, 50, 80
    expect(result.items[0].offset).toBe(0);
    if (result.items.length > 1) expect(result.items[1].offset).toBe(50);
    if (result.items.length > 2) expect(result.items[2].offset).toBe(80);
  });

  it('should handle empty heights array', () => {
    const result = buildDynamicLayout([], 400, 0);
    expect(result.totalHeight).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it('should respect overscan parameter', () => {
    const heights = Array(100).fill(40);
    const result = buildDynamicLayout(heights, 200, 400, 10);
    expect(result.startIndex).toBeLessThanOrEqual(10); // with overscan
  });
});

describe('binarySearchStartIndex', () => {
  it('should find correct index', () => {
    const offsets = [0, 40, 80, 120, 160, 200, 240, 280, 320, 360];
    expect(binarySearchStartIndex(offsets, 0)).toBe(0);
    expect(binarySearchStartIndex(offsets, 50)).toBe(1); // 40 < 50, 80 >= 50 → index 1
    expect(binarySearchStartIndex(offsets, 100)).toBe(2); // 80 < 100, 120 >= 100 → index 2
    expect(binarySearchStartIndex(offsets, 200)).toBe(4); // 160 < 200, 200 >= 200 → index 4
  });

  it('should handle exact boundary', () => {
    const offsets = [0, 100, 200, 300];
    expect(binarySearchStartIndex(offsets, 100)).toBe(0); // 0 < 100, 100 >= 100 → index 0
  });

  it('should return 0 for negative scroll', () => {
    const offsets = [0, 100, 200];
    expect(binarySearchStartIndex(offsets, -10)).toBe(0);
  });

  it('should handle single element', () => {
    expect(binarySearchStartIndex([0], 0)).toBe(0);
  });
});

describe('ScrollPositionManager', () => {
  it('should save and restore positions', () => {
    const mgr = new ScrollPositionManager();
    mgr.save('page1', 150);
    expect(mgr.restore('page1')).toBe(150);
  });

  it('should return 0 for unknown key', () => {
    const mgr = new ScrollPositionManager();
    expect(mgr.restore('unknown')).toBe(0);
  });

  it('should clear specific key', () => {
    const mgr = new ScrollPositionManager();
    mgr.save('a', 100);
    mgr.save('b', 200);
    mgr.clear('a');
    expect(mgr.restore('a')).toBe(0);
    expect(mgr.restore('b')).toBe(200);
  });

  it('should clear all', () => {
    const mgr = new ScrollPositionManager();
    mgr.save('a', 100);
    mgr.save('b', 200);
    mgr.clear();
    expect(mgr.restore('a')).toBe(0);
    expect(mgr.restore('b')).toBe(0);
  });

  it('should overwrite existing position', () => {
    const mgr = new ScrollPositionManager();
    mgr.save('page', 100);
    mgr.save('page', 200);
    expect(mgr.restore('page')).toBe(200);
  });
});
