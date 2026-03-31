/**
 * Portfolio Rebalancing Engine
 *
 * Multiple rebalancing strategies: calendar, threshold, momentum-adaptive,
 * risk-parity, and tax-aware rebalancing.
 */

// ==================== Types ====================

export type RebalanceStrategy =
  | 'calendar'
  | 'threshold'
  | 'momentum'
  | 'risk-parity'
  | 'tax-aware'
  | 'cash-flow';

export interface Holding {
  symbol: string;
  targetWeight: number;
  currentWeight: number;
  costBasis: number;
  currentValue: number;
  unrealizedGain: number;
  sector?: string;
  assetClass?: string;
}

export interface RebalanceTrade {
  symbol: string;
  action: 'buy' | 'sell';
  shares: number;
  estimatedValue: number;
  currentWeight: number;
  targetWeight: number;
  taxImpact: number;
  urgency: number; // 0-1
}

export interface RebalancePlan {
  strategy: RebalanceStrategy;
  trades: RebalanceTrade[];
  totalTurnover: number;
  estimatedCost: number;
  taxImpact: number;
  expectedTrackingError: number;
  netBenefit: number;
  timestamp: string;
}

export interface ThresholdConfig {
  absolute: number; // e.g., 0.05 for 5%
  relative: number; // e.g., 0.20 for 20% relative deviation
}

export interface CalendarConfig {
  frequency: 'monthly' | 'quarterly' | 'semi-annual' | 'annual';
  lastRebalanceDate: string;
}

export interface TaxConfig {
  shortTermRate: number;
  longTermRate: number;
  taxLotMethod: 'fifo' | 'lifo' | 'highest-cost' | 'lowest-cost';
  harvestLossThreshold: number; // minimum loss to harvest
}

export interface DriftAnalysis {
  symbol: string;
  currentWeight: number;
  targetWeight: number;
  absoluteDrift: number;
  relativeDrift: number;
  needsRebalance: boolean;
}

export interface TurnoverAnalysis {
  totalTurnover: number;
  sectorTurnover: Record<string, number>;
  assetClassTurnover: Record<string, number>;
  estimatedCost: number;
}

export interface RebalanceMetrics {
  trackingError: number;
  informationRatio: number;
  sharpeImpact: number;
  taxEfficiency: number;
  turnoverRatio: number;
  costDrag: number;
}

// ==================== Helpers ====================

function abs(v: number): number { return Math.abs(v); }
function sum(arr: number[]): number { return arr.reduce((s, v) => s + v, 0); }

function estimateCommission(value: number): number {
  // Simplified: 0.1% of trade value, minimum 5
  return Math.max(5, Math.abs(value) * 0.001);
}

function estimateSpreadCost(value: number, liquidity: number = 1): number {
  // Simplified: 0.05% spread, adjusted by liquidity
  return Math.abs(value) * 0.0005 / Math.max(0.1, liquidity);
}

// ==================== Core Functions ====================

/**
 * Analyze portfolio drift from target weights
 */
export function analyzeDrift(holdings: Holding[]): DriftAnalysis[] {
  return holdings.map(h => {
    const absoluteDrift = h.currentWeight - h.targetWeight;
    const relativeDrift = h.targetWeight === 0
      ? (h.currentWeight === 0 ? 0 : Infinity)
      : absoluteDrift / h.targetWeight;

    return {
      symbol: h.symbol,
      currentWeight: h.currentWeight,
      targetWeight: h.targetWeight,
      absoluteDrift,
      relativeDrift,
      needsRebalance: abs(absoluteDrift) > 0.02 || abs(relativeDrift) > 0.1,
    };
  });
}

/**
 * Calendar-based rebalancing plan
 */
export function calendarRebalance(
  holdings: Holding[],
  portfolioValue: number,
  config: CalendarConfig,
  currentDate: string
): RebalancePlan {
  const lastDate = new Date(config.lastRebalanceDate);
  const now = new Date(currentDate);
  const daysSince = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);

  let needsRebalance = false;
  switch (config.frequency) {
    case 'monthly': needsRebalance = daysSince >= 30; break;
    case 'quarterly': needsRebalance = daysSince >= 90; break;
    case 'semi-annual': needsRebalance = daysSince >= 180; break;
    case 'annual': needsRebalance = daysSince >= 365; break;
  }

  if (!needsRebalance) {
    return {
      strategy: 'calendar',
      trades: [],
      totalTurnover: 0,
      estimatedCost: 0,
      taxImpact: 0,
      expectedTrackingError: 0,
      netBenefit: 0,
      timestamp: currentDate,
    };
  }

  return generateRebalancePlan(holdings, portfolioValue, 'calendar', currentDate);
}

