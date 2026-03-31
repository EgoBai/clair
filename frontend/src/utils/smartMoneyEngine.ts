/**
 * 智能资金追踪引擎 - 追踪机构/北向/主力/游资动向
 */

export interface MoneyFlow {
  date: string;
  ticker: string;
  institutional: number; // 机构净流入(万)
  northbound: number; // 北向净流入(万)
  mainForce: number; // 主力净流入(万)
  retail: number; // 散户净流入(万)
  hotMoney: number; // 游资净流入(万)
  volume: number;
  price: number;
}

export interface SmartMoneySignal {
  ticker: string;
  signal: 'strong_inflow' | 'inflow' | 'neutral' | 'outflow' | 'strong_outflow';
  score: number; // -100 to 100
  confidence: number; // 0-1
  drivers: string[];
  duration: number; // 持续天数
  intensity: number; // 强度 0-100
}

export interface MoneyFlowSummary {
  ticker: string;
  period: string;
  totalInflow: number;
  avgDailyFlow: number;
  flowTrend: 'accelerating' | 'stable' | 'decelerating' | 'reversing';
  institutionalDominance: number; // 机构主导度 0-100
  northboundTrend: 'accumulating' | 'holding' | 'reducing';
  hotMoneyActivity: 'active' | 'normal' | 'quiet';
  keyDays: Array<{
    date: string;
    event: string;
    flow: number;
  }>;
  correlation: {
    priceFlow: number; // 价量相关性
    institutionReturn: number; // 机构流向与收益相关性
  };
}

export interface InstitutionalBehavior {
  ticker: string;
  holdingChange: number; // 持仓变化(%)
  avgCost: number; // 平均成本
  profitLoss: number; // 盈亏(%)
  behavior: 'accumulating' | 'distributing' | 'holding' | 'panic_selling';
  conviction: number; // 信心度 0-100
  daysSinceAction: number;
  estimatedTarget: number; // 目标价估算
}

/**
 * 分析智能资金信号
 */
export function analyzeSmartMoney(flows: MoneyFlow[]): SmartMoneySignal {
  if (flows.length === 0) {
    return {
      ticker: '',
      signal: 'neutral',
      score: 0,
      confidence: 0,
      drivers: [],
      duration: 0,
      intensity: 0,
    };
  }

  const ticker = flows[0].ticker;
  const recent = flows.slice(-5);
  const all = flows.slice(-20);

  // 计算综合资金得分
  const instScore = recent.reduce((s, f) => s + f.institutional, 0) / recent.length;
  const northScore = recent.reduce((s, f) => s + f.northbound, 0) / recent.length;
  const mainScore = recent.reduce((s, f) => s + f.mainForce, 0) / recent.length;

  // 加权评分 (机构40%, 北向30%, 主力30%)
  const rawScore = instScore * 0.4 + northScore * 0.3 + mainScore * 0.3;
  const maxFlow = Math.max(...all.map(f => Math.abs(f.institutional + f.northbound + f.mainForce)));
  const score = maxFlow > 0 ? Math.min(100, Math.max(-100, (rawScore / maxFlow) * 100)) : 0;

  // 确定信号
  let signal: SmartMoneySignal['signal'];
  if (score > 50) signal = 'strong_inflow';
  else if (score > 15) signal = 'inflow';
  else if (score > -15) signal = 'neutral';
  else if (score > -50) signal = 'outflow';
  else signal = 'strong_outflow';

  // 计算持续天数
  let duration = 0;
  const isPositive = score > 0;
  for (let i = flows.length - 1; i >= 0; i--) {
    const dayScore = flows[i].institutional * 0.4 + flows[i].northbound * 0.3 + flows[i].mainForce * 0.3;
    if ((isPositive && dayScore > 0) || (!isPositive && dayScore < 0)) {
      duration++;
    } else {
      break;
    }
  }

  // 驱动因素
  const drivers: string[] = [];
  if (instScore > 0) drivers.push('机构持续买入');
  if (instScore < 0) drivers.push('机构减持');
  if (northScore > 0) drivers.push('北向资金流入');
  if (northScore < 0) drivers.push('北向资金流出');
  if (mainScore > 0) drivers.push('主力资金介入');
  if (mainScore < 0) drivers.push('主力资金撤离');

  // 信心度: 基于一致性和持续性
  const consistency = recent.filter(f => {
    const dayScore = f.institutional * 0.4 + f.northbound * 0.3 + f.mainForce * 0.3;
    return (isPositive && dayScore > 0) || (!isPositive && dayScore < 0);
  }).length / recent.length;
  const confidence = Math.min(1, consistency * 0.6 + Math.min(duration / 10, 1) * 0.4);

  // 强度
  const intensity = Math.min(100, Math.abs(score) * (1 + duration * 0.1));

  return {
    ticker,
    signal,
    score: Math.round(score * 10) / 10,
    confidence: Math.round(confidence * 100) / 100,
    drivers,
    duration,
    intensity: Math.round(intensity),
  };
}

