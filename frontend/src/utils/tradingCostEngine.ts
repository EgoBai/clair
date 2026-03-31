/**
 * 交易成本优化引擎
 * 滑点估算/冲击成本/最优拆单/执行算法选择/成本归因
 */

export interface OrderParams {
  ticker: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  urgency: 'low' | 'medium' | 'high' | 'immediate';
  orderType: 'market' | 'limit';
  timeConstraint?: number; // 期望完成时间(分钟)
}

export interface MarketCondition {
  ticker: string;
  avgDailyVolume: number;
  bidAskSpread: number;
  volatility: number;
  depth: { price: number; volume: number }[];
  participationRate: number; // 当前成交量占ADV比例
}

export interface CostEstimate {
  totalCost: number;
  breakdown: {
    commission: number;
    spread: number;
    slippage: number;
    impact: number;
    timing: number;
  };
  costBps: number;       // 基点
  estimatedFillPrice: number;
  fillProbability: number;
  timeToFill: number;    // 预估成交时间(秒)
}

export interface SlicingStrategy {
  totalQuantity: number;
  slices: {
    quantity: number;
    timeOffset: number;  // 距开始的秒数
    orderType: 'market' | 'limit';
    limitPrice?: number;
  }[];
  estimatedDuration: number; // 总耗时(秒)
  estimatedCost: number;
  algo: 'twap' | 'vwap' | 'pov' | 'iceberg' | 'sniper';
}

export interface ExecutionQuality {
  orderId: string;
  benchmark: 'arrival' | 'vwap' | 'close';
  benchmarkPrice: number;
  avgFillPrice: number;
  slippage: number;
  slippageBps: number;
  implementation shortfall: number;
  timingCost: number;
  qualityScore: number; // 0-100
}

export interface CostAttribution {
  period: string;
  totalTrades: number;
  totalVolume: number;
  totalCost: number;
  avgCostBps: number;
  byStrategy: { strategy: string; cost: number; trades: number }[];
  byTicker: { ticker: string; cost: number; trades: number }[];
  bestExecution: { ticker: string; cost: number };
  worstExecution: { ticker: string; cost: number };
}

/**
 * 佣金计算 (A股标准)
 */
export function calcCommission(
  amount: number,
  rate: number = 0.00025,
  minFee: number = 5
): number {
  return Math.max(minFee, amount * rate);
}

/**
 * 滑点估算
 */
export function estimateSlippage(
  order: OrderParams,
  market: MarketCondition
): number {
  // 基础滑点: 一半的bid-ask spread
  let slippage = market.bidAskSpread / 2;

  // 订单规模调整
  const orderValue = order.quantity * order.price;
  const advRatio = orderValue / (market.avgDailyVolume * order.price);

  if (advRatio > 0.1) slippage *= 2;
  else if (advRatio > 0.05) slippage *= 1.5;
  else if (advRatio > 0.01) slippage *= 1.2;

  // 紧迫度调整
  const urgencyMult: Record<string, number> = {
    low: 0.5, medium: 1, high: 1.5, immediate: 2.5,
  };
  slippage *= urgencyMult[order.urgency] ?? 1;

  // 波动率调整
  slippage *= (1 + market.volatility * 2);

  return slippage;
}

/**
 * 市场冲击成本估算
 */
export function estimateImpact(
  order: OrderParams,
  market: MarketCondition
): number {
  // Almgren-Chriss简化模型
  const participationRate = (order.quantity * order.price) /
    (market.avgDailyVolume * market.price);
  const sigma = market.volatility;
  const eta = 0.1; // 临时冲击系数

  // 永久冲击 + 临时冲击
  const permanentImpact = sigma * Math.sqrt(participationRate) * 0.5;
  const temporaryImpact = eta * sigma * participationRate;

  return permanentImpact + temporaryImpact;
}

/**
 * 完整成本估算
 */
export function estimateTotalCost(
  order: OrderParams,
  market: MarketCondition
): CostEstimate {
  const orderValue = order.quantity * order.price;
  const commission = calcCommission(orderValue);
  const spreadCost = (market.bidAskSpread / 2) * orderValue;
  const slippage = estimateSlippage(order, market);
  const slippageCost = slippage * orderValue;
  const impact = estimateImpact(order, market);
  const impactCost = impact * orderValue;

  // 时序成本 (等待导致的机会成本)
  const timingCost = order.urgency === 'immediate' ? 0 :
    market.volatility * orderValue * 0.001;

  const totalCost = commission + spreadCost + slippageCost + impactCost + timingCost;
  const costBps = (totalCost / orderValue) * 10000;

  // 预估成交价
  const direction = order.side === 'buy' ? 1 : -1;
  const estimatedFillPrice = order.price * (1 + direction * (slippage + impact));

  // 成交概率
  let fillProbability = 0.95;
  if (order.orderType === 'limit') {
    const distanceFromMarket = Math.abs(order.price - market.price) / market.price;
    fillProbability = Math.max(0.1, 1 - distanceFromMarket * 10);
  }

  // 预估成交时间
  const timeToFill = order.urgency === 'immediate' ? 1 :
    order.urgency === 'high' ? 30 :
    order.urgency === 'medium' ? 120 : 300;

  return {
    totalCost,
    breakdown: {
      commission,
      spread: spreadCost,
      slippage: slippageCost,
      impact: impactCost,
      timing: timingCost,
    },
    costBps,
    estimatedFillPrice,
    fillProbability,
    timeToFill,
  };
}