/**
 * Threshold-based rebalancing
 */
export function thresholdRebalance(
  holdings: Holding[],
  portfolioValue: number,
  config: ThresholdConfig,
  currentDate: string
): RebalancePlan {
  const trades: RebalanceTrade[] = [];
  let totalTurnover = 0;
  let totalCost = 0;
  let totalTax = 0;

  for (const h of holdings) {
    const absDrift = abs(h.currentWeight - h.targetWeight);
    const relDrift = h.targetWeight === 0 ? 0 : absDrift / h.targetWeight;

    const absTriggered = absDrift > config.absolute;
    const relTriggered = relDrift > config.relative;

    if (absTriggered || relTriggered) {
      const targetValue = h.targetWeight * portfolioValue;
      const tradeValue = targetValue - h.currentValue;
      const action = tradeValue > 0 ? 'buy' : 'sell';
      const absValue = abs(tradeValue);

      // Tax impact for sells
      let taxImpact = 0;
      if (action === 'sell' && h.unrealizedGain > 0) {
        taxImpact = h.unrealizedGain * 0.2; // Simplified 20% rate
      }

      trades.push({
        symbol: h.symbol,
        action,
        shares: Math.floor(absValue / (h.currentValue / (portfolioValue * h.currentWeight || 1))),
        estimatedValue: absValue,
        currentWeight: h.currentWeight,
        targetWeight: h.targetWeight,
        taxImpact,
        urgency: absDrift / 0.1, // normalized urgency
      });

      totalTurnover += absValue;
      totalCost += estimateCommission(absValue) + estimateSpreadCost(absValue);
      totalTax += taxImpact;
    }
  }

  const trackingError = calculateTrackingError(holdings);
  const turnover = totalTurnover / portfolioValue;

  return {
    strategy: 'threshold',
    trades: trades.sort((a, b) => b.urgency - a.urgency),
    totalTurnover: turnover,
    estimatedCost: totalCost,
    taxImpact: totalTax,
    expectedTrackingError: trackingError,
    netBenefit: trackingError * portfolioValue * 0.5 - totalCost - totalTax,
    timestamp: currentDate,
  };
}

/**
 * Momentum-adaptive rebalancing
 */
export function momentumRebalance(
  holdings: Holding[],
  portfolioValue: number,
  momentumScores: Record<string, number>,
  currentDate: string
): RebalancePlan {
  const trades: RebalanceTrade[] = [];
  let totalTurnover = 0;
  let totalCost = 0;

  // Adjust target weights based on momentum
  const totalMomentum = Object.values(momentumScores).reduce((s, v) => s + Math.max(0, v), 0);

  for (const h of holdings) {
    const momentum = momentumScores[h.symbol] || 0;
    // Tilt: increase weight for positive momentum, decrease for negative
    const tilt = totalMomentum === 0 ? 0 : (momentum / totalMomentum) * 0.05;
    const adjustedTarget = Math.max(0, h.targetWeight + tilt);

    const tradeValue = (adjustedTarget - h.currentWeight) * portfolioValue;
    if (abs(tradeValue) > portfolioValue * 0.005) { // 0.5% minimum trade
      const action = tradeValue > 0 ? 'buy' : 'sell';
      const absValue = abs(tradeValue);

      trades.push({
        symbol: h.symbol,
        action,
        shares: 0,
        estimatedValue: absValue,
        currentWeight: h.currentWeight,
        targetWeight: adjustedTarget,
        taxImpact: action === 'sell' && h.unrealizedGain > 0 ? h.unrealizedGain * 0.2 : 0,
        urgency: abs(momentum) / 10,
      });

      totalTurnover += absValue;
      totalCost += estimateCommission(absValue) + estimateSpreadCost(absValue);
    }
  }

  return {
    strategy: 'momentum',
    trades: trades.sort((a, b) => b.urgency - a.urgency),
    totalTurnover: totalTurnover / portfolioValue,
    estimatedCost: totalCost,
    taxImpact: trades.reduce((s, t) => s + t.taxImpact, 0),
    expectedTrackingError: calculateTrackingError(holdings),
    netBenefit: 0,
    timestamp: currentDate,
  };
}

/**
 * Risk-parity rebalancing
 */
