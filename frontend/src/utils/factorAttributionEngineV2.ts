/**
 * 因子归因引擎 v2
 * 多因子收益归因: Brinson + 风格因子
 */

// ==================== 类型定义 ====================
export interface FactorExposure {
  factor: string;
  exposure: number;
  contribution: number;
  tStat: number;
  significant: boolean;
}

export interface BrinsonAttribution {
  allocationEffect: number; // 配置效应
  selectionEffect: number; // 选股效应
  interactionEffect: number; // 交互效应
  totalEffect: number;
  sectorBreakdown: Map<string, { allocation: number; selection: number; interaction: number }>;
}

export interface FactorReturn {
  factor: string;
  dailyReturn: number;
  cumulativeReturn: number;
  annualizedReturn: number;
  volatility: number;
  sharpeRatio: number;
  hitRate: number;
  maxDrawdown: number;
}

export interface RiskAttribution {
  totalRisk: number;
  systematicRisk: number;
  idiosyncraticRisk: number;
  factorContributions: Map<string, number>;
  diversificationRatio: number;
  trackingError: number;
}

export interface StyleAnalysis {
  growth: number;
  value: number;
  momentum: number;
  quality: number;
  size: number;
  lowVol: number;
  dominantStyle: string;
  stylePurity: number; // 风格纯度 0-1
}

// ==================== 核心引擎 ====================
export class FactorAttributionEngineV2 {
  private factorNames = ['market', 'size', 'value', 'momentum', 'quality', 'lowVol'];

  /**
   * Brinson归因分析
   */
  brinsonAttribution(
    portfolioWeights: Map<string, number>,
    benchmarkWeights: Map<string, number>,
    portfolioReturns: Map<string, number>,
    benchmarkReturns: Map<string, number>,
    sectorMapping: Map<string, string>
  ): BrinsonAttribution {
    const sectors = new Set<string>();
    for (const [, sector] of sectorMapping) sectors.add(sector);

    const sectorBreakdown = new Map<string, { allocation: number; selection: number; interaction: number }>();
    let totalAllocation = 0;
    let totalSelection = 0;
    let totalInteraction = 0;

    // 计算总收益
    let portfolioTotalReturn = 0;
    let benchmarkTotalReturn = 0;
    for (const [asset, weight] of portfolioWeights) {
      portfolioTotalReturn += weight * (portfolioReturns.get(asset) || 0);
    }
    for (const [asset, weight] of benchmarkWeights) {
      benchmarkTotalReturn += weight * (benchmarkReturns.get(asset) || 0);
    }

    for (const sector of sectors) {
      // 汇总sector级别
      let wp = 0, wb = 0, rp = 0, rb = 0;
      for (const [asset, weight] of portfolioWeights) {
        if (sectorMapping.get(asset) === sector) {
          wp += weight;
          rp += weight * (portfolioReturns.get(asset) || 0);
        }
      }
      for (const [asset, weight] of benchmarkWeights) {
        if (sectorMapping.get(asset) === sector) {
          wb += weight;
          rb += weight * (benchmarkReturns.get(asset) || 0);
        }
      }

      const rpSector = wp > 0 ? rp / wp : 0;
      const rbSector = wb > 0 ? rb / wb : 0;

      // 配置效应: (wp - wb) * (rb_sector - rb_total)
      const allocation = (wp - wb) * (rbSector - benchmarkTotalReturn);
      // 选股效应: wb * (rp_sector - rb_sector)
      const selection = wb * (rpSector - rbSector);
      // 交互效应: (wp - wb) * (rp_sector - rb_sector)
      const interaction = (wp - wb) * (rpSector - rbSector);

      sectorBreakdown.set(sector, {
        allocation: Math.round(allocation * 10000) / 10000,
        selection: Math.round(selection * 10000) / 10000,
        interaction: Math.round(interaction * 10000) / 10000
      });

      totalAllocation += allocation;
      totalSelection += selection;
      totalInteraction += interaction;
    }

    return {
      allocationEffect: Math.round(totalAllocation * 10000) / 10000,
      selectionEffect: Math.round(totalSelection * 10000) / 10000,
      interactionEffect: Math.round(totalInteraction * 10000) / 10000,
      totalEffect: Math.round((totalAllocation + totalSelection + totalInteraction) * 10000) / 10000,
      sectorBreakdown
    };
  }

