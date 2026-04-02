/**
 * 尾部风险对冲引擎
 * - CVaR (条件风险价值) 计算
 * - 尾部依赖性分析
 * - 保护性期权策略评估
 * - 黑天鹅压力测试
 * - 极值理论 (EVT) 拟合
 * - 对冲比率优化
 */

export interface TailRiskMetrics {
  var95: number;
  var99: number;
  cvar95: number;
  cvar99: number;
  maxDrawdown: number;
  tailIndex: number;
  skewness: number;
  kurtosis: number;
}

export interface EVTParams {
  threshold: number;
  scale: number;
  shape: number; // ξ > 0 heavy tail
  exceedances: number;
}

export interface StressScenario {
  name: string;
  shockPercent: number;
  probability: number;
  portfolioImpact: number;
  hedgeBenefit: number;
}

export interface HedgeStrategy {
  type: 'put_spread' | 'collar' | 'tail_hedge' | 'variance_swap';
  cost: number;
  maxProtection: number;
  protectionRange: [number, number]; // % from current
  breakeven: number;
}

export interface OptimalHedge {
  strategy: HedgeStrategy;
  hedgeRatio: number;
  expectedCost: number;
  expectedBenefit: number;
  costBenefitRatio: number;
  residualRisk: number;
}

export class TailRiskHedgeEngine {
  /**
   * 计算尾部风险指标
   */
  calculateTailRisk(returns: number[]): TailRiskMetrics {
    if (returns.length < 10) {
      return { var95: 0, var99: 0, cvar95: 0, cvar99: 0, maxDrawdown: 0, tailIndex: 0, skewness: 0, kurtosis: 0 };
    }

    const sorted = [...returns].sort((a, b) => a - b);
    const n = sorted.length;

    const var95 = sorted[Math.floor(n * 0.05)] || 0;
    const var99 = sorted[Math.floor(n * 0.01)] || 0;

    // CVaR = mean of returns below VaR
    const below95 = sorted.filter(r => r <= var95);
    const below99 = sorted.filter(r => r <= var99);
    const cvar95 = below95.length > 0 ? below95.reduce((s, v) => s + v, 0) / below95.length : var95;
    const cvar99 = below99.length > 0 ? below99.reduce((s, v) => s + v, 0) / below99.length : var99;

    // Max drawdown from cumulative returns
    const cumReturns: number[] = [1];
    for (const r of returns) cumReturns.push(cumReturns[cumReturns.length - 1] * (1 + r));
    let peak = cumReturns[0], maxDD = 0;
    for (const c of cumReturns) {
      peak = Math.max(peak, c);
      maxDD = Math.min(maxDD, (c - peak) / peak);
    }

    // Skewness and kurtosis
    const mean = returns.reduce((s, v) => s + v, 0) / n;
    const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    const std = Math.sqrt(variance);

    const skewness = std > 0 ? returns.reduce((s, v) => s + ((v - mean) / std) ** 3, 0) / n : 0;
    const kurtosis = std > 0 ? returns.reduce((s, v) => s + ((v - mean) / std) ** 4, 0) / n - 3 : 0;

    // Tail index (Hill estimator)
    const tailIndex = this.hillEstimator(sorted);

    return { var95, var99, cvar95, cvar99, maxDrawdown: maxDD, tailIndex, skewness, kurtosis };
  }

  /**
   * 极值理论 (GPD) 拟合
   */
  fitEVT(returns: number[], threshold?: number): EVTParams | null {
    if (returns.length < 20) return null;

    const sorted = [...returns].sort((a, b) => a - b);
    const q = threshold ?? sorted[Math.floor(sorted.length * 0.1)];

    const exceedances = sorted.filter(r => r < q).map(r => q - r);
    if (exceedances.length < 5) return null;

    // Method of moments for GPD
    const mean = exceedances.reduce((s, v) => s + v, 0) / exceedances.length;
    const variance = exceedances.reduce((s, v) => s + (v - mean) ** 2, 0) / exceedances.length;

    // ξ = 0.5 * (mean² / variance - 1)
    const shape = variance > 0 ? 0.5 * ((mean * mean) / variance - 1) : 0;
    // σ = 0.5 * mean * (1 + mean² / variance)
    const scale = mean * (1 + shape) / 2;

    return {
      threshold: q,
      scale: Math.max(1e-10, scale),
      shape,
      exceedances: exceedances.length
    };
  }

  /**
   * 压力测试场景
   */
  stressTest(
    portfolioValue: number,
    weights: Map<string, number>,
    scenarios: Array<{ name: string; shocks: Map<string, number>; probability: number }>
  ): StressScenario[] {
    return scenarios.map(scenario => {
      let portfolioImpact = 0;
      weights.forEach((w, asset) => {
        const shock = scenario.shocks.get(asset) || 0;
        portfolioImpact += w * shock;
      });

      return {
        name: scenario.name,
        shockPercent: portfolioImpact,
        probability: scenario.probability,
        portfolioImpact: portfolioValue * portfolioImpact,
        hedgeBenefit: Math.abs(portfolioValue * portfolioImpact) * 0.7 // Assume hedge covers 70%
      };
    });
  }

