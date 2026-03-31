import { describe, it, expect } from 'vitest';

/**
 * 异常检测 / 价格异常 / 量价背离逻辑测试
 */

describe('AnomalyDetectionEngine', () => {
  describe('价格异常检测', () => {
    const detectPriceAnomaly = (prices: number[], threshold: number = 2) => {
      const returns = prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);
      const mean = returns.reduce((a, b) => a + b) / returns.length;
      const std = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length);
      
      return returns.map((r, i) => ({
        index: i + 1,
        return: r,
        zScore: (r - mean) / (std || 1),
        isAnomaly: Math.abs((r - mean) / (std || 1)) > threshold,
      }));
    };

    it('应该检测异常涨跌', () => {
      const prices = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 300];
      const results = detectPriceAnomaly(prices, 2);
      const anomalies = results.filter(r => r.isAnomaly);
      expect(anomalies.length).toBeGreaterThan(0);
    });

    it('正常波动不应该标记异常', () => {
      const prices = [100, 101, 102, 103, 104, 105];
      const results = detectPriceAnomaly(prices, 2);
      const anomalies = results.filter(r => r.isAnomaly);
      expect(anomalies).toHaveLength(0);
    });
  });

  describe('成交量异常', () => {
    const detectVolumeAnomaly = (volumes: number[], threshold: number = 3) => {
      const mean = volumes.reduce((a, b) => a + b) / volumes.length;
      const std = Math.sqrt(volumes.reduce((s, v) => s + (v - mean) ** 2, 0) / volumes.length);
      return volumes.map((v, i) => ({
        index: i,
        volume: v,
        ratio: v / mean,
        isAnomaly: v > mean + threshold * std,
      }));
    };

    it('应该检测异常放量', () => {
      const volumes = [1000, 1050, 980, 5000, 1020, 990];
      const results = detectVolumeAnomaly(volumes, 2);
      const anomalies = results.filter(r => r.isAnomaly);
      expect(anomalies.length).toBeGreaterThan(0);
      expect(anomalies[0].volume).toBe(5000);
    });
  });

  describe('量价背离', () => {
    const detectDivergence = (prices: number[], volumes: number[]) => {
      const priceChange = prices[prices.length - 1] - prices[prices.length - 2];
      const volumeChange = volumes[volumes.length - 1] - volumes[volumes.length - 2];
      
      if (priceChange > 0 && volumeChange < 0) return 'bearish_divergence';
      if (priceChange < 0 && volumeChange > 0) return 'bullish_divergence';
      return 'aligned';
    };

    it('应该检测看跌量价背离', () => {
      expect(detectDivergence([100, 110], [2000, 1000])).toBe('bearish_divergence');
    });

    it('应该检测看涨量价背离', () => {
      expect(detectDivergence([110, 100], [1000, 2000])).toBe('bullish_divergence');
    });

    it('量价同步应该返回 aligned', () => {
      expect(detectDivergence([100, 110], [1000, 2000])).toBe('aligned');
    });
  });

  describe('连续异常', () => {
    const detectConsecutiveAnomaly = (flags: boolean[], minConsecutive: number = 3) => {
      let count = 0;
      const periods: {start: number, end: number}[] = [];
      let start = -1;
      
      flags.forEach((flag, i) => {
        if (flag) {
          if (count === 0) start = i;
          count++;
        } else {
          if (count >= minConsecutive) {
            periods.push({ start, end: i - 1 });
          }
          count = 0;
        }
      });
      
      if (count >= minConsecutive) {
        periods.push({ start, end: flags.length - 1 });
      }
      
      return periods;
    };

    it('应该检测连续异常区间', () => {
      const flags = [false, true, true, true, false, true, true, false];
      const periods = detectConsecutiveAnomaly(flags, 3);
      expect(periods).toHaveLength(1);
      expect(periods[0].start).toBe(1);
    });

    it('短连续不应该被检测', () => {
      const flags = [true, true, false, true, true];
      const periods = detectConsecutiveAnomaly(flags, 3);
      expect(periods).toHaveLength(0);
    });
  });
});
