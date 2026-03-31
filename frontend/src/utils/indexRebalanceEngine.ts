/**
 * 指数再平衡分析引擎
 * - 成分股调整预测
 * - 调入调出影响分析
 * - 被动资金跟踪误差
 * - 调仓日冲击估计
 * - 再平衡收益预估
 */
export interface IndexConstituent {
  stockCode: string;
  stockName: string;
  weight: number;
  marketCap: number;
  turnover: number;
  addedDate: string;
}

export interface RebalanceEvent {
  date: string;
  indexCode: string;
  additions: IndexConstituent[];
  deletions: IndexConstituent[];
  weightChanges: Array<{ stockCode: string; oldWeight: number; newWeight: number }>;
}

export interface PassiveImpact {
  totalFundAUM: number;
  affectedAUM: number;
  buyPressure: Array<{ stockCode: string; amount: number; daysToAbsorb: number }>;
  sellPressure: Array<{ stockCode: string; amount: number; daysToAbsorb: number }>;
  trackingErrorImpact: number;
  estimatedCost: number;
}

export interface RebalanceAnalysis {
  event: RebalanceEvent;
  passiveImpact: PassiveImpact;
  expectedReturn: number;
  preRebalanceAlpha: number;
  postRebalanceDrift: number;
  liquidityRisk: 'low' | 'medium' | 'high';
  executionStrategy: 'aggressive' | 'passive' | 'twap';
  alerts: string[];
}

export function analyzeRebalance(
  event: RebalanceEvent,
  currentConstituents: IndexConstituent[],
  totalFundAUM: number
): RebalanceAnalysis {
  // 被动资金影响
  const avgDailyTurnover = new Map(currentConstituents.map(c => [c.stockCode, c.turnover]));

  const buyPressure = event.additions.map(stock => {
    const amount = totalFundAUM * stock.weight;
    const dailyTurnover = avgDailyTurnover.get(stock.stockCode) ?? amount * 0.1;
    return { stockCode: stock.stockCode, amount, daysToAbsorb: amount / dailyTurnover };
  });

  const sellPressure = event.deletions.map(stock => {
    const amount = totalFundAUM * stock.weight;
    const dailyTurnover = avgDailyTurnover.get(stock.stockCode) ?? amount * 0.1;
    return { stockCode: stock.stockCode, amount, daysToAbsorb: amount / dailyTurnover };
  });

  const totalBuy = buyPressure.reduce((s, p) => s + p.amount, 0);
  const totalSell = sellPressure.reduce((s, p) => s + p.amount, 0);
  const affectedAUM = totalBuy + totalSell;

  const maxDaysToAbsorb = Math.max(
    ...buyPressure.map(p => p.daysToAbsorb),
    ...sellPressure.map(p => p.daysToAbsorb),
    0
  );

  const trackingErrorImpact = affectedAUM / totalFundAUM * 0.01;
  const estimatedCost = affectedAUM * 0.003; // 估计30bps交易成本

  // 调仓前Alpha (被动买入前的价格上涨)
  const preRebalanceAlpha = buyPressure.reduce((s, p) => s + p.amount * 0.02, 0) / totalFundAUM;
  
  // 调仓后漂移
  const postRebalanceDrift = event.additions.length * 0.005 - event.deletions.length * 0.003;

  // 预期收益
  const expectedReturn = preRebalanceAlpha * 0.5 + postRebalanceDrift * 0.5;

  // 流动性风险
  const liquidityRisk = maxDaysToAbsorb > 5 ? 'high' : maxDaysToAbsorb > 2 ? 'medium' : 'low';

  // 执行策略
  const executionStrategy = liquidityRisk === 'high' ? 'twap' : liquidityRisk === 'medium' ? 'passive' : 'aggressive';

  const alerts: string[] = [];
  if (event.additions.length > 5) alerts.push(`调入${event.additions.length}只股票，调仓幅度大`);
  if (event.deletions.length > 5) alerts.push(`调出${event.deletions.length}只股票，调仓幅度大`);
  if (estimatedCost > totalFundAUM * 0.001) alerts.push('调仓成本偏高');
  if (liquidityRisk === 'high') alerts.push('存在流动性风险');

  const passiveImpact: PassiveImpact = {
    totalFundAUM,
    affectedAUM,
    buyPressure,
    sellPressure,
    trackingErrorImpact,
    estimatedCost,
  };

  return {
    event,
    passiveImpact,
    expectedReturn,
    preRebalanceAlpha,
    postRebalanceDrift,
    liquidityRisk,
    executionStrategy,
    alerts,
  };
}
