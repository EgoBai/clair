import { describe, it, expect } from 'vitest';

// 图表坐标轴和刻度逻辑测试
describe('Chart Axis and Scale Logic', () => {
  // Y轴刻度计算
  describe('Y-Axis Scale', () => {
    const calcYAxisRange = (min: number, max: number, ticks: number = 5) => {
      const range = max - min;
      const padding = range * 0.1;
      const niceMin = Math.floor((min - padding) / 10) * 10;
      const niceMax = Math.ceil((max + padding) / 10) * 10;
      const step = (niceMax - niceMin) / (ticks - 1);
      const values: number[] = [];
      for (let i = 0; i < ticks; i++) {
        values.push(niceMin + step * i);
      }
      return { min: niceMin, max: niceMax, step, values };
    };

    it('should calculate range with padding', () => {
      const result = calcYAxisRange(100, 200);
      expect(result.min).toBeLessThan(100);
      expect(result.max).toBeGreaterThan(200);
    });

    it('should generate correct number of ticks', () => {
      const result = calcYAxisRange(100, 200, 5);
      expect(result.values).toHaveLength(5);
    });

    it('should have ascending tick values', () => {
      const result = calcYAxisRange(100, 200);
      for (let i = 1; i < result.values.length; i++) {
        expect(result.values[i]).toBeGreaterThan(result.values[i - 1]);
      }
    });

    it('should handle zero range', () => {
      const result = calcYAxisRange(100, 100);
      expect(result.min).toBeLessThanOrEqual(100);
    });
  });

  // 数据点到像素映射
  describe('Data to Pixel Mapping', () => {
    const mapToPixel = (value: number, dataMin: number, dataMax: number, pixelMin: number, pixelMax: number) => {
      const ratio = (value - dataMin) / (dataMax - dataMin);
      return pixelMin + ratio * (pixelMax - pixelMin);
    };

    it('should map min value to pixelMin', () => {
      expect(mapToPixel(100, 100, 200, 0, 500)).toBe(0);
    });

    it('should map max value to pixelMax', () => {
      expect(mapToPixel(200, 100, 200, 0, 500)).toBe(500);
    });

    it('should map mid value to center', () => {
      expect(mapToPixel(150, 100, 200, 0, 500)).toBe(250);
    });

    it('should handle reversed pixel range', () => {
      // Y轴通常反转（高值在上方/像素小）
      expect(mapToPixel(200, 100, 200, 500, 0)).toBe(0);
    });
  });

  // X轴时间刻度
  describe('X-Axis Time Scale', () => {
    const formatTimeLabel = (timestamp: number, interval: 'day' | 'week' | 'month'): string => {
      const date = new Date(timestamp);
      const month = date.getMonth() + 1;
      const day = date.getDate();
      if (interval === 'month') return `${month}月`;
      if (interval === 'week') return `${month}/${day}`;
      return `${month}/${day}`;
    };

    it('should format day label', () => {
      const ts = new Date('2026-03-24').getTime();
      expect(formatTimeLabel(ts, 'day')).toBe('3/24');
    });

    it('should format month label', () => {
      const ts = new Date('2026-03-24').getTime();
      expect(formatTimeLabel(ts, 'month')).toBe('3月');
    });

    it('should format week label', () => {
      const ts = new Date('2026-03-24').getTime();
      expect(formatTimeLabel(ts, 'week')).toBe('3/24');
    });
  });

  // 格线计算
  describe('Grid Lines', () => {
    const calcGridLines = (min: number, max: number, count: number) => {
      const step = (max - min) / count;
      const lines: number[] = [];
      for (let i = 0; i <= count; i++) {
        lines.push(min + step * i);
      }
      return lines;
    };

    it('should generate correct grid line count', () => {
      const lines = calcGridLines(0, 100, 5);
      expect(lines).toHaveLength(6);
    });

    it('should include min and max', () => {
      const lines = calcGridLines(0, 100, 5);
      expect(lines[0]).toBe(0);
      expect(lines[5]).toBe(100);
    });

    it('should have equal spacing', () => {
      const lines = calcGridLines(0, 100, 5);
      const step = lines[1] - lines[0];
      for (let i = 2; i < lines.length; i++) {
        expect(lines[i] - lines[i - 1]).toBeCloseTo(step, 5);
      }
    });
  });

  // 缩放计算
  describe('Zoom Calculation', () => {
    const calcZoom = (startIdx: number, endIdx: number, total: number, zoomFactor: number) => {
      const range = endIdx - startIdx;
      const center = (startIdx + endIdx) / 2;
      const newRange = Math.max(10, Math.min(total, range * zoomFactor));
      const newStart = Math.max(0, Math.floor(center - newRange / 2));
      const newEnd = Math.min(total, Math.ceil(center + newRange / 2));
      return { start: newStart, end: newEnd, range: newEnd - newStart };
    };

    it('should zoom in (narrow range)', () => {
      const result = calcZoom(0, 100, 200, 0.5);
      expect(result.range).toBeLessThan(100);
    });

    it('should zoom out (widen range)', () => {
      const result = calcZoom(25, 75, 200, 2);
      expect(result.range).toBeGreaterThan(50);
    });

    it('should not exceed total range', () => {
      const result = calcZoom(0, 100, 200, 5);
      expect(result.end).toBeLessThanOrEqual(200);
    });

    it('should not go below minimum range', () => {
      const result = calcZoom(50, 51, 200, 0.1);
      expect(result.range).toBeGreaterThanOrEqual(10);
    });
  });

  // 十字光标数据索引
  describe('Crosshair Index', () => {
    const pixelToIndex = (pixelX: number, chartLeft: number, chartWidth: number, dataCount: number) => {
      const ratio = (pixelX - chartLeft) / chartWidth;
      return Math.max(0, Math.min(dataCount - 1, Math.round(ratio * (dataCount - 1))));
    };

    it('should map left edge to index 0', () => {
      expect(pixelToIndex(50, 50, 400, 10)).toBe(0);
    });

    it('should map right edge to last index', () => {
      expect(pixelToIndex(450, 50, 400, 10)).toBe(9);
    });

    it('should map center to mid index', () => {
      expect(pixelToIndex(250, 50, 400, 10)).toBe(5);
    });

    it('should clamp before start', () => {
      expect(pixelToIndex(0, 50, 400, 10)).toBe(0);
    });

    it('should clamp after end', () => {
      expect(pixelToIndex(500, 50, 400, 10)).toBe(9);
    });
  });

  // 指标叠加位置
  describe('Indicator Overlay', () => {
    const calcIndicatorY = (value: number, min: number, max: number, chartHeight: number) => {
      const ratio = (value - min) / (max - min);
      // 翻转Y轴
      return chartHeight * (1 - ratio);
    };

    it('should place max at top (y=0)', () => {
      expect(calcIndicatorY(200, 100, 200, 300)).toBe(0);
    });

    it('should place min at bottom (y=height)', () => {
      expect(calcIndicatorY(100, 100, 200, 300)).toBe(300);
    });

    it('should place mid at center', () => {
      expect(calcIndicatorY(150, 100, 200, 300)).toBe(150);
    });
  });

  // Tooltip 位置
  describe('Tooltip Position', () => {
    const calcTooltipPos = (mouseX: number, mouseY: number, tooltipW: number, tooltipH: number, canvasW: number, canvasH: number) => {
      let x = mouseX + 15;
      let y = mouseY - tooltipH / 2;
      if (x + tooltipW > canvasW) x = mouseX - tooltipW - 15;
      if (y < 0) y = 0;
      if (y + tooltipH > canvasH) y = canvasH - tooltipH;
      return { x, y };
    };

    it('should place tooltip to right of cursor', () => {
      const pos = calcTooltipPos(100, 100, 100, 50, 500, 300);
      expect(pos.x).toBe(115);
    });

    it('should flip to left when near right edge', () => {
      const pos = calcTooltipPos(450, 100, 100, 50, 500, 300);
      expect(pos.x).toBeLessThan(450);
    });

    it('should clamp to top when near top', () => {
      const pos = calcTooltipPos(100, 5, 100, 50, 500, 300);
      expect(pos.y).toBeGreaterThanOrEqual(0);
    });

    it('should clamp to bottom when near bottom', () => {
      const pos = calcTooltipPos(100, 290, 100, 50, 500, 300);
      expect(pos.y + 50).toBeLessThanOrEqual(300);
    });
  });
});
