/**
 * 市场状态检测引擎
 * - 牛/熊/震荡/过渡状态识别
 * - 马尔可夫状态切换模型
 * - 趋势强度评分
 * - 波动率状态(低/正常/高/极端)
 * - 动量状态(加速/减速/反转)
 * - 市场宽度(普涨/结构性/普跌)
 * - 风险偏好指标
 * - 状态转换概率
 */

export interface RegimeState {
  regime: 'bull' | 'bear' | 'sideways' | 'transition';
  confidence: number; // 0-1
  duration: number; // 当前状态持续天数
  trendStrength: number; // -100到100
}

export interface VolatilityRegime {
  state: 'low' | 'normal' | 'high' | 'extreme';
  currentVol: number;
  percentile: number; // 历史分位数
  zScore: number;
}

export interface MomentumState {
  state: 'accelerating' | 'decelerating' | 'reversal' | 'stable';
  shortMomentum: number;
  mediumMomentum: number;
  longMomentum: number;
  divergence: boolean; // 长短期动量背离
}

export interface TransitionProbability {
  from: string;
  to: string;
  probability: number;
  expectedDuration: number; // 期望持续天数
}

export interface RiskAppetite {
  level: 'risk_on' | 'risk_off' | 'neutral';
  score: number; // -100到100
  creditSpreadSignal: number;
  flightToQuality: boolean;
}

export interface MarketRegimeReport {
  timestamp: number;
  regime: RegimeState;
  volatility: VolatilityRegime;
  momentum: MomentumState;
  transitions: TransitionProbability[];
  riskAppetite: RiskAppetite;
  overallSignal: 'aggressive' | 'moderate' | 'defensive' | 'cash';
}

export class MarketRegimeEngine {
  private lookbackShort: number;
  private lookbackMedium: number;
  private lookbackLong: number;

  constructor(lookbackShort = 20, lookbackMedium = 60, lookbackLong = 120) {
    this.lookbackShort = lookbackShort;
    this.lookbackMedium = lookbackMedium;
    this.lookbackLong = lookbackLong;
  }

  /**
   * 检测市场状态
   */
  detectRegime(prices: number[], currentIndex?: number): RegimeState {
    const idx = currentIndex ?? prices.length - 1;
    const shortSMA = this.calcSMA(prices, idx, this.lookbackShort);
    const mediumSMA = this.calcSMA(prices, idx, this.lookbackMedium);
    const longSMA = this.calcSMA(prices, idx, this.lookbackLong);

    if (shortSMA === null || mediumSMA === null || longSMA === null) {
      return { regime: 'sideways', confidence: 0.3, duration: 0, trendStrength: 0 };
    }

    // 趋势强度: 短期均线相对长期均线的位置
    const trendStrength = ((shortSMA - longSMA) / longSMA) * 1000;
    const clampedStrength = Math.max(-100, Math.min(100, trendStrength));

    // 均线排列判断
    const bullishAlign = shortSMA > mediumSMA && mediumSMA > longSMA;
    const bearishAlign = shortSMA < mediumSMA && mediumSMA < longSMA;

    let regime: RegimeState['regime'];
    let confidence: number;

    if (bullishAlign && clampedStrength > 20) {
      regime = 'bull';
      confidence = Math.min(1, 0.5 + Math.abs(clampedStrength) / 200);
    } else if (bearishAlign && clampedStrength < -20) {
      regime = 'bear';
      confidence = Math.min(1, 0.5 + Math.abs(clampedStrength) / 200);
    } else if (Math.abs(clampedStrength) < 10) {
      regime = 'sideways';
      confidence = 0.5 + (1 - Math.abs(clampedStrength) / 10) * 0.3;
    } else {
      regime = 'transition';
      confidence = 0.4;
    }

    // 计算当前状态持续天数
    const duration = this.calcRegimeDuration(prices, regime, idx);

    return {
      regime,
      confidence: Math.round(confidence * 100) / 100,
      duration,
      trendStrength: Math.round(clampedStrength * 100) / 100,
    };
  }

