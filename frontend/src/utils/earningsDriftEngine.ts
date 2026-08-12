/**
 * 财报后漂移引擎 (PEAD)
 * - 超预期幅度计算
 * - 漂移方向/强度
 * - 最佳持仓期
 * - 超预期持续性
 * - 行业传染效应
 * - 信号衰减曲线
 */

export interface EarningsSurprise {
  ticker: string;
  actualEPS: number;
  expectedEPS: number;
  surprisePct: number; // 超预期百分比
  magnitude: 'small' | 'medium' | 'large' | 'massive';
  direction: 'positive' | 'negative';
}

export interface DriftSignal {
  direction: 'long' | 'short' | 'neutral';
  expectedDrift: number; // 预期漂移收益率(%)
  optimalHoldDays: number;
  confidence: number;
  decayRate: number; // 日均衰减率
}

export interface DriftDecay {
  day: number;
  avgReturn: number;
  winRate: number;
  cumulativeReturn: number;
  signalStrength: number; // 0-1
}

export interface IndustryContagion {
  sector: string;
  contagionScore: number; // 0-100
  relatedTickers: string[];
  expectedImpact: number;
}

export interface PEADReport {
  surprise: EarningsSurprise;
  signal: DriftSignal;
  decayCurve: DriftDecay[];
  historicalAccuracy: number;
  recommendation: 'strong_play' | 'play' | 'monitor' | 'avoid';
}

export class EarningsDriftEngine {
  private surpriseThresholds = { small: 0.02, medium: 0.05, large: 0.1, massive: 0.2 };

  /**
   * 计算超预期幅度
   */
  calcSurprise(ticker: string, actualEPS: number, expectedEPS: number): EarningsSurprise {
    const surprisePct = expectedEPS !== 0 ? (actualEPS - expectedEPS) / Math.abs(expectedEPS) : 0;

    let magnitude: EarningsSurprise['magnitude'];
    const absSurprise = Math.abs(surprisePct);
    if (absSurprise >= this.surpriseThresholds.massive) magnitude = 'massive';
    else if (absSurprise >= this.surpriseThresholds.large) magnitude = 'large';
    else if (absSurprise >= this.surpriseThresholds.medium) magnitude = 'medium';
    else magnitude = 'small';

    return {
      ticker,
      actualEPS,
      expectedEPS,
      surprisePct: Math.round(surprisePct * 10000) / 10000,
      magnitude,
      direction: surprisePct >= 0 ? 'positive' : 'negative',
    };
  }

  /**
   * 生成漂移信号
   */
  generateDriftSignal(
    surprise: EarningsSurprise,
    historicalDrifts: number[][], // [day1_returns, day2_returns, ...]
  ): DriftSignal {
    const direction = surprise.direction === 'positive' ? 'long' : surprise.direction === 'negative' ? 'short' : 'neutral';

    // 基于超预期幅度估计漂移
    const magnitudeMultiplier = { small: 0.5, medium: 1, large: 2, massive: 3 }[surprise.magnitude];
    const expectedDrift = surprise.surprisePct * magnitudeMultiplier * 100;

    // 最优持有期: 基于历史衰减
    let optimalHoldDays = 5;
    if (historicalDrifts.length > 0) {
      let maxCumReturn = 0;
      let bestDay = 1;
      let cumReturn = 0;
      for (let d = 0; d < Math.min(historicalDrifts.length, 30); d++) {
        const dayAvg = historicalDrifts[d].reduce((a, b) => a + b, 0) / historicalDrifts[d].length;
        cumReturn += dayAvg;
        if (cumReturn > maxCumReturn) {
          maxCumReturn = cumReturn;
          bestDay = d + 1;
        }
      }
      optimalHoldDays = bestDay;
    }

    // 置信度
    const confidence = Math.min(1, 0.3 + surprise.surprisePct * 2);

    // 衰减率
    const decayRate = 0.15; // 默认确定性基线衰减率；真实校准需后端历史漂移数据（非随机伪造）

    return {
      direction,
      expectedDrift: Math.round(expectedDrift * 100) / 100,
      optimalHoldDays,
      confidence: Math.round(Math.abs(confidence) * 100) / 100,
      decayRate: Math.round(decayRate * 1000) / 1000,
    };
  }

