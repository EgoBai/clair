import { describe, it, expect } from 'vitest';

/**
 * 图表骨架屏逻辑测试
 * ChartSkeleton / ChartLoadingPlaceholder 无渲染逻辑
 */

interface SkeletonConfig {
  height: number;
  rowHeight: number;
  minRows: number;
  maxRows: number;
}

function calcSkeletonRows(height: number, rowHeight = 60): number {
  return Math.max(1, Math.floor(height / rowHeight));
}

function calcSkeletonDimensions(config: SkeletonConfig): {
  rows: number;
  totalHeight: number;
  fitsContainer: boolean;
} {
  const rows = calcSkeletonRows(config.height, config.rowHeight);
  const clampedRows = Math.min(config.maxRows, Math.max(config.minRows, rows));
  const totalHeight = clampedRows * config.rowHeight;
  return {
    rows: clampedRows,
    totalHeight,
    fitsContainer: totalHeight <= config.height,
  };
}

function shouldShowSkeleton(loading: boolean, hasData: boolean): boolean {
  return loading || !hasData;
}

function calcPlaceholderOpacity(elapsed: number, duration: number): number {
  if (duration <= 0) return 1;
  const progress = Math.min(1, elapsed / duration);
  // Shimmer effect: 0.3 → 0.7 → 0.3
  return 0.3 + 0.4 * Math.sin(progress * Math.PI);
}

function generateSkeletonGrid(
  width: number,
  height: number,
  cols: number,
  rows: number
): Array<{ x: number; y: number; w: number; h: number }> {
  const cellW = width / cols;
  const cellH = height / rows;
  const cells: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({ x: c * cellW, y: r * cellH, w: cellW, h: cellH });
    }
  }
  return cells;
}

function chartTypeToRows(chartType: string): number {
  const map: Record<string, number> = {
    candlestick: 5,
    line: 3,
    bar: 4,
    pie: 2,
    heatmap: 6,
    treemap: 4,
    volume: 3,
    scatter: 3,
  };
  return map[chartType] ?? 3;
}

describe('图表骨架屏逻辑', () => {
  describe('calcSkeletonRows', () => {
    it('should calculate rows from height', () => {
      expect(calcSkeletonRows(300)).toBe(5);
      expect(calcSkeletonRows(300, 60)).toBe(5);
      expect(calcSkeletonRows(300, 100)).toBe(3);
    });

    it('should return at least 1 row', () => {
      expect(calcSkeletonRows(0)).toBe(1); // Math.max(1, ...) ensures at least 1
      expect(calcSkeletonRows(50)).toBe(1);
    });

    it('should handle large heights', () => {
      expect(calcSkeletonRows(1200)).toBe(20);
    });

    it('should handle custom row heights', () => {
      expect(calcSkeletonRows(500, 50)).toBe(10);
      expect(calcSkeletonRows(500, 125)).toBe(4);
    });
  });

  describe('calcSkeletonDimensions', () => {
    it('should clamp rows within min/max', () => {
      const result = calcSkeletonDimensions({
        height: 300,
        rowHeight: 60,
        minRows: 2,
        maxRows: 4,
      });
      expect(result.rows).toBe(4); // 5 clamped to 4
    });

    it('should enforce minimum rows', () => {
      const result = calcSkeletonDimensions({
        height: 60,
        rowHeight: 60,
        minRows: 3,
        maxRows: 10,
      });
      expect(result.rows).toBe(3);
    });

    it('should calculate total height', () => {
      const result = calcSkeletonDimensions({
        height: 300,
        rowHeight: 60,
        minRows: 1,
        maxRows: 10,
      });
      expect(result.totalHeight).toBe(300);
    });

    it('should indicate if skeleton fits container', () => {
      const fits = calcSkeletonDimensions({
        height: 300,
        rowHeight: 60,
        minRows: 1,
        maxRows: 10,
      });
      expect(fits.fitsContainer).toBe(true);

      const overflows = calcSkeletonDimensions({
        height: 100,
        rowHeight: 60,
        minRows: 5,
        maxRows: 10,
      });
      expect(overflows.fitsContainer).toBe(false);
    });
  });

  describe('shouldShowSkeleton', () => {
    it('should show when loading', () => {
      expect(shouldShowSkeleton(true, true)).toBe(true);
      expect(shouldShowSkeleton(true, false)).toBe(true);
    });

    it('should show when no data', () => {
      expect(shouldShowSkeleton(false, false)).toBe(true);
    });

    it('should hide when loaded with data', () => {
      expect(shouldShowSkeleton(false, true)).toBe(false);
    });
  });

  describe('calcPlaceholderOpacity', () => {
    it('should return 0.3 at start', () => {
      const op = calcPlaceholderOpacity(0, 1000);
      expect(op).toBeCloseTo(0.3, 5);
    });

    it('should return 0.7 at midpoint (shimmer peak)', () => {
      const op = calcPlaceholderOpacity(500, 1000);
      expect(op).toBeCloseTo(0.7, 5);
    });

    it('should return 0.3 at end', () => {
      const op = calcPlaceholderOpacity(1000, 1000);
      expect(op).toBeCloseTo(0.3, 5);
    });

    it('should handle zero duration', () => {
      expect(calcPlaceholderOpacity(100, 0)).toBe(1);
      expect(calcPlaceholderOpacity(100, -1)).toBe(1);
    });
  });

  describe('generateSkeletonGrid', () => {
    it('should generate correct number of cells', () => {
      const cells = generateSkeletonGrid(400, 300, 2, 3);
      expect(cells).toHaveLength(6);
    });

    it('should calculate correct cell dimensions', () => {
      const cells = generateSkeletonGrid(400, 300, 2, 3);
      expect(cells[0]).toEqual({ x: 0, y: 0, w: 200, h: 100 });
      expect(cells[1]).toEqual({ x: 200, y: 0, w: 200, h: 100 });
      expect(cells[2]).toEqual({ x: 0, y: 100, w: 200, h: 100 });
    });

    it('should handle single cell', () => {
      const cells = generateSkeletonGrid(100, 100, 1, 1);
      expect(cells).toHaveLength(1);
      expect(cells[0]).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    });

    it('should fill entire grid area', () => {
      const cells = generateSkeletonGrid(600, 400, 3, 4);
      const last = cells[cells.length - 1];
      expect(last.x + last.w).toBe(600);
      expect(last.y + last.h).toBe(400);
    });
  });

  describe('chartTypeToRows', () => {
    it('should map known chart types', () => {
      expect(chartTypeToRows('candlestick')).toBe(5);
      expect(chartTypeToRows('line')).toBe(3);
      expect(chartTypeToRows('bar')).toBe(4);
      expect(chartTypeToRows('pie')).toBe(2);
      expect(chartTypeToRows('heatmap')).toBe(6);
      expect(chartTypeToRows('treemap')).toBe(4);
      expect(chartTypeToRows('volume')).toBe(3);
    });

    it('should default to 3 for unknown types', () => {
      expect(chartTypeToRows('unknown')).toBe(3);
      expect(chartTypeToRows('')).toBe(3);
    });
  });
});
