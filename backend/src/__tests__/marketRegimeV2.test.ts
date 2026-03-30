import { describe, it, expect } from 'vitest';

describe('市场状态检测引擎', () => {
  type Regime = 'bull' | 'bear' | 'sideways';

  function detectRegime(prices: number[], window = 20): Regime[] {
    const regimes: Regime[] = [];
    for (let i = 0; i < prices.length; i++) {
      if (i < window - 1) { regimes.push('sideways'); continue; }
      const slice = prices.slice(i - window + 1, i + 1);
      const start = slice[0], end = slice[slice.length - 1];
      const change = (end - start) / start;
      if (change > 0.05) regimes.push('bull');
      else if (change < -0.05) regimes.push('bear');
      else regimes.push('sideways');
    }
    return regimes;
  }
  function calcRegimeTransitions(regimes: Regime[]): Record<string, number> {
    const trans: Record<string, number> = {};
    for (let i = 1; i < regimes.length; i++) {
      const key = `${regimes[i - 1]}->${regimes[i]}`;
      trans[key] = (trans[key] || 0) + 1;
    }
    return trans;
  }
  function calcRegimeDuration(regimes: Regime[]): { regime: Regime; duration: number }[] {
    if (!regimes.length) return [];
    const result: { regime: Regime; duration: number }[] = [];
    let current = regimes[0], count = 1;
    for (let i = 1; i < regimes.length; i++) {
      if (regimes[i] === current) count++;
      else {
        result.push({ regime: current, duration: count });
        current = regimes[i]; count = 1;
      }
    }
    result.push({ regime: current, duration: count });
    return result;
  }
  function calcVolatilityRegime(returns: number[], window = 10): string[] {
    const regimes: string[] = [];
    for (let i = 0; i < returns.length; i++) {
      if (i < window - 1) { regimes.push('normal'); continue; }
      const slice = returns.slice(i - window + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
      const vol = Math.sqrt(slice.reduce((s, r) => s + (r - mean) ** 2, 0) / (slice.length - 1));
      if (vol > 0.03) regimes.push('high_vol');
      else if (vol < 0.01) regimes.push('low_vol');
      else regimes.push('normal');
    }
    return regimes;
  }
  function calcMomentumScore(prices: number[], period: number): number {
    if (prices.length < period + 1) return 0;
    const recent = prices[prices.length - 1];
    const past = prices[prices.length - 1 - period];
    return (recent - past) / past * 100;
  }
  function calcMeanReversionZScore(prices: number[], window: number): number {
    if (prices.length < window) return 0;
    const slice = prices.slice(-window);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const std = Math.sqrt(slice.reduce((s, p) => s + (p - mean) ** 2, 0) / slice.length);
    if (std === 0) return 0;
    return (prices[prices.length - 1] - mean) / std;
  }

  const bullPrices = Array.from({ length: 30 }, (_, i) => 100 + i * 2);
  const bearPrices = Array.from({ length: 30 }, (_, i) => 120 - i * 2);
  const flatPrices = Array.from({ length: 30 }, () => 100);

  it('牛市检测', () => {
    const regimes = detectRegime(bullPrices);
    expect(regimes[regimes.length - 1]).toBe('bull');
  });

  it('熊市检测', () => {
    const regimes = detectRegime(bearPrices);
    expect(regimes[regimes.length - 1]).toBe('bear');
  });

  it('震荡市检测', () => {
    const regimes = detectRegime(flatPrices);
    expect(regimes[regimes.length - 1]).toBe('sideways');
  });

  it('状态序列长度匹配', () => {
    const regimes = detectRegime(bullPrices);
    expect(regimes).toHaveLength(bullPrices.length);
  });

  it('初期为sideways', () => {
    const regimes = detectRegime(bullPrices, 20);
    expect(regimes[0]).toBe('sideways');
  });

  it('状态转换计数', () => {
    const regimes: Regime[] = ['bull', 'bull', 'bear', 'bear', 'bull'];
    const trans = calcRegimeTransitions(regimes);
    expect(trans['bull->bull']).toBe(1);
    expect(trans['bull->bear']).toBe(1);
    expect(trans['bear->bull']).toBe(1);
  });

  it('状态持续时间', () => {
    const regimes: Regime[] = ['bull', 'bull', 'bull', 'bear', 'bear', 'bull'];
    const dur = calcRegimeDuration(regimes);
    expect(dur).toHaveLength(3);
    expect(dur[0]).toEqual({ regime: 'bull', duration: 3 });
    expect(dur[1]).toEqual({ regime: 'bear', duration: 2 });
  });

  it('空状态序列', () => {
    expect(calcRegimeDuration([])).toEqual([]);
  });

  it('波动率状态检测', () => {
    const returns = Array.from({ length: 20 }, () => Math.random() * 0.06 - 0.03);
    const vr = calcVolatilityRegime(returns);
    expect(vr).toHaveLength(returns.length);
  });

  it('动量分数', () => {
    const score = calcMomentumScore(bullPrices, 10);
    expect(score).toBeGreaterThan(0);
  });

  it('负动量', () => {
    const score = calcMomentumScore(bearPrices, 10);
    expect(score).toBeLessThan(0);
  });

  it('动量不足数据', () => {
    expect(calcMomentumScore([1, 2], 10)).toBe(0);
  });

  it('均值回归Z分数', () => {
    const prices = [100, 101, 99, 100, 101, 99, 100, 101, 99, 100, 105];
    const z = calcMeanReversionZScore(prices, 10);
    expect(z).toBeGreaterThan(0);
  });

  it('Z分数恰好在均值', () => {
    const prices = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100];
    expect(calcMeanReversionZScore(prices, 10)).toBe(0);
  });

  it('Z分数不足数据', () => {
    expect(calcMeanReversionZScore([1, 2, 3], 10)).toBe(0);
  });
});
