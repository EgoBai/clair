/**
 * 波动率期限结构引擎
 * 分析波动率曲面的期限结构特征
 */

// ==================== 类型定义 ====================
export interface VolTermStructure {
  tenors: number[]; // 到期日(天)
  impliedVols: number[];
  realizedVols: number[];
  volSpread: number[]; // 隐含-实现
  termSlope: number;
  curvature: number;
  contango: boolean;
}

export interface VolSurfacePoint {
  strike: number;
  tenor: number;
  callIV: number;
  putIV: number;
  skew: number;
  smile: number;
}

export interface VolRegime {
  regime: 'low' | 'normal' | 'elevated' | 'high' | 'extreme';
  currentVol: number;
  percentile: number;
  zScore: number;
  volOfVol: number;
  meanReversionSpeed: number;
  longTermMean: number;
}

export interface VolTradingSignal {
  signal: 'buy_vol' | 'sell_vol' | 'neutral';
  strategy: string;
  entryVol: number;
  targetVol: number;
  stopLoss: number;
  riskReward: number;
  confidence: number;
}

export interface VolatilityCone {
  tenors: number[];
  minVol: number[];
  p25Vol: number[];
  medianVol: number[];
  p75Vol: number[];
  maxVol: number[];
  currentVol: number[];
  currentPercentile: number[];
}

// ==================== 核心引擎 ====================
export class VolTermStructureEngine {
  /**
   * 分析波动率期限结构
   */
  analyzeTermStructure(
    tenors: number[],
    impliedVols: number[],
    realizedVols: number[]
  ): VolTermStructure {
    const n = Math.min(tenors.length, impliedVols.length, realizedVols.length);
    if (n < 2) {
      return {
        tenors: [], impliedVols: [], realizedVols: [],
        volSpread: [], termSlope: 0, curvature: 0, contango: false
      };
    }

    const volSpread = impliedVols.slice(0, n).map((iv, i) => iv - realizedVols[i]);

    // 期限斜率: 远端-近端
    const termSlope = impliedVols[n - 1] - impliedVols[0];

    // 曲率: 中间端相对于两端的凸度
    const midIdx = Math.floor(n / 2);
    const curvature = n > 2
      ? impliedVols[midIdx] - (impliedVols[0] + impliedVols[n - 1]) / 2
      : 0;

    // Contango: 远端隐含波动率 > 近端
    const contango = termSlope > 0;

    return {
      tenors: tenors.slice(0, n),
      impliedVols: impliedVols.slice(0, n).map(v => Math.round(v * 10000) / 10000),
      realizedVols: realizedVols.slice(0, n).map(v => Math.round(v * 10000) / 10000),
      volSpread: volSpread.map(v => Math.round(v * 10000) / 10000),
      termSlope: Math.round(termSlope * 10000) / 10000,
      curvature: Math.round(curvature * 10000) / 10000,
      contango
    };
  }

  /**
   * 计算波动率曲面点
   */
  calculateVolSurface(
    spotPrice: number,
    strikes: number[],
    tenors: number[],
    baseVol: number = 0.2
  ): VolSurfacePoint[] {
    const points: VolSurfacePoint[] = [];

    for (const strike of strikes) {
      for (const tenor of tenors) {
        const moneyness = spotPrice / strike;
        const logM = Math.log(moneyness);

        // 波动率微笑: OTM波动率更高
        const smile = 0.02 * logM * logM;
        // 波动率偏斜: 低行权价有更高波动率
        const skew = -0.05 * logM;

        const callIV = baseVol + smile + skew + 0.01 * Math.sqrt(tenor / 365);
        const putIV = baseVol + smile - skew + 0.01 * Math.sqrt(tenor / 365);

        points.push({
          strike,
          tenor,
          callIV: Math.round(Math.max(0.05, callIV) * 10000) / 10000,
          putIV: Math.round(Math.max(0.05, putIV) * 10000) / 10000,
          skew: Math.round(skew * 10000) / 10000,
          smile: Math.round(smile * 10000) / 10000
        });
      }
    }

    return points;
  }

