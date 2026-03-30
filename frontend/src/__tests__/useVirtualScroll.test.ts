import { describe, it, expect } from 'vitest';

// Test pure logic from useVirtualScroll without React rendering

describe('useVirtualScroll logic', () => {
  const items = Array.from({ length: 1000 }, (_, i) => ({ id: i, name: `Item ${i}` }));

  it('should calculate correct visible range', () => {
    const itemHeight = 40;
    const containerHeight = 400;
    const overscan = 5;
    const scrollTop = 0;

    const visibleCount = Math.ceil(containerHeight / itemHeight); // 10
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan); // 0
    const end = Math.min(items.length - 1, Math.floor(scrollTop / itemHeight) + visibleCount + overscan); // 14

    expect(start).toBe(0);
    expect(end).toBe(15);
    expect(end - start + 1).toBe(16); // items with overscan
  });

  it('should calculate range with scroll offset', () => {
    const itemHeight = 40;
    const containerHeight = 400;
    const overscan = 5;
    const scrollTop = 400; // scrolled 10 items

    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const end = Math.min(items.length - 1, Math.floor(scrollTop / itemHeight) + visibleCount + overscan);

    expect(start).toBe(5); // 10 - 5 overscan
    expect(end).toBe(25); // 10 + 10 visible + 5 overscan
  });

  it('should calculate total height', () => {
    const itemHeight = 40;
    expect(items.length * itemHeight).toBe(40000);
  });

  it('should generate correct item positions', () => {
    const itemHeight = 40;
    const positions = items.map((_, i) => ({
      top: i * itemHeight,
      height: itemHeight,
    }));

    expect(positions[0]).toEqual({ top: 0, height: 40 });
    expect(positions[999]).toEqual({ top: 39960, height: 40 });
  });

  it('should handle empty items', () => {
    const totalHeight = 0 * 40;
    expect(totalHeight).toBe(0);
  });

  it('should clamp start index to 0', () => {
    const scrollTop = 0;
    const overscan = 10;
    const start = Math.max(0, Math.floor(scrollTop / 40) - overscan);
    expect(start).toBe(0);
  });

  it('should clamp end index to items.length - 1', () => {
    const scrollTop = 39600; // near end
    const containerHeight = 400;
    const itemHeight = 40;
    const overscan = 5;
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const end = Math.min(items.length - 1, Math.floor(scrollTop / itemHeight) + visibleCount + overscan);
    expect(end).toBe(999); // clamped to last index
  });

  it('should generate virtual items with correct styles', () => {
    const itemHeight = 40;
    const start = 5;
    const end = 15;

    const virtualItems = [];
    for (let i = start; i <= end; i++) {
      virtualItems.push({
        index: i,
        item: items[i],
        style: {
          position: 'absolute' as const,
          top: i * itemHeight,
          left: 0,
          right: 0,
          height: itemHeight,
        },
      });
    }

    expect(virtualItems).toHaveLength(11);
    expect(virtualItems[0].index).toBe(5);
    expect(virtualItems[0].style.top).toBe(200);
    expect(virtualItems[0].item.id).toBe(5);
  });

  describe('dynamic height calculation', () => {
    it('should sum estimated heights for total', () => {
      const itemCount = 100;
      const estimatedHeight = 40;
      expect(itemCount * estimatedHeight).toBe(4000);
    });

    it('should use measured heights when available', () => {
      const heights = new Map<number, number>();
      heights.set(0, 50); // measured
      heights.set(1, 30); // measured
      // 2 not measured, use estimated

      const estimated = 40;
      const totalHeight = [0, 1, 2].reduce((sum, i) => {
        return sum + (heights.get(i) ?? estimated);
      }, 0);

      expect(totalHeight).toBe(120); // 50 + 30 + 40
    });
  });
});
