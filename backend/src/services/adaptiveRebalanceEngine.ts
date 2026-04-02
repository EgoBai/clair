/**
 * 自适应组合再平衡引擎
 * - 阈值触发再平衡
 * - 时间触发再平衡
 * - 漂移容忍度优化
 * - 交易成本敏感再平衡
 * - 风险预算再平衡
 * - 税损收割策略
 */

export interface PortfolioWeight {
  asset: string;
  target: number;
  current: number;
  drift: number;
}

export interface RebalanceTrade {
  asset: string;
  action: 'buy' | 'sell';
  amount: number;
  currentValue: number;
  targetValue: number;
  estimatedCost: number;
}

export interface RebalanceSignal {
  shouldRebalance: boolean;
  trigger: 'threshold' | 'time' | 'risk' | 'cost' | 'none';
  urgency: number; // 0-1
  trades: RebalanceTrade[];
  totalTurnover: number;
  estimatedCost: number;
}

export interface DriftTolerance {
  asset: string;
  lowerBound: number;
  upperBound: number;
  currentDrift: number;
  isBreached: boolean;
}

export interface TaxLot {
  asset: string;
  quantity: number;
  costBasis: number;
  currentPrice: number;
  purchaseDate: string;
  unrealizedGain: number;
  isLongTerm: boolean;
}

export interface TaxLossHarvestResult {
  harvestedLoss: number;
  trades: RebalanceTrade[];
  washSaleRisk: string[];
  netTaxBenefit: number;
}

export class AdaptiveRebalanceEngine {
  /**
   * 阈值触发再平衡
   */
  thresholdRebalance(
    weights: PortfolioWeight[],
    totalValue: number,
    driftThreshold: number = 0.05,
    transactionCostRate: number = 0.001
  ): RebalanceSignal {
    const trades: RebalanceTrade[] = [];
    let totalTurnover = 0;
    let maxDrift = 0;

    for (const w of weights) {
      const drift = Math.abs(w.current - w.target);
      maxDrift = Math.max(maxDrift, drift);

      if (drift > driftThreshold) {
        const targetValue = w.target * totalValue;
        const currentValue = w.current * totalValue;
        const amount = targetValue - currentValue;

        trades.push({
          asset: w.asset,
          action: amount > 0 ? 'buy' : 'sell',
          amount: Math.abs(amount),
          currentValue,
          targetValue,
          estimatedCost: Math.abs(amount) * transactionCostRate
        });

        totalTurnover += Math.abs(amount);
      }
    }

    const estimatedCost = trades.reduce((s, t) => s + t.estimatedCost, 0);
    const shouldRebalance = trades.length > 0 &&
      estimatedCost < totalTurnover * 0.01; // Cost < 1% of turnover

    return {
      shouldRebalance,
      trigger: shouldRebalance ? 'threshold' : 'none',
      urgency: Math.min(1, maxDrift / (driftThreshold * 3)),
      trades,
      totalTurnover,
      estimatedCost
    };
  }

  /**
   * 时间触发再平衡
   */
  timeRebalance(
    weights: PortfolioWeight[],
    totalValue: number,
    daysSinceLast: number,
    targetInterval: number = 30,
    transactionCostRate: number = 0.001
  ): RebalanceSignal {
    const shouldRebalance = daysSinceLast >= targetInterval;
    if (!shouldRebalance) {
      return { shouldRebalance: false, trigger: 'time', urgency: daysSinceLast / targetInterval, trades: [], totalTurnover: 0, estimatedCost: 0 };
    }

    return this.thresholdRebalance(weights, totalValue, 0.001, transactionCostRate);
  }

  /**
   * 漂移容忍度计算
   */
  calculateDriftTolerance(
    weights: PortfolioWeight[],
    volatility: Map<string, number>,
    maxTurnover: number = 0.1
  ): DriftTolerance[] {
    return weights.map(w => {
      const vol = volatility.get(w.asset) || 0.02;
      // Higher volatility → wider tolerance
      const baseTolerance = 0.03 + vol * 0.5;
      const turnoverConstraint = maxTurnover / weights.length;
      const tolerance = Math.min(baseTolerance, turnoverConstraint);

      return {
        asset: w.asset,
        lowerBound: -tolerance,
        upperBound: tolerance,
        currentDrift: w.drift,
        isBreached: Math.abs(w.drift) > tolerance
      };
    });
  }