  /**
   * 波动率体制判断
   */
  detectVolRegime(
    currentVol: number,
    historicalVols: number[],
    lookback: number = 252
  ): VolRegime {
    if (historicalVols.length < 10) {
      return {
        regime: 'normal', currentVol, percentile: 50, zScore: 0,
        volOfVol: 0, meanReversionSpeed: 0, longTermMean: currentVol
      };
    }

    const recent = historicalVols.slice(-lookback);
    const mean = recent.reduce((s, v) => s + v, 0) / recent.length;
    const variance = recent.reduce((s, v) => s + (v - mean) ** 2, 0) / recent.length;
    const std = Math.sqrt(variance);

    const zScore = std > 0 ? (currentVol - mean) / std : 0;
    const percentile = this.calcPercentile(recent, currentVol) * 100;

    // Vol of Vol
    const volReturns = [];
    for (let i = 1; i < recent.length; i++) {
      volReturns.push(recent[i] - recent[i - 1]);
    }
    const volOfVol = Math.sqrt(this.calcVariance(volReturns) * 252);

    // 均值回归速度 (简化)
    let meanReversionSpeed = 0;
    if (recent.length > 20) {
      const y = recent.slice(1);
      const x = recent.slice(0, -1);
      const meanX = x.reduce((s, v) => s + v, 0) / x.length;
      const meanY = y.reduce((s, v) => s + v, 0) / y.length;
      let num = 0, den = 0;
      for (let i = 0; i < x.length; i++) {
        num += (x[i] - meanX) * (y[i] - meanY);
        den += (x[i] - meanX) ** 2;
      }
      meanReversionSpeed = den > 0 ? 1 - num / den : 0;
    }

    let regime: VolRegime['regime'];
    if (percentile > 95) regime = 'extreme';
    else if (percentile > 80) regime = 'high';
    else if (percentile > 60) regime = 'elevated';
    else if (percentile > 20) regime = 'normal';
    else regime = 'low';

    return {
      regime,
      currentVol: Math.round(currentVol * 10000) / 10000,
      percentile: Math.round(percentile * 100) / 100,
      zScore: Math.round(zScore * 100) / 100,
      volOfVol: Math.round(volOfVol * 10000) / 10000,
      meanReversionSpeed: Math.round(meanReversionSpeed * 10000) / 10000,
      longTermMean: Math.round(mean * 10000) / 10000
    };
  }

  /**
   * 波动率交易信号
   */
  generateTradingSignal(
    currentVol: number,
    historicalVols: number[],
    regime: VolRegime
  ): VolTradingSignal {
    const { percentile, longTermMean, zScore } = regime;

    let signal: VolTradingSignal['signal'];
    let strategy: string;
    let confidence: number;

    if (zScore < -1.5 && percentile < 20) {
      signal = 'buy_vol';
      strategy = '买入跨式/宽跨式，押注波动率回升';
      confidence = Math.min(0.9, 0.5 + Math.abs(zScore) * 0.1);
    } else if (zScore > 1.5 && percentile > 80) {
      signal = 'sell_vol';
      strategy = '卖出跨式/铁鹰，收取时间价值';
      confidence = Math.min(0.9, 0.5 + zScore * 0.1);
    } else {
      signal = 'neutral';
      strategy = '波动率处于正常区间，无明确信号';
      confidence = 0.3;
    }

    const entryVol = currentVol;
    const targetVol = signal === 'buy_vol'
      ? longTermMean * 1.2
      : signal === 'sell_vol'
        ? longTermMean * 0.8
        : longTermMean;
    const stopLoss = signal === 'buy_vol'
      ? currentVol * 0.85
      : signal === 'sell_vol'
        ? currentVol * 1.3
        : currentVol;
    const riskReward = Math.abs(targetVol - entryVol) / Math.abs(stopLoss - entryVol) || 1;

    return {
      signal,
      strategy,
      entryVol: Math.round(entryVol * 10000) / 10000,
      targetVol: Math.round(targetVol * 10000) / 10000,
      stopLoss: Math.round(stopLoss * 10000) / 10000,
      riskReward: Math.round(riskReward * 100) / 100,
      confidence: Math.round(confidence * 10000) / 10000
    };
  }

  /**
   * 波动率锥
   */
  buildVolCone(
    historicalVols: Map<string, number[]>, // tenor -> vol series
    currentVols: Map<string, number>
  ): VolatilityCone {
    const tenors: number[] = [];
    const minVol: number[] = [];
    const p25Vol: number[] = [];
    const medianVol: number[] = [];
    const p75Vol: number[] = [];
    const maxVol: number[] = [];
    const currentVol: number[] = [];
    const currentPercentile: number[] = [];

    for (const [tenor, vols] of historicalVols) {
      const sorted = [...vols].sort((a, b) => a - b);
      const current = currentVols.get(tenor) || sorted[sorted.length - 1];

      tenors.push(parseFloat(tenor));
      minVol.push(sorted[0]);
      p25Vol.push(this.percentile(sorted, 25));
      medianVol.push(this.percentile(sorted, 50));
      p75Vol.push(this.percentile(sorted, 75));
      maxVol.push(sorted[sorted.length - 1]);
      currentVol.push(current);
      currentPercentile.push(this.calcPercentile(sorted, current) * 100);
    }

    return {
      tenors,
      minVol: minVol.map(v => Math.round(v * 10000) / 10000),
      p25Vol: p25Vol.map(v => Math.round(v * 10000) / 10000),
      medianVol: medianVol.map(v => Math.round(v * 10000) / 10000),
      p75Vol: p75Vol.map(v => Math.round(v * 10000) / 10000),
      maxVol: maxVol.map(v => Math.round(v * 10000) / 10000),
      currentVol: currentVol.map(v => Math.round(v * 10000) / 10000),
      currentPercentile: currentPercentile.map(v => Math.round(v * 100) / 100)
    };
  }

  // ==================== 辅助方法 ====================
  private calcVariance(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  }

  private percentile(sorted: number[], p: number): number {
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
  }

  private calcPercentile(sorted: number[], value: number): number {
    let count = 0;
    for (const v of sorted) {
      if (v <= value) count++;
    }
    return sorted.length > 0 ? count / sorted.length : 0.5;
  }
}

export default VolTermStructureEngine;
