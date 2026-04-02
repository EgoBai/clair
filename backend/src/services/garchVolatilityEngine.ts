/**
 * GARCH(1,1) 波动率引擎
 * - 波动率聚类建模
 * - 条件方差估计
 * - 风险预测
 */

export interface GARCHResult {
  omega: number;
  alpha: number;
  beta: number;
  conditionalVariance: number[];
  forecast: number[];
}

export class GARCHVolatilityEngine {
  private returns: number[] = [];
  private omega = 0.0001;
  private alpha = 0.1;
  private beta = 0.85;

  /**
   * 拟合GARCH(1,1)模型
   */
  fit(returns: number[], maxIter = 100): GARCHResult {
    this.returns = returns;
    const n = returns.length;
    if (n < 10) {
      return { omega: this.omega, alpha: this.alpha, beta: this.beta, conditionalVariance: [], forecast: [] };
    }

    // 简化的MLE估计
    let omega = 0.0001, alpha = 0.1, beta = 0.85;
    const condVar = new Array(n).fill(0);
    condVar[0] = this.sampleVariance(returns);

    for (let iter = 0; iter < maxIter; iter++) {
      for (let t = 1; t < n; t++) {
        condVar[t] = omega + alpha * returns[t - 1] ** 2 + beta * condVar[t - 1];
      }

      // 更新参数（简化的矩匹配）
      const avgVar = condVar.reduce((a, b) => a + b, 0) / n;
      const avgSqReturn = returns.reduce((a, r) => a + r * r, 0) / n;
      omega = avgVar * (1 - alpha - beta) * 0.9 + omega * 0.1;

      // 确保平稳性
      if (alpha + beta >= 0.999) {
        const scale = 0.99 / (alpha + beta);
        alpha *= scale;
        beta *= scale;
      }
    }

    this.omega = omega;
    this.alpha = alpha;
    this.beta = beta;

    const forecast = this.forecastVolatility(5);
    return { omega, alpha, beta, conditionalVariance: condVar, forecast };
  }

  /**
   * 预测未来波动率
   */
  forecastVolatility(days: number): number[] {
    const n = this.returns.length;
    if (n === 0) return new Array(days).fill(0);

    const forecasts: number[] = [];
    let lastVar = this.omega / (1 - this.alpha - this.beta);

    for (let t = 1; t < n; t++) {
      lastVar = this.omega + this.alpha * this.returns[t - 1] ** 2 + this.beta * lastVar;
    }

    const longRunVar = this.omega / (1 - this.alpha - this.beta);
    for (let h = 0; h < days; h++) {
      const forecast = longRunVar + (this.alpha + this.beta) ** h * (lastVar - longRunVar);
      forecasts.push(Math.sqrt(Math.max(0, forecast)));
    }
    return forecasts;
  }

  /**
   * 计算VaR
   */
  calculateVaR(confidenceLevel = 0.95): number {
    const forecasts = this.forecastVolatility(1);
    const vol = forecasts[0] || 0;
    const zScore = confidenceLevel === 0.95 ? 1.645 : confidenceLevel === 0.99 ? 2.326 : 1.282;
    return vol * zScore;
  }

  /**
   * 获取波动率状态
   */
  getVolatilityRegime(): 'low' | 'normal' | 'high' | 'extreme' {
    const forecasts = this.forecastVolatility(1);
    const vol = forecasts[0] || 0;
    const annualized = vol * Math.sqrt(252);
    if (annualized < 0.1) return 'low';
    if (annualized < 0.2) return 'normal';
    if (annualized < 0.4) return 'high';
    return 'extreme';
  }

  private sampleVariance(data: number[]): number {
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    return data.reduce((a, x) => a + (x - mean) ** 2, 0) / data.length;
  }
}

export default new GARCHVolatilityEngine();