export function riskParityRebalance(
  holdings: Holding[],
  portfolioValue: number,
  volatilities: Record<string, number>,
  correlations: Record<string, Record<string, number>>,
  currentDate: string
): RebalancePlan {
  // Inverse-volatility weighting
  const invVols: Record<string, number> = {};
  let totalInvVol = 0;

  for (const h of holdings) {
    const vol = volatilities[h.symbol] || 0.2;
    invVols[h.symbol] = 1 / vol;
    totalInvVol += invVols[h.symbol];
  }

  // Correlation adjustment: reduce weight if highly correlated with others
  const adjustedWeights: Record<string, number> = {};
  for (const h of holdings) {
    let avgCorr = 0;
    let corrCount = 0;
    for (const other of holdings) {
      if (other.symbol !== h.symbol) {
        avgCorr += correlations[h.symbol]?.[other.symbol] || 0;
        corrCount++;
      }
    }
    avgCorr = corrCount > 0 ? avgCorr / corrCount : 0;

    // Penalize high correlation
    const corrAdj = 1 - Math.max(0, avgCorr) * 0.3;
    adjustedWeights[h.symbol] = (invVols[h.symbol] / totalInvVol) * corrAdj;
  }

  // Normalize
  const totalAdj = sum(Object.values(adjustedWeights));
  for (const sym of Object.keys(adjustedWeights)) {
    adjustedWeights[sym] /= totalAdj;
  }

  // Generate trades
  const trades: RebalanceTrade[] = [];
  let totalTurnover = 0;
  let totalCost = 0;

  for (const h of holdings) {
    const newTarget = adjustedWeights[h.symbol];
    const tradeValue = (newTarget - h.currentWeight) * portfolioValue;

    if (abs(tradeValue) > portfolioValue * 0.005) {
      const action = tradeValue > 0 ? 'buy' : 'sell';
      const absValue = abs(tradeValue);

      trades.push({
        symbol: h.symbol,
        action,
        shares: 0,
        estimatedValue: absValue,
        currentWeight: h.currentWeight,
        targetWeight: newTarget,
        taxImpact: action === 'sell' && h.unrealizedGain > 0 ? h.unrealizedGain * 0.2 : 0,
        urgency: abs(h.currentWeight - newTarget) / 0.05,
      });

      totalTurnover += absValue;
      totalCost += estimateCommission(absValue) + estimateSpreadCost(absValue);
    }
  }

  return {
    strategy: 'risk-parity',
    trades: trades.sort((a, b) => b.urgency - a.urgency),
    totalTurnover: totalTurnover / portfolioValue,
    estimatedCost: totalCost,
    taxImpact: trades.reduce((s, t) => s + t.taxImpact, 0),
    expectedTrackingError: calculateTrackingError(holdings),
    netBenefit: 0,
    timestamp: currentDate,
  };
}

/**
 * Tax-aware rebalancing with loss harvesting
 */
export function taxAwareRebalance(
  holdings: Holding[],
  portfolioValue: number,
  taxConfig: TaxConfig,
  currentDate: string
): RebalancePlan {
  const trades: RebalanceTrade[] = [];
  let totalTurnover = 0;
  let totalCost = 0;
  let totalTaxSaved = 0;

  // First pass: harvest losses
  for (const h of holdings) {
    if (h.unrealizedGain < -taxConfig.harvestLossThreshold) {
      // Tax loss harvesting opportunity
      const lossAmount = abs(h.unrealizedGain);
      const taxSaved = lossAmount * taxConfig.shortTermRate; // Assume short-term for max benefit

      trades.push({
        symbol: h.symbol,
        action: 'sell',
        shares: 0,
        estimatedValue: h.currentValue,
        currentWeight: h.currentWeight,
        targetWeight: 0, // temporary exit
        taxImpact: -taxSaved, // negative = savings
        urgency: 0.9,
      });

      totalTaxSaved += taxSaved;
      totalTurnover += h.currentValue;
    }
  }

  // Second pass: rebalance winners with lowest tax impact
  for (const h of holdings) {
    if (h.unrealizedGain >= 0) {
      const drift = abs(h.currentWeight - h.targetWeight);
      if (drift > 0.02) {
        const tradeValue = (h.targetWeight - h.currentWeight) * portfolioValue;
        const action = tradeValue > 0 ? 'buy' : 'sell';
        const absValue = abs(tradeValue);

        // For sells, minimize tax impact
        let taxImpact = 0;
        if (action === 'sell') {
          const gainRatio = h.unrealizedGain / h.currentValue;
          taxImpact = gainRatio * absValue * taxConfig.longTermRate;
        }

        trades.push({
          symbol: h.symbol,
          action,
          shares: 0,
          estimatedValue: absValue,
          currentWeight: h.currentWeight,
          targetWeight: h.targetWeight,
          taxImpact,
          urgency: drift > 0.05 ? 0.7 : 0.3,
        });

        totalTurnover += absValue;
        totalCost += estimateCommission(absValue) + estimateSpreadCost(absValue);
      }
    }
  }

  const netTaxImpact = trades.reduce((s, t) => s + t.taxImpact, 0);

  return {
    strategy: 'tax-aware',
    trades: trades.sort((a, b) => b.urgency - a.urgency),
    totalTurnover: totalTurnover / portfolioValue,
    estimatedCost: totalCost,
    taxImpact: netTaxImpact,
    expectedTrackingError: calculateTrackingError(holdings),
    netBenefit: totalTaxSaved - totalCost,
    timestamp: currentDate,
  };
}

