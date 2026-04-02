/**
 * TurnoverOptimizationEngine - 换手优化引擎
 * 在收益和换手成本之间找到最优平衡
 */

export interface TradeCost {
  commissionRate: number;
  slippageRate: number;
  marketImpact: number;
}

export interface TurnoverResult {
  optimalTurnover: number;
  expectedCost: number;
  netAlpha: number;
  costRatio: number;
  turnoverLimit: number;
}

export function optimizeTurnover(
  grossAlpha: number,
  currentTurnover: number,
  cost: TradeCost,
  alphaDecayRate: number = 0.02
): TurnoverResult | null {
  if (grossAlpha <= 0 || currentTurnover < 0) return null;
  const totalCostRate = cost.commissionRate + cost.slippageRate + cost.marketImpact;
  const marginalCost = totalCostRate * 2;
  const optimalTurnover = Math.max(0, Math.min(1, grossAlpha / (marginalCost + alphaDecayRate)));
  const expectedCost = optimalTurnover * totalCostRate;
  const netAlpha = grossAlpha * optimalTurnover - expectedCost;
  const costRatio = grossAlpha > 0 ? expectedCost / (grossAlpha * optimalTurnover || 1) : 1;
  const turnoverLimit = totalCostRate > 0 ? grossAlpha / totalCostRate : 1;

  return {
    optimalTurnover: Math.round(optimalTurnover * 10000) / 10000,
    expectedCost: Math.round(expectedCost * 10000) / 10000,
    netAlpha: Math.round(netAlpha * 10000) / 10000,
    costRatio: Math.round(costRatio * 10000) / 10000,
    turnoverLimit: Math.round(Math.min(1, turnoverLimit) * 10000) / 10000,
  };
}
