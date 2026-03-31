/**
 * 财报异动检测引擎
 * 检测财报发布前后的异常信号，包括：
 * - 盈利预期偏离
 * - 营收增速突变
 * - 毛利率异常波动
 * - 现金流与利润背离
 * - 关键财务比率异常
 */

export interface FinancialReport {
  symbol: string;
  period: string;
  revenue: number;
  netIncome: number;
  grossProfit: number;
  operatingCashFlow: number;
  totalAssets: number;
  totalLiabilities: number;
  eps: number;
  roe: number;
  grossMargin: number;
  netMargin: number;
  debtToAsset: number;
  currentRatio: number;
}

export interface EarningsSurprise {
  symbol: string;
  type: 'positive' | 'negative' | 'neutral';
  score: number;           // 0-100 异动强度
  signals: SurpriseSignal[];
  recommendation: string;
  timestamp: number;
}

export interface SurpriseSignal {
  category: string;
  name: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  value: number;
  threshold: number;
  direction: 'above' | 'below';
}

export interface AnalystEstimate {
  symbol: string;
  period: string;
  expectedEps: number;
  expectedRevenue: number;
  expectedGrowth: number;
  analystCount: number;
}

export class EarningsSurpriseEngine {
  private thresholds = {
    revenueGrowth: { low: 0.05, medium: 0.15, high: 0.30 },
    marginChange: { low: 0.02, medium: 0.05, high: 0.10 },
    epsSurprise: { low: 0.05, medium: 0.15, high: 0.25 },
    cashFlowMismatch: { low: 0.10, medium: 0.25, high: 0.50 },
    debtChange: { low: 0.05, medium: 0.15, high: 0.25 },
  };

  /**
   * 检测盈利预期偏离
   */
  detectEpsSurprise(
    report: FinancialReport,
    estimate: AnalystEstimate
  ): SurpriseSignal | null {
    if (!estimate.expectedEps) return null;

    const surprise = (report.eps - estimate.expectedEps) / Math.abs(estimate.expectedEps);
    const absSurprise = Math.abs(surprise);

    if (absSurprise < this.thresholds.epsSurprise.low) return null;

    const severity = absSurprise >= this.thresholds.epsSurprise.high
      ? 'high'
      : absSurprise >= this.thresholds.epsSurprise.medium
        ? 'medium'
        : 'low';

    return {
      category: '盈利',
      name: 'EPS预期偏离',
      severity,
      description: surprise > 0
        ? `实际EPS ${report.eps.toFixed(2)} 超出预期 ${estimate.expectedEps.toFixed(2)}，超出 ${(absSurprise * 100).toFixed(1)}%`
        : `实际EPS ${report.eps.toFixed(2)} 低于预期 ${estimate.expectedEps.toFixed(2)}，低 ${(absSurprise * 100).toFixed(1)}%`,
      value: surprise,
      threshold: this.thresholds.epsSurprise[severity],
      direction: surprise > 0 ? 'above' : 'below',
    };
  }

  /**
   * 检测营收增速突变
   */
  detectRevenueAnomaly(
    current: FinancialReport,
    previous: FinancialReport
  ): SurpriseSignal | null {
    if (previous.revenue <= 0) return null;

    const growth = (current.revenue - previous.revenue) / previous.revenue;
    const absGrowth = Math.abs(growth);

    if (absGrowth < this.thresholds.revenueGrowth.low) return null;

    const severity = absGrowth >= this.thresholds.revenueGrowth.high
      ? 'high'
      : absGrowth >= this.thresholds.revenueGrowth.medium
        ? 'medium'
        : 'low';

    return {
      category: '营收',
      name: '营收增速异常',
      severity,
      description: growth > 0
        ? `营收同比增长 ${(growth * 100).toFixed(1)}%，显示强劲增长`
        : `营收同比下降 ${(absGrowth * 100).toFixed(1)}%，需关注`,
      value: growth,
      threshold: this.thresholds.revenueGrowth[severity],
      direction: growth > 0 ? 'above' : 'below',
    };
  }

  /**
   * 检测毛利率异常波动
   */
  detectMarginAnomaly(
    current: FinancialReport,
    previous: FinancialReport
  ): SurpriseSignal | null {
    const marginChange = current.grossMargin - previous.grossMargin;
    const absChange = Math.abs(marginChange);

    if (absChange < this.thresholds.marginChange.low) return null;

    const severity = absChange >= this.thresholds.marginChange.high
      ? 'high'
      : absChange >= this.thresholds.marginChange.medium
        ? 'medium'
        : 'low';

    return {
      category: '利润率',
      name: '毛利率波动异常',
      severity,
      description: marginChange > 0
        ? `毛利率提升 ${(marginChange * 100).toFixed(1)} 个百分点至 ${(current.grossMargin * 100).toFixed(1)}%`
        : `毛利率下降 ${(absChange * 100).toFixed(1)} 个百分点至 ${(current.grossMargin * 100).toFixed(1)}%`,
      value: marginChange,
      threshold: this.thresholds.marginChange[severity],
      direction: marginChange > 0 ? 'above' : 'below',
    };
  }