/**
 * 汇总资金流向
 */
export function summarizeMoneyFlow(flows: MoneyFlow[], period: string = '20d'): MoneyFlowSummary {
  const ticker = flows[0]?.ticker || '';

  if (flows.length < 2) {
    return {
      ticker,
      period,
      totalInflow: 0,
      avgDailyFlow: 0,
      flowTrend: 'stable',
      institutionalDominance: 50,
      northboundTrend: 'holding',
      hotMoneyActivity: 'normal',
      keyDays: [],
      correlation: { priceFlow: 0, institutionReturn: 0 },
    };
  }

  const totalInflow = flows.reduce((s, f) => s + f.institutional + f.northbound + f.mainForce, 0);
  const avgDailyFlow = totalInflow / flows.length;

  // 资金流趋势
  const firstHalf = flows.slice(0, Math.floor(flows.length / 2));
  const secondHalf = flows.slice(Math.floor(flows.length / 2));
  const firstAvg = firstHalf.reduce((s, f) => s + f.institutional + f.mainForce, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((s, f) => s + f.institutional + f.mainForce, 0) / secondHalf.length;

  let flowTrend: MoneyFlowSummary['flowTrend'];
  if (secondAvg > firstAvg * 1.5) flowTrend = 'accelerating';
  else if (secondAvg < firstAvg * 0.5) flowTrend = 'decelerating';
  else if ((firstAvg > 0 && secondAvg < 0) || (firstAvg < 0 && secondAvg > 0)) flowTrend = 'reversing';
  else flowTrend = 'stable';

  // 机构主导度
  const totalAbsFlow = flows.reduce((s, f) =>
    s + Math.abs(f.institutional) + Math.abs(f.northbound) + Math.abs(f.mainForce) + Math.abs(f.retail), 0);
  const instAbs = flows.reduce((s, f) => s + Math.abs(f.institutional) + Math.abs(f.northbound), 0);
  const institutionalDominance = totalAbsFlow > 0 ? Math.round((instAbs / totalAbsFlow) * 100) : 50;

  // 北向趋势
  const recentNorth = flows.slice(-5).reduce((s, f) => s + f.northbound, 0);
  const earlierNorth = flows.slice(-10, -5).reduce((s, f) => s + f.northbound, 0);
  let northboundTrend: MoneyFlowSummary['northboundTrend'];
  if (recentNorth > 0 && recentNorth > earlierNorth) northboundTrend = 'accumulating';
  else if (recentNorth < 0) northboundTrend = 'reducing';
  else northboundTrend = 'holding';

  // 游资活跃度
  const hotMoneyTotal = flows.reduce((s, f) => s + Math.abs(f.hotMoney), 0);
  const avgHotMoney = hotMoneyTotal / flows.length;
  let hotMoneyActivity: MoneyFlowSummary['hotMoneyActivity'];
  if (avgHotMoney > 5000) hotMoneyActivity = 'active';
  else if (avgHotMoney < 1000) hotMoneyActivity = 'quiet';
  else hotMoneyActivity = 'normal';

  // 关键日
  const keyDays = flows
    .filter(f => {
      const total = f.institutional + f.northbound + f.mainForce;
      return Math.abs(total) > avgDailyFlow * 2;
    })
    .slice(-5)
    .map(f => ({
      date: f.date,
      event: f.institutional + f.northbound + f.mainForce > 0 ? '大额流入' : '大额流出',
      flow: f.institutional + f.northbound + f.mainForce,
    }));

  // 价量相关性
  const prices = flows.map(f => f.price);
  const flows_total = flows.map(f => f.institutional + f.northbound + f.mainForce);
  const priceFlow = calculateCorrelation(prices, flows_total);

  // 机构流向与收益相关性
  const returns = prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);
  const instFlows = flows.slice(1).map(f => f.institutional);
  const institutionReturn = calculateCorrelation(returns, instFlows);

  return {
    ticker,
    period,
    totalInflow: Math.round(totalInflow),
    avgDailyFlow: Math.round(avgDailyFlow),
    flowTrend,
    institutionalDominance,
    northboundTrend,
    hotMoneyActivity,
    keyDays,
    correlation: {
      priceFlow: Math.round(priceFlow * 100) / 100,
      institutionReturn: Math.round(institutionReturn * 100) / 100,
    },
  };
}

