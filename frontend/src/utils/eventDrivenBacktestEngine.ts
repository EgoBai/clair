/**
 * 事件驱动回测引擎
 * - 事件触发回测(业绩/分红/并购/政策)
 * - 事件前后收益率统计
 * - 胜率/赔率计算
 * - 持仓周期优化
 * - 风险控制参数
 */
export interface EventTrade {
  eventDate: string;
  eventType: string;
  entryPrice: number;
  exitPrice: number;
  entryDate: string;
  exitDate: string;
  holdingDays: number;
  returnPct: number;
  maxDrawdownDuringHolding: number;
  maxGainDuringHolding: number;
}

export interface BacktestConfig {
  holdingDays: number;
  stopLoss: number; // 止损比例
  takeProfit: number; // 止盈比例
  maxPositionSize: number; // 最大仓位
}

export interface BacktestResult {
  totalTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  annualizedReturn: number;
  avgHoldingDays: number;
  bestTrade: number;
  worstTrade: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  expectancy: number;
  calmarRatio: number;
  riskRewardRatio: number;
  byEventType: { type: string; winRate: number; avgReturn: number; trades: number }[];
}

export function runEventBacktest(trades: EventTrade[], config: BacktestConfig): BacktestResult {
  if (trades.length === 0) throw new Error('没有交易数据');

  const returns = trades.map(t => t.returnPct);
  const wins = returns.filter(r => r > 0);
  const losses = returns.filter(r => r <= 0);

  const winRate = wins.length / trades.length;
  const avgWin = wins.length > 0 ? wins.reduce((s, r) => s + r, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, r) => s + r, 0) / losses.length) : 0;
  const profitFactor = avgLoss > 0 ? (avgWin * wins.length) / (avgLoss * losses.length) : Infinity;

  // 最大回撤
  let peak = 0, maxDrawdown = 0, equity = 1;
  for (const r of returns) {
    equity *= (1 + r);
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, (equity - peak) / peak);
  }

  // Sharpe
  const meanReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
  const stdReturn = Math.sqrt(returns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / returns.length);
  const sharpeRatio = stdReturn > 0 ? meanReturn / stdReturn * Math.sqrt(252 / config.holdingDays) : 0;

  // 年化收益
  const totalReturn = equity - 1;
  const totalDays = trades.reduce((s, t) => s + t.holdingDays, 0);
  const annualizedReturn = totalDays > 0 ? Math.pow(1 + totalReturn, 365 / totalDays) - 1 : 0;

  // 平均持仓天数
  const avgHoldingDays = trades.reduce((s, t) => s + t.holdingDays, 0) / trades.length;

  // 最佳/最差
  const bestTrade = Math.max(...returns);
  const worstTrade = Math.min(...returns);

  // 连续赢/输
  let consecutiveWins = 0, maxConsecutiveWins = 0;
  let consecutiveLosses = 0, maxConsecutiveLosses = 0;
  for (const r of returns) {
    if (r > 0) { consecutiveWins++; consecutiveLosses = 0; maxConsecutiveWins = Math.max(maxConsecutiveWins, consecutiveWins); }
    else { consecutiveLosses++; consecutiveWins = 0; maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses); }
  }

  // 期望值
  const expectancy = winRate * avgWin - (1 - winRate) * avgLoss;

  // Calmar ratio
  const calmarRatio = maxDrawdown !== 0 ? annualizedReturn / Math.abs(maxDrawdown) : 0;

  // 按事件类型分类
  const eventTypeMap = new Map<string, { wins: number; totalReturn: number; count: number }>();
  trades.forEach(t => {
    const entry = eventTypeMap.get(t.eventType) || { wins: 0, totalReturn: 0, count: 0 };
    entry.count++;
    entry.totalReturn += t.returnPct;
    if (t.returnPct > 0) entry.wins++;
    eventTypeMap.set(t.eventType, entry);
  });

  const byEventType = Array.from(eventTypeMap.entries()).map(([type, data]) => ({
    type,
    winRate: Math.round(data.wins / data.count * 100) / 100,
    avgReturn: Math.round(data.totalReturn / data.count * 10000) / 10000,
    trades: data.count,
  }));

  return {
    totalTrades: trades.length,
    winRate: Math.round(winRate * 10000) / 10000,
    avgWin: Math.round(avgWin * 10000) / 10000,
    avgLoss: Math.round(avgLoss * 10000) / 10000,
    profitFactor: Math.round(profitFactor * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 10000) / 10000,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    annualizedReturn: Math.round(annualizedReturn * 10000) / 10000,
    avgHoldingDays: Math.round(avgHoldingDays * 10) / 10,
    bestTrade: Math.round(bestTrade * 10000) / 10000,
    worstTrade: Math.round(worstTrade * 10000) / 10000,
    consecutiveWins: maxConsecutiveWins,
    consecutiveLosses: maxConsecutiveLosses,
    expectancy: Math.round(expectancy * 10000) / 10000,
    calmarRatio: Math.round(calmarRatio * 100) / 100,
    riskRewardRatio: avgLoss > 0 ? Math.round(avgWin / avgLoss * 100) / 100 : Infinity,
    byEventType,
  };
}
