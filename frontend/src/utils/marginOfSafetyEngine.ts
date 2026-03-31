/**
 * 安全边际计算引擎
 * - Graham安全边际
 * - 多维度估值折扣
 * - 下行保护评估
 * - 投资吸引力评分
 */

export interface StockValuation {
  price: number;
  eps: number;            // 每股收益
  bookValue: number;      // 每股净资产
  dividendYield: number;  // 股息率(%)
  peRatio: number;
  pbRatio: number;
  growthRate: number;     // 预期增长率(%)
  debtToEquity: number;   // 负债率
  currentRatio: number;   // 流动比率
}

export interface MarginOfSafetyResult {
  grahamValue: number;        // Graham内在价值
  safetyMargin: number;       // 安全边际(%)
  qualityScore: number;       // 质量评分(0-100)
  attractiveness: 'excellent' | 'good' | 'fair' | 'poor' | 'avoid';
  signals: string[];
  downsideProtection: number; // 下行保护(%)
  riskAdjustedReturn: number; // 风险调整收益(%)
}

export interface ValuationDecomposition {
  earningsValue: number;
  assetValue: number;
  dividendValue: number;
  growthPremium: number;
  qualityDiscount: number;
  fairValue: number;
}

export class MarginOfSafetyEngine {
  /**
   * Graham内在价值 = EPS × (8.5 + 2g) × 4.4 / Y
   * g = 预期增长率, Y = AAA债券收益率
   */
  grahamValue(eps: number, growthRate: number, aaaYield: number = 4.5): number {
    if (eps <= 0) return 0;
    const multiplier = Math.max(8.5, 8.5 + 2 * growthRate);
    return Math.round(eps * multiplier * 4.4 / aaaYield * 100) / 100;
  }

  /**
   * 计算安全边际
   */
  calculateMarginOfSafety(val: StockValuation, aaaYield: number = 4.5): MarginOfSafetyResult {
    const signals: string[] = [];

    // Graham价值
    const grahamVal = this.grahamValue(val.eps, val.growthRate, aaaYield);

    // 安全边际
    const safetyMargin = grahamVal > 0 ? Math.round((1 - val.price / grahamVal) * 10000) / 100 : -100;

    // 质量评分
    let qualityScore = 50;
    if (val.debtToEquity < 0.5) { qualityScore += 15; signals.push('低负债'); }
    else if (val.debtToEquity > 1.5) { qualityScore -= 15; signals.push('高负债'); }

    if (val.currentRatio > 2) { qualityScore += 10; signals.push('强流动性'); }
    else if (val.currentRatio < 1) { qualityScore -= 15; signals.push('流动性不足'); }

    if (val.dividendYield > 3) { qualityScore += 10; signals.push('高股息'); }
    if (val.growthRate > 10) { qualityScore += 10; signals.push('高成长'); }
    if (val.peRatio < 15 && val.peRatio > 0) { qualityScore += 5; signals.push('低PE'); }
    if (val.pbRatio < 1.5 && val.pbRatio > 0) { qualityScore += 5; signals.push('低PB'); }

    qualityScore = Math.max(0, Math.min(100, qualityScore));

    // 吸引力
    let attractiveness: MarginOfSafetyResult['attractiveness'];
    if (safetyMargin > 40 && qualityScore > 70) attractiveness = 'excellent';
    else if (safetyMargin > 25 && qualityScore > 55) attractiveness = 'good';
    else if (safetyMargin > 10) attractiveness = 'fair';
    else if (safetyMargin > 0) attractiveness = 'poor';
    else attractiveness = 'avoid';

    if (safetyMargin > 30) signals.push('显著安全边际');
    if (safetyMargin < 0) signals.push('溢价交易');

    // 下行保护 = (内在价值-当前价格)/当前价格
    const downsideProtection = val.price > 0 ? Math.round((grahamVal - val.price) / val.price * 10000) / 100 : 0;

    // 风险调整收益 = 安全边际 × 质量系数
    const riskAdjustedReturn = Math.round(safetyMargin * qualityScore / 100 * 100) / 100;

    return {
      grahamValue: grahamVal,
      safetyMargin,
      qualityScore,
      attractiveness,
      signals,
      downsideProtection,
      riskAdjustedReturn,
    };
  }

  /**
   * 估值分解
   */
  decomposeValue(val: StockValuation): ValuationDecomposition {
    const earningsValue = val.eps > 0 ? val.eps * 10 : 0; // 10倍PE
    const assetValue = val.bookValue * 0.8; // 80%净资产折价
    const dividendValue = val.dividendYield > 0 ? val.eps / (val.dividendYield / 100) * 0.5 : 0;
    const growthPremium = val.growthRate > 0 ? val.eps * val.growthRate * 0.5 : 0;

    let qualityDiscount = 1;
    if (val.debtToEquity > 1) qualityDiscount -= 0.1;
    if (val.currentRatio < 1) qualityDiscount -= 0.1;
    qualityDiscount = Math.max(0.5, qualityDiscount);

    const rawValue = (earningsValue + assetValue + dividendValue + growthPremium) / 3;
    const fairValue = Math.round(rawValue * qualityDiscount * 100) / 100;

    return {
      earningsValue: Math.round(earningsValue * 100) / 100,
      assetValue: Math.round(assetValue * 100) / 100,
      dividendValue: Math.round(dividendValue * 100) / 100,
      growthPremium: Math.round(growthPremium * 100) / 100,
      qualityDiscount: Math.round(qualityDiscount * 100) / 100,
      fairValue,
    };
  }

  /**
   * 批量比较安全边际
   */
  rankByMarginOfSafety(stocks: Array<{ name: string; valuation: StockValuation }>): Array<{ name: string; result: MarginOfSafetyResult; rank: number }> {
    const results = stocks.map(s => ({
      name: s.name,
      result: this.calculateMarginOfSafety(s.valuation),
    }));

    results.sort((a, b) => b.result.riskAdjustedReturn - a.result.riskAdjustedReturn);

    return results.map((r, i) => ({ ...r, rank: i + 1 }));
  }
}

export default new MarginOfSafetyEngine();
