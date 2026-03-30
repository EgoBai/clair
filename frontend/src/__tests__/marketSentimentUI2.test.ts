import { describe, it, expect } from 'vitest';

// 市场情绪UI引擎
interface SentimentData {
  date: string;
  bullishPercent: number;    // 看涨比例
  bearishPercent: number;    // 看跌比例
  neutralPercent: number;    // 中性比例
  vix: number;               // 波动率指数
  putCallRatio: number;      // 看跌/看涨比
  advanceDecline: number;    // 涨跌比
  newHighs: number;          // 新高数
  newLows: number;           // 新低数
}

function calcSentimentScore(data: SentimentData): number {
  let score = 50; // 中性起点
  score += (data.bullishPercent - 50) * 0.5;
  score -= (data.vix - 20) * 0.3;
  score += (data.advanceDecline - 1) * 10;
  score += (data.newHighs - data.newLows) * 0.1;
  return Math.max(0, Math.min(100, score));
}

function getSentimentLabel(score: number): string {
  if (score >= 80) return '极度贪婪';
  if (score >= 60) return '贪婪';
  if (score >= 40) return '中性';
  if (score >= 20) return '恐惧';
  return '极度恐惧';
}

function getSentimentColor(score: number): string {
  if (score >= 80) return '#dc2626';
  if (score >= 60) return '#f59e0b';
  if (score >= 40) return '#6b7280';
  if (score >= 20) return '#3b82f6';
  return '#1d4ed8';
}

function calcSentimentTrend(history: SentimentData[]): 'improving' | 'deteriorating' | 'stable' {
  if (history.length < 2) return 'stable';
  const recent = history.slice(-5);
  const scores = recent.map(calcSentimentScore);
  const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
  const secondHalf = scores.slice(Math.floor(scores.length / 2));
  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  if (avgSecond - avgFirst > 5) return 'improving';
  if (avgFirst - avgSecond > 5) return 'deteriorating';
  return 'stable';
}

function generateSentimentGauge(score: number): { angle: number; color: string; label: string } {
  return {
    angle: (score / 100) * 180 - 90,
    color: getSentimentColor(score),
    label: getSentimentLabel(score),
  };
}

function calcMcClellanOscillator(advances: number[], declines: number[]): number[] {
  if (advances.length !== declines.length) return [];
  const netAdvances = advances.map((a, i) => a - declines[i]);
  const ema19 = calcEMA(netAdvances, 19);
  const ema39 = calcEMA(netAdvances, 39);
  const result: number[] = [];
  for (let i = 0; i < ema19.length; i++) {
    if (ema39[i] !== undefined) result.push(ema19[i] - ema39[i]);
  }
  return result;
}

function calcEMA(data: number[], period: number): number[] {
  if (data.length < period) return [];
  const multiplier = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const result: number[] = [];
  for (let i = 0; i < period - 1; i++) result.push(NaN);
  result.push(ema);
  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * multiplier + ema;
    result.push(ema);
  }
  return result;
}

describe('市场情绪UI引擎', () => {
  const sampleData: SentimentData = {
    date: '2026-03-24',
    bullishPercent: 60,
    bearishPercent: 25,
    neutralPercent: 15,
    vix: 18,
    putCallRatio: 0.8,
    advanceDecline: 1.5,
    newHighs: 120,
    newLows: 30,
  };

  describe('情绪评分', () => {
    it('应返回0-100之间的分数', () => {
      const score = calcSentimentScore(sampleData);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('高看涨比例应得高分', () => {
      const bullish = { ...sampleData, bullishPercent: 80 };
      const bearish = { ...sampleData, bullishPercent: 20 };
      expect(calcSentimentScore(bullish)).toBeGreaterThan(calcSentimentScore(bearish));
    });

    it('高VIX应降低分数', () => {
      const lowVix = { ...sampleData, vix: 10 };
      const highVix = { ...sampleData, vix: 40 };
      expect(calcSentimentScore(lowVix)).toBeGreaterThan(calcSentimentScore(highVix));
    });
  });

  describe('情绪标签', () => {
    it('>=80应为极度贪婪', () => { expect(getSentimentLabel(85)).toBe('极度贪婪'); });
    it('60-79应为贪婪', () => { expect(getSentimentLabel(65)).toBe('贪婪'); });
    it('40-59应为中性', () => { expect(getSentimentLabel(50)).toBe('中性'); });
    it('20-39应为恐惧', () => { expect(getSentimentLabel(25)).toBe('恐惧'); });
    it('<20应为极度恐惧', () => { expect(getSentimentLabel(10)).toBe('极度恐惧'); });
  });

  describe('情绪颜色', () => {
    it('高分应为红色', () => { expect(getSentimentColor(85)).toBe('#dc2626'); });
    it('低分应为蓝色', () => { expect(getSentimentColor(10)).toBe('#1d4ed8'); });
  });

  describe('情绪趋势', () => {
    it('上升趋势应返回improving', () => {
      const history: SentimentData[] = Array.from({ length: 6 }, (_, i) => ({
        ...sampleData, bullishPercent: 30 + i * 10, vix: 30 - i * 3,
      }));
      expect(calcSentimentTrend(history)).toBe('improving');
    });

    it('下降趋势应返回deteriorating', () => {
      const history: SentimentData[] = Array.from({ length: 6 }, (_, i) => ({
        ...sampleData, bullishPercent: 80 - i * 10, vix: 15 + i * 5,
      }));
      expect(calcSentimentTrend(history)).toBe('deteriorating');
    });

    it('数据不足应返回stable', () => {
      expect(calcSentimentTrend([sampleData])).toBe('stable');
    });
  });

  describe('仪表盘', () => {
    it('应生成正确的角度', () => {
      const gauge = generateSentimentGauge(50);
      expect(gauge.angle).toBe(0);
    });

    it('0分应在最左', () => {
      expect(generateSentimentGauge(0).angle).toBe(-90);
    });

    it('100分应在最右', () => {
      expect(generateSentimentGauge(100).angle).toBe(90);
    });
  });

  describe('McClellan振荡器', () => {
    it('应返回数值数组', () => {
      const advances = Array.from({ length: 50 }, () => Math.floor(Math.random() * 300 + 100));
      const declines = Array.from({ length: 50 }, () => Math.floor(Math.random() * 200 + 50));
      const osc = calcMcClellanOscillator(advances, declines);
      expect(osc.length).toBeGreaterThan(0);
    });

    it('长度不匹配应返回空', () => {
      expect(calcMcClellanOscillator([1, 2], [1]).length).toBe(0);
    });
  });

  describe('EMA', () => {
    it('应计算指数移动平均', () => {
      const data = Array.from({ length: 30 }, (_, i) => 100 + i);
      const ema = calcEMA(data, 10);
      expect(ema.length).toBe(30);
      expect(ema[9]).toBeGreaterThan(0);
    });

    it('数据不足应返回空', () => {
      expect(calcEMA([1, 2, 3], 10).length).toBe(0);
    });
  });
});
