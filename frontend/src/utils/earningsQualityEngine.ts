/**
 * 盈利质量评估引擎
 * - 收入质量分析
 * - 利润可持续性
 * - 应收账款健康度
 * - 盈利惊喜预测
 * - 综合盈利质量评分
 */

export interface EarningsData {
  revenue: number;          // 营业收入
  netIncome: number;        // 净利润
  operatingCashFlow: number; // 经营现金流
  accountsReceivable: number; // 应收账款
  inventory: number;        // 存货
  totalAssets: number;      // 总资产
  revenueGrowth: number;    // 收入增长率(%)
  earningsGrowth: number;   // 利润增长率(%)
  grossMargin: number;      // 毛利率(%)
  operatingMargin: number;  // 营业利润率(%)
  accrualsRatio: number;    // 应计比率
}

export interface EarningsQualityResult {
  overallScore: number;       // 综合评分(0-100)
  revenueQuality: number;     // 收入质量(0-100)
  earningsSustainability: number; // 利润可持续性(0-100)
  cashConversion: number;     // 现金转化率
  accrualRisk: 'low' | 'medium' | 'high';
  redFlags: string[];
  greenFlags: string[];
  qualityGrade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export interface EarningsSurpriseEstimate {
  expectedEPS: number;
  beatProbability: number;   // 0-1
  expectedSurprise: number;  // 预期惊喜幅度(%)
  confidence: number;        // 置信度(0-1)
}

export class EarningsQualityEngine {
  /**
   * 评估盈利质量
   */
  assessQuality(data: EarningsData): EarningsQualityResult {
    const redFlags: string[] = [];
    const greenFlags: string[] = [];

    // 收入质量
    let revenueQuality = 50;
    const arToRevenue = data.revenue > 0 ? data.accountsReceivable / data.revenue : 0;
    if (arToRevenue < 0.15) { revenueQuality += 15; greenFlags.push('应收账款占比低'); }
    else if (arToRevenue > 0.4) { revenueQuality -= 20; redFlags.push('应收账款占比过高'); }

    if (data.revenueGrowth > 10) { revenueQuality += 15; greenFlags.push('收入高增长'); }
    else if (data.revenueGrowth < -5) { revenueQuality -= 15; redFlags.push('收入萎缩'); }

    if (data.grossMargin > 40) { revenueQuality += 10; greenFlags.push('高毛利率'); }
    if (data.operatingMargin > 15) { revenueQuality += 10; greenFlags.push('高营业利润率'); }

    revenueQuality = Math.max(0, Math.min(100, revenueQuality));

    // 利润可持续性
    let earningsSustainability = 50;
    const cashCoverage = data.netIncome > 0 ? data.operatingCashFlow / data.netIncome : 0;
    if (cashCoverage > 1.2) { earningsSustainability += 20; greenFlags.push('现金流覆盖利润'); }
    else if (cashCoverage < 0.8 && data.netIncome > 0) { earningsSustainability -= 20; redFlags.push('利润缺乏现金流支撑'); }

    if (data.earningsGrowth > 0 && data.revenueGrowth > 0) {
      const ratio = data.earningsGrowth / Math.max(0.1, data.revenueGrowth);
      if (ratio > 0.8 && ratio < 2) { earningsSustainability += 10; greenFlags.push('利润与收入同步增长'); }
    }

    if (Math.abs(data.earningsGrowth - data.revenueGrowth) > 30) {
      earningsSustainability -= 10; redFlags.push('利润与收入增长不匹配');
    }

    earningsSustainability = Math.max(0, Math.min(100, earningsSustainability));

    // 现金转化率
    const cashConversion = data.netIncome > 0 ? Math.round(data.operatingCashFlow / data.netIncome * 100) / 100 : 0;

    // 应计风险
    let accrualRisk: 'low' | 'medium' | 'high';
    if (data.accrualsRatio < 0.05) accrualRisk = 'low';
    else if (data.accrualsRatio < 0.15) accrualRisk = 'medium';
    else { accrualRisk = 'high'; redFlags.push('高应计比率'); }

    // 综合评分
    const overallScore = Math.round((revenueQuality * 0.4 + earningsSustainability * 0.4 + (100 - data.accrualsRatio * 500) * 0.2));
    const clampedScore = Math.max(0, Math.min(100, overallScore));

    // 等级
    let qualityGrade: 'A' | 'B' | 'C' | 'D' | 'F';
    if (clampedScore >= 85) qualityGrade = 'A';
    else if (clampedScore >= 70) qualityGrade = 'B';
    else if (clampedScore >= 55) qualityGrade = 'C';
    else if (clampedScore >= 40) qualityGrade = 'D';
    else qualityGrade = 'F';

    return {
      overallScore: clampedScore,
      revenueQuality,
      earningsSustainability,
      cashConversion,
      accrualRisk,
      redFlags,
      greenFlags,
      qualityGrade,
    };
  }

  /**
   * 盈利惊喜预测
   */
  estimateSurprise(historical: EarningsData[], analystEPS: number): EarningsSurpriseEstimate {
    if (historical.length === 0) {
      return { expectedEPS: analystEPS, beatProbability: 0.5, expectedSurprise: 0, confidence: 0 };
    }

    // 历史beat率
    const avgCashCoverage = historical.reduce((s, d) => s + (d.netIncome > 0 ? d.operatingCashFlow / d.netIncome : 0), 0) / historical.length;
    const avgMarginTrend = historical.slice(-3).reduce((s, d) => s + d.operatingMargin, 0) / Math.min(3, historical.length);

    let beatProbability = 0.5;
    if (avgCashCoverage > 1.1) beatProbability += 0.15;
    if (avgMarginTrend > 15) beatProbability += 0.1;
    beatProbability = Math.min(0.95, Math.max(0.05, beatProbability));

    const marginDirection = historical.length >= 2 ? (historical[historical.length - 1].operatingMargin - historical[historical.length - 2].operatingMargin) : 0;
    const expectedSurprise = Math.round(marginDirection * 0.5 * 100) / 100;
    const expectedEPS = Math.round(analystEPS * (1 + expectedSurprise / 100) * 100) / 100;

    const confidence = Math.min(1, 0.3 + historical.length * 0.1);

    return {
      expectedEPS,
      beatProbability: Math.round(beatProbability * 100) / 100,
      expectedSurprise,
      confidence: Math.round(confidence * 100) / 100,
    };
  }

  /**
   * 比较多期盈利趋势
   */
  analyzeTrend(quarterly: EarningsData[]): { trend: 'improving' | 'stable' | 'deteriorating'; momentum: number; consistency: number } {
    if (quarterly.length < 2) return { trend: 'stable', momentum: 0, consistency: 50 };

    const margins = quarterly.map(q => q.operatingMargin);
    const changes = [];
    for (let i = 1; i < margins.length; i++) {
      changes.push(margins[i] - margins[i - 1]);
    }

    const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
    const positiveCount = changes.filter(c => c > 0).length;
    const consistency = Math.round(positiveCount / changes.length * 100);

    let trend: 'improving' | 'stable' | 'deteriorating';
    if (avgChange > 1) trend = 'improving';
    else if (avgChange < -1) trend = 'deteriorating';
    else trend = 'stable';

    return { trend, momentum: Math.round(avgChange * 100) / 100, consistency };
  }
}

export default new EarningsQualityEngine();