  /**
   * 因子暴露分析
   */
  analyzeFactorExposures(
    returns: number[],
    factorReturns: Map<string, number[]>
  ): FactorExposure[] {
    if (returns.length < 10) return [];

    const exposures: FactorExposure[] = [];

    for (const factorName of this.factorNames) {
      const factorData = factorReturns.get(factorName);
      if (!factorData || factorData.length < returns.length) continue;

      const n = Math.min(returns.length, factorData.length);
      const y = returns.slice(0, n);
      const x = factorData.slice(0, n);

      // 简单线性回归
      const meanX = x.reduce((s, v) => s + v, 0) / n;
      const meanY = y.reduce((s, v) => s + v, 0) / n;

      let num = 0, den = 0;
      let ssRes = 0, ssTot = 0;
      for (let i = 0; i < n; i++) {
        num += (x[i] - meanX) * (y[i] - meanY);
        den += (x[i] - meanX) ** 2;
      }

      const beta = den > 0 ? num / den : 0;
      const alpha = meanY - beta * meanX;

      // R² 和 t统计量
      for (let i = 0; i < n; i++) {
        const predicted = alpha + beta * x[i];
        ssRes += (y[i] - predicted) ** 2;
        ssTot += (y[i] - meanY) ** 2;
      }
      const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
      const se = Math.sqrt(ssRes / Math.max(1, n - 2));
      const seBeta = den > 0 ? se / Math.sqrt(den) : 0;
      const tStat = seBeta > 0 ? beta / seBeta : 0;

      // 贡献 = 暴露 * 因子平均收益
      const avgFactorReturn = x.reduce((s, v) => s + v, 0) / n;
      const contribution = beta * avgFactorReturn;

      exposures.push({
        factor: factorName,
        exposure: Math.round(beta * 10000) / 10000,
        contribution: Math.round(contribution * 10000) / 10000,
        tStat: Math.round(tStat * 100) / 100,
        significant: Math.abs(tStat) > 1.96
      });
    }

    return exposures;
  }

  /**
   * 因子收益分析
   */
  analyzeFactorReturns(
    factorReturns: Map<string, number[]>
  ): FactorReturn[] {
    const results: FactorReturn[] = [];

    for (const [factor, returns] of factorReturns) {
      if (returns.length < 2) continue;

      const cumReturn = returns.reduce((prod, r) => prod * (1 + r), 1) - 1;
      const annReturn = (1 + cumReturn) ** (252 / returns.length) - 1;
      const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
      const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / returns.length;
      const vol = Math.sqrt(variance * 252);
      const sharpe = vol > 0 ? annReturn / vol : 0;

      const wins = returns.filter(r => r > 0).length;
      const hitRate = returns.length > 0 ? wins / returns.length : 0;

      // 最大回撤
      let peak = 1, maxDD = 0;
      let cumValue = 1;
      for (const r of returns) {
        cumValue *= (1 + r);
        if (cumValue > peak) peak = cumValue;
        const dd = (peak - cumValue) / peak;
        if (dd > maxDD) maxDD = dd;
      }

      results.push({
        factor,
        dailyReturn: Math.round(mean * 10000) / 10000,
        cumulativeReturn: Math.round(cumReturn * 10000) / 10000,
        annualizedReturn: Math.round(annReturn * 10000) / 10000,
        volatility: Math.round(vol * 10000) / 10000,
        sharpeRatio: Math.round(sharpe * 100) / 100,
        hitRate: Math.round(hitRate * 10000) / 10000,
        maxDrawdown: Math.round(maxDD * 10000) / 10000
      });
    }

    return results;
  }

