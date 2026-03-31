/**
 * 风险预算引擎
 * - VaR/CVaR计算 (历史/参数/蒙特卡洛)
 * - 最大回撤控制
 * - 风险预算分配
 * - 相关性风险监控
 * - 压力测试
 */

export interface Position {
  symbol: string;
  weight: number;
  returns: number[];
  sector?: string;
}

export interface RiskMetrics {
  var95: number;
  var99: number;
  cvar95: number;
  cvar99: number;
  maxDrawdown: number;
  currentDrawdown: number;
  volatility: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  beta: number;
  trackingError: number;
  informationRatio: number;
}

export interface RiskBudget {
  totalBudget: number;
  allocations: Array<{
    sector: string;
    allocated: number;
    used: number;
    utilization: number;
    breach: boolean;
  }>;
  diversificationScore: number;
  concentrationRisk: number;
}

export interface StressTestScenario {
  name: string;
  description: string;
  shocks: Record<string, number>; // symbol -> return shock
}

export interface StressTestResult {
  scenario: string;
  portfolioImpact: number;
  worstPosition: { symbol: string; loss: number };
  breachesLimit: boolean;
}

export interface CorrelationRisk {
  avgCorrelation: number;
  maxCorrelation: number;
  correlationPairs: Array<{
    pair: [string, string];
    correlation: number;
    risk: 'low' | 'medium' | 'high';
  }>;
  diversificationRatio: number;
}

export class RiskBudgetEngine {
  /**
   * 参数法VaR
   */
  parametricVaR(returns: number[], confidence: number = 0.95, horizon: number = 1): number {
    if (returns.length < 10) return 0;

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
    const std = Math.sqrt(variance);

    // Z-score for confidence level
    const zScore = confidence === 0.95 ? 1.645 : confidence === 0.99 ? 2.326 : 1.645;

    return -(mean - zScore * std * Math.sqrt(horizon));
  }

  /**
   * 历史模拟法VaR
   */
  historicalVaR(returns: number[], confidence: number = 0.95): number {
    if (returns.length < 10) return 0;

    const sorted = [...returns].sort((a, b) => a - b);
    const index = Math.floor((1 - confidence) * sorted.length);

    return -sorted[index];
  }

  /**
   * 蒙特卡洛VaR
   */
  monteCarloVaR(returns: number[], confidence: number = 0.95, simulations: number = 10000, horizon: number = 1): number {
    if (returns.length < 20) return 0;

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const std = Math.sqrt(returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length);

    const simulatedPnL: number[] = [];

    for (let i = 0; i < simulations; i++) {
      let cumulativeReturn = 0;
      for (let h = 0; h < horizon; h++) {
        // Box-Muller transform
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        cumulativeReturn += mean + std * z;
      }
      simulatedPnL.push(cumulativeReturn);
    }

    simulatedPnL.sort((a, b) => a - b);
    const index = Math.floor((1 - confidence) * simulatedPnL.length);

    return -simulatedPnL[index];
  }

  /**
   * CVaR (Expected Shortfall)
   */
  calculateCVaR(returns: number[], confidence: number = 0.95): number {
    if (returns.length < 10) return 0;

    const sorted = [...returns].sort((a, b) => a - b);
    const cutoffIndex = Math.floor((1 - confidence) * sorted.length);
    const tailReturns = sorted.slice(0, cutoffIndex + 1);

    if (tailReturns.length === 0) return 0;

    const avgTailReturn = tailReturns.reduce((a, b) => a + b, 0) / tailReturns.length;
    return -avgTailReturn;
  }

  /**
   * 计算组合最大回撤
   */
  calculateMaxDrawdown(returns: number[]): { maxDrawdown: number; currentDrawdown: number; peakIndex: number; troughIndex: number } {
    if (returns.length === 0) return { maxDrawdown: 0, currentDrawdown: 0, peakIndex: 0, troughIndex: 0 };

    let cumulative = 1;
    let peak = 1;
    let maxDD = 0;
    let currentDD = 0;
    let peakIdx = 0;
    let troughIdx = 0;
    let tempPeakIdx = 0;

    for (let i = 0; i < returns.length; i++) {
      cumulative *= (1 + returns[i]);

      if (cumulative > peak) {
        peak = cumulative;
        tempPeakIdx = i;
      }

      const dd = (peak - cumulative) / peak;
      if (dd > maxDD) {
        maxDD = dd;
        peakIdx = tempPeakIdx;
        troughIdx = i;
      }

      currentDD = dd;
    }

    return { maxDrawdown: maxDD, currentDrawdown: currentDD, peakIndex: peakIdx, troughIndex: troughIdx };
  }

