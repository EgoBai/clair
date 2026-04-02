/**
 * TransactionCostEngine - 交易成本模型引擎
 * 估算滑点、佣金、市场冲击成本
 */

export interface CostParams { commission: number; slippageBps: number; impactCoeff: number; }

export function estimateCost(volume: number, price: number, adv: number, params: CostParams): number {
  const tradeValue = volume * price;
  const commission = tradeValue * params.commission;
  const slippage = tradeValue * (params.slippageBps / 10000);
  const participation = adv > 0 ? volume / adv : 0;
  const impact = tradeValue * params.impactCoeff * Math.sqrt(participation);
  return commission + slippage + impact;
}

export function costAsPct(volume: number, price: number, adv: number, params: CostParams): number {
  const total = estimateCost(volume, price, adv, params);
  const value = volume * price;
  return value > 0 ? total / value : 0;
}

export function optimalExecutionSlice(totalShares: number, adv: number, maxParticipation: number): number[] {
  const maxSlice = adv * maxParticipation;
  if (maxSlice <= 0) return [totalShares];
  const slices: number[] = [];
  let remaining = totalShares;
  while (remaining > 0) {
    const slice = Math.min(remaining, maxSlice);
    slices.push(slice);
    remaining -= slice;
  }
  return slices;
}

export function compareExecutionStrategies(
  shares: number, price: number, adv: number, params: CostParams
): { aggressive: number; passive: number; optimal: number } {
  const aggressiveParams = { ...params, slippageBps: params.slippageBps * 2 };
  const passiveParams = { ...params, slippageBps: params.slippageBps * 0.5, commission: params.commission * 1.5 };
  return {
    aggressive: estimateCost(shares, price, adv, aggressiveParams),
    passive: estimateCost(shares, price, adv, passiveParams),
    optimal: estimateCost(shares, price, adv, params),
  };
}
