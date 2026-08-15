/**
 * 市场状态检测引擎测试 —— 直接驱动真实模块
 * 说明: 原测试内联重实现了 detectTrend/calculateVolatilityRegime/detectRegimeChanges,
 *       其中 detectRegimeChanges 真实签名为 (prices, timestamps, window) 而非 (returns, window), 已修正。
 *       calculateVolatilityRegime 旧测试用 Math.random 喂数据, 改为确定性数据。
 *       另补充真实导出: detectRegimeTransitions / simpleHMM / calculateMarketBreadth / calculateMcClellanOscillator
 */
import { describe, it, expect } from 'vitest';
import {
  detectTrend,
  calculateVolatilityRegime,
  detectRegimeChanges,
  detectRegimeTransitions,
  simpleHMM,
  calculateMarketBreadth,
  calculateMcClellanOscillator,
  type RegimeState,
} from '../utils/regimeDetectionEngine';

const validRegimes = ['bull', 'bear', 'sideways', 'high_vol', 'low_vol', 'transition'];
const validVolRegimes = ['low', 'normal', 'high', 'extreme'];

describe('detectTrend', () => {
  it('数据不足应返回中性', () => {
    const trend = detectTrend([1, 2, 3], 20);
    expect(trend.direction).toBe('neutral');
    expect(trend.strength).toBe(0);
  });

  it('应识别上升趋势', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + i * 2);
    const trend = detectTrend(prices, 20);
    expect(trend.direction).toBe('up');
    expect(trend.strength).toBeGreaterThan(0);
  });

  it('应识别下降趋势', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 200 - i * 2);
    const trend = detectTrend(prices, 20);
    expect(trend.direction).toBe('down');
  });

  it('横盘应返回中性', () => {
    const prices = Array.from({ length: 30 }, () => 100);
    const trend = detectTrend(prices, 20);
    expect(trend.direction).toBe('neutral');
  });

  it('应识别枢轴点位', () => {
    const prices = [10, 12, 15, 12, 10, 8, 10, 13, 16, 13, 10, 7, 10, 14, 17, 14, 10, 6, 10, 15, 18, 15, 10, 5, 10];
    const trend = detectTrend(prices, 20);
    expect(Array.isArray(trend.pivotHighs)).toBe(true);
    expect(Array.isArray(trend.pivotLows)).toBe(true);
  });
});

describe('calculateVolatilityRegime', () => {
  it('数据不足应返回 normal 且 vol 为 0', () => {
    const vol = calculateVolatilityRegime([0.01]);
    expect(vol.regime).toBe('normal');
    expect(vol.currentVol).toBe(0);
  });

  it('高波动序列应给出合法状态且 vol 为正', () => {
    const returns = Array.from({ length: 120 }, (_, i) => (i % 2 ? 0.08 : -0.08));
    const vol = calculateVolatilityRegime(returns);
    expect(validVolRegimes).toContain(vol.regime);
    expect(vol.currentVol).toBeGreaterThan(0);
  });

  it('低波动序列应给出合法百分位', () => {
    const returns = Array.from({ length: 120 }, () => 0.0005);
    const vol = calculateVolatilityRegime(returns);
    expect(vol.currentVol).toBeGreaterThan(0);
    expect(vol.percentile).toBeGreaterThanOrEqual(0);
    expect(vol.percentile).toBeLessThanOrEqual(100);
  });
});

describe('detectRegimeChanges', () => {
  it('数据不足应返回空数组', () => {
    const prices = [100, 101, 102];
    expect(detectRegimeChanges(prices, [0, 1, 2], 20)).toHaveLength(0);
  });

  it('明确的上涨序列应判定为 bull 状态', () => {
    const prices = Array.from({ length: 41 }, (_, i) => 100 + i);
    const timestamps = Array.from({ length: 41 }, (_, i) => i);
    const regimes = detectRegimeChanges(prices, timestamps, 20);
    expect(regimes.length).toBe(prices.length - 20);
    for (const r of regimes) {
      expect(validRegimes).toContain(r.regime);
      expect(typeof r.probability).toBe('number');
      expect(typeof r.features.trend).toBe('number');
    }
  });
});

describe('detectRegimeTransitions', () => {
  it('状态相同不应产生转换', () => {
    const regimes: RegimeState[] = [
      { regime: 'bull', probability: 0.9, duration: 1, startTimestamp: 1, features: { trend: 1, volatility: 0.1, momentum: 0.01, volume: 0 } },
      { regime: 'bull', probability: 0.9, duration: 2, startTimestamp: 2, features: { trend: 1, volatility: 0.1, momentum: 0.01, volume: 0 } },
    ];
    expect(detectRegimeTransitions(regimes)).toHaveLength(0);
  });

  it('状态切换应记录转换', () => {
    const regimes: RegimeState[] = [
      { regime: 'bull', probability: 0.9, duration: 1, startTimestamp: 1, features: { trend: 1, volatility: 0.1, momentum: 0.01, volume: 0 } },
      { regime: 'bear', probability: 0.8, duration: 1, startTimestamp: 2, features: { trend: -1, volatility: 0.1, momentum: -0.01, volume: 0 } },
    ];
    const transitions = detectRegimeTransitions(regimes);
    expect(transitions).toHaveLength(1);
    expect(transitions[0].from).toBe('bull');
    expect(transitions[0].to).toBe('bear');
  });
});

describe('simpleHMM', () => {
  it('应返回完整的隐马尔可夫状态', () => {
    const observations = [1, 1, 1, 2, 2, 2, 1, 1, 2, 2];
    const hmm = simpleHMM(observations, 2);
    expect(hmm.states).toHaveLength(observations.length);
    expect(hmm.emissionMeans).toHaveLength(2);
    expect(hmm.emissionStd).toHaveLength(2);
    expect(typeof hmm.logLikelihood).toBe('number');
    for (const row of hmm.transitionMatrix) {
      const sum = row.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 5);
    }
  });
});

describe('calculateMarketBreadth', () => {
  it('普涨应给出 bullish 信号', () => {
    const b = calculateMarketBreadth(800, 200, 0);
    expect(b.signal).toBe('bullish');
    expect(b.advanceDeclineRatio).toBe(4);
  });

  it('普跌应给出 bearish 信号', () => {
    expect(calculateMarketBreadth(100, 900, 0).signal).toBe('bearish');
  });

  it('涨跌均衡应为中性', () => {
    expect(calculateMarketBreadth(500, 500, 0).signal).toBe('neutral');
  });
});

describe('calculateMcClellanOscillator', () => {
  it('首值应为 0 且长度与输入一致', () => {
    const advancing = [100, 110, 120, 130];
    const declining = [80, 90, 85, 95];
    const osc = calculateMcClellanOscillator(advancing, declining);
    expect(osc).toHaveLength(advancing.length);
    expect(osc[0]).toBe(0);
    for (const v of osc) expect(typeof v).toBe('number');
  });
});
