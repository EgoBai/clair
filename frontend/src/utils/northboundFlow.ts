/**
 * 北向资金追踪引擎
 * 沪股通 / 深股通 资金流向分析
 */

export interface NorthboundFlow {
  date: string;
  shConnect: number; // 沪股通净流入
  szConnect: number; // 深股通净流入
  total: number;
  shBuy: number;
  shSell: number;
  szBuy: number;
  szSell: number;
}

export interface NorthboundHolding {
  ticker: string;
  name: string;
  shares: number;
  marketValue: number;
  changePercent: number; // 持仓变动%
  freeFloatRatio: number; // 占流通股比例
  sector: string;
}

export interface NorthboundSummary {
  todayNet: number;
  weekNet: number;
  monthNet: number;
  monthDayAvg: number;
  trend: 'inflow' | 'outflow' | 'neutral';
  momentum: number; // 动量指标
  consecutiveDays: number; // 连续流入/流出天数
}

export interface TopHoldingsChange {
  topIncreased: NorthboundHolding[];
  topDecreased: NorthboundHolding[];
  topNewPositions: NorthboundHolding[];
  topExited: NorthboundHolding[];
}

/**
 * 计算北向资金汇总
 */
export function summarizeNorthboundFlow(flows: NorthboundFlow[]): NorthboundSummary {
  if (flows.length === 0) {
    return {
      todayNet: 0,
      weekNet: 0,
      monthNet: 0,
      monthDayAvg: 0,
      trend: 'neutral',
      momentum: 0,
      consecutiveDays: 0,
    };
  }

  const sorted = [...flows].sort((a, b) => b.date.localeCompare(a.date));
  const today = sorted[0]?.total ?? 0;
  const weekFlows = sorted.slice(0, 5);
  const monthFlows = sorted.slice(0, 20);

  const weekNet = weekFlows.reduce((s, f) => s + f.total, 0);
  const monthNet = monthFlows.reduce((s, f) => s + f.total, 0);
  const monthDayAvg = monthNet / monthFlows.length;

  // 趋势判断
  let trend: 'inflow' | 'outflow' | 'neutral';
  if (monthDayAvg > 5) trend = 'inflow';
  else if (monthDayAvg < -5) trend = 'outflow';
  else trend = 'neutral';

  // 动量 = 近5日均值 / 近20日均值
  const weekAvg = weekNet / weekFlows.length;
  const momentum = monthDayAvg !== 0 ? weekAvg / monthDayAvg : 1;

  // 连续天数
  let consecutiveDays = 0;
  const lastDirection = today > 0 ? 'in' : today < 0 ? 'out' : 'neutral';
  if (lastDirection !== 'neutral') {
    for (const f of sorted) {
      const dir = f.total > 0 ? 'in' : f.total < 0 ? 'out' : 'neutral';
      if (dir === lastDirection) consecutiveDays++;
      else break;
    }
  }

  return {
    todayNet: Math.round(today * 100) / 100,
    weekNet: Math.round(weekNet * 100) / 100,
    monthNet: Math.round(monthNet * 100) / 100,
    monthDayAvg: Math.round(monthDayAvg * 100) / 100,
    trend,
    momentum: Math.round(momentum * 100) / 100,
    consecutiveDays,
  };
}

/**
 * 持仓变动分析
 */
