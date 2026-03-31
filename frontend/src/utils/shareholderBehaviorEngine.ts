/**
 * 股东行为分析引擎 (Shareholder Behavior Engine)
 * - 大股东增减持分析
 * - 机构持仓变化
 * - 管理层持股追踪
 * - 股权质押风险
 * - 解禁压力分析
 * - 股东人数变化
 */

export interface ShareholderChange {
  shareholder: string;
  type: 'increase' | 'decrease' | 'new' | 'exit';
  shares: number;
  pctChange: number;
  avgPrice: number;
  totalAmount: number;
  date: string;
}

export interface InsiderTrade {
  name: string;
  role: 'chairman' | 'ceo' | 'cfo' | 'director' | 'supervisor' | 'executive';
  type: 'buy' | 'sell';
  shares: number;
  price: number;
  amount: number;
  date: string;
  holdingAfter: number;
}

export interface PledgeRisk {
  shareholder: string;
  pledgedShares: number;
  totalHolding: number;
  pledgeRatio: number; // 质押率
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  warningPrice: number;
  closingPrice: number;
  distanceToWarning: number; // 距平仓线%
}

export interface UnlockPressure {
  date: string;
  shares: number;
  pctOfTotal: number;
  avgCost: number;
  currentPrice: number;
  profitLoss: number;
  pressureLevel: 'low' | 'medium' | 'high';
}

export interface ConcentrationChange {
  period: string;
  shareholderCount: number;
  avgHoldingPerPerson: number;
  top10Pct: number;
  concentration: 'increasing' | 'decreasing' | 'stable';
  giniCoefficient: number;
}

/**
 * 分析大股东增减持
 */
export function analyzeShareholderChanges(
  changes: ShareholderChange[]
): {
  totalIncrease: number;
  totalDecrease: number;
  netChange: number;
  signals: { type: 'bullish' | 'bearish' | 'neutral'; description: string; strength: number }[];
} {
  const increases = changes.filter(c => c.type === 'increase');
  const decreases = changes.filter(c => c.type === 'decrease');

  const totalIncrease = increases.reduce((s, c) => s + c.totalAmount, 0);
  const totalDecrease = decreases.reduce((s, c) => s + c.totalAmount, 0);
  const netChange = totalIncrease - totalDecrease;

  const signals: { type: 'bullish' | 'bearish' | 'neutral'; description: string; strength: number }[] = [];

  // 大额增持信号
  for (const inc of increases) {
    if (inc.pctChange > 1) {
      signals.push({
        type: 'bullish',
        description: `${inc.shareholder}增持${inc.pctChange.toFixed(1)}%，金额${(inc.totalAmount / 10000).toFixed(0)}万元`,
        strength: Math.min(100, Math.round(inc.pctChange * 20 + inc.totalAmount / 100000)),
      });
    }
  }

  // 大额减持信号
  for (const dec of decreases) {
    if (dec.pctChange > 1) {
      signals.push({
        type: 'bearish',
        description: `${dec.shareholder}减持${dec.pctChange.toFixed(1)}%`,
        strength: Math.min(100, Math.round(dec.pctChange * 20 + dec.totalAmount / 100000)),
      });
    }
  }

  // 净增持/减持总判断
  if (netChange > 0) {
    signals.push({
      type: 'bullish',
      description: `股东净增持${(netChange / 10000).toFixed(0)}万元`,
      strength: Math.min(100, Math.round(netChange / 100000)),
    });
  } else if (netChange < 0) {
    signals.push({
      type: 'bearish',
      description: `股东净减持${(Math.abs(netChange) / 10000).toFixed(0)}万元`,
      strength: Math.min(100, Math.round(Math.abs(netChange) / 100000)),
    });
  }

  return { totalIncrease, totalDecrease, netChange, signals };
}

/**
 * 管理层交易分析
 */
export function analyzeInsiderTrades(trades: InsiderTrade[]): {
  buyCount: number;
  sellCount: number;
  netAmount: number;
  signals: { type: string; description: string }[];
} {
  const buys = trades.filter(t => t.type === 'buy');
  const sells = trades.filter(t => t.type === 'sell');

  const buyAmount = buys.reduce((s, t) => s + t.amount, 0);
  const sellAmount = sells.reduce((s, t) => s + t.amount, 0);

  const signals: { type: string; description: string }[] = [];

  if (buys.length > sells.length && buyAmount > sellAmount) {
    signals.push({ type: 'bullish', description: '管理层净买入，看好公司前景' });
  }

  if (sells.length > buys.length * 2) {
    signals.push({ type: 'bearish', description: '管理层集中减持，需关注' });
  }

  // 高管大额减持
  for (const sell of sells) {
    if (sell.amount > 1000000) {
      signals.push({
        type: 'bearish',
        description: `${sell.role} ${sell.name}减持${(sell.amount / 10000).toFixed(0)}万元`,
      });
    }
  }

  return {
    buyCount: buys.length,
    sellCount: sells.length,
    netAmount: buyAmount - sellAmount,
    signals,
  };
}