/**
 * Cash-flow rebalancing (use inflows/outflows to rebalance)
 */
export function cashFlowRebalance(
  holdings: Holding[],
  portfolioValue: number,
  cashFlow: number, // positive = inflow, negative = outflow
  currentDate: string
): RebalancePlan {
  const trades: RebalanceTrade[] = [];
  let totalTurnover = 0;
  let totalCost = 0;

  if (cashFlow > 0) {
    // Inflow: buy underweight positions first
    const underweight = holdings
      .filter(h => h.currentWeight < h.targetWeight)
      .sort((a, b) => (a.currentWeight / a.targetWeight) - (b.currentWeight / b.targetWeight));

    let remaining = cashFlow;
    for (const h of underweight) {
      if (remaining <= 0) break;
      const needed = (h.targetWeight - h.currentWeight) * portfolioValue;
      const buyAmount = Math.min(needed, remaining);

      if (buyAmount > 100) {
        trades.push({
          symbol: h.symbol,
          action: 'buy',
          shares: 0,
          estimatedValue: buyAmount,
          currentWeight: h.currentWeight,
          targetWeight: h.targetWeight,
          taxImpact: 0,
          urgency: 0.5,
        });
        remaining -= buyAmount;
        totalTurnover += buyAmount;
        totalCost += estimateCommission(buyAmount);
      }
    }
  } else {
    // Outflow: sell overweight positions first
    const outflowAmount = abs(cashFlow);
    const overweight = holdings
      .filter(h => h.currentWeight > h.targetWeight)
      .sort((a, b) => {
        // Prefer selling positions with losses (tax-efficient)
        const gainRatioA = a.unrealizedGain / a.currentValue;
        const gainRatioB = b.unrealizedGain / b.currentValue;
        return gainRatioA - gainRatioB;
      });

    let remaining = outflowAmount;
    for (const h of overweight) {
      if (remaining <= 0) break;
      const excess = (h.currentWeight - h.targetWeight) * portfolioValue + h.currentValue * 0.01;
      const sellAmount = Math.min(excess, remaining);

      if (sellAmount > 100) {
        trades.push({
          symbol: h.symbol,
          action: 'sell',
          shares: 0,
          estimatedValue: sellAmount,
          currentWeight: h.currentWeight,
          targetWeight: h.targetWeight,
          taxImpact: h.unrealizedGain > 0 ? (h.unrealizedGain / h.currentValue) * sellAmount * 0.2 : 0,
          urgency: 0.8,
        });
        remaining -= sellAmount;
        totalTurnover += sellAmount;
        totalCost += estimateCommission(sellAmount);
      }
    }
  }

  return {
    strategy: 'cash-flow',
    trades,
    totalTurnover: totalTurnover / portfolioValue,
    estimatedCost: totalCost,
    taxImpact: trades.reduce((s, t) => s + t.taxImpact, 0),
    expectedTrackingError: calculateTrackingError(holdings),
    netBenefit: -totalCost,
    timestamp: currentDate,
  };
}

/**
 * Generic rebalance plan generator
 */
