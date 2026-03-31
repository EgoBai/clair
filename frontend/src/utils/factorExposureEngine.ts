/**
 * 因子暴露分析引擎
 * - Fama-French因子暴露
 * - 风格因子分解
 * - 因子贡献归因
 * - 因子拥挤度评估
 */

export interface FactorReturns {
  market: number;    // 市场因子收益
  size: number;      // SMB (小盘-大盘)
  value: number;     // HML (价值-成长)
  momentum: number;  // 动量因子
  quality: number;   // 质量因子
  volatility: number; // 低波动因子
}

export interface FactorExposure {
  market: number;
  size: number;
  value: number;
  momentum: number;
  quality: number;
  volatility: number;
}

export interface FactorAttribution {
  totalReturn: number;
  factorReturn: number;
  specificReturn: number;
  contributions: Record<string, number>;
  rSquared: number;
}

export interface StyleProfile {
  style: 'large_value' | 'large_growth' | 'small_value' | 'small_growth' | 'blend';
  tiltStrength: number; // 0-100
  factorPurities: Record<string, number>;
  diversificationScore: number;
}

export class FactorExposureEngine {
  private readonly factorNames: (keyof FactorExposure)[] = ['market', 'size', 'value', 'momentum', 'quality', 'volatility'];

  /**
   * 因子收益归因
   */
  attributeReturns(exposure: FactorExposure, factorReturns: FactorReturns, specificReturn: number): FactorAttribution {
    const contributions: Record<string, number> = {};
    let factorReturn = 0;

    for (const name of this.factorNames) {
      const contrib = exposure[name] * factorReturns[name];
      contributions[name] = Math.round(contrib * 10000) / 10000;
      factorReturn += contrib;
    }

    const totalReturn = factorReturn + specificReturn;
    const factorVariance = this.factorNames.reduce((s, n) => s + (exposure[n] * factorReturns[n]) ** 2, 0);
    const totalVariance = totalReturn ** 2;
    const rSquared = totalVariance > 0 ? Math.min(1, Math.round(factorVariance / totalVariance * 100) / 100) : 0;

    return {
      totalReturn: Math.round(totalReturn * 10000) / 10000,
      factorReturn: Math.round(factorReturn * 10000) / 10000,
      specificReturn: Math.round(specificReturn * 10000) / 10000,
      contributions,
      rSquared,
    };
  }

  /**
   * 从收益率序列估计因子暴露(简化OLS)
   */
  estimateExposure(stockReturns: number[], factorReturnsMatrix: FactorReturns[]): FactorExposure {
    if (stockReturns.length < 2 || factorReturnsMatrix.length < 2) {
      return { market: 1, size: 0, value: 0, momentum: 0, quality: 0, volatility: 0 };
    }

    const n = Math.min(stockReturns.length, factorReturnsMatrix.length);
    const exposures: FactorExposure = { market: 0, size: 0, value: 0, momentum: 0, quality: 0, volatility: 0 };

    for (const name of this.factorNames) {
      const x = factorReturnsMatrix.slice(0, n).map(f => f[name]);
      const y = stockReturns.slice(0, n);

      // 简单OLS: beta = cov(x,y) / var(x)
      const xMean = x.reduce((a, b) => a + b, 0) / n;
      const yMean = y.reduce((a, b) => a + b, 0) / n;

      let cov = 0, varX = 0;
      for (let i = 0; i < n; i++) {
        cov += (x[i] - xMean) * (y[i] - yMean);
        varX += (x[i] - xMean) ** 2;
      }

      exposures[name] = varX > 0 ? Math.round(cov / varX * 10000) / 10000 : 0;
    }

    return exposures;
  }

  /**
   * 风格分析
   */
  analyzeStyle(exposure: FactorExposure): StyleProfile {
    // 大/小盘
    const isSmall = exposure.size > 0.3;
    const isLarge = exposure.size < -0.3;

    // 价值/成长
    const isValue = exposure.value > 0.3;
    const isGrowth = exposure.value < -0.3;

    let style: StyleProfile['style'];
    if (isLarge && isValue) style = 'large_value';
    else if (isLarge && isGrowth) style = 'large_growth';
    else if (isSmall && isValue) style = 'small_value';
    else if (isSmall && isGrowth) style = 'small_growth';
    else style = 'blend';

    // 倾斜强度
    const absExposures = this.factorNames.map(n => Math.abs(exposure[n]));
    const tiltStrength = Math.min(100, Math.round(Math.max(...absExposures) * 100));

    // 因子纯度(每个因子暴露占总暴露的比例)
    const totalAbs = absExposures.reduce((a, b) => a + b, 0) || 1;
    const factorPurities: Record<string, number> = {};
    this.factorNames.forEach((n, i) => {
      factorPurities[n] = Math.round(absExposures[i] / totalAbs * 100) / 100;
    });

    // 分散化评分
    const nonZero = absExposures.filter(e => e > 0.1).length;
    const diversificationScore = Math.min(100, Math.round(nonZero / this.factorNames.length * 100));

    return { style, tiltStrength, factorPurities, diversificationScore };
  }

  /**
   * 因子拥挤度评估
   */
  assessCrowding(factorExposures: FactorExposure[]): Record<string, { avgExposure: number; crowding: 'low' | 'medium' | 'high'; percentile: number }> {
    const result: Record<string, { avgExposure: number; crowding: 'low' | 'medium' | 'high'; percentile: number }> = {};

    for (const name of this.factorNames) {
      const values = factorExposures.map(e => e[name]).sort((a, b) => a - b);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const p90 = values[Math.floor(values.length * 0.9)] || 0;

      let crowding: 'low' | 'medium' | 'high';
      if (Math.abs(avg) > 0.5 && Math.abs(p90) > 1) crowding = 'high';
      else if (Math.abs(avg) > 0.2) crowding = 'medium';
      else crowding = 'low';

      result[name] = {
        avgExposure: Math.round(avg * 10000) / 10000,
        crowding,
        percentile: Math.round(p90 * 100) / 100,
      };
    }

    return result;
  }

  /**
   * 组合因子暴露汇总
   */
  portfolioExposure(holdings: Array<{ weight: number; exposure: FactorExposure }>): FactorExposure {
    const total: FactorExposure = { market: 0, size: 0, value: 0, momentum: 0, quality: 0, volatility: 0 };

    for (const h of holdings) {
      for (const name of this.factorNames) {
        total[name] += h.weight * h.exposure[name];
      }
    }

    for (const name of this.factorNames) {
      total[name] = Math.round(total[name] * 10000) / 10000;
    }

    return total;
  }
}

export default new FactorExposureEngine();
