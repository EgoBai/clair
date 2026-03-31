/**
 * 财务异动检测引擎
 * - ROE突变检测
 * - 营收增速异常
 * - 毛利率异动
 * - 现金流质量评分
 * - 财务造假预警信号
 * - Z-Score Altman破产预测
 */

export interface FinancialStatement {
  period: string;  // YYYY-QN or YYYY
  revenue: number;
  grossProfit: number;
  operatingProfit: number;
  netIncome: number;
  totalAssets: number;
  totalLiabilities: number;
  currentAssets: number;
  currentLiabilities: number;
  retainedEarnings: number;
  ebit: number;
  marketCap: number;
  sharesOutstanding: number;
  operatingCashFlow: number;
  investingCashFlow: number;
  financingCashFlow: number;
  accountsReceivable: number;
  inventory: number;
  totalEquity: number;
}

export interface FinancialAnomaly {
  type: 'roe_surge' | 'roe_plunge' | 'revenue_anomaly' | 'margin_anomaly' | 'cash_flow_mismatch' | 'altman_distress' | 'earnings_manipulation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  period: string;
  metric: string;
  value: number;
  expectedRange: [number, number];
  description: string;
}

export interface CashFlowQuality {
  score: number; // 0-100
  operatingToNetIncome: number;
  cashConversionCycle: number;
  freeCashFlowYield: number;
  capexIntensity: number;
  cashFlowStability: number;
  quality: 'excellent' | 'good' | 'fair' | 'poor';
}

export interface AltmanZScore {
  score: number;
  zone: 'safe' | 'grey' | 'distress';
  components: {
    workingCapitalToAssets: number;
    retainedEarningsToAssets: number;
    ebitToAssets: number;
    marketCapToLiabilities: number;
    assetTurnover: number;
  };
}

export interface EarningsManipulationRisk {
  score: number; // 0-100, higher = more suspicious
  beneishMScore: number;
  flags: string[];
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
}