/**
 * 分析机构行为
 */
export function analyzeInstitutionalBehavior(
  flows: MoneyFlow[],
  currentPrice: number,
): InstitutionalBehavior {
  const ticker = flows[0]?.ticker || '';

  if (flows.length < 2) {
    return {
      ticker,
      holdingChange: 0,
      avgCost: currentPrice,
      profitLoss: 0,
      behavior: 'holding',
      conviction: 50,
      daysSinceAction: 0,
      estimatedTarget: currentPrice,
    };
  }

  const totalInstitutional = flows.reduce((s, f) => s + f.institutional, 0);
  const avgInstitutional = totalInstitutional / flows.length;

  // 持仓变化 (简化估算)
  const holdingChange = totalInstitutional / 10000; // 转换为百分比

  // 平均成本 (加权)
  let totalWeightedPrice = 0;
  let totalWeight = 0;
  flows.forEach(f => {
    const w = Math.abs(f.institutional);
    totalWeightedPrice += f.price * w;
    totalWeight += w;
  });
  const avgCost = totalWeight > 0 ? totalWeightedPrice / totalWeight : currentPrice;

  // 盈亏
  const profitLoss = ((currentPrice - avgCost) / avgCost) * 100;

  // 行为判断
  let behavior: InstitutionalBehavior['behavior'];
  const recentTrend = flows.slice(-5).reduce((s, f) => s + f.institutional, 0);
  const earlierTrend = flows.slice(-10, -5).reduce((s, f) => s + f.institutional, 0);

  if (recentTrend > 0 && recentTrend > earlierTrend) behavior = 'accumulating';
  else if (recentTrend < 0 && recentTrend < earlierTrend * 0.5) behavior = 'panic_selling';
  else if (recentTrend < 0) behavior = 'distributing';
  else behavior = 'holding';

  // 信心度
  const conviction = Math.min(100, Math.max(0,
    50 + (recentTrend > 0 ? 20 : -20) + (profitLoss > 0 ? 15 : -15) + (flows.length > 10 ? 10 : 0)
  ));

  // 持续天数
  let daysSinceAction = 0;
  for (let i = flows.length - 1; i >= 0; i--) {
    if (Math.abs(flows[i].institutional) > Math.abs(avgInstitutional)) {
      break;
    }
    daysSinceAction++;
  }

  // 目标价估算
  const priceChangeRate = flows.length > 5
    ? (currentPrice - flows[flows.length - 5].price) / flows[flows.length - 5].price
    : 0;
  const estimatedTarget = currentPrice * (1 + Math.max(priceChangeRate * 3, 0.05));

  return {
    ticker,
    holdingChange: Math.round(holdingChange * 100) / 100,
    avgCost: Math.round(avgCost * 100) / 100,
    profitLoss: Math.round(profitLoss * 100) / 100,
    behavior,
    conviction: Math.round(conviction),
    daysSinceAction,
    estimatedTarget: Math.round(estimatedTarget * 100) / 100,
  };
}

function calculateCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  const meanX = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const meanY = y.slice(0, n).reduce((a, b) => a + b, 0) / n;

  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  return den > 0 ? num / den : 0;
}
