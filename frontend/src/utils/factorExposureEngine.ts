/**
 * 因子暴露分析引擎
 * - Fama-French三/五因子暴露
 * - Alpha/Beta分离
 * - 风格归因(价值/成长/规模/动量)
 * - 残差风险
 * - 因子贡献分解
 * - R平方分析
 * - 跟踪误差
 */

export interface FactorExposure {
  factor: string;
  beta: number;
  tStat: number;
  significance: 'high' | 'medium' | 'low' | 'none';
}

export interface StyleAttribution {
  valueExposure: number;
  growthExposure: number;
  sizeExposure: number;
  momentumExposure: number;
  qualityExposure: number;
  dominantStyle: string;
  stylePurity: number; // 0-1
}

export interface AlphaDecomposition {
  alpha: number; // 日均Alpha
  annualizedAlpha: number;
  beta: number;
  rSquared: number;
  trackingError: number;
  informationRatio: number;
  residualVol: number;
}

export interface FactorContribution {
  factor: string;
  contribution: number; // 对总收益的贡献(%)
  exposure: number;
  factorReturn: number;
}

export interface FactorAnalysisReport {
  exposures: FactorExposure[];
  style: StyleAttribution;
  alpha: AlphaDecomposition;
  contributions: FactorContribution[];
  totalExplained: number; // 因子解释的收益比例
  idiosyncraticRisk: number;
}

export class FactorExposureEngine {
  /**
   * 计算因子暴露(Beta)
   */
  calcFactorExposures(
    stockReturns: number[],
    factorReturns: Record<string, number[]>,
  ): FactorExposure[] {
    const factorNames = Object.keys(factorReturns);
    if (factorNames.length === 0 || stockReturns.length < 10) return [];

    const n = Math.min(stockReturns.length, ...factorNames.map(f => factorReturns[f].length));

    // 多元线性回归
    const { betas, residuals } = this.multipleRegression(
      stockReturns.slice(0, n),
      factorNames.map(f => factorReturns[f].slice(0, n)),
    );

    const resStd = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / (n - factorNames.length - 1));