export interface FinancialHealthScore {
  overall: number; // 0-100
  profitability: number;
  liquidity: number;
  solvency: number;
  efficiency: number;
  growth: number;
  quality: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export class FinancialAnomalyEngine {
  /**
   * 检测财务异常
   */
  detectAnomalies(statements: FinancialStatement[]): FinancialAnomaly[] {
    if (statements.length < 2) return [];

    const anomalies: FinancialAnomaly[] = [];

    // Sort by period
    const sorted = [...statements].sort((a, b) => a.period.localeCompare(b.period));

    for (let i = 1; i < sorted.length; i++) {
      const curr = sorted[i];
      const prev = sorted[i - 1];

      // ROE anomaly
      const currROE = curr.totalEquity !== 0 ? curr.netIncome / curr.totalEquity : 0;
      const prevROE = prev.totalEquity !== 0 ? prev.netIncome / prev.totalEquity : 0;
      const roeChange = currROE - prevROE;

      if (roeChange > 0.15) {
        anomalies.push({
          type: 'roe_surge', severity: roeChange > 0.3 ? 'high' : 'medium',
          period: curr.period, metric: 'ROE', value: currROE,
          expectedRange: [prevROE - 0.05, prevROE + 0.05],
          description: `ROE突增${(roeChange * 100).toFixed(1)}%`
        });
      }
      if (roeChange < -0.15) {
        anomalies.push({
          type: 'roe_plunge', severity: roeChange < -0.3 ? 'high' : 'medium',
          period: curr.period, metric: 'ROE', value: currROE,
          expectedRange: [prevROE - 0.05, prevROE + 0.05],
          description: `ROE突降${(Math.abs(roeChange) * 100).toFixed(1)}%`
        });
      }

      // Revenue anomaly
      if (prev.revenue > 0) {
        const revenueGrowth = (curr.revenue - prev.revenue) / prev.revenue;
        if (Math.abs(revenueGrowth) > 0.5) {
          anomalies.push({
            type: 'revenue_anomaly', severity: Math.abs(revenueGrowth) > 1 ? 'high' : 'medium',
            period: curr.period, metric: '营收增速', value: revenueGrowth,
            expectedRange: [-0.2, 0.3],
            description: `营收增速异常: ${(revenueGrowth * 100).toFixed(1)}%`
          });
        }
      }

      // Margin anomaly
      if (curr.revenue > 0 && prev.revenue > 0) {
        const currMargin = curr.grossProfit / curr.revenue;
        const prevMargin = prev.grossProfit / prev.revenue;
        const marginChange = currMargin - prevMargin;

        if (Math.abs(marginChange) > 0.1) {
          anomalies.push({
            type: 'margin_anomaly', severity: Math.abs(marginChange) > 0.2 ? 'high' : 'medium',
            period: curr.period, metric: '毛利率', value: currMargin,
            expectedRange: [prevMargin - 0.05, prevMargin + 0.05],
            description: `毛利率异动: ${(marginChange * 100).toFixed(1)}%`
          });
        }
      }

      // Cash flow mismatch
      if (curr.netIncome > 0 && curr.operatingCashFlow < 0) {
        anomalies.push({
          type: 'cash_flow_mismatch', severity: 'high',
          period: curr.period, metric: '经营现金流/净利润', value: curr.operatingCashFlow,
          expectedRange: [0, Infinity],
          description: '净利润为正但经营现金流为负'
        });
      }
    }

    // Altman Z-Score for latest
    const latest = sorted[sorted.length - 1];
    const altman = this.calculateAltmanZScore(latest);
    if (altman.zone === 'distress') {
      anomalies.push({
        type: 'altman_distress', severity: 'critical',
        period: latest.period, metric: 'Altman Z-Score', value: altman.score,
        expectedRange: [2.99, Infinity],
        description: `Altman Z-Score进入危险区域: ${altman.score.toFixed(2)}`
      });
    }

    return anomalies;
  }

  /**
   * Altman Z-Score 破产预测模型
   */
  calculateAltmanZScore(stmt: FinancialStatement): AltmanZScore {
    const ta = stmt.totalAssets || 1;
    const tl = stmt.totalLiabilities || 1;

    const wcToTA = (stmt.currentAssets - stmt.currentLiabilities) / ta;
    const reToTA = stmt.retainedEarnings / ta;
    const ebitToTA = stmt.ebit / ta;
    const mcToTL = stmt.marketCap / tl;
    const at = stmt.revenue / ta;

    // Altman Z-Score (for public companies)
    const score = 1.2 * wcToTA + 1.4 * reToTA + 3.3 * ebitToTA + 0.6 * mcToTL + 1.0 * at;

    let zone: 'safe' | 'grey' | 'distress';
    if (score > 2.99) zone = 'safe';
    else if (score > 1.81) zone = 'grey';
    else zone = 'distress';

    return {
      score,
      zone,
      components: {
        workingCapitalToAssets: wcToTA,
        retainedEarningsToAssets: reToTA,
        ebitToAssets: ebitToTA,
        marketCapToLiabilities: mcToTL,
        assetTurnover: at
      }
    };
  }

  /**
   * 现金流质量评分
   */
  evaluateCashFlowQuality(stmt: FinancialStatement): CashFlowQuality {
    const opToNetIncome = stmt.netIncome !== 0
      ? stmt.operatingCashFlow / stmt.netIncome
      : stmt.operatingCashFlow > 0 ? 2 : 0;

    // Free cash flow
    const fcf = stmt.operatingCashFlow + stmt.investingCashFlow;
    const fcfYield = stmt.marketCap !== 0 ? fcf / stmt.marketCap : 0;

    // Capex intensity
    const capexIntensity = Math.abs(stmt.investingCashFlow) / (stmt.revenue || 1);

    // Operating cash flow stability (simplified)
    const cashFlowStability = stmt.operatingCashFlow > 0 ? 1 : 0;

    // Score calculation
    let score = 50;
    score += Math.min(25, opToNetIncome * 15); // Higher OCF/NI is better
    score += fcfYield > 0 ? 15 : -10;
    score += capexIntensity < 0.1 ? 10 : -5;
    score += cashFlowStability * 10;
    score = Math.max(0, Math.min(100, score));

    let quality: 'excellent' | 'good' | 'fair' | 'poor';
    if (score >= 80) quality = 'excellent';
    else if (score >= 60) quality = 'good';
    else if (score >= 40) quality = 'fair';
    else quality = 'poor';

    return {
      score,
      operatingToNetIncome: opToNetIncome,
      cashConversionCycle: 0, // Would need AR/AP data
      freeCashFlowYield: fcfYield,
      capexIntensity,
      cashFlowStability,
      quality
    };
  }

  /**
   * Beneish M-Score 盈余操纵检测 (简化版)
   */
  detectEarningsManipulation(statements: FinancialStatement[]): EarningsManipulationRisk {
    if (statements.length < 2) {
      return { score: 0, beneishMScore: 0, flags: [], riskLevel: 'low' };
    }

    const sorted = [...statements].sort((a, b) => a.period.localeCompare(b.period));
    const curr = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];

    const flags: string[] = [];
    let suspiciousScore = 0;

    // DSRI: Days Sales in Receivables Index
    if (prev.revenue > 0 && curr.revenue > 0) {
      const prevDSRI = prev.accountsReceivable / prev.revenue;
      const currDSRI = curr.accountsReceivable / curr.revenue;
      const dsri = prevDSRI !== 0 ? currDSRI / prevDSRI : 1;

      if (dsri > 1.3) {
        flags.push(`应收账款增速超过营收增速(DSRI=${dsri.toFixed(2)})`);
        suspiciousScore += 15;
      }
    }

    // GMI: Gross Margin Index
    if (prev.revenue > 0 && curr.revenue > 0) {
      const prevMargin = prev.grossProfit / prev.revenue;
      const currMargin = curr.grossProfit / curr.revenue;
      const gmi = currMargin !== 0 ? prevMargin / currMargin : 1;

      if (gmi > 1.2) {
        flags.push(`毛利率下降(GMI=${gmi.toFixed(2)})`);
        suspiciousScore += 10;
      }
    }

    // AQI: Asset Quality Index
    const prevInTangible = 1 - (prev.currentAssets / prev.totalAssets);
    const currInTangible = 1 - (curr.currentAssets / curr.totalAssets);
    const aqi = prevInTangible !== 0 ? currInTangible / prevInTangible : 1;

    if (aqi > 1.3) {
      flags.push(`非流动资产占比异常增加(AQI=${aqi.toFixed(2)})`);
      suspiciousScore += 10;
    }

    // SGI: Sales Growth Index
    if (prev.revenue > 0) {
      const sgi = curr.revenue / prev.revenue;
      if (sgi > 1.5) {
        flags.push(`营收增速过快(SGI=${sgi.toFixed(2)})`);
        suspiciousScore += 5;
      }
    }

    // DEPI: Depreciation Index (approximation)
    const prevCapexRate = prev.revenue !== 0 ? Math.abs(prev.investingCashFlow) / prev.revenue : 0;
    const currCapexRate = curr.revenue !== 0 ? Math.abs(curr.investingCashFlow) / curr.revenue : 0;

    if (prevCapexRate > 0 && currCapexRate / prevCapexRate < 0.7) {
      flags.push('资本支出大幅下降');
      suspiciousScore += 10;
    }

    // OCF vs Net Income
    if (curr.netIncome > 0 && curr.operatingCashFlow < curr.netIncome * 0.5) {
      flags.push('经营现金流远低于净利润');
      suspiciousScore += 20;
    }

    // Accrual ratio
    const accruals = curr.netIncome - curr.operatingCashFlow;
    const accrualRatio = curr.totalAssets !== 0 ? accruals / curr.totalAssets : 0;
    if (accrualRatio > 0.05) {
      flags.push(`应计比率过高(${(accrualRatio * 100).toFixed(1)}%)`);
      suspiciousScore += 15;
    }

    // Approximate Beneish M-Score
    const beneishMScore = -2.22 + suspiciousScore * 0.05;

    let riskLevel: 'low' | 'moderate' | 'high' | 'critical';
    if (suspiciousScore >= 50) riskLevel = 'critical';
    else if (suspiciousScore >= 30) riskLevel = 'high';
    else if (suspiciousScore >= 15) riskLevel = 'moderate';
    else riskLevel = 'low';

    return {
      score: Math.min(100, suspiciousScore),
      beneishMScore,
      flags,
      riskLevel
    };
  }

