/**
 * 蒙特卡洛模拟引擎
 * - 股价路径模拟
 * - 投资组合分布
 * - VaR/CVaR估计
 * - 期权定价
 */

export interface MonteCarloParams {
  initialValue: number;
  expectedReturn: number;  // 年化
  volatility: number;      // 年化
  timeHorizon: number;     // 年
  steps: number;           // 时间步数
  simulations: number;     // 模拟次数
}

export interface MonteCarloResult {
  paths: number[][];
  statistics: {
    mean: number;
    median: number;
    stdDev: number;
    skewness: number;
    kurtosis: number;
    min: number;
    max: number;
  };
  percentiles: Record<number, number>;
  var95: number;
  cvar95: number;
}

export interface PortfolioSimResult {
  finalValues: number[];
  expectedReturn: number;
  risk: number;
  sharpeRatio: number;
  maxDrawdown: number;
  probLoss: number;
}

export class MonteCarloEngine {
  private seed: number = 42;

  // 简单伪随机数生成器(可重复)
  private random(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  // Box-Muller正态随机数
  private normalRandom(): number {
    const u1 = this.random();
    const u2 = this.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /**
   * 模拟股价路径(几何布朗运动)
   */
  simulatePaths(params: MonteCarloParams): MonteCarloResult {
    const { initialValue, expectedReturn, volatility, timeHorizon, steps, simulations } = params;
    const dt = timeHorizon / steps;
    const drift = (expectedReturn - 0.5 * volatility ** 2) * dt;
    const diffusion = volatility * Math.sqrt(dt);

    const paths: number[][] = [];
    const finalValues: number[] = [];

    for (let sim = 0; sim < simulations; sim++) {
      const path = [initialValue];
      let price = initialValue;

      for (let step = 0; step < steps; step++) {
        price *= Math.exp(drift + diffusion * this.normalRandom());
        path.push(price);
      }

      paths.push(path);
      finalValues.push(price);
    }

    // 统计
    finalValues.sort((a, b) => a - b);
    const mean = finalValues.reduce((a, b) => a + b, 0) / simulations;
    const median = finalValues[Math.floor(simulations / 2)];
    const variance = finalValues.reduce((s, v) => s + (v - mean) ** 2, 0) / simulations;
    const stdDev = Math.sqrt(variance);

    const m3 = finalValues.reduce((s, v) => s + ((v - mean) / stdDev) ** 3, 0) / simulations;
    const m4 = finalValues.reduce((s, v) => s + ((v - mean) / stdDev) ** 4, 0) / simulations;

    // 百分位数
    const percentiles: Record<number, number> = {};
    for (const p of [1, 5, 10, 25, 50, 75, 90, 95, 99]) {
      const idx = Math.floor(simulations * p / 100);
      percentiles[p] = Math.round(finalValues[Math.min(idx, simulations - 1)] * 100) / 100;
    }

    // VaR/CVaR
    const var95 = initialValue - percentiles[5];
    const worstFivePct = finalValues.slice(0, Math.max(1, Math.floor(simulations * 0.05)));
    const cvar95 = initialValue - worstFivePct.reduce((a, b) => a + b, 0) / worstFivePct.length;

    return {
      paths,
      statistics: {
        mean: Math.round(mean * 100) / 100,
        median: Math.round(median * 100) / 100,
        stdDev: Math.round(stdDev * 100) / 100,
        skewness: Math.round(m3 * 10000) / 10000,
        kurtosis: Math.round(m4 * 10000) / 10000,
        min: Math.round(finalValues[0] * 100) / 100,
        max: Math.round(finalValues[simulations - 1] * 100) / 100,
      },
      percentiles,
      var95: Math.round(var95 * 100) / 100,
      cvar95: Math.round(cvar95 * 100) / 100,
    };
  }

  /**
   * 投资组合蒙特卡洛模拟
   */
  simulatePortfolio(
    weights: number[],
    expectedReturns: number[],
    covarianceMatrix: number[][],
    initialValue: number,
    timeHorizon: number,
    simulations: number,
  ): PortfolioSimResult {
    const n = weights.length;
    const finalValues: number[] = [];

    // 组合预期收益和波动率
    let portReturn = 0;
    for (let i = 0; i < n; i++) portReturn += weights[i] * expectedReturns[i];

    let portVariance = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        portVariance += weights[i] * weights[j] * covarianceMatrix[i][j];
      }
    }
    const portVol = Math.sqrt(portVariance);

    // 模拟
    const dt = timeHorizon;
    const drift = (portReturn - 0.5 * portVol ** 2) * dt;
    const diffusion = portVol * Math.sqrt(dt);

    let peakValue = initialValue;
    let maxDrawdown = 0;

    for (let sim = 0; sim < simulations; sim++) {
      let value = initialValue;
      const z = this.normalRandom();
      value *= Math.exp(drift + diffusion * z);
      finalValues.push(value);

      if (value > peakValue) peakValue = value;
      const drawdown = (peakValue - value) / peakValue;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    finalValues.sort((a, b) => a - b);
    const mean = finalValues.reduce((a, b) => a + b, 0) / simulations;
    const variance = finalValues.reduce((s, v) => s + (v - mean) ** 2, 0) / simulations;
    const risk = Math.sqrt(variance);
    const expectedReturnPct = (mean - initialValue) / initialValue;
    const sharpeRatio = risk > 0 ? expectedReturnPct / (risk / initialValue) : 0;
    const probLoss = finalValues.filter(v => v < initialValue).length / simulations;

    return {
      finalValues,
      expectedReturn: Math.round(expectedReturnPct * 10000) / 10000,
      risk: Math.round(risk * 100) / 100,
      sharpeRatio: Math.round(sharpeRatio * 10000) / 10000,
      maxDrawdown: Math.round(maxDrawdown * 10000) / 10000,
      probLoss: Math.round(probLoss * 10000) / 10000,
    };
  }

  /**
   * 蒙特卡洛期权定价
   */
  priceOption(
    spot: number,
    strike: number,
    rate: number,
    volatility: number,
    timeToExpiry: number,
    type: 'call' | 'put',
    simulations: number = 10000,
  ): { price: number; stdError: number } {
    const drift = (rate - 0.5 * volatility ** 2) * timeToExpiry;
    const diffusion = volatility * Math.sqrt(timeToExpiry);

    let totalPayoff = 0;
    let totalPayoffSq = 0;

    for (let i = 0; i < simulations; i++) {
      const finalPrice = spot * Math.exp(drift + diffusion * this.normalRandom());
      const payoff = type === 'call' ? Math.max(0, finalPrice - strike) : Math.max(0, strike - finalPrice);
      totalPayoff += payoff;
      totalPayoffSq += payoff ** 2;
    }

    const avgPayoff = totalPayoff / simulations;
    const price = Math.exp(-rate * timeToExpiry) * avgPayoff;

    const variance = totalPayoffSq / simulations - avgPayoff ** 2;
    const stdError = Math.exp(-rate * timeToExpiry) * Math.sqrt(variance / simulations);

    return {
      price: Math.round(price * 10000) / 10000,
      stdError: Math.round(stdError * 10000) / 10000,
    };
  }

  /**
   * 重置随机种子
   */
  setSeed(seed: number): void {
    this.seed = seed;
  }
}

export default new MonteCarloEngine();
