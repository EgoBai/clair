/**
 * 流动性评分引擎
 * - 成交额/成交量分析
 * - 换手率评估
 * - Amihud非流动性指标
 * - 流动性综合评分
 */

export interface LiquidityData {
  code: string;
  name: string;
  price: number;
  avgVolume: number;      // 20日均成交量
  avgTurnover: number;    // 20日均成交额
  turnoverRate: number;   // 换手率(%)
  freeFloat: number;      // 自由流通市值
  dailyReturn: number;    // 日收益率绝对值
  dailyVolume: number;    // 当日成交量
}

export interface LiquidityScore {
  code: string;
  volumeScore: number;       // 成交量评分(0-100)
  turnoverScore: number;     // 成交额评分(0-100)
  turnoverRateScore: number; // 换手率评分(0-100)
  amihudScore: number;       // Amihud非流动性(越低越好)
  compositeScore: number;    // 综合评分(0-100)
  tier: 'high' | 'medium' | 'low' | 'illiquid';
  adv: number;               // 日均成交额
}

export interface LiquidityRanking {
  rankings: LiquidityScore[];
  marketStats: {
    medianADV: number;
    avgTurnoverRate: number;
    illiquidPct: number; // 低流动性股票占比
  };
}

export class LiquidityScoreEngine {
  /**
   * 计算单只股票流动性评分
   */
  calculateScore(data: LiquidityData): LiquidityScore {
    // 成交量评分(对数尺度)
    const volumeScore = Math.min(100, Math.round(Math.log10(Math.max(1, data.avgVolume)) * 20));

    // 成交额评分
    const adv = data.avgTurnover;
    const turnoverScore = Math.min(100, Math.round(Math.log10(Math.max(1, adv / 10000)) * 20));

    // 换手率评分(0.5-5%为最优)
    let turnoverRateScore: number;
    if (data.turnoverRate >= 0.5 && data.turnoverRate <= 5) turnoverRateScore = 90;
    else if (data.turnoverRate > 0.1 && data.turnoverRate < 10) turnoverRateScore = 60;
    else if (data.turnoverRate >= 10) turnoverRateScore = 40;
    else turnoverRateScore = 20;

    // Amihud非流动性指标 = |R| / Volume
    const amihud = data.dailyVolume > 0 ? Math.abs(data.dailyReturn) / (data.dailyVolume * data.price) : 1;
    const amihudScore = Math.max(0, Math.round(100 - amihud * 1e8));

    // 综合评分
    const compositeScore = Math.round(
      volumeScore * 0.25 + turnoverScore * 0.3 + turnoverRateScore * 0.2 + Math.min(100, amihudScore) * 0.25
    );

    // 流动性层级
    let tier: 'high' | 'medium' | 'low' | 'illiquid';
    if (compositeScore >= 75) tier = 'high';
    else if (compositeScore >= 50) tier = 'medium';
    else if (compositeScore >= 25) tier = 'low';
    else tier = 'illiquid';

    return {
      code: data.code,
      volumeScore,
      turnoverScore,
      turnoverRateScore,
      amihudScore: Math.min(100, amihudScore),
      compositeScore: Math.max(0, Math.min(100, compositeScore)),
      tier,
      adv: Math.round(adv),
    };
  }

  /**
   * 批量评分和排名
   */
  rankLiquidity(dataArray: LiquidityData[]): LiquidityRanking {
    const scores = dataArray.map(d => this.calculateScore(d));
    scores.sort((a, b) => b.compositeScore - a.compositeScore);

    const advs = scores.map(s => s.adv).sort((a, b) => a - b);
    const medianADV = advs.length > 0 ? advs[Math.floor(advs.length / 2)] : 0;
    const avgTurnoverRate = dataArray.length > 0
      ? dataArray.reduce((s, d) => s + d.turnoverRate, 0) / dataArray.length
      : 0;
    const illiquidPct = scores.length > 0
      ? scores.filter(s => s.tier === 'illiquid' || s.tier === 'low').length / scores.length
      : 0;

    return {
      rankings: scores,
      marketStats: {
        medianADV: Math.round(medianADV),
        avgTurnoverRate: Math.round(avgTurnoverRate * 100) / 100,
        illiquidPct: Math.round(illiquidPct * 100) / 100,
      },
    };
  }

  /**
   * 流动性预警
   */
  checkLiquidityRisk(data: LiquidityData, avgVolumeHistory: number[]): { risk: 'high' | 'medium' | 'low'; signals: string[] } {
    const signals: string[] = [];
    let riskScore = 0;

    // 成交量萎缩
    if (avgVolumeHistory.length >= 5) {
      const recent = avgVolumeHistory.slice(-5).reduce((a, b) => a + b, 0) / 5;
      const earlier = avgVolumeHistory.slice(0, -5).reduce((a, b) => a + b, 0) / Math.max(1, avgVolumeHistory.length - 5);
      if (earlier > 0 && recent / earlier < 0.5) {
        signals.push('成交量显著萎缩');
        riskScore += 30;
      }
    }

    // 换手率过低
    if (data.turnoverRate < 0.1) {
      signals.push('换手率极低');
      riskScore += 25;
    }

    // 成交额过小
    if (data.avgTurnover < 10000000) {
      signals.push('日均成交额不足1000万');
      riskScore += 25;
    }

    // 自由流通市值/成交额比过大
    const illiqRatio = data.avgTurnover > 0 ? data.freeFloat / data.avgTurnover : 999;
    if (illiqRatio > 500) {
      signals.push('市值/成交额比过大，流动性差');
      riskScore += 20;
    }

    let risk: 'high' | 'medium' | 'low';
    if (riskScore >= 50) risk = 'high';
    else if (riskScore >= 25) risk = 'medium';
    else risk = 'low';

    return { risk, signals };
  }
}

export default new LiquidityScoreEngine();
