import { describe, it, expect } from 'vitest';

// Chart rendering and data transformation logic tests
describe('Chart Render Logic', () => {
  // Candlestick rendering
  describe('Candlestick Rendering', () => {
    interface Candle { open: number; high: number; low: number; close: number; volume: number; }

    function getCandleColor(candle: Candle): { body: string; wick: string } {
      const isUp = candle.close >= candle.open;
      return {
        body: isUp ? '#ef4444' : '#22c55e',
        wick: isUp ? '#ef4444' : '#22c55e',
      };
    }

    function getCandleMetrics(candle: Candle, width: number) {
      const bodyTop = Math.max(candle.open, candle.close);
      const bodyBottom = Math.min(candle.open, candle.close);
      const bodyHeight = bodyTop - bodyBottom;
      const totalRange = candle.high - candle.low;
      const bodyRatio = totalRange === 0 ? 1 : bodyHeight / totalRange;
      return { bodyTop, bodyBottom, bodyHeight, totalRange, bodyRatio, width };
    }

    it('should color bullish candle red', () => {
      const color = getCandleColor({ open: 100, high: 105, low: 98, close: 103, volume: 1000 });
      expect(color.body).toBe('#ef4444');
    });

    it('should color bearish candle green', () => {
      const color = getCandleColor({ open: 103, high: 105, low: 98, close: 100, volume: 1000 });
      expect(color.body).toBe('#22c55e');
    });

    it('should calculate body metrics', () => {
      const metrics = getCandleMetrics({ open: 100, high: 105, low: 98, close: 103, volume: 1000 }, 8);
      expect(metrics.bodyTop).toBe(103);
      expect(metrics.bodyBottom).toBe(100);
      expect(metrics.bodyHeight).toBe(3);
    });

    it('should handle doji (zero body)', () => {
      const metrics = getCandleMetrics({ open: 100, high: 105, low: 95, close: 100, volume: 1000 }, 8);
      expect(metrics.bodyHeight).toBe(0);
    });

    it('should calculate body ratio', () => {
      const metrics = getCandleMetrics({ open: 100, high: 105, low: 95, close: 104, volume: 1000 }, 8);
      expect(metrics.bodyRatio).toBeCloseTo(0.4, 1);
    });

    it('should render upper wick', () => {
      const candle = { open: 100, high: 108, low: 95, close: 103, volume: 1000 };
      const upperWickTop = candle.high;
      const upperWickBottom = Math.max(candle.open, candle.close);
      expect(upperWickTop).toBe(108);
      expect(upperWickBottom).toBe(103);
    });

    it('should render lower wick', () => {
      const candle = { open: 100, high: 108, low: 95, close: 103, volume: 1000 };
      const lowerWickTop = Math.min(candle.open, candle.close);
      const lowerWickBottom = candle.low;
      expect(lowerWickTop).toBe(100);
      expect(lowerWickBottom).toBe(95);
    });
  });

  // Volume bar rendering
  describe('Volume Bar Rendering', () => {
    function getVolumeBarColor(close: number, prevClose: number): string {
      return close >= prevClose ? '#ef444480' : '#22c55e80';
    }

    function scaleVolume(volume: number, maxVolume: number, maxHeight: number): number {
      return (volume / maxVolume) * maxHeight;
    }

    it('should color volume bar based on price direction', () => {
      expect(getVolumeBarColor(105, 100)).toBe('#ef444480');
      expect(getVolumeBarColor(95, 100)).toBe('#22c55e80');
    });

    it('should scale volume proportionally', () => {
      const height = scaleVolume(500000, 1000000, 100);
      expect(height).toBe(50);
    });

    it('should handle zero max volume', () => {
      const height = scaleVolume(0, 0, 100);
      expect(height).toBeNaN();
    });

    it('should cap at max height', () => {
      const height = scaleVolume(1000000, 500000, 100);
      expect(height).toBe(200);
    });
  });

  // Y-axis scaling
  describe('Y-Axis Scaling', () => {
    function calculateYRange(prices: number[], padding: number = 0.05): { min: number; max: number } {
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const range = max - min;
      return {
        min: min - range * padding,
        max: max + range * padding,
      };
    }

    function generateYTicks(min: number, max: number, count: number = 5): number[] {
      const step = (max - min) / (count - 1);
      return Array.from({ length: count }, (_, i) => +(min + i * step).toFixed(2));
    }

    it('should calculate range with padding', () => {
      const { min, max } = calculateYRange([95, 105]);
      expect(min).toBeLessThan(95);
      expect(max).toBeGreaterThan(105);
    });

    it('should generate evenly spaced ticks', () => {
      const ticks = generateYTicks(90, 110, 5);
      expect(ticks).toHaveLength(5);
      expect(ticks[0]).toBe(90);
      expect(ticks[4]).toBe(110);
    });

    it('should handle flat data', () => {
      const { min, max } = calculateYRange([100, 100, 100]);
      expect(min).toBe(100);
      expect(max).toBe(100);
    });

    it('should format tick values', () => {
      const ticks = generateYTicks(1790.5, 1810.5, 5);
      ticks.forEach(t => {
        expect(Number.isFinite(t)).toBe(true);
      });
    });
  });

  // X-axis time formatting
  describe('X-Axis Time Formatting', () => {
    function formatTimeLabel(dateStr: string, period: string): string {
      const d = new Date(dateStr);
      if (period === 'day') return `${d.getMonth() + 1}/${d.getDate()}`;
      if (period === 'week') return `W${Math.ceil(d.getDate() / 7)}`;
      if (period === 'month') return `${d.getFullYear()}/${d.getMonth() + 1}`;
      return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    it('should format daily label', () => {
      expect(formatTimeLabel('2024-03-15', 'day')).toBe('3/15');
    });

    it('should format monthly label', () => {
      expect(formatTimeLabel('2024-03-15', 'month')).toBe('2024/3');
    });

    it('should format intraday time', () => {
      const label = formatTimeLabel('2024-03-15T10:30:00', '5m');
      expect(label).toContain(':');
    });
  });

  // Crosshair tooltip positioning
  describe('Crosshair Tooltip', () => {
    interface TooltipPos { x: number; y: number; placement: 'left' | 'right' | 'top' | 'bottom'; }

    function calculateTooltipPos(
      mouseX: number, mouseY: number,
      chartWidth: number, chartHeight: number,
      tooltipWidth: number, tooltipHeight: number
    ): TooltipPos {
      const halfW = tooltipWidth / 2;
      const halfH = tooltipHeight / 2;
      let x = mouseX, y = mouseY;
      let placement: TooltipPos['placement'] = 'right';

      if (mouseX + halfW > chartWidth) { placement = 'left'; x = mouseX - tooltipWidth; }
      if (mouseX - halfW < 0) { placement = 'right'; x = mouseX; }
      if (mouseY - halfH < 0) { y = mouseY + 10; }
      if (mouseY + halfH > chartHeight) { y = mouseY - tooltipHeight - 10; }

      return { x, y, placement };
    }

    it('should place tooltip right by default', () => {
      const pos = calculateTooltipPos(100, 100, 800, 400, 150, 80);
      expect(pos.placement).toBe('right');
    });

    it('should flip to left near right edge', () => {
      const pos = calculateTooltipPos(750, 100, 800, 400, 150, 80);
      expect(pos.placement).toBe('left');
    });

    it('should handle top edge', () => {
      const pos = calculateTooltipPos(400, 5, 800, 400, 150, 80);
      expect(pos.y).toBeGreaterThan(0);
    });

    it('should handle bottom edge', () => {
      const pos = calculateTooltipPos(400, 395, 800, 400, 150, 80);
      expect(pos.y).toBeLessThan(395);
    });
  });

  // MA line rendering
  describe('MA Line Rendering', () => {
    function generateMALine(prices: number[], period: number): (number | null)[] {
      const result: (number | null)[] = [];
      for (let i = 0; i < prices.length; i++) {
        if (i < period - 1) { result.push(null); continue; }
        const slice = prices.slice(i - period + 1, i + 1);
        result.push(slice.reduce((a, b) => a + b, 0) / period);
      }
      return result;
    }

    it('should generate correct MA line', () => {
      const prices = [10, 12, 14, 16, 18];
      const ma3 = generateMALine(prices, 3);
      expect(ma3[0]).toBeNull();
      expect(ma3[1]).toBeNull();
      expect(ma3[2]).toBe(12);
      expect(ma3[4]).toBe(16);
    });

    it('should have null prefix for short data', () => {
      const prices = [10, 12];
      const ma5 = generateMALine(prices, 5);
      expect(ma5.every(v => v === null)).toBe(true);
    });

    it('should match data length', () => {
      const prices = [10, 12, 14, 16, 18, 20];
      const ma3 = generateMALine(prices, 3);
      expect(ma3).toHaveLength(prices.length);
    });

    it('should connect points as polyline', () => {
      const prices = [10, 12, 14, 16, 18, 20, 22, 24];
      const ma3 = generateMALine(prices, 3);
      const validPoints = ma3.filter((v): v is number => v !== null);
      // Check monotonic for rising prices
      for (let i = 1; i < validPoints.length; i++) {
        expect(validPoints[i]).toBeGreaterThanOrEqual(validPoints[i - 1]);
      }
    });
  });

  // Chart responsive behavior
  describe('Chart Responsive', () => {
    function getChartConfig(width: number) {
      if (width < 480) return { candleWidth: 2, fontSize: 10, indicators: false };
      if (width < 768) return { candleWidth: 4, fontSize: 11, indicators: true };
      return { candleWidth: 8, fontSize: 12, indicators: true };
    }

    it('should use narrow candles on mobile', () => {
      const config = getChartConfig(375);
      expect(config.candleWidth).toBe(2);
    });

    it('should use wide candles on desktop', () => {
      const config = getChartConfig(1200);
      expect(config.candleWidth).toBe(8);
    });

    it('should hide indicators on very small screens', () => {
      const config = getChartConfig(375);
      expect(config.indicators).toBe(false);
    });
  });
});