  /**
   * 检测现金流与利润背离
   */
  detectCashFlowMismatch(report: FinancialReport): SurpriseSignal | null {
    if (report.netIncome <= 0) return null;

    const ratio = report.operatingCashFlow / report.netIncome;
    const deviation = Math.abs(1 - ratio);

    if (deviation < this.thresholds.cashFlowMismatch.low) return null;

    const severity = deviation >= this.thresholds.cashFlowMismatch.high
      ? 'high'
      : deviation >= this.thresholds.cashFlowMismatch.medium
        ? 'medium'
        : 'low';

    return {
      category: '现金流',
      name: '现金流与利润背离',
      severity,
      description: ratio < 1
        ? `经营现金流/净利润比率 ${ratio.toFixed(2)}，利润质量存疑`
        : `经营现金流/净利润比率 ${ratio.toFixed(2)}，现金流充裕`,
      value: ratio,
      threshold: 1 + this.thresholds.cashFlowMismatch[severity],
      direction: ratio >= 1 ? 'above' : 'below',
    };
  }

  /**
   * 检测资产负债率异常
   */
  detectLeverageAnomaly(
    current: FinancialReport,
    previous: FinancialReport
  ): SurpriseSignal | null {
    const debtChange = current.debtToAsset - previous.debtToAsset;
    const absChange = Math.abs(debtChange);

    if (absChange < this.thresholds.debtChange.low) return null;

    const severity = absChange >= this.thresholds.debtChange.high
      ? 'high'
      : absChange >= this.thresholds.debtChange.medium
        ? 'medium'
        : 'low';

    return {
      category: '杠杆',
      name: '资产负债率异常变动',
      severity,
      description: debtChange > 0
        ? `资产负债率上升 ${(debtChange * 100).toFixed(1)} 个百分点至 ${(current.debtToAsset * 100).toFixed(1)}%`
        : `资产负债率下降 ${(absChange * 100).toFixed(1)} 个百分点至 ${(current.debtToAsset * 100).toFixed(1)}%`,
      value: debtChange,
      threshold: this.thresholds.debtChange[severity],
      direction: debtChange > 0 ? 'above' : 'below',
    };
  }

  /**
   * 综合分析财报异动
   */
  analyze(
    current: FinancialReport,
    previous: FinancialReport,
    estimate?: AnalystEstimate
  ): EarningsSurprise {
    const signals: SurpriseSignal[] = [];

    // EPS预期偏离
    if (estimate) {
      const epsSignal = this.detectEpsSurprise(current, estimate);
      if (epsSignal) signals.push(epsSignal);
    }

    // 营收增速
    const revSignal = this.detectRevenueAnomaly(current, previous);
    if (revSignal) signals.push(revSignal);

    // 毛利率波动
    const marginSignal = this.detectMarginAnomaly(current, previous);
    if (marginSignal) signals.push(marginSignal);

    // 现金流背离
    const cfSignal = this.detectCashFlowMismatch(current);
    if (cfSignal) signals.push(cfSignal);

    // 杠杆异常
    const leverageSignal = this.detectLeverageAnomaly(current, previous);
    if (leverageSignal) signals.push(leverageSignal);

    // 计算综合分数
    const score = this.calculateScore(signals);
    const type = score >= 60 ? 'positive' : score <= -20 ? 'negative' : 'neutral';

    return {
      symbol: current.symbol,
      type,
      score: Math.abs(score),
      signals,
      recommendation: this.generateRecommendation(type, signals),
      timestamp: Date.now(),
    };
  }

  /**
   * 计算异动分数
   */
  private calculateScore(signals: SurpriseSignal[]): number {
    let score = 0;

    for (const signal of signals) {
      const weight = signal.severity === 'high' ? 30
        : signal.severity === 'medium' ? 15
        : 5;

      // 正面信号加分，负面信号减分
      const isPositive = (
        (signal.name.includes('增速') && signal.direction === 'above') ||
        (signal.name.includes('毛利率') && signal.direction === 'above') ||
        (signal.name.includes('EPS') && signal.direction === 'above') ||
        (signal.name.includes('现金流') && signal.direction === 'above') ||
        (signal.name.includes('资产负债率') && signal.direction === 'below')
      );

      score += isPositive ? weight : -weight;
    }

    return Math.max(-100, Math.min(100, score));
  }

  /**
   * 生成投资建议
   */
  private generateRecommendation(
    type: 'positive' | 'negative' | 'neutral',
    signals: SurpriseSignal[]
  ): string {
    const highSignals = signals.filter(s => s.severity === 'high');

    if (type === 'positive') {
      if (highSignals.length >= 2) return '财报表现优异，多项指标超预期，建议关注';
      return '财报整体向好，部分指标改善';
    }

    if (type === 'negative') {
      if (highSignals.length >= 2) return '财报多项指标不及预期，建议谨慎';
      return '财报部分指标承压，需持续关注';
    }

    return '财报表现平稳，无明显异动';
  }

  /**
   * 批量分析多只股票
   */
  batchAnalyze(
    reports: Map<string, { current: FinancialReport; previous: FinancialReport }>,
    estimates?: Map<string, AnalystEstimate>
  ): EarningsSurprise[] {
    const results: EarningsSurprise[] = [];

    for (const [symbol, { current, previous }] of reports) {
      const estimate = estimates?.get(symbol);
      results.push(this.analyze(current, previous, estimate));
    }

    return results.sort((a, b) => {
      if (a.type === 'negative' && b.type !== 'negative') return -1;
      if (a.type === 'positive' && b.type !== 'positive') return 1;
      return b.score - a.score;
    });
  }

  /**
   * 更新检测阈值
   */
  updateThresholds(thresholds: Partial<typeof this.thresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }
}

export const earningsSurpriseEngine = new EarningsSurpriseEngine();
export default EarningsSurpriseEngine;
