import { describe, it, expect } from 'vitest';

/**
 * 模式识别 / 图形分析逻辑测试
 */

describe('PatternRecognitionEngine', () => {
  describe('头肩顶/底', () => {
    const isHeadAndShoulders = (highs: number[]) => {
      if (highs.length < 5) return false;
      // 简化检测: 左肩 < 头 > 右肩，左右肩等高
      const leftShoulder = highs[0];
      const head = highs[2];
      const rightShoulder = highs[4];
      return head > leftShoulder && head > rightShoulder && 
             Math.abs(leftShoulder - rightShoulder) / leftShoulder < 0.05;
    };

    it('应该识别头肩顶', () => {
      expect(isHeadAndShoulders([100, 95, 110, 95, 100])).toBe(true);
    });

    it('非头肩顶应返回 false', () => {
      expect(isHeadAndShoulders([100, 110, 120, 130, 140])).toBe(false);
    });
  });

  describe('双顶/双底', () => {
    const isDoubleTop = (highs: number[], tolerance: number = 0.02) => {
      for (let i = 0; i < highs.length - 1; i++) {
        for (let j = i + 1; j < highs.length; j++) {
          if (Math.abs(highs[i] - highs[j]) / highs[i] < tolerance) {
            return { found: true, points: [i, j] };
          }
        }
      }
      return { found: false, points: [] };
    };

    it('应该识别双顶', () => {
      const result = isDoubleTop([90, 100, 95, 99, 92]);
      expect(result.found).toBe(true);
    });

    it('无双顶应该返回 false', () => {
      const result = isDoubleTop([90, 95, 100, 105, 110]);
      expect(result.found).toBe(false);
    });
  });

  describe('三角形整理', () => {
    const isTrianglePattern = (highs: number[], lows: number[]) => {
      // 上升三角: 高点持平，低点抬高
      const highTrend = highs[highs.length - 1] - highs[0];
      const lowTrend = lows[lows.length - 1] - lows[0];
      
      if (Math.abs(highTrend) < 2 && lowTrend > 0) return 'ascending';
      if (highTrend < 0 && Math.abs(lowTrend) < 2) return 'descending';
      if (highTrend < 0 && lowTrend > 0) return 'symmetrical';
      return 'none';
    };

    it('应该识别上升三角形', () => {
      expect(isTrianglePattern([100, 100, 100, 100], [90, 92, 94, 96])).toBe('ascending');
    });

    it('应该识别下降三角形', () => {
      expect(isTrianglePattern([110, 108, 106, 104], [95, 95, 95, 95])).toBe('descending');
    });

    it('应该识别对称三角形', () => {
      expect(isTrianglePattern([110, 108, 106, 104], [90, 92, 94, 96])).toBe('symmetrical');
    });
  });

  describe('旗形/楔形', () => {
    const isFlag = (prices: number[], trendBefore: 'up' | 'down') => {
      const range = Math.max(...prices) - Math.min(...prices);
      const avgPrice = prices.reduce((a, b) => a + b) / prices.length;
      const consolidationRange = range / avgPrice;
      
      // 整理区间应该窄幅
      return consolidationRange < 0.05;
    };

    it('应该识别窄幅整理', () => {
      expect(isFlag([100, 101, 99, 100, 101], 'up')).toBe(true);
    });

    it('宽幅波动不应该识别为旗形', () => {
      expect(isFlag([90, 100, 95, 110, 92], 'up')).toBe(false);
    });
  });
});

describe('PatternMatching', () => {
  describe('形态相似度', () => {
    const calcSimilarity = (pattern1: number[], pattern2: number[]) => {
      const normalize = (arr: number[]) => {
        const min = Math.min(...arr);
        const max = Math.max(...arr);
        const range = max - min || 1;
        return arr.map(v => (v - min) / range);
      };
      
      const n1 = normalize(pattern1);
      const n2 = normalize(pattern2);
      
      const diff = n1.reduce((s, v, i) => s + Math.abs(v - n2[i]), 0);
      return 1 - diff / n1.length;
    };

    it('相同模式相似度应该为 1', () => {
      const p = [100, 110, 105, 115, 120];
      expect(calcSimilarity(p, p)).toBe(1);
    });

    it('相似模式相似度应该较高', () => {
      const p1 = [100, 110, 105, 115, 120];
      const p2 = [50, 55, 52, 57, 60];
      const similarity = calcSimilarity(p1, p2);
      expect(similarity).toBeGreaterThan(0.8);
    });
  });
});