  /**
   * 保护性看跌期权策略
   */
  evaluatePutProtection(
    spotPrice: number,
    putStrike: number,
    putPremium: number,
    notional: number
  ): HedgeStrategy {
    const protectionPct = (spotPrice - putStrike) / spotPrice;
    const maxProtection = notional * protectionPct;
    const cost = putPremium * notional / spotPrice;

    return {
      type: 'put_spread',
      cost,
      maxProtection,
      protectionRange: [-protectionPct * 100, 0],
      breakeven: spotPrice + putPremium
    };
  }

  /**
   * 领口策略 (Collar)
   */
  evaluateCollar(
    spotPrice: number,
    putStrike: number,
    callStrike: number,
    putPremium: number,
    callPremium: number,
    notional: number
  ): HedgeStrategy {
    const netCost = (putPremium - callPremium) * notional / spotPrice;
    const protectionPct = (spotPrice - putStrike) / spotPrice;
    const upsideCap = (callStrike - spotPrice) / spotPrice;

    return {
      type: 'collar',
      cost: Math.max(0, netCost),
      maxProtection: notional * protectionPct,
      protectionRange: [-protectionPct * 100, upsideCap * 100],
      breakeven: spotPrice + netCost
    };
  }

  /**
   * 优化对冲比率
   */
  optimizeHedgeRatio(
    portfolioReturns: number[],
    hedgeReturns: number[],
    maxRatio: number = 1.0
  ): OptimalHedge | null {
    if (portfolioReturns.length !== hedgeReturns.length || portfolioReturns.length < 10) return null;

    const n = portfolioReturns.length;
    let bestRatio = 0;
    let bestScore = -Infinity;

    for (let ratio = 0; ratio <= maxRatio; ratio += 0.05) {
      const hedged = portfolioReturns.map((r, i) => r + ratio * hedgeReturns[i]);
      const metrics = this.calculateTailRisk(hedged);
      const cost = ratio * 0.001; // cost per unit of hedge

      // Score: maximize reduction in CVaR minus cost
      const portfolioMetrics = this.calculateTailRisk(portfolioReturns);
      const benefit = portfolioMetrics.cvar95 - metrics.cvar95;
      const score = benefit - cost;

      if (score > bestScore) {
        bestScore = score;
        bestRatio = ratio;
      }
    }

    const hedged = portfolioReturns.map((r, i) => r + bestRatio * hedgeReturns[i]);
    const portfolioMetrics = this.calculateTailRisk(portfolioReturns);
    const hedgedMetrics = this.calculateTailRisk(hedged);

    return {
      strategy: {
        type: 'tail_hedge',
        cost: bestRatio * 0.001 * n,
        maxProtection: Math.abs(portfolioMetrics.cvar95 - hedgedMetrics.cvar95),
        protectionRange: [hedgedMetrics.var95 * 100, 0],
        breakeven: 0
      },
      hedgeRatio: bestRatio,
      expectedCost: bestRatio * 0.001 * n,
      expectedBenefit: Math.abs(portfolioMetrics.cvar95 - hedgedMetrics.cvar95),
      costBenefitRatio: bestRatio > 0 ? Math.abs(portfolioMetrics.cvar95 - hedgedMetrics.cvar95) / (bestRatio * 0.001 * n || 1) : 0,
      residualRisk: Math.abs(hedgedMetrics.cvar95)
    };
  }

  /**
   * 期望亏空 (Expected Shortfall) 计算
   */
  expectedShortfall(returns: number[], alpha: number = 0.05): number {
    if (returns.length === 0) return 0;
    const sorted = [...returns].sort((a, b) => a - b);
    const cutoff = Math.floor(returns.length * alpha);
    if (cutoff === 0) return sorted[0];
    const tail = sorted.slice(0, cutoff);
    return tail.reduce((s, v) => s + v, 0) / tail.length;
  }

  /**
   * 尾部依赖系数 (Clayton copula 简化)
   */
  tailDependence(returns1: number[], returns2: number[]): { lower: number; upper: number } {
    const n = Math.min(returns1.length, returns2.length);
    if (n < 20) return { lower: 0, upper: 0 };

    const threshold = 0.1; // Bottom/top 10%

    const ranks1 = this.toRanks(returns1.slice(0, n));
    const ranks2 = this.toRanks(returns2.slice(0, n));

    let lowerCount = 0, upperCount = 0;
    for (let i = 0; i < n; i++) {
      if (ranks1[i] < threshold && ranks2[i] < threshold) lowerCount++;
      if (ranks1[i] > 1 - threshold && ranks2[i] > 1 - threshold) upperCount++;
    }

    return {
      lower: lowerCount / (n * threshold),
      upper: upperCount / (n * threshold)
    };
  }

  // Private helpers
  private hillEstimator(sorted: number[]): number {
    const n = sorted.length;
    if (n < 10) return 0;
    const k = Math.floor(n * 0.1);
    const threshold = sorted[n - k];
    const exceedances = sorted.slice(n - k).filter(v => v > threshold);
    if (exceedances.length < 2) return 0;

    const logRatios = exceedances.map(v => Math.log(v / threshold));
    const mean = logRatios.reduce((s, v) => s + v, 0) / logRatios.length;
    return mean > 0 ? 1 / mean : 0;
  }

  private toRanks(data: number[]): number[] {
    const indexed = data.map((v, i) => ({ v, i }));
    indexed.sort((a, b) => a.v - b.v);
    const ranks = Array(data.length).fill(0);
    indexed.forEach((item, rank) => {
      ranks[item.i] = rank / data.length;
    });
    return ranks;
  }
}