  /**
   * 综合财务健康评分
   */
  calculateHealthScore(stmt: FinancialStatement, prev?: FinancialStatement): FinancialHealthScore {
    const ta = stmt.totalAssets || 1;

    // Profitability
    const netMargin = stmt.revenue !== 0 ? stmt.netIncome / stmt.revenue : 0;
    const roe = stmt.totalEquity !== 0 ? stmt.netIncome / stmt.totalEquity : 0;
    const roa = ta !== 0 ? stmt.netIncome / ta : 0;
    const profitability = Math.min(100, Math.max(0,
      (netMargin * 200 + roe * 200 + roa * 300) / 3
    ));

    // Liquidity
    const currentRatio = stmt.currentLiabilities !== 0 ? stmt.currentAssets / stmt.currentLiabilities : 0;
    const liquidity = Math.min(100, Math.max(0, currentRatio * 50));

    // Solvency
    const debtRatio = ta !== 0 ? stmt.totalLiabilities / ta : 1;
    const solvency = Math.min(100, Math.max(0, (1 - debtRatio) * 150));

    // Efficiency
    const assetTurnover = ta !== 0 ? stmt.revenue / ta : 0;
    const efficiency = Math.min(100, Math.max(0, assetTurnover * 100));

    // Growth
    let growth = 50;
    if (prev && prev.revenue > 0) {
      const revenueGrowth = (stmt.revenue - prev.revenue) / prev.revenue;
      growth = Math.min(100, Math.max(0, 50 + revenueGrowth * 100));
    }

    // Quality
    const cfQuality = this.evaluateCashFlowQuality(stmt);
    const quality = cfQuality.score;

    const overall = (profitability * 0.25 + liquidity * 0.15 + solvency * 0.2 +
      efficiency * 0.15 + growth * 0.1 + quality * 0.15);

    let grade: 'A' | 'B' | 'C' | 'D' | 'F';
    if (overall >= 80) grade = 'A';
    else if (overall >= 65) grade = 'B';
    else if (overall >= 50) grade = 'C';
    else if (overall >= 35) grade = 'D';
    else grade = 'F';

    return { overall, profitability, liquidity, solvency, efficiency, growth, quality, grade };
  }
}

export default new FinancialAnomalyEngine();
