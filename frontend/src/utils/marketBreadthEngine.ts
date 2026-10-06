/**
 * 市场广度分析引擎
 * 计算涨跌家数比、新高新低、成交量广度等指标
 */

export interface BreadthData {
  advances: number;
  declines: number;
  unchanged: number;
  /** 创新高家数；行情源不提供时为 null（不可用 ≠ 0），使用前须判空 */
  newHighs: number | null;
  /** 创新低家数；行情源不提供时为 null（不可用 ≠ 0），使用前须判空 */
  newLows: number | null;
  upVolume: number;
  downVolume: number;
  totalVolume: number;
  date: string;
}

export interface BreadthResult {
  advanceDeclineRatio: number;
  advanceDeclineLine: number;
  newHighLowRatio: number;
  volumeBreadth: number;
  mcclellanOscillator: number;
  armIndex: number; // TRIN
  breadthThrust: number;
  signal: 'bullish' | 'bearish' | 'neutral';
}

export class MarketBreadthEngine {
  private adLineHistory: number[] = [];

  /**
   * 计算市场广度指标
   */
  analyze(data: BreadthData, prevADLine: number = 0): BreadthResult {
    const total = data.advances + data.declines + (data.unchanged || 0);

    // 涨跌比
    const adRatio = data.declines > 0 ? data.advances / data.declines : data.advances > 0 ? 10 : 1;

    // 涨跌线
    const adLine = prevADLine + (data.advances - data.declines);
    this.adLineHistory.push(adLine);

    // 新高新低比。诚实红线：null = 不可用（行情源不提供），此时取中性 1
    // 且不参与下方多空因子计数，而不是把null 当 0 算出「无新高无新低」的假象。
    // 先取局部值收窄，避免用 `as number` 强转（会丢掉控制流类型收窄）。
    const newHighsVal = data.newHighs;
    const newLowsVal = data.newLows;
    const hasNewHighLow = newHighsVal !== null && newLowsVal !== null;
    const nhRatio = !hasNewHighLow
      ? 1
      : newLowsVal > 0
        ? newHighsVal / newLowsVal
        : newHighsVal > 0 ? 10 : 1;

    // 成交量广度
    const volumeBreadth = data.downVolume > 0
      ? data.upVolume / data.downVolume
      : data.upVolume > 0 ? 10 : 1;

    // McClellan振荡器 (EMA差值)
    const ema19 = this.calculateEMA(this.adLineHistory, 19);
    const ema39 = this.calculateEMA(this.adLineHistory, 39);
    const mcclellan = ema19 - ema39;

    // Arms Index (TRIN)
    const advRatio = total > 0 ? data.advances / total : 0;
    const decRatio = total > 0 ? data.declines / total : 0;
    const upVolRatio = data.totalVolume > 0 ? data.upVolume / data.totalVolume : 0;
    const downVolRatio = data.totalVolume > 0 ? data.downVolume / data.totalVolume : 0;
    const trin = (decRatio > 0 && upVolRatio > 0)
      ? (advRatio / decRatio) / (upVolRatio / downVolRatio)
      : 1;

    // Breadth Thrust
    const breadthThrust = total > 0 ? data.advances / total : 0.5;

    // 综合信号
    let signal: BreadthResult['signal'];
    const bullishFactors =
      (adRatio > 1.5 ? 1 : 0) +
      (hasNewHighLow && nhRatio > 2 ? 1 : 0) +
      (volumeBreadth > 1.5 ? 1 : 0) +
      (mcclellan > 0 ? 1 : 0) +
      (trin < 0.8 ? 1 : 0) +
      (breadthThrust > 0.615 ? 1 : 0);

    const bearishFactors =
      (adRatio < 0.67 ? 1 : 0) +
      (hasNewHighLow && nhRatio < 0.5 ? 1 : 0) +
      (volumeBreadth < 0.67 ? 1 : 0) +
      (mcclellan < 0 ? 1 : 0) +
      (trin > 1.2 ? 1 : 0) +
      (breadthThrust < 0.385 ? 1 : 0);

    if (bullishFactors >= 4) signal = 'bullish';
    else if (bearishFactors >= 4) signal = 'bearish';
    else signal = 'neutral';

    return {
      advanceDeclineRatio: Math.round(adRatio * 100) / 100,
      advanceDeclineLine: adLine,
      newHighLowRatio: Math.round(nhRatio * 100) / 100,
      volumeBreadth: Math.round(volumeBreadth * 100) / 100,
      mcclellanOscillator: Math.round(mcclellan * 100) / 100,
      armIndex: Math.round(trin * 1000) / 1000,
      breadthThrust: Math.round(breadthThrust * 1000) / 1000,
      signal,
    };
  }

  private calculateEMA(data: number[], period: number): number {
    if (data.length === 0) return 0;
    if (data.length < period) return data[data.length - 1];

    const k = 2 / (period + 1);
    let ema = data[0];
    for (let i = 1; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
    }
    return ema;
  }

  reset(): void {
    this.adLineHistory = [];
  }
}

export const marketBreadthEngine = new MarketBreadthEngine();
export default MarketBreadthEngine;