  /**
   * 漂移衰减曲线
   */
  calcDriftDecay(
    historicalDrifts: number[][],
    maxDays: number = 20,
  ): DriftDecay[] {
    const decay: DriftDecay[] = [];
    let cumulativeReturn = 0;

    for (let d = 0; d < Math.min(historicalDrifts.length, maxDays); d++) {
      const dayReturns = historicalDrifts[d];
      if (dayReturns.length === 0) continue;

      const avgReturn = dayReturns.reduce((a, b) => a + b, 0) / dayReturns.length;
      const winRate = dayReturns.filter(r => r > 0).length / dayReturns.length;
      cumulativeReturn += avgReturn;

      // 信号强度: 随天数衰减
      const signalStrength = Math.max(0, 1 - d * 0.08);

      decay.push({
        day: d + 1,
        avgReturn: Math.round(avgReturn * 10000) / 10000,
        winRate: Math.round(winRate * 100) / 100,
        cumulativeReturn: Math.round(cumulativeReturn * 10000) / 10000,
        signalStrength: Math.round(signalStrength * 100) / 100,
      });
    }

    return decay;
  }

  /**
   * 行业传染效应分析
   */
  analyzeIndustryContagion(
    sector: string,
    sectorReturns: Record<string, number[]>,
    sectorCorrelations: Record<string, number>,
  ): IndustryContagion {
    const relatedTickers = Object.keys(sectorCorrelations).filter(
      t => Math.abs(sectorCorrelations[t]) > 0.5
    );

    const contagionScore = relatedTickers.length > 0
      ? Math.min(100, relatedTickers.reduce((s, t) => s + Math.abs(sectorCorrelations[t]) * 100, 0) / relatedTickers.length)
      : 0;

    const expectedImpact = relatedTickers.length > 0
      ? relatedTickers.reduce((s, t) => {
          const rets = sectorReturns[t] || [];
          return s + (rets.length > 0 ? rets[rets.length - 1] : 0);
        }, 0) / relatedTickers.length
      : 0;

    return {
      sector,
      contagionScore: Math.round(contagionScore * 10) / 10,
      relatedTickers,
      expectedImpact: Math.round(expectedImpact * 10000) / 10000,
    };
  }

  /**
   * 生成PEAD报告
   */
  generateReport(
    ticker: string,
    actualEPS: number,
    expectedEPS: number,
    historicalDrifts: number[][],
    _sector: string = '',
    _sectorReturns: Record<string, number[]> = {},
    _sectorCorrelations: Record<string, number> = {},
  ): PEADReport {
    const surprise = this.calcSurprise(ticker, actualEPS, expectedEPS);
    const signal = this.generateDriftSignal(surprise, historicalDrifts);
    const decayCurve = this.calcDriftDecay(historicalDrifts);

    // 历史准确率: 基于衰减曲线正收益比例
    const historicalAccuracy = decayCurve.length > 0
      ? decayCurve.filter(d => d.avgReturn > 0).length / decayCurve.length
      : 0.5;

    let recommendation: PEADReport['recommendation'];
    if (surprise.magnitude === 'massive' && historicalAccuracy > 0.7) recommendation = 'strong_play';
    else if (surprise.magnitude === 'large' && historicalAccuracy > 0.6) recommendation = 'play';
    else if (surprise.magnitude === 'medium') recommendation = 'monitor';
    else recommendation = 'avoid';

    return {
      surprise,
      signal,
      decayCurve,
      historicalAccuracy: Math.round(historicalAccuracy * 100) / 100,
      recommendation,
    };
  }
}

export default new EarningsDriftEngine();
