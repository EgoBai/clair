import { describe, it, expect } from 'vitest';
import {
  formatKlineTooltip,
  formatVolumeTooltip,
  formatIndicatorTooltip,
  formatComparisonTooltip,
  OHLCVData,
} from '../utils/chartTooltipFormatter';

const mockOHLCV: OHLCVData = {
  date: '2025-03-15',
  open: 10.50,
  high: 11.20,
  low: 10.30,
  close: 11.00,
  volume: 150000,
  changePercent: 4.76,
};

describe('ChartTooltipFormatter', () => {
  describe('formatKlineTooltip', () => {
    it('should format basic K-line tooltip', () => {
      const result = formatKlineTooltip(mockOHLCV);
      expect(result).toContain('2025-03-15');
      expect(result).toContain('开: 10.50');
      expect(result).toContain('高: 11.20');
      expect(result).toContain('收: 11.00');
    });

    it('should show volume in 万手', () => {
      const result = formatKlineTooltip(mockOHLCV);
      expect(result).toContain('万手');
    });

    it('should show change percent when enabled', () => {
      const result = formatKlineTooltip(mockOHLCV, [], { showChange: true });
      expect(result).toContain('+4.76%');
    });

    it('should hide change when disabled', () => {
      const result = formatKlineTooltip(mockOHLCV, [], { showChange: false });
      expect(result).not.toContain('涨跌');
    });

    it('should show indicators', () => {
      const result = formatKlineTooltip(mockOHLCV, [
        { name: 'MA5', value: 10.8 },
        { name: 'MA10', value: 10.5 },
      ]);
      expect(result).toContain('MA5: 10.80');
      expect(result).toContain('MA10: 10.50');
    });

    it('should apply custom decimal places', () => {
      const result = formatKlineTooltip(mockOHLCV, [], { decimalPlaces: 3 });
      expect(result).toContain('10.500');
    });

    it('should format date differently', () => {
      const result = formatKlineTooltip(mockOHLCV, [], { dateFormat: 'MM-DD' });
      expect(result).toContain('03-15');
      expect(result).not.toContain('2025');
    });

    it('should handle negative change', () => {
      const data = { ...mockOHLCV, changePercent: -2.5 };
      const result = formatKlineTooltip(data, [], { showChange: true });
      expect(result).toContain('-2.50%');
    });
  });

  describe('formatVolumeTooltip', () => {
    it('should show volume and ratio', () => {
      const result = formatVolumeTooltip('2025-03-15', 300000, 100000);
      expect(result).toContain('均量比: 3.00x');
      expect(result).toContain('⚠️ 放量');
    });

    it('should detect shrinking volume', () => {
      const result = formatVolumeTooltip('2025-03-15', 30000, 100000);
      expect(result).toContain('📌 缩量');
    });
  });

  describe('formatIndicatorTooltip', () => {
    it('should format indicator values', () => {
      const result = formatIndicatorTooltip('2025-03-15', [
        { name: 'RSI', value: 65.5 },
      ]);
      expect(result).toContain('RSI: 65.50');
    });
  });

  describe('formatComparisonTooltip', () => {
    it('should compare multiple stocks', () => {
      const result = formatComparisonTooltip('2025-03-15', [
        { name: '茅台', price: 1800, change: 2.5 },
        { name: '比亚迪', price: 250, change: -1.2 },
      ]);
      expect(result).toContain('茅台');
      expect(result).toContain('+2.50%');
      expect(result).toContain('-1.20%');
    });
  });
});