  /**
   * 风险归因分析
   */
  analyzeRiskAttribution(
    portfolioReturns: number[],
    factorReturns: Map<string, number[]>,
    benchmarkReturns?: number[]
  ): RiskAttribution {
    if (portfolioReturns.length < 10) {
      return {
        totalRisk: 0, systematicRisk: 0, idiosyncraticRisk: 0,
        factorContributions: new Map(), diversificationRatio: 0, trackingError: 0
      };
    }

    const totalVariance = this.calcVariance(portfolioReturns);
    const totalRisk = Math.sqrt(totalVariance * 252);

    // 因子回归
    const exposures = this.analyzeFactorExposures(portfolioReturns, factorReturns);
    let systematicVariance = 0;
    const factorContributions = new Map<string, number>();

    for (const exp of exposures) {
      const factorData = factorReturns.get(exp.factor);
      if (!factorData) continue;
      const factorVar = this.calcVariance(factorData.slice(0, portfolioReturns.length));
      const contrib = (exp.exposure ** 2) * factorVar;
      factorContributions.set(exp.factor, Math.round(Math.sqrt(contrib * 252) * 10000) / 10000);
      systematicVariance += contrib;
    }

    const systematicRisk = Math.sqrt(systematicVariance * 252);
    const idiosyncraticRisk = Math.sqrt(Math.max(0, totalVariance - systematicVariance) * 252);
    const diversificationRatio = totalRisk > 0 ? systematicRisk / totalRisk : 0;

    // 跟踪误差
    let trackingError = 0;
    if (benchmarkReturns) {
      const n = Math.min(portfolioReturns.length, benchmarkReturns.length);
      const excessReturns = portfolioReturns.slice(0, n).map((r, i) => r - benchmarkReturns[i]);
      trackingError = Math.sqrt(this.calcVariance(excessReturns) * 252);
    }

    return {
      totalRisk: Math.round(totalRisk * 10000) / 10000,
      systematicRisk: Math.round(systematicRisk * 10000) / 10000,
      idiosyncraticRisk: Math.round(idiosyncraticRisk * 10000) / 10000,
      factorContributions,
      diversificationRatio: Math.round(diversificationRatio * 10000) / 10000,
      trackingError: Math.round(trackingError * 10000) / 10000
    };
  }

  /**
   * 风格分析
   */
  analyzeStyle(
    returns: number[],
    factorReturns: Map<string, number[]>
  ): StyleAnalysis {
    const exposures = this.analyzeFactorExposures(returns, factorReturns);

    const getExposure = (name: string) => exposures.find(e => e.factor === name)?.exposure || 0;

    const growth = getExposure('growth') || (getExposure('momentum') * 0.5 + getExposure('quality') * 0.5);
    const value = getExposure('value');
    const momentum = getExposure('momentum');
    const quality = getExposure('quality');
    const size = getExposure('size');
    const lowVol = getExposure('lowVol');

    const styles = { growth, value, momentum, quality, size: -size, lowVol: -lowVol };
    const sorted = Object.entries(styles).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const dominantStyle = sorted[0][0];

    // 风格纯度: 最大因子暴露的占比
    const totalExposure = Object.values(styles).reduce((s, v) => s + Math.abs(v), 0);
    const stylePurity = totalExposure > 0 ? Math.abs(sorted[0][1]) / totalExposure : 0;

    return {
      growth: Math.round(growth * 10000) / 10000,
      value: Math.round(value * 10000) / 10000,
      momentum: Math.round(momentum * 10000) / 10000,
      quality: Math.round(quality * 10000) / 10000,
      size: Math.round(size * 10000) / 10000,
      lowVol: Math.round(lowVol * 10000) / 10000,
      dominantStyle,
      stylePurity: Math.round(stylePurity * 10000) / 10000
    };
  }

  // ==================== 辅助方法 ====================
  private calcVariance(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  }
}

export default FactorAttributionEngineV2;