  /**
   * 完整风险指标
   */
  calculateRiskMetrics(portfolioReturns: number[], benchmarkReturns?: number[], riskFreeRate: number = 0.025 / 252): RiskMetrics {
    const n = portfolioReturns.length;
    if (n < 10) {
      return {
        var95: 0, var99: 0, cvar95: 0, cvar99: 0,
        maxDrawdown: 0, currentDrawdown: 0, volatility: 0,
        sharpeRatio: 0, sortinoRatio: 0, calmarRatio: 0,
        beta: 0, trackingError: 0, informationRatio: 0
      };
    }

    const mean = portfolioReturns.reduce((a, b) => a + b, 0) / n;
    const variance = portfolioReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / n;
    const volatility = Math.sqrt(variance * 252);

    const var95 = this.historicalVaR(portfolioReturns, 0.95);
    const var99 = this.historicalVaR(portfolioReturns, 0.99);
    const cvar95 = this.calculateCVaR(portfolioReturns, 0.95);
    const cvar99 = this.calculateCVaR(portfolioReturns, 0.99);

    const { maxDrawdown, currentDrawdown } = this.calculateMaxDrawdown(portfolioReturns);

    const annualizedReturn = mean * 252;
    const sharpeRatio = volatility === 0 ? 0 : (annualizedReturn - riskFreeRate * 252) / volatility;

    // Sortino ratio
    const downsideReturns = portfolioReturns.filter(r => r < riskFreeRate);
    const downsideVariance = downsideReturns.reduce((sum, r) => sum + (r - riskFreeRate) ** 2, 0) / n;
    const downsideDeviation = Math.sqrt(downsideVariance * 252);
    const sortinoRatio = downsideDeviation === 0 ? 0 : (annualizedReturn - riskFreeRate * 252) / downsideDeviation;

    // Calmar ratio
    const calmarRatio = maxDrawdown === 0 ? 0 : annualizedReturn / maxDrawdown;

    // Beta and tracking error (if benchmark provided)
    let beta = 0;
    let trackingError = 0;
    let informationRatio = 0;

    if (benchmarkReturns && benchmarkReturns.length >= n) {
      const benchN = Math.min(n, benchmarkReturns.length);
      const benchMean = benchmarkReturns.slice(0, benchN).reduce((a, b) => a + b, 0) / benchN;

      let covariance = 0;
      let benchVariance = 0;
      const activeReturns: number[] = [];

      for (let i = 0; i < benchN; i++) {
        covariance += (portfolioReturns[i] - mean) * (benchmarkReturns[i] - benchMean);
        benchVariance += (benchmarkReturns[i] - benchMean) ** 2;
        activeReturns.push(portfolioReturns[i] - benchmarkReturns[i]);
      }

      beta = benchVariance === 0 ? 0 : (covariance / benchN) / (benchVariance / benchN);

      const activeMean = activeReturns.reduce((a, b) => a + b, 0) / activeReturns.length;
      const teSquared = activeReturns.reduce((sum, r) => sum + (r - activeMean) ** 2, 0) / activeReturns.length;
      trackingError = Math.sqrt(teSquared * 252);
      informationRatio = trackingError === 0 ? 0 : (activeMean * 252) / trackingError;
    }

    return {
      var95, var99, cvar95, cvar99,
      maxDrawdown, currentDrawdown, volatility,
      sharpeRatio, sortinoRatio, calmarRatio,
      beta, trackingError, informationRatio
    };
  }