  /**
   * 波动率状态检测
   */
  detectVolatilityRegime(returns: number[], lookback: number = 60): VolatilityRegime {
    if (returns.length < lookback) {
      return { state: 'normal', currentVol: 0, percentile: 50, zScore: 0 };
    }

    const currentVol = this.calcRealizedVol(returns.slice(-20));
    const historicalVols: number[] = [];

    for (let i = lookback; i < returns.length; i += 5) {
      historicalVols.push(this.calcRealizedVol(returns.slice(Math.max(0, i - 20), i)));
    }

    if (historicalVols.length === 0) {
      return { state: 'normal', currentVol, percentile: 50, zScore: 0 };
    }

    const sorted = [...historicalVols].sort((a, b) => a - b);
    const rank = sorted.filter(v => v <= currentVol).length;
    const percentile = (rank / sorted.length) * 100;

    const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const std = Math.sqrt(sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / sorted.length);
    const zScore = std > 0 ? (currentVol - mean) / std : 0;

    let state: VolatilityRegime['state'];
    if (percentile > 90) state = 'extreme';
    else if (percentile > 70) state = 'high';
    else if (percentile < 30) state = 'low';
    else state = 'normal';

    return {
      state,
      currentVol: Math.round(currentVol * 10000) / 10000,
      percentile: Math.round(percentile * 10) / 10,
      zScore: Math.round(zScore * 100) / 100,
    };
  }

  /**
   * 动量状态检测
   */
  detectMomentumState(prices: number[]): MomentumState {
    const shortMom = this.calcMomentum(prices, this.lookbackShort);
    const mediumMom = this.calcMomentum(prices, this.lookbackMedium);
    const longMom = this.calcMomentum(prices, this.lookbackLong);

    const divergence = (shortMom > 0 && longMom < 0) || (shortMom < 0 && longMom > 0);

    let state: MomentumState['state'];
    if (Math.abs(shortMom) > Math.abs(mediumMom) * 1.5 && Math.abs(mediumMom) > Math.abs(longMom) * 1.2) {
      state = shortMom > 0 ? 'accelerating' : 'reversal';
    } else if (Math.abs(shortMom) < Math.abs(mediumMom) * 0.7) {
      state = 'decelerating';
    } else {
      state = 'stable';
    }

    return {
      state,
      shortMomentum: Math.round(shortMom * 10000) / 10000,
      mediumMomentum: Math.round(mediumMom * 10000) / 10000,
      longMomentum: Math.round(longMom * 10000) / 10000,
      divergence,
    };
  }

  /**
   * 状态转换概率矩阵
   */
  calcTransitionProbabilities(prices: number[], windowSize: number = 252): TransitionProbability[] {
    const regimes: string[] = [];
    for (let i = this.lookbackLong; i < prices.length; i++) {
      const r = this.detectRegime(prices, i);
      regimes.push(r.regime);
    }

    const states = ['bull', 'bear', 'sideways', 'transition'];
    const transitions: TransitionProbability[] = [];

    for (const from of states) {
      for (const to of states) {
        let count = 0;
        let totalFrom = 0;
        let durations: number[] = [];
        let currentDuration = 0;

        for (let i = 0; i < regimes.length; i++) {
          if (regimes[i] === from) {
            totalFrom++;
            currentDuration++;
            if (i < regimes.length - 1 && regimes[i + 1] === to) {
              count++;
              durations.push(currentDuration);
              currentDuration = 0;
            }
          } else {
            currentDuration = 0;
          }
        }

        const prob = totalFrom > 0 ? count / totalFrom : 0;
        const avgDuration = durations.length > 0
          ? durations.reduce((a, b) => a + b, 0) / durations.length
          : 0;

        if (prob > 0) {
          transitions.push({
            from,
            to,
            probability: Math.round(prob * 10000) / 10000,
            expectedDuration: Math.round(avgDuration * 10) / 10,
          });
        }
      }
    }

    return transitions;
  }