/**
 * 拆单策略
 */
export function suggestSlicing(
  order: OrderParams,
  market: MarketCondition
): SlicingStrategy {
  const adv = market.avgDailyVolume;
  const participationTarget = order.urgency === 'immediate' ? 0.5 :
    order.urgency === 'high' ? 0.2 :
    order.urgency === 'medium' ? 0.1 : 0.05;

  const maxSliceSize = Math.floor(adv * participationTarget);
  const numSlices = Math.max(1, Math.ceil(order.quantity / maxSliceSize));

  let algo: SlicingStrategy['algo'];
  if (order.urgency === 'immediate') algo = 'sniper';
  else if (numSlices >= 20) algo = 'vwap';
  else if (numSlices > 5) algo = 'twap';
  else algo = 'iceberg';

  const timeConstraint = order.timeConstraint ?? (
    order.urgency === 'immediate' ? 1 :
    order.urgency === 'high' ? 5 :
    order.urgency === 'medium' ? 30 : 60
  );

  const intervalSeconds = (timeConstraint * 60) / numSlices;

  const slices: SlicingStrategy['slices'] = [];
  let remaining = order.quantity;

  for (let i = 0; i < numSlices; i++) {
    const sliceQty = Math.min(
      Math.ceil(order.quantity / numSlices),
      remaining
    );
    if (sliceQty <= 0) break;

    const limitOffset = algo === 'sniper' ? 0 :
      (order.side === 'buy' ? -0.001 : 0.001) * (i + 1);

    slices.push({
      quantity: sliceQty,
      timeOffset: Math.round(i * intervalSeconds),
      orderType: algo === 'sniper' ? 'market' : 'limit',
      limitPrice: algo === 'sniper' ? undefined :
        Math.round(order.price * (1 + limitOffset) * 100) / 100,
    });

    remaining -= sliceQty;
  }

  const estimatedCost = estimateTotalCost(order, market).totalCost * 0.85; // 拆单节省15%

  return {
    totalQuantity: order.quantity,
    slices,
    estimatedDuration: timeConstraint * 60,
    estimatedCost,
    algo,
  };
}

/**
 * 执行质量评估
 */
export function evaluateExecution(
  orderId: string,
  fills: { price: number; quantity: number; time: string }[],
  benchmark: ExecutionQuality['benchmark'],
  benchmarkPrice: number,
  arrivalPrice: number
): ExecutionQuality {
  const totalQty = fills.reduce((s, f) => s + f.quantity, 0);
  const avgFillPrice = fills.reduce((s, f) => s + f.price * f.quantity, 0) / totalQty;

  const slippage = avgFillPrice - benchmarkPrice;
  const slippageBps = (slippage / benchmarkPrice) * 10000;
  const implementationShortfall = (avgFillPrice - arrivalPrice) / arrivalPrice;
  const timingCost = (benchmarkPrice - arrivalPrice) / arrivalPrice;

  // 质量评分
  let qualityScore = 50;
  qualityScore -= Math.abs(slippageBps) * 2; // 滑点惩罚
  qualityScore -= Math.abs(implementationShortfall) * 500;
  qualityScore = Math.max(0, Math.min(100, qualityScore));

  return {
    orderId,
    benchmark,
    benchmarkPrice,
    avgFillPrice,
    slippage,
    slippageBps,
    implementationShortfall,
    timingCost,
    qualityScore,
  };
}

/**
 * 选择最优执行算法
 */
export function selectBestAlgo(
  order: OrderParams,
  market: MarketCondition
): { algo: string; reason: string; estimatedCost: number } {
  const orderValue = order.quantity * order.price;
  const advRatio = order.quantity / market.avgDailyVolume;

  if (advRatio < 0.001) {
    return { algo: 'direct', reason: '订单量极小，直接执行', estimatedCost: orderValue * 0.0001 };
  }

  if (order.urgency === 'immediate') {
    return { algo: 'sniper', reason: '紧急订单，市价抢筹', estimatedCost: orderValue * 0.002 };
  }

  if (advRatio > 0.1) {
    return { algo: 'vwap', reason: '大单需跟随VWAP拆分', estimatedCost: orderValue * 0.001 };
  }

  if (market.volatility > 0.03) {
    return { algo: 'twap', reason: '高波动，均匀拆分降低冲击', estimatedCost: orderValue * 0.0015 };
  }

  return { algo: 'twap', reason: '中等订单，TWAP均衡执行', estimatedCost: orderValue * 0.0008 };
}