  /**
   * 风险预算分配
   */
  calculateRiskBudget(positions: Position[], totalBudget: number): RiskBudget {
    const allocations: RiskBudget['allocations'] = [];
    const sectorMap: Map<string, { allocated: number; used: number }> = new Map();

    for (const pos of positions) {
      const sector = pos.sector || 'other';
      if (!sectorMap.has(sector)) sectorMap.set(sector, { allocated: 0, used: 0 });

      const vol = this.std(pos.returns);
      const riskContribution = Math.abs(pos.weight) * vol;
      const sectorData = sectorMap.get(sector)!;

      sectorData.allocated += Math.abs(pos.weight) * totalBudget;
      sectorData.used += riskContribution * totalBudget;
    }

    for (const [sector, data] of sectorMap) {
      allocations.push({
        sector,
        allocated: data.allocated,
        used: data.used,
        utilization: data.allocated > 0 ? data.used / data.allocated : 0,
        breach: data.used > data.allocated
      });
    }

    // Diversification score (Herfindahl)
    const weights = positions.map(p => Math.abs(p.weight));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const normalizedWeights = weights.map(w => totalWeight > 0 ? w / totalWeight : 0);
    const hhi = normalizedWeights.reduce((sum, w) => sum + w ** 2, 0);
    const diversificationScore = 1 - hhi;

    const concentrationRisk = hhi;

    return {
      totalBudget,
      allocations,
      diversificationScore,
      concentrationRisk
    };
  }

  /**
   * 相关性风险分析
   */
  analyzeCorrelationRisk(positions: Position[]): CorrelationRisk {
    if (positions.length < 2) {
      return { avgCorrelation: 0, maxCorrelation: 0, correlationPairs: [], diversificationRatio: 1 };
    }

    const pairs: CorrelationRisk['correlationPairs'] = [];
    let totalCorr = 0;
    let maxCorr = 0;

    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const corr = this.correlation(positions[i].returns, positions[j].returns);
        totalCorr += corr;
        maxCorr = Math.max(maxCorr, Math.abs(corr));

        let risk: 'low' | 'medium' | 'high' = 'low';
        if (Math.abs(corr) > 0.7) risk = 'high';
        else if (Math.abs(corr) > 0.4) risk = 'medium';

        pairs.push({
          pair: [positions[i].symbol, positions[j].symbol],
          correlation: corr,
          risk
        });
      }
    }

    const numPairs = (positions.length * (positions.length - 1)) / 2;
    const avgCorrelation = numPairs > 0 ? totalCorr / numPairs : 0;

    // Diversification ratio
    const portfolioVol = Math.sqrt(
      positions.reduce((sum, p) => sum + (p.weight * this.std(p.returns)) ** 2, 0)
    );
    const weightedAvgVol = positions.reduce((sum, p) => sum + Math.abs(p.weight) * this.std(p.returns), 0);
    const diversificationRatio = portfolioVol === 0 ? 1 : weightedAvgVol / portfolioVol;

    return {
      avgCorrelation,
      maxCorrelation: maxCorr,
      correlationPairs: pairs.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)),
      diversificationRatio
    };
  }

  /**
   * 压力测试
   */
  stressTest(positions: Position[], scenarios: StressTestScenario[]): StressTestResult[] {
    return scenarios.map(scenario => {
      let portfolioImpact = 0;
      let worstLoss = 0;
      let worstSymbol = '';

      for (const pos of positions) {
        const shock = scenario.shocks[pos.symbol] || 0;
        const impact = pos.weight * shock;
        portfolioImpact += impact;

        if (impact < worstLoss) {
          worstLoss = impact;
          worstSymbol = pos.symbol;
        }
      }

      return {
        scenario: scenario.name,
        portfolioImpact,
        worstPosition: { symbol: worstSymbol, loss: worstLoss },
        breachesLimit: Math.abs(portfolioImpact) > 0.1 // 10% loss limit
      };
    });
  }

  // --- Utility ---

  private std(data: number[]): number {
    if (data.length === 0) return 0;
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    return Math.sqrt(data.reduce((sum, v) => sum + (v - mean) ** 2, 0) / data.length);
  }

  private correlation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 5) return 0;

    const meanX = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const meanY = y.slice(0, n).reduce((a, b) => a + b, 0) / n;

    let cov = 0;
    let varX = 0;
    let varY = 0;

    for (let i = 0; i < n; i++) {
      cov += (x[i] - meanX) * (y[i] - meanY);
      varX += (x[i] - meanX) ** 2;
      varY += (y[i] - meanY) ** 2;
    }

    const denom = Math.sqrt(varX * varY);
    return denom === 0 ? 0 : cov / denom;
  }
}

export default new RiskBudgetEngine();