    return factorNames.map((name, i) => {
      const beta = betas[i];
      // 简化t统计量
      const factorVar = factorReturns[name].slice(0, n).reduce((s, v) => s + v * v, 0) / n;
      const se = resStd / Math.sqrt(factorVar * n);
      const tStat = se > 0 ? beta / se : 0;

      let significance: FactorExposure['significance'];
      if (Math.abs(tStat) > 2.58) significance = 'high';
      else if (Math.abs(tStat) > 1.96) significance = 'medium';
      else if (Math.abs(tStat) > 1.65) significance = 'low';
      else significance = 'none';

      return {
        factor: name,
        beta: Math.round(beta * 10000) / 10000,
        tStat: Math.round(tStat * 100) / 100,
        significance,
      };
    });
  }

  /**
   * 风格归因
   */
  calcStyleAttribution(
    stockReturns: number[],
    factorReturns: Record<string, number[]>,
  ): StyleAttribution {
    const exposures = this.calcFactorExposures(stockReturns, factorReturns);

    const getBeta = (name: string) => exposures.find(e => e.factor === name)?.beta ?? 0;

    const valueExposure = getBeta('value');
    const growthExposure = getBeta('growth');
    const sizeExposure = getBeta('size');
    const momentumExposure = getBeta('momentum');
    const qualityExposure = getBeta('quality');

    // 主导风格
    const styles = [
      { name: 'value', abs: Math.abs(valueExposure) },
      { name: 'growth', abs: Math.abs(growthExposure) },
      { name: 'size', abs: Math.abs(sizeExposure) },
      { name: 'momentum', abs: Math.abs(momentumExposure) },
      { name: 'quality', abs: Math.abs(qualityExposure) },
    ].sort((a, b) => b.abs - a.abs);

    const dominantStyle = styles[0]?.name ?? 'mixed';

    // 风格纯度: 最大暴露占比
    const totalAbs = styles.reduce((s, st) => s + st.abs, 0);
    const stylePurity = totalAbs > 0 ? styles[0].abs / totalAbs : 0;

    return {
      valueExposure: Math.round(valueExposure * 10000) / 10000,
      growthExposure: Math.round(growthExposure * 10000) / 10000,
      sizeExposure: Math.round(sizeExposure * 10000) / 10000,
      momentumExposure: Math.round(momentumExposure * 10000) / 10000,
      qualityExposure: Math.round(qualityExposure * 10000) / 10000,
      dominantStyle,
      stylePurity: Math.round(stylePurity * 100) / 100,
    };
  }

  /**
   * Alpha分解
   */
  decomposeAlpha(
    stockReturns: number[],
    marketReturns: number[],
  ): AlphaDecomposition {
    const n = Math.min(stockReturns.length, marketReturns.length);
    if (n < 10) {
      return { alpha: 0, annualizedAlpha: 0, beta: 0, rSquared: 0, trackingError: 0, informationRatio: 0, residualVol: 0 };
    }

    const y = stockReturns.slice(0, n);
    const x = marketReturns.slice(0, n);

    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;

    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (x[i] - meanX) * (y[i] - meanY);
      den += (x[i] - meanX) ** 2;
    }
    const beta = den > 0 ? num / den : 1;
    const alpha = meanY - beta * meanX;

    const residuals = y.map((yi, i) => yi - (alpha + beta * x[i]));
    const ssRes = residuals.reduce((s, r) => s + r * r, 0);
    const ssTot = y.reduce((s, yi) => s + (yi - meanY) ** 2, 0);
    const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    const residualVol = Math.sqrt(ssRes / (n - 2)) * Math.sqrt(252);
    const trackingError = residualVol;
    const annualizedAlpha = alpha * 252;
    const informationRatio = trackingError > 0 ? annualizedAlpha / trackingError : 0;

    return {
      alpha: Math.round(alpha * 10000) / 10000,
      annualizedAlpha: Math.round(annualizedAlpha * 10000) / 10000,
      beta: Math.round(beta * 10000) / 10000,
      rSquared: Math.round(rSquared * 10000) / 10000,
      trackingError: Math.round(trackingError * 10000) / 10000,
      informationRatio: Math.round(informationRatio * 100) / 100,
      residualVol: Math.round(residualVol * 10000) / 10000,
    };
  }

  /**
   * 因子收益贡献分解
   */
  calcFactorContributions(
    exposures: FactorExposure[],
    factorReturns: Record<string, number[]>,
  ): FactorContribution[] {
    const contributions: FactorContribution[] = [];
    let totalReturn = 0;

    for (const exp of exposures) {
      const fr = factorReturns[exp.factor];
      if (!fr || fr.length === 0) continue;
      const avgFactorReturn = fr.reduce((a, b) => a + b, 0) / fr.length;
      const contribution = exp.beta * avgFactorReturn;
      totalReturn += contribution;
      contributions.push({
        factor: exp.factor,
        contribution: 0, // placeholder
        exposure: exp.beta,
        factorReturn: Math.round(avgFactorReturn * 10000) / 10000,
      });
    }

    // 归一化贡献百分比
    if (Math.abs(totalReturn) > 1e-10) {
      for (const c of contributions) {
        c.contribution = Math.round((c.exposure * c.factorReturn / totalReturn) * 10000) / 100;
      }
    }

    return contributions;
  }

  /**
   * 生成完整因子分析报告
   */
  generateReport(
    stockReturns: number[],
    factorReturns: Record<string, number[]>,
    marketReturns: number[],
  ): FactorAnalysisReport {
    const exposures = this.calcFactorExposures(stockReturns, factorReturns);
    const style = this.calcStyleAttribution(stockReturns, factorReturns);
    const alpha = this.decomposeAlpha(stockReturns, marketReturns);
    const contributions = this.calcFactorContributions(exposures, factorReturns);

    const totalExplained = Math.abs(alpha.rSquared);
    const idiosyncraticRisk = alpha.residualVol;

    return {
      exposures,
      style,
      alpha,
      contributions,
      totalExplained: Math.round(totalExplained * 10000) / 10000,
      idiosyncraticRisk: Math.round(idiosyncraticRisk * 10000) / 10000,
    };
  }

  // --- Helpers ---

  private multipleRegression(
    y: number[],
    xMatrix: number[][],
  ): { betas: number[]; residuals: number[] } {
    const n = y.length;
    const k = xMatrix.length;

    if (k === 0) return { betas: [], residuals: y.slice() };

    // 使用正规方程: β = (X'X)^(-1) X'y (简化版)
    // 对于小维度，使用逐个回归近似
    const betas: number[] = [];
    const residuals = y.slice();

    for (let j = 0; j < k; j++) {
      const x = xMatrix[j];
      const meanX = x.reduce((a, b) => a + b, 0) / n;
      const meanY = residuals.reduce((a, b) => a + b, 0) / n;

      let num = 0, den = 0;
      for (let i = 0; i < n; i++) {
        num += (x[i] - meanX) * (residuals[i] - meanY);
        den += (x[i] - meanX) ** 2;
      }
      const beta = den > 0 ? num / den : 0;
      betas.push(beta);

      // 更新残差
      for (let i = 0; i < n; i++) {
        residuals[i] -= beta * x[i];
      }
    }

    return { betas, residuals };
  }
}

export default new FactorExposureEngine();
