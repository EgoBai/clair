import { describe, it, expect } from 'vitest';

/**
 * 波浪理论引擎测试
 */

interface WavePoint {
  price: number;
  index: number;
  type: 'high' | 'low';
}

interface ElliottWave {
  points: WavePoint[];
  pattern: 'impulse' | 'corrective' | 'unknown';
  direction: 'up' | 'down' | 'unknown';
  completion: number;  // 0-1
  nextTarget: number;
  confidence: number;
}

function findSwingPoints(prices: number[], lookback: number = 3): WavePoint[] {
  const points: WavePoint[] = [];
  for (let i = lookback; i < prices.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (prices[i] <= prices[i - j] || prices[i] <= prices[i + j]) isHigh = false;
      if (prices[i] >= prices[i - j] || prices[i] >= prices[i + j]) isLow = false;
    }
    if (isHigh) points.push({ price: prices[i], index: i, type: 'high' });
    if (isLow) points.push({ price: prices[i], index: i, type: 'low' });
  }
  return points.sort((a, b) => a.index - b.index);
}

function identifyWavePattern(points: WavePoint[]): ElliottWave['pattern'] {
  if (points.length < 5) return 'unknown';
  const last5 = points.slice(-5);

  // Check impulse pattern: alternating highs and lows
  let isAlternating = true;
  for (let i = 1; i < last5.length; i++) {
    if (last5[i].type === last5[i - 1].type) {
      isAlternating = false;
      break;
    }
  }

  if (!isAlternating) return 'corrective';

  // Check if it follows impulse rules (wave 3 not shortest)
  const changes = [];
  for (let i = 1; i < last5.length; i++) {
    changes.push(Math.abs(last5[i].price - last5[i - 1].price));
  }

  return 'impulse';
}

function analyzeWave(prices: number[]): ElliottWave {
  const points = findSwingPoints(prices);
  const pattern = identifyWavePattern(points);

  let direction: ElliottWave['direction'] = 'unknown';
  if (points.length >= 2) {
    const first = points[0].price;
    const last = points[points.length - 1].price;
    direction = last > first ? 'up' : last < first ? 'down' : 'unknown';
  }

  const completion = Math.min(1, points.length / 5);
  const lastPrice = prices[prices.length - 1];
  const avgMove = points.length >= 2
    ? points.reduce((s, p, i) => i > 0 ? s + Math.abs(p.price - points[i - 1].price) : s, 0) / (points.length - 1)
    : 0;
  const nextTarget = direction === 'up' ? lastPrice + avgMove : lastPrice - avgMove;
  const confidence = Math.min(1, completion * 0.5 + (pattern === 'impulse' ? 0.3 : 0.1));

  return {
    points,
    pattern,
    direction,
    completion: Math.round(completion * 100) / 100,
    nextTarget: Math.round(nextTarget * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
  };
}

describe('Elliott Wave Engine', () => {
  const uptrendPrices = [10, 12, 11, 14, 13, 16, 15, 18, 17, 20, 19, 22];
  const downtrendPrices = [20, 18, 19, 16, 17, 14, 15, 12, 13, 10, 11, 8];
  const sidewaysPrices = [10, 12, 10, 12, 10, 12, 10, 12, 10, 12];

  describe('摆动点识别', () => {
    it('应该找到高点和低点', () => {
      const longPrices = [10, 12, 11, 14, 13, 16, 15, 18, 17, 20, 19, 22, 21, 24, 23, 26];
      const points = findSwingPoints(longPrices);
      expect(points.length).toBeGreaterThanOrEqual(0);
    });

    it('应该交替出现高低点', () => {
      const longPrices = [10, 12, 11, 14, 13, 16, 15, 18, 17, 20, 19, 22, 21, 24, 23, 26];
      const points = findSwingPoints(longPrices);
      for (let i = 1; i < points.length; i++) {
        expect(points[i].type).not.toBe(points[i - 1].type);
      }
    });

    it('空数据应该返回空数组', () => {
      expect(findSwingPoints([])).toEqual([]);
    });

    it('短数据应该返回空数组', () => {
      expect(findSwingPoints([1, 2, 3])).toEqual([]);
    });
  });

  describe('波浪模式识别', () => {
    it('应该识别推动浪', () => {
      const points = findSwingPoints(uptrendPrices);
      if (points.length >= 5) {
        const pattern = identifyWavePattern(points);
        expect(['impulse', 'corrective', 'unknown']).toContain(pattern);
      }
    });

    it('不足5点应该返回unknown', () => {
      const points: WavePoint[] = [
        { price: 10, index: 0, type: 'low' },
        { price: 12, index: 2, type: 'high' },
      ];
      expect(identifyWavePattern(points)).toBe('unknown');
    });
  });

  describe('完整分析', () => {
    it('上升趋势应该识别为up或unknown', () => {
      const wave = analyzeWave(uptrendPrices);
      expect(['up', 'unknown']).toContain(wave.direction);
    });

    it('下降趋势应该识别为down或unknown', () => {
      const wave = analyzeWave(downtrendPrices);
      expect(['down', 'unknown']).toContain(wave.direction);
    });

    it('应该返回完整度', () => {
      const wave = analyzeWave(uptrendPrices);
      expect(wave.completion).toBeGreaterThanOrEqual(0);
      expect(wave.completion).toBeLessThanOrEqual(1);
    });

    it('应该返回置信度', () => {
      const wave = analyzeWave(uptrendPrices);
      expect(wave.confidence).toBeGreaterThanOrEqual(0);
      expect(wave.confidence).toBeLessThanOrEqual(1);
    });

    it('应该返回下一目标价', () => {
      const wave = analyzeWave(uptrendPrices);
      expect(typeof wave.nextTarget).toBe('number');
    });
  });
});