export function analyzeHoldingsChanges(
  current: NorthboundHolding[],
  previous: NorthboundHolding[]
): TopHoldingsChange {
  const prevMap = new Map(previous.map((h) => [h.ticker, h]));

  const topIncreased: NorthboundHolding[] = [];
  const topDecreased: NorthboundHolding[] = [];
  const topNewPositions: NorthboundHolding[] = [];

  for (const holding of current) {
    const prev = prevMap.get(holding.ticker);
    if (!prev) {
      topNewPositions.push({ ...holding, changePercent: 100 });
    } else {
      const changePct =
        prev.shares !== 0 ? ((holding.shares - prev.shares) / prev.shares) * 100 : 100;
      const item = { ...holding, changePercent: Math.round(changePct * 100) / 100 };
      if (changePct > 0) topIncreased.push(item);
      else topDecreased.push(item);
    }
  }

  const currMap = new Map(current.map((h) => [h.ticker, h]));
  const topExited = previous
    .filter((h) => !currMap.has(h.ticker))
    .map((h) => ({ ...h, shares: 0, marketValue: 0, changePercent: -100 }));

  const sortDesc = (a: NorthboundHolding, b: NorthboundHolding) =>
    Math.abs(b.changePercent) - Math.abs(a.changePercent);

  return {
    topIncreased: topIncreased.sort(sortDesc).slice(0, 10),
    topDecreased: topDecreased.sort(sortDesc).slice(0, 10),
    topNewPositions: topNewPositions.sort(sortDesc).slice(0, 10),
    topExited: topExited.sort(sortDesc).slice(0, 10),
  };
}

/**
 * 板块资金流向聚合
 */
export function sectorFlowAggregation(
  holdings: NorthboundHolding[]
): { sector: string; totalValue: number; count: number; avgChange: number }[] {
  const sectorMap = new Map<string, { totalValue: number; count: number; changes: number[] }>();

  for (const h of holdings) {
    const existing = sectorMap.get(h.sector) ?? { totalValue: 0, count: 0, changes: [] };
    existing.totalValue += h.marketValue;
    existing.count++;
    existing.changes.push(h.changePercent);
    sectorMap.set(h.sector, existing);
  }

  return Array.from(sectorMap.entries())
    .map(([sector, data]) => ({
      sector,
      totalValue: Math.round(data.totalValue * 100) / 100,
      count: data.count,
      avgChange:
        Math.round(
          (data.changes.reduce((a, b) => a + b, 0) / data.changes.length) * 100
        ) / 100,
    }))
    .sort((a, b) => b.totalValue - a.totalValue);
}

/**
 * 北向资金信号生成
 */
export interface NorthboundSignal {
  type: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 0-100
  message: string;
}

export function generateNorthboundSignals(summary: NorthboundSummary): NorthboundSignal[] {
  const signals: NorthboundSignal[] = [];

  // 连续流入信号
  if (summary.consecutiveDays >= 5 && summary.trend === 'inflow') {
    signals.push({
      type: 'bullish',
      strength: Math.min(90, 50 + summary.consecutiveDays * 5),
      message: `北向资金连续${summary.consecutiveDays}日净流入，外资持续加仓`,
    });
  }

  // 连续流出信号
  if (summary.consecutiveDays >= 5 && summary.trend === 'outflow') {
    signals.push({
      type: 'bearish',
      strength: Math.min(90, 50 + summary.consecutiveDays * 5),
      message: `北向资金连续${summary.consecutiveDays}日净流出，外资持续撤退`,
    });
  }

  // 动量加速
  if (summary.momentum > 1.5 && summary.trend === 'inflow') {
    signals.push({
      type: 'bullish',
      strength: Math.min(85, 40 + summary.momentum * 20),
      message: `北向资金流入动量加速，周均值为月均值的${summary.momentum.toFixed(1)}倍`,
    });
  }

  // 动量减速
  if (summary.momentum < 0.5 && summary.trend === 'inflow') {
    signals.push({
      type: 'bearish',
      strength: 55,
      message: '北向资金流入动量减弱，需关注是否转为流出',
    });
  }

  // 大额流入
  if (summary.todayNet > 100) {
    signals.push({
      type: 'bullish',
      strength: Math.min(80, 50 + summary.todayNet / 10),
      message: `今日北向资金大幅净流入${summary.todayNet}亿，强势买入`,
    });
  }

  // 大额流出
  if (summary.todayNet < -100) {
    signals.push({
      type: 'bearish',
      strength: Math.min(80, 50 + Math.abs(summary.todayNet) / 10),
      message: `今日北向资金大幅净流出${Math.abs(summary.todayNet)}亿，强烈卖出`,
    });
  }

  if (signals.length === 0) {
    signals.push({
      type: 'neutral',
      strength: 50,
      message: '北向资金流入流出均衡，无明显方向性信号',
    });
  }

  return signals;
}
