import { describe, it, expect } from 'vitest';
import {
  calculateMA,
  calculateAllMAs,
  detectCrossovers,
  calculateTrendStrength,
  identifyTrendPhase,
  calculateStopLossTakeProfit,
  analyzeDrawdown,
  calculateATR,
  type PriceData,
  type MAValues,
} from '../utils/trendFollowingEngine';

/**
 * 趋势跟踪策略引擎测试 (导入真实模块)
 */

function mkPrice(i: number, close: number): PriceData {
  return { date: `d${i}`, open: close, high: close + 1, low: close - 1, close, volume: 1000 };
}

describe('calculateMA', () => {
  it('数据不足应返回 NaN 数组', () => {
    const ma = calculateMA([1, 2], 5);
    expect(ma).toHaveLength(2);
    expect(ma.every(v => Number.isNaN(v))).toBe(true);
  });

  it('应正确计算移动平均', () => {
    const ma = calculateMA([10, 20, 30], 3);
    expect(ma).toHaveLength(3);
    expect(ma[2]).toBe(20);
  });
});

describe('calculateAllMAs', () => {
  it('返回与输入等长的序列', () => {
    const data = Array.from({ length: 70 }, (_, i) => mkPrice(i, 100 + i));
    const mas = calculateAllMAs(data);
    expect(mas).toHaveLength(70);
    expect(mas[69].ma5).toBeGreaterThan(0);
    expect(mas[69].ma60).toBeGreaterThan(0);
  });
});

describe('detectCrossovers', () => {
  it('应检测金叉', () => {
    const data: (MAValues & { date: string; close: number })[] = [
      { date: '1', close: 100, ma5: 10, ma10: 11, ma20: 12, ma60: 13, ma120: 14, ma250: 15 },
      { date: '2', close: 100, ma5: 20, ma10: 11, ma20: 12, ma60: 13, ma120: 14, ma250: 15 },
    ];
    const signals = detectCrossovers(data);
    expect(signals.some(s => s.type === 'golden_cross')).toBe(true);
    expect(signals.every(s => s.direction === 'bullish')).toBe(true);
  });

  it('应检测死叉', () => {
    const data: (MAValues & { date: string; close: number })[] = [
      { date: '1', close: 100, ma5: 20, ma10: 11, ma20: 12, ma60: 13, ma120: 14, ma250: 15 },
      { date: '2', close: 100, ma5: 10, ma10: 11, ma20: 12, ma60: 13, ma120: 14, ma250: 15 },
    ];
    const signals = detectCrossovers(data);
    expect(signals.some(s => s.type === 'death_cross')).toBe(true);
    expect(signals.every(s => s.direction === 'bearish')).toBe(true);
  });
});

describe('calculateTrendStrength', () => {
  it('空数据返回中性', () => {
    const r = calculateTrendStrength([]);
    expect(r.score).toBe(50);
    expect(r.level).toBe('neutral');
    expect(r.maAlignment).toBe(0);
  });

  it('应识别多头排列(强上涨)', () => {
    const data: (MAValues & { date: string; close: number })[] = [
      { date: '1', close: 110, ma5: 120, ma10: 110, ma20: 100, ma60: 90, ma120: 80, ma250: 70 },
    ];
    const r = calculateTrendStrength(data);
    expect(r.level).toBe('strong_up');
    expect(r.score).toBeGreaterThan(75);
    expect(r.maAlignment).toBeCloseTo(0.8, 2);
  });

  it('应识别空头排列(强下跌)', () => {
    const data: (MAValues & { date: string; close: number })[] = [
      { date: '1', close: 90, ma5: 80, ma10: 90, ma20: 100, ma60: 110, ma120: 120, ma250: 130 },
    ];
    const r = calculateTrendStrength(data);
    expect(r.level).toBe('strong_down');
    expect(r.score).toBe(0);
  });
});

describe('identifyTrendPhase', () => {
  it('数据不足返回积累阶段', () => {
    const data = Array.from({ length: 5 }, (_, i) => ({
      date: `d${i}`, close: 100 + i, ma5: 1, ma10: 2, ma20: 3, ma60: 4, ma120: 5, ma250: 6,
    }));
    const phase = identifyTrendPhase(data, Array(5).fill(100));
    expect(phase.phase).toBe('accumulation');
    expect(phase.confidence).toBe(0);
    expect(phase.characteristics).toContain('数据不足');
  });

  it('放量上涨识别为主升浪', () => {
    const mk = () => ({ date: 'x', close: 110, ma5: 120, ma10: 110, ma20: 100, ma60: 90, ma120: 80, ma250: 70 });
    const data = Array.from({ length: 25 }, (_, i) => ({ ...mk(), date: `d${i}` }));
    const volumes = Array.from({ length: 25 }, (_, i) => (i >= 20 ? 200 : 100));
    const phase = identifyTrendPhase(data, volumes);
    expect(phase.phase).toBe('markup');
    expect(phase.confidence).toBe(80);
    expect(phase.characteristics).toContain('放量上涨');
  });
});

describe('calculateStopLossTakeProfit', () => {
  it('ATR 法应正确计算', () => {
    const r = calculateStopLossTakeProfit(100, 2);
    expect(r.stopLoss).toBe(96);
    expect(r.takeProfit).toBe(106);
    expect(r.riskReward).toBeCloseTo(1.5, 5);
    expect(r.trailingStop).toBe(98);
    expect(r.method).toContain('ATR');
  });

  it('ATR 为 0 时回退百分比法', () => {
    const r = calculateStopLossTakeProfit(100, 0);
    expect(r.stopLoss).toBe(95);
    expect(r.takeProfit).toBeCloseTo(110, 5);
  });

  it('百分比法', () => {
    const r = calculateStopLossTakeProfit(100, 2, 'percentage');
    expect(r.stopLoss).toBe(95);
    expect(r.takeProfit).toBeCloseTo(110, 5);
  });
});

describe('analyzeDrawdown', () => {
  it('应计算最大回撤', () => {
    const data: PriceData[] = [
      mkPrice(0, 100),
      mkPrice(1, 120),
      mkPrice(2, 90),
    ];
    const r = analyzeDrawdown(data);
    expect(r.maxDrawdown).toBe(30);
    expect(r.maxDrawdownPct).toBe(25);
    expect(r.currentDrawdown).toBe(25);
  });
});

describe('calculateATR', () => {
  it('应返回与输入等长的序列且末值有限', () => {
    const data: PriceData[] = Array.from({ length: 20 }, (_, i) =>
      ({ date: `d${i}`, open: 100 + i, high: 102 + i, low: 98 + i, close: 100 + i, volume: 1000 }));
    const atr = calculateATR(data, 14);
    expect(atr).toHaveLength(20);
    expect(Number.isFinite(atr[19])).toBe(true);
  });
});