  /**
   * 风险预算再平衡
   */
  riskBudgetRebalance(
    weights: PortfolioWeight[],
    totalValue: number,
    covariance: number[][],
    riskBudgets: number[], // Target risk contribution per asset
    transactionCostRate: number = 0.001
  ): RebalanceSignal {
    const n = weights.length;
    if (covariance.length !== n || riskBudgets.length !== n) {
      return { shouldRebalance: false, trigger: 'risk', urgency: 0, trades: [], totalTurnover: 0, estimatedCost: 0 };
    }

    // Current risk contributions
    const currentWeights = weights.map(w => w.current);
    const riskContribs = this.computeRiskContributions(currentWeights, covariance);
    const targetRC = riskBudgets.map(rb => rb / riskBudgets.reduce((s, v) => s + v, 0));

    // Check deviation
    let maxDev = 0;
    for (let i = 0; i < n; i++) {
      maxDev = Math.max(maxDev, Math.abs(riskContribs[i] - targetRC[i]));
    }

    const urgency = Math.min(1, maxDev * 5);
    const shouldRebalance = maxDev > 0.05;

    const trades: RebalanceTrade[] = [];
    let totalTurnover = 0;

    if (shouldRebalance) {
      // Simple adjustment: move weights toward target risk contribution
      for (let i = 0; i < n; i++) {
        const adjust = (targetRC[i] - riskContribs[i]) * 0.5;
        const newTarget = Math.max(0, currentWeights[i] + adjust);
        const amount = (newTarget - currentWeights[i]) * totalValue;

        if (Math.abs(amount) > totalValue * 0.001) {
          trades.push({
            asset: weights[i].asset,
            action: amount > 0 ? 'buy' : 'sell',
            amount: Math.abs(amount),
            currentValue: currentWeights[i] * totalValue,
            targetValue: newTarget * totalValue,
            estimatedCost: Math.abs(amount) * transactionCostRate
          });
          totalTurnover += Math.abs(amount);
        }
      }
    }

    return {
      shouldRebalance,
      trigger: shouldRebalance ? 'risk' : 'none',
      urgency,
      trades,
      totalTurnover,
      estimatedCost: trades.reduce((s, t) => s + t.estimatedCost, 0)
    };
  }

  /**
   * 税损收割
   */
  taxLossHarvest(
    lots: TaxLot[],
    replacementAssets: Map<string, string>, // asset → replacement
    taxRate: number = 0.25,
    minLoss: number = 100
  ): TaxLossHarvestResult {
    const trades: RebalanceTrade[] = [];
    const washSaleRisk: string[] = [];
    let harvestedLoss = 0;

    const losers = lots
      .filter(l => l.unrealizedGain < -minLoss)
      .sort((a, b) => a.unrealizedGain - b.unrealizedGain);

    for (const lot of losers) {
      const loss = Math.abs(lot.unrealizedGain);
      const replacement = replacementAssets.get(lot.asset);

      // Check wash sale risk (buying same asset within 30 days)
      if (!lot.isLongTerm && lot.purchaseDate) {
        const purchaseDate = new Date(lot.purchaseDate);
        const daysSince = (Date.now() - purchaseDate.getTime()) / (1000 * 3600 * 24);
        if (daysSince < 30) {
          washSaleRisk.push(lot.asset);
        }
      }

      trades.push({
        asset: lot.asset,
        action: 'sell',
        amount: lot.quantity * lot.currentPrice,
        currentValue: lot.quantity * lot.currentPrice,
        targetValue: 0,
        estimatedCost: lot.quantity * lot.currentPrice * 0.001
      });

      harvestedLoss += loss;

      // Buy replacement
      if (replacement) {
        trades.push({
          asset: replacement,
          action: 'buy',
          amount: lot.quantity * lot.currentPrice,
          currentValue: 0,
          targetValue: lot.quantity * lot.currentPrice,
          estimatedCost: lot.quantity * lot.currentPrice * 0.001
        });
      }
    }

    const netTaxBenefit = harvestedLoss * taxRate - trades.reduce((s, t) => s + t.estimatedCost, 0);

    return { harvestedLoss, trades, washSaleRisk, netTaxBenefit: Math.max(0, netTaxBenefit) };
  }

  /**
   * 最优再平衡频率分析
   */
  optimalFrequency(
    weights: PortfolioWeight[],
    volatility: Map<string, number>,
    transactionCostRate: number = 0.001,
    frequencies: number[] = [1, 7, 14, 30, 60, 90]
  ): { frequency: number; expectedCost: number; expectedDrift: number; score: number }[] {
    return frequencies.map(freq => {
      // Expected drift grows with sqrt(time)
      const avgVol = weights.reduce((s, w) => {
        const vol = volatility.get(w.asset) || 0.02;
        return s + vol * w.target;
      }, 0);
      const expectedDrift = avgVol * Math.sqrt(freq / 252);

      // Expected transaction cost per rebalance
      const expectedTurnover = expectedDrift * 2;
      const expectedCost = expectedTurnover * transactionCostRate;

      // Score: minimize cost + drift penalty
      const score = 1 / (expectedCost * 252 / freq + expectedDrift * 10);

      return { frequency: freq, expectedCost, expectedDrift, score };
    });
  }

  /**
   * 计算风险贡献
   */
  private computeRiskContributions(weights: number[], covariance: number[][]): number[] {
    const n = weights.length;
    // Portfolio variance
    let portVar = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        portVar += weights[i] * weights[j] * (covariance[i]?.[j] || 0);
      }
    }
    if (portVar <= 0) return weights.map(() => 1 / n);

    const portVol = Math.sqrt(portVar);
    const riskContribs: number[] = [];

    for (let i = 0; i < n; i++) {
      let marginal = 0;
      for (let j = 0; j < n; j++) {
        marginal += weights[j] * (covariance[i]?.[j] || 0);
      }
      riskContribs.push(weights[i] * marginal / portVol);
    }

    // Normalize
    const total = riskContribs.reduce((s, v) => s + Math.abs(v), 0) || 1;
    return riskContribs.map(rc => Math.abs(rc) / total);
  }
}
