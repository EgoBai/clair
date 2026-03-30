import { describe, it, expect } from 'vitest';

describe('Data Visualization Logic', () => {
  describe('Chart Data Processing', () => {
    interface KLineData { date: string; open: number; close: number; high: number; low: number; volume: number; }

    function processKLineForChart(data: KLineData[]) {
      return data.map(d => ({
        ...d,
        isUp: d.close >= d.open,
        color: d.close >= d.open ? '#ef4444' : '#22c55e',
        bodyHeight: Math.abs(d.close - d.open),
        upperShadow: d.high - Math.max(d.open, d.close),
        lowerShadow: Math.min(d.open, d.close) - d.low,
      }));
    }

    function calculateMA(data: number[], period: number): (number | null)[] {
      const result: (number | null)[] = [];
      for (let i = 0; i < data.length; i++) {
        if (i < period - 1) { result.push(null); continue; }
        const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        result.push(sum / period);
      }
      return result;
    }

    function calculateEMA(data: number[], period: number): (number | null)[] {
      const result: (number | null)[] = [];
      const multiplier = 2 / (period + 1);
      let ema = data[0];
      for (let i = 0; i < data.length; i++) {
        if (i === 0) { result.push(data[0]); continue; }
        ema = (data[i] - ema) * multiplier + ema;
        result.push(ema);
      }
      return result;
    }

    it('should process KLine data with correct colors', () => {
      const data: KLineData[] = [
        { date: '2024-01-01', open: 100, close: 105, high: 108, low: 98, volume: 1000 },
        { date: '2024-01-02', open: 105, close: 100, high: 107, low: 99, volume: 1200 },
      ];
      const result = processKLineForChart(data);
      expect(result[0].color).toBe('#ef4444'); // red for up
      expect(result[1].color).toBe('#22c55e'); // green for down
      expect(result[0].isUp).toBe(true);
      expect(result[1].isUp).toBe(false);
    });

    it('should calculate upper and lower shadows', () => {
      const data: KLineData[] = [
        { date: '2024-01-01', open: 100, close: 105, high: 110, low: 95, volume: 1000 },
      ];
      const result = processKLineForChart(data);
      expect(result[0].upperShadow).toBe(5); // 110 - 105
      expect(result[0].lowerShadow).toBe(5); // 100 - 95
    });

    it('should calculate body height', () => {
      const data: KLineData[] = [
        { date: '2024-01-01', open: 100, close: 105, high: 108, low: 98, volume: 1000 },
        { date: '2024-01-02', open: 108, close: 100, high: 110, low: 98, volume: 1000 },
      ];
      const result = processKLineForChart(data);
      expect(result[0].bodyHeight).toBe(5);
      expect(result[1].bodyHeight).toBe(8);
    });

    it('should calculate MA correctly', () => {
      const data = [10, 20, 30, 40, 50];
      const ma3 = calculateMA(data, 3);
      expect(ma3[0]).toBeNull();
      expect(ma3[1]).toBeNull();
      expect(ma3[2]).toBeCloseTo(20, 1); // (10+20+30)/3
      expect(ma3[3]).toBeCloseTo(30, 1);
      expect(ma3[4]).toBeCloseTo(40, 1);
    });

    it('should calculate EMA correctly', () => {
      const data = [10, 20, 30, 40, 50];
      const ema = calculateEMA(data, 3);
      expect(ema[0]).toBe(10);
      expect(ema.length).toBe(5);
      // EMA should smooth the values
      expect(ema[4]).toBeGreaterThan(ema[0]);
    });

    it('should handle empty data for MA', () => {
      const ma = calculateMA([], 5);
      expect(ma).toEqual([]);
    });

    it('should handle single data point', () => {
      const data: KLineData[] = [
        { date: '2024-01-01', open: 100, close: 100, high: 100, low: 100, volume: 1000 },
      ];
      const result = processKLineForChart(data);
      expect(result[0].bodyHeight).toBe(0);
      expect(result[0].upperShadow).toBe(0);
      expect(result[0].lowerShadow).toBe(0);
    });
  });

  describe('Color Scale Logic', () => {
    function getColorForValue(value: number, min: number, max: number): string {
      if (max === min) return '#888888';
      const ratio = (value - min) / (max - min);
      if (ratio > 0.6) return '#ef4444'; // strong positive
      if (ratio > 0.4) return '#f97316'; // moderate positive
      if (ratio > 0.3) return '#eab308'; // slight positive
      if (ratio > 0.2) return '#9ca3af'; // neutral
      return '#22c55e'; // negative
    }

    function getHeatmapColor(changePercent: number): string {
      if (changePercent >= 5) return '#dc2626';
      if (changePercent >= 3) return '#ef4444';
      if (changePercent >= 1) return '#f97316';
      if (changePercent >= 0) return '#fbbf24';
      if (changePercent >= -1) return '#86efac';
      if (changePercent >= -3) return '#22c55e';
      return '#15803d';
    }

    it('should return red for high values', () => {
      expect(getColorForValue(90, 0, 100)).toBe('#ef4444');
    });

    it('should return green for low values', () => {
      expect(getColorForValue(10, 0, 100)).toBe('#22c55e');
    });

    it('should handle equal min/max', () => {
      expect(getColorForValue(50, 50, 50)).toBe('#888888');
    });

    it('should get heatmap color for positive change', () => {
      expect(getHeatmapColor(5)).toBe('#dc2626');
      expect(getHeatmapColor(3)).toBe('#ef4444');
      expect(getHeatmapColor(1)).toBe('#f97316');
      expect(getHeatmapColor(0.5)).toBe('#fbbf24');
    });

    it('should get heatmap color for negative change', () => {
      expect(getHeatmapColor(-5)).toBe('#15803d');
      expect(getHeatmapColor(-2)).toBe('#22c55e');
      expect(getHeatmapColor(-0.5)).toBe('#86efac');
    });

    it('should get heatmap color for zero', () => {
      expect(getHeatmapColor(0)).toBe('#fbbf24');
    });
  });

  describe('Axis Formatting Logic', () => {
    function formatYAxis(value: number): string {
      if (value >= 1e12) return (value / 1e12).toFixed(1) + '万亿';
      if (value >= 1e8) return (value / 1e8).toFixed(1) + '亿';
      if (value >= 1e4) return (value / 1e4).toFixed(1) + '万';
      return value.toFixed(2);
    }

    function formatXAxisDate(dateStr: string, period: string): string {
      if (period === '1d' || period === 'day') return dateStr.slice(5);
      if (period === '1w' || period === 'week') return dateStr.slice(5);
      return dateStr.slice(0, 7);
    }

    it('should format large numbers with 万亿', () => {
      expect(formatYAxis(1.5e12)).toBe('1.5万亿');
    });

    it('should format medium numbers with 亿', () => {
      expect(formatYAxis(5e8)).toBe('5.0亿');
    });

    it('should format small numbers with 万', () => {
      expect(formatYAxis(15000)).toBe('1.5万');
    });

    it('should format tiny numbers as is', () => {
      expect(formatYAxis(100)).toBe('100.00');
    });

    it('should format daily dates', () => {
      expect(formatXAxisDate('2024-01-15', 'day')).toBe('01-15');
    });

    it('should format monthly dates', () => {
      expect(formatXAxisDate('2024-01-15', 'month')).toBe('2024-01');
    });
  });

  describe('Tooltip Logic', () => {
    function formatTooltipContent(data: { label: string; value: number; change?: number }[]): string {
      let content = '';
      for (const item of data) {
        content += `${item.label}: ${item.value.toFixed(2)}`;
        if (item.change !== undefined) {
          const sign = item.change >= 0 ? '+' : '';
          content += ` (${sign}${item.change.toFixed(2)}%)`;
        }
        content += '\n';
      }
      return content;
    }

    it('should format tooltip with values', () => {
      const content = formatTooltipContent([{ label: '收盘', value: 105.5 }]);
      expect(content).toContain('收盘');
      expect(content).toContain('105.50');
    });

    it('should format tooltip with change', () => {
      const content = formatTooltipContent([{ label: '涨跌', value: 5.5, change: 2.3 }]);
      expect(content).toContain('+2.30%');
    });

    it('should format negative change', () => {
      const content = formatTooltipContent([{ label: '涨跌', value: -3.2, change: -1.5 }]);
      expect(content).toContain('-1.50%');
    });

    it('should handle multiple items', () => {
      const content = formatTooltipContent([
        { label: '开', value: 100 },
        { label: '高', value: 110 },
        { label: '低', value: 95 },
      ]);
      expect(content.split('\n').length).toBeGreaterThan(2);
    });
  });
});