/**
 * 质押风险评估
 */
export function assessPledgeRisk(
  pledges: PledgeRisk[]
): {
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  totalPledgedPct: number;
  highRiskList: PledgeRisk[];
  avgPledgeRatio: number;
} {
  if (pledges.length === 0) {
    return { overallRisk: 'low', totalPledgedPct: 0, highRiskList: [], avgPledgeRatio: 0 };
  }

  for (const p of pledges) {
    const distToWarning = (p.closingPrice - p.warningPrice) / p.closingPrice * 100;
    p.distanceToWarning = distToWarning;

    if (distToWarning < 10) p.riskLevel = 'critical';
    else if (distToWarning < 20) p.riskLevel = 'high';
    else if (distToWarning < 30) p.riskLevel = 'medium';
    else p.riskLevel = 'low';
  }

  const totalPledged = pledges.reduce((s, p) => s + p.pledgedShares, 0);
  const totalHolding = pledges.reduce((s, p) => s + p.totalHolding, 0);
  const totalPledgedPct = totalHolding > 0 ? totalPledged / totalHolding * 100 : 0;
  const avgPledgeRatio = pledges.reduce((s, p) => s + p.pledgeRatio, 0) / pledges.length;

  const highRiskList = pledges.filter(p => p.riskLevel === 'critical' || p.riskLevel === 'high');

  let overallRisk: 'low' | 'medium' | 'high' | 'critical';
  if (highRiskList.length > 0 || totalPledgedPct > 50) overallRisk = 'critical';
  else if (totalPledgedPct > 30) overallRisk = 'high';
  else if (totalPledgedPct > 15) overallRisk = 'medium';
  else overallRisk = 'low';

  return { overallRisk, totalPledgedPct, highRiskList, avgPledgeRatio };
}

/**
 * 解禁压力分析
 */
export function analyzeUnlockPressure(
  unlocks: UnlockPressure[],
  avgDailyVolume: number
): {
  totalPressure: number;
  highPressureDays: UnlockPressure[];
  worstDay: UnlockPressure | null;
  avgPressureLevel: string;
} {
  for (const u of unlocks) {
    const daysToAbsorb = avgDailyVolume > 0 ? u.shares / avgDailyVolume : 0;
    u.profitLoss = (u.currentPrice - u.avgCost) / u.avgCost * 100;

    if (daysToAbsorb > 10 || u.pctOfTotal > 5) u.pressureLevel = 'high';
    else if (daysToAbsorb > 5 || u.pctOfTotal > 2) u.pressureLevel = 'medium';
    else u.pressureLevel = 'low';
  }

  const totalPressure = unlocks.reduce((s, u) => s + u.pctOfTotal, 0);
  const highPressureDays = unlocks.filter(u => u.pressureLevel === 'high');
  const worstDay = unlocks.length > 0
    ? unlocks.reduce((max, u) => u.pctOfTotal > max.pctOfTotal ? u : max, unlocks[0])
    : null;

  const highCount = highPressureDays.length;
  const avgPressureLevel = highCount > unlocks.length * 0.5 ? 'high'
    : highCount > 0 ? 'medium' : 'low';

  return { totalPressure, highPressureDays, worstDay, avgPressureLevel };
}

/**
 * 股东集中度变化分析
 */
export function analyzeConcentration(
  periods: ConcentrationChange[]
): {
  trend: 'increasing' | 'decreasing' | 'stable';
  latestConcentration: number;
  signal: string;
} {
  if (periods.length < 2) {
    return { trend: 'stable', latestConcentration: 0, signal: '数据不足' };
  }

  const latest = periods[periods.length - 1];
  const previous = periods[periods.length - 2];

  const countChange = latest.shareholderCount - previous.shareholderCount;
  const top10Change = latest.top10Pct - previous.top10Pct;

  let trend: 'increasing' | 'decreasing' | 'stable';
  if (top10Change > 2) trend = 'increasing';
  else if (top10Change < -2) trend = 'decreasing';
  else trend = 'stable';

  let signal: string;
  if (trend === 'increasing' && countChange < 0) {
    signal = '股东人数减少且筹码集中度提升，可能有机构吸筹';
  } else if (trend === 'decreasing' && countChange > 0) {
    signal = '股东人数增加且筹码分散，可能有主力派发';
  } else {
    signal = '股东结构稳定';
  }

  return { trend, latestConcentration: latest.top10Pct, signal };
}
