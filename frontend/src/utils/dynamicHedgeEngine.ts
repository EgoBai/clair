/**
 * 动态对冲引擎
 * - Delta/Gamma/Vega对冲
 * - 对冲频率优化
 * - 交易成本控制
 * - 对冲比率动态调整
 * - 残差风险监控
 */
export interface OptionPosition {
  code: string;
  type: 'call' | 'put';
  strike: number;
  expiry: number; // 天数
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  position: number; // 合约数量
  underlyingPrice: number;
}

export interface HedgeInstrument {
  code: string;
  type: 'stock' | 'future' | 'option';
  delta: number;
  gamma: number;
  vega: number;
  costPerUnit: number;
}

export interface HedgeRequirement {
  targetDelta: number;
  targetGamma: number;
  targetVega: number;
  maxCost: number;
  rebalanceThreshold: number;
}

export interface HedgePlan {
  instruments: Array<{
    code: string;
    quantity: number;
    cost: number;
    deltaContrib: number;
    gammaContrib: number;
    vegaContrib: number;
  }>;
  totalDelta: number;
  totalGamma: number;
  totalVega: number;
  totalCost: number;
  residualRisk: {
    deltaRisk: number;
    gammaRisk: number;
    vegaRisk: number;
  };
  rebalanceNeeded: boolean;
  hedgeRatio: number;
}

export function computeDynamicHedge(
  positions: OptionPosition[],
  instruments: HedgeInstrument[],
  requirement: HedgeRequirement
): HedgePlan {
  // 计算组合希腊字母
  let portDelta = 0, portGamma = 0, portVega = 0;
  for (const p of positions) {
    portDelta += p.delta * p.position * 100;
    portGamma += p.gamma * p.position * 100;
    portVega += p.vega * p.position * 100;
  }

  // 需要对冲的量
  const deltaToHedge = requirement.targetDelta - portDelta;
  const gammaToHedge = requirement.targetGamma - portGamma;
  const vegaToHedge = requirement.targetVega - portVega;

  // 贪心对冲分配
  const hedgeInstruments: HedgePlan['instruments'] = [];
  let remainingDelta = deltaToHedge;
  let remainingGamma = gammaToHedge;
  let remainingVega = vegaToHedge;
  let totalCost = 0;

  // 优先用股票对冲Delta (最低成本)
  const stockInstruments = instruments.filter(i => i.type === 'stock');
  const optionInstruments = instruments.filter(i => i.type === 'option');

  for (const inst of stockInstruments) {
    if (Math.abs(remainingDelta) < requirement.rebalanceThreshold) break;
    if (totalCost > requirement.maxCost) break;
    
    const quantity = Math.round(remainingDelta / (inst.delta * 100));
    if (quantity === 0) continue;

    const cost = Math.abs(quantity) * inst.costPerUnit;
    if (totalCost + cost > requirement.maxCost) continue;

    hedgeInstruments.push({
      code: inst.code,
      quantity,
      cost,
      deltaContrib: quantity * inst.delta * 100,
      gammaContrib: quantity * inst.gamma * 100,
      vegaContrib: quantity * inst.vega * 100,
    });

    remainingDelta -= quantity * inst.delta * 100;
    remainingGamma -= quantity * inst.gamma * 100;
    remainingVega -= quantity * inst.vega * 100;
    totalCost += cost;
  }

  // 用期权对冲Gamma和Vega
  for (const inst of optionInstruments) {
    if (Math.abs(remainingGamma) < 0.01 && Math.abs(remainingVega) < 10) break;
    if (totalCost > requirement.maxCost) break;

    const gammaQty = inst.gamma !== 0 ? Math.round(remainingGamma / (inst.gamma * 100)) : 0;
    const vegaQty = inst.vega !== 0 ? Math.round(remainingVega / (inst.vega * 100)) : 0;
    const quantity = Math.abs(gammaQty) > Math.abs(vegaQty) ? gammaQty : vegaQty;
    if (quantity === 0) continue;

    const cost = Math.abs(quantity) * inst.costPerUnit;
    if (totalCost + cost > requirement.maxCost) continue;

    hedgeInstruments.push({
      code: inst.code,
      quantity,
      cost,
      deltaContrib: quantity * inst.delta * 100,
      gammaContrib: quantity * inst.gamma * 100,
      vegaContrib: quantity * inst.vega * 100,
    });

    remainingDelta -= quantity * inst.delta * 100;
    remainingGamma -= quantity * inst.gamma * 100;
    remainingVega -= quantity * inst.vega * 100;
    totalCost += cost;
  }

  const totalDelta = portDelta + hedgeInstruments.reduce((s, h) => s + h.deltaContrib, 0);
  const totalGamma = portGamma + hedgeInstruments.reduce((s, h) => s + h.gammaContrib, 0);
  const totalVega = portVega + hedgeInstruments.reduce((s, h) => s + h.vegaContrib, 0);

  const rebalanceNeeded = Math.abs(totalDelta - requirement.targetDelta) > requirement.rebalanceThreshold
    || Math.abs(totalGamma - requirement.targetGamma) > 0.1
    || Math.abs(totalVega - requirement.targetVega) > 50;

  const hedgeRatio = portDelta !== 0 ? 1 - Math.abs(totalDelta / portDelta) : 1;

  return {
    instruments: hedgeInstruments,
    totalDelta,
    totalGamma,
    totalVega,
    totalCost,
    residualRisk: {
      deltaRisk: Math.abs(totalDelta - requirement.targetDelta),
      gammaRisk: Math.abs(totalGamma - requirement.targetGamma),
      vegaRisk: Math.abs(totalVega - requirement.targetVega),
    },
    rebalanceNeeded,
    hedgeRatio: Math.max(0, Math.min(1, hedgeRatio)),
  };
}