export function generateRebalancePlan(
  holdings: Holding[],
  portfolioValue: number,
  strategy: RebalanceStrategy,
  currentDate: string
): RebalancePlan {
  const trades: RebalanceTrade[] = [];
  let totalTurnover = 0;
  let totalCost = 0;

  for (const h of holdings) {
    const tradeValue = (h.targetWeight - h.currentWeight) * portfolioValue;
    if (abs(tradeValue) > portfolioValue * 0.002) {
      const action = tradeValue > 0 ? 'buy' : 'sell';
      const absValue = abs(tradeValue);

      trades.push({
        symbol: h.symbol,
        action,
        shares: 0,
        estimatedValue: absValue,
        currentWeight: h.currentWeight,
        targetWeight: h.targetWeight,
        taxImpact: action === 'sell' && h.unrealizedGain > 0 ? h.unrealizedGain * 0.2 : 0,
        urgency: abs(h.currentWeight - h.targetWeight) / 0.05,
      });

      totalTurnover += absValue;
      totalCost += estimateCommission(absValue) + estimateSpreadCost(absValue);
    }
  }

  return {
    strategy,
    trades: trades.sort((a, b) => b.urgency - a.urgency),
    totalTurnover: totalTurnover / portfolioValue,
    estimatedCost: totalCost,
    taxImpact: trades.reduce((s, t) => s + t.taxImpact, 0),
    expectedTrackingError: calculateTrackingError(holdings),
    netBenefit: 0,
    timestamp: currentDate,
  };
}

/**
 * Calculate tracking error from target
 */
export function calculateTrackingError(holdings: Holding[]): number {
  if (holdings.length === 0) return 0;
  const drifts = holdings.map(h => h.currentWeight - h.targetWeight);
  const meanDrift = sum(drifts) / drifts.length;
  const variance = drifts.reduce((s, d) => s + (d - meanDrift) ** 2, 0) / drifts.length;
  return Math.sqrt(variance);
}

/**
 * Calculate turnover analysis
 */
export function calculateTurnover(
  plan: RebalancePlan,
  holdings: Holding[]
): TurnoverAnalysis {
  const sectorTurnover: Record<string, number> = {};
  const assetClassTurnover: Record<string, number> = {};

  for (const trade of plan.trades) {
    const holding = holdings.find(h => h.symbol === trade.symbol);
    if (holding) {
      if (holding.sector) {
        sectorTurnover[holding.sector] = (sectorTurnover[holding.sector] || 0) + trade.estimatedValue;
      }
      if (holding.assetClass) {
        assetClassTurnover[holding.assetClass] = (assetClassTurnover[holding.assetClass] || 0) + trade.estimatedValue;
      }
    }
  }

  return {
    totalTurnover: plan.totalTurnover,
    sectorTurnover,
    assetClassTurnover,
    estimatedCost: plan.estimatedCost,
  };
}

/**
 * Evaluate rebalancing metrics
 */
export function evaluateRebalanceMetrics(
  beforeHoldings: Holding[],
  afterHoldings: Holding[],
  portfolioValue: number
): RebalanceMetrics {
  const beforeTE = calculateTrackingError(beforeHoldings);
  const afterTE = calculateTrackingError(afterHoldings);

  const turnover = sum(
    afterHoldings.map((h, i) => abs(h.currentWeight - beforeHoldings[i].currentWeight))
  ) / 2;

  return {
    trackingError: afterTE,
    informationRatio: afterTE === 0 ? 0 : (beforeTE - afterTE) / afterTE,
    sharpeImpact: 0, // Would need return/vol data
    taxEfficiency: 1 - turnover * 0.2,
    turnoverRatio: turnover,
    costDrag: turnover * 0.002, // 20bps round-trip
  };
}

/**
 * Optimal rebalancing frequency analysis
 */
export function optimalRebalanceFrequency(
  dailyDrifts: number[][],
  transactionCosts: number = 0.002
): {
  frequency: string;
  avgDrift: number;
  avgCost: number;
  netBenefit: number;
}[] {
  const frequencies = [
    { name: 'daily', interval: 1 },
    { name: 'weekly', interval: 5 },
    { name: 'monthly', interval: 21 },
    { name: 'quarterly', interval: 63 },
    { name: 'semi-annual', interval: 126 },
    { name: 'annual', interval: 252 },
  ];

  return frequencies.map(f => {
    let totalDrift = 0;
    let totalCost = 0;
    let periods = 0;

    for (let i = f.interval; i < (dailyDrifts[0]?.length || 0); i += f.interval) {
      const driftAtPoint = sum(dailyDrifts.map(d => abs(d[i] || 0)));
      totalDrift += driftAtPoint;
      totalCost += transactionCosts;
      periods++;
    }

    const avgDrift = periods > 0 ? totalDrift / periods : 0;
    const avgCost = periods > 0 ? totalCost / periods : 0;

    return {
      frequency: f.name,
      avgDrift,
      avgCost,
      netBenefit: avgDrift * 0.5 - avgCost, // rough optimization
    };
  });
}
