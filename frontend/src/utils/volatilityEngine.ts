/**
 * 波动率引擎
 * 计算历史波动率、隐含波动率、GARCH模型
 */

export interface VolatilityResult {
  daily: number;
  annualized: number;
  rolling: number[];
  percentile: number;
  regime: 'low' | 'normal' | 'high' | 'extreme';
}

export interface GARCHParams {
  omega: number;
  alpha: number;
  beta: number;
}

export class VolatilityEngine {
  /**
   * 计算历史波动率
   */
  historicalVolatility(returns: number[], window: number = 20): VolatilityResult {
    if (returns.length < window) {
      return { daily: 0, annualized: 0, rolling: [], percentile: 50, regime: 'normal' };
    }

    // 日波动率
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
    const daily = Math.sqrt(variance);

    // 年化波动率
    const annualized = daily * Math.sqrt(252);

    // 滚动波动率
    const rolling: number[] = [];
    for (let i = window; i <= returns.length; i++) {
      const slice = returns.slice(i - window, i);
      const m = slice.reduce((a, b) => a + b, 0) / slice.length;
      const v = slice.reduce((s, r) => s + (r - m) ** 2, 0) / (slice.length - 1);
      rolling.push(Math.sqrt(v) * Math.sqrt(252));
    }

    // 百分位数
    const sorted = [...rolling].sort((a, b) => a - b);
    const lastVal = rolling[rolling.length - 1];
    let rank = sorted.findIndex(v => v >= lastVal);
    if (rank === -1) rank = sorted.length - 1;
    const percentile = Math.round((rank / sorted.length) * 100);

    // 波动率区间
    let regime: VolatilityResult['regime'];
    if (annualized < 0.15) regime = 'low';
    else if (annualized < 0.25) regime = 'normal';
    else if (annualized < 0.40) regime = 'high';
    else regime = 'extreme';

    return {
      daily: Math.round(daily * 10000) / 10000,
      annualized: Math.round(annualized * 10000) / 10000,
      rolling: rolling.map(v => Math.round(v * 10000) / 10000),
      percentile,
      regime,
    };
  }

  /**
   * EWMA波动率（指数加权移动平均）
   */
  ewmaVolatility(returns: number[], lambda: number = 0.94): number[] {
    if (returns.length < 2) return [];

    const result: number[] = [returns[0] ** 2];

    for (let i = 1; i < returns.length; i++) {
      result.push(lambda * result[i - 1] + (1 - lambda) * returns[i] ** 2);
    }

    return result.map(v => Math.sqrt(v) * Math.sqrt(252));
  }

  /**
   * GARCH(1,1)波动率估计
   */
  garchVolatility(
    returns: number[],
    params: GARCHParams = { omega: 0.00001, alpha: 0.1, beta: 0.85 }
  ): number[] {
    if (returns.length < 2) return [];

    const { omega, alpha, beta } = params;
    const result: number[] = [returns[0] ** 2];

    for (let i = 1; i < returns.length; i++) {
      result.push(omega + alpha * returns[i - 1] ** 2 + beta * result[i - 1]);
    }

    return result.map(v => Math.sqrt(v) * Math.sqrt(252));
  }

  /**
   * Parkinson波动率（基于高低价）
   */
  parkinsonVolatility(highs: number[], lows: number[]): number {
    if (highs.length !== lows.length || highs.length < 2) return 0;

    let sum = 0;
    for (let i = 0; i < highs.length; i++) {
      if (highs[i] > 0 && lows[i] > 0) {
        sum += (Math.log(highs[i] / lows[i])) ** 2;
      }
    }

    return Math.sqrt(sum / (4 * Math.log(2) * highs.length)) * Math.sqrt(252);
  }

  /**
   * 波动率锥
   */
  volatilityCone(returns: number[]): {
    period: number;
    min: number;
    q25: number;
    median: number;
    q75: number;
    max: number;
    current: number;
  }[] {
    const periods = [5, 10, 20, 60, 120, 252];
    const cone: ReturnType<VolatilityEngine['volatilityCone']> = [];

    for (const period of periods) {
      if (returns.length < period) continue;

      const vols: number[] = [];
      for (let i = period; i <= returns.length; i++) {
        const slice = returns.slice(i - period, i);
        const m = slice.reduce((a, b) => a + b, 0) / slice.length;
        const v = slice.reduce((s, r) => s + (r - m) ** 2, 0) / (slice.length - 1);
        vols.push(Math.sqrt(v) * Math.sqrt(252));
      }

      vols.sort((a, b) => a - b);
      cone.push({
        period,
        min: vols[0],
        q25: vols[Math.floor(vols.length * 0.25)],
        median: vols[Math.floor(vols.length * 0.5)],
        q75: vols[Math.floor(vols.length * 0.75)],
        max: vols[vols.length - 1],
        current: vols[vols.length - 1],
      });
    }

    return cone;
  }
}

export const volatilityEngine = new VolatilityEngine();
export default VolatilityEngine;