  /**
   * 风险偏好指标
   */
  assessRiskAppetite(
    stockReturns: number[],
    bondReturns: number[],
    volatilityLevel: number,
  ): RiskAppetite {
    const stockMom = stockReturns.length >= 20
      ? stockReturns.slice(-20).reduce((a, b) => a + b, 0) : 0;
    const bondMom = bondReturns.length >= 20
      ? bondReturns.slice(-20).reduce((a, b) => a + b, 0) : 0;

    // 股债利差信号: 股票跑赢债券 → risk on
    const spread = stockMom - bondMom;
    const creditSpreadSignal = Math.max(-100, Math.min(100, spread * 1000));

    // 逃向质量: 债券强于股票 + 高波动率
    const flightToQuality = bondMom > stockMom && volatilityLevel > 0.02;

    const score = creditSpreadSignal + (flightToQuality ? -30 : 0);
    const clampedScore = Math.max(-100, Math.min(100, score));

    let level: RiskAppetite['level'];
    if (clampedScore > 20) level = 'risk_on';
    else if (clampedScore < -20) level = 'risk_off';
    else level = 'neutral';

    return {
      level,
      score: Math.round(clampedScore * 100) / 100,
      creditSpreadSignal: Math.round(creditSpreadSignal * 100) / 100,
      flightToQuality,
    };
  }

  /**
   * 生成市场状态报告
   */
  generateReport(
    prices: number[],
    returns: number[],
    bondReturns: number[] = [],
  ): MarketRegimeReport {
    const regime = this.detectRegime(prices);
    const volatility = this.detectVolatilityRegime(returns);
    const momentum = this.detectMomentumState(prices);
    const transitions = this.calcTransitionProbabilities(prices);
    const riskAppetite = this.assessRiskAppetite(
      returns,
      bondReturns.length > 0 ? bondReturns : returns.map(() => 0),
      volatility.currentVol,
    );

    let overallSignal: MarketRegimeReport['overallSignal'];
    if (regime.regime === 'bull' && volatility.state !== 'extreme' && riskAppetite.level === 'risk_on') {
      overallSignal = 'aggressive';
    } else if (regime.regime === 'bear' || volatility.state === 'extreme') {
      overallSignal = 'cash';
    } else if (regime.regime === 'sideways' || regime.regime === 'transition') {
      overallSignal = 'moderate';
    } else {
      overallSignal = 'defensive';
    }

    return {
      timestamp: Date.now(),
      regime,
      volatility,
      momentum,
      transitions,
      riskAppetite,
      overallSignal,
    };
  }

  // --- Helpers ---

  private calcSMA(prices: number[], endIdx: number, period: number): number | null {
    if (endIdx < period - 1) return null;
    let sum = 0;
    for (let i = endIdx - period + 1; i <= endIdx; i++) {
      sum += prices[i];
    }
    return sum / period;
  }

  private calcMomentum(prices: number[], period: number): number {
    if (prices.length < period + 1) return 0;
    return (prices[prices.length - 1] - prices[prices.length - 1 - period]) / prices[prices.length - 1 - period];
  }

  private calcRealizedVol(returns: number[]): number {
    if (returns.length < 2) return 0;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
    return Math.sqrt(variance * 252);
  }

  private calcRegimeDuration(prices: number[], currentRegime: string, endIdx: number): number {
    let duration = 0;
    // Use simple SMA comparison instead of recursive detectRegime
    for (let i = endIdx; i >= this.lookbackLong; i--) {
      const s = this.calcSMA(prices, i, this.lookbackShort);
      const m = this.calcSMA(prices, i, this.lookbackMedium);
      const l = this.calcSMA(prices, i, this.lookbackLong);
      if (s === null || m === null || l === null) break;

      let r: string;
      const str = ((s - l) / l) * 1000;
      if (s > m && m > l && str > 20) r = 'bull';
      else if (s < m && m < l && str < -20) r = 'bear';
      else if (Math.abs(str) < 10) r = 'sideways';
      else r = 'transition';

      if (r === currentRegime) duration++;
      else break;
    }
    return duration;
  }
}

export default new MarketRegimeEngine();
