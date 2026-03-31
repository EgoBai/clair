/**
 * 事件驱动交易引擎
 * 支持: 财报事件、分红除权、股权激励、重大事件响应
 */

export type EventType = 
  | 'earnings'        // 财报发布
  | 'dividend'        // 分红派息
  | 'rights_issue'    // 配股
  | 'stock_split'     // 拆股
  | 'buyback'         // 回购
  | 'lockup_expiry'   // 解禁
  | 'index_rebalance' // 指数调仓
  | 'merger'          // 并购重组
  | 'ipostock';       // 新股上市

export interface Event {
  type: EventType;
  date: Date;
  symbol: string;
  details: Record<string, any>;
}

export interface EventImpact {
  eventType: EventType;
  avgReturn1d: number;   // 事件日平均收益
  avgReturn5d: number;   // 5日平均收益
  avgReturn20d: number;  // 20日平均收益
  winRate1d: number;
  winRate5d: number;
  winRate20d: number;
  volatility: number;
  sampleSize: number;
  significance: number; // t统计量
}

export interface EarningsSurprise {
  symbol: string;
  reportDate: Date;
  actualEPS: number;
  estimatedEPS: number;
  surprisePct: number;
  preEventPrice: number;
  postEventPrice: number;
  return1d: number;
  return5d: number;
  return20d: number;
}

export interface EventStrategy {
  eventType: EventType;
  entryTiming: 'before' | 'after' | 'on';
  entryDays: number; // 事件前/后几天
  exitDays: number;
  stopLoss: number; // 止损比例
  takeProfit: number; // 止盈比例
  positionSize: number; // 仓位比例
}

export interface EventBacktestResult {
  strategy: EventStrategy;
  totalTrades: number;
  avgReturn: number;
  winRate: number;
  sharpeRatio: number;
  maxDrawdown: number;
  profitFactor: number;
  trades: EventTrade[];
}

export interface EventTrade {
  symbol: string;
  eventType: EventType;
  entryDate: Date;
  exitDate: Date;
  entryPrice: number;
  exitPrice: number;
  return: number;
  holdingDays: number;
}

/**
 * 分析事件影响
 */
export function analyzeEventImpact(
  events: Event[],
  priceData: Map<string, number[]>, // symbol -> daily close prices
  dates: Date[]
): EventImpact[] {
  const byType = new Map<EventType, Event[]>();
  for (const event of events) {
    if (!byType.has(event.type)) byType.set(event.type, []);
    byType.get(event.type)!.push(event);
  }

  const results: EventImpact[] = [];

  for (const [type, typeEvents] of byType) {
    const returns1d: number[] = [];
    const returns5d: number[] = [];
    const returns20d: number[] = [];

    for (const event of typeEvents) {
      const prices = priceData.get(event.symbol);
      if (!prices) continue;

      const eventIdx = findDateIndex(dates, event.date);
      if (eventIdx < 0 || eventIdx >= prices.length) continue;

      const prePrice = prices[eventIdx];
      if (prePrice <= 0) continue;

      if (eventIdx + 1 < prices.length) {
        returns1d.push((prices[eventIdx + 1] - prePrice) / prePrice);
      }
      if (eventIdx + 5 < prices.length) {
        returns5d.push((prices[eventIdx + 5] - prePrice) / prePrice);
      }
      if (eventIdx + 20 < prices.length) {
        returns20d.push((prices[eventIdx + 20] - prePrice) / prePrice);
      }
    }

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const winRate = (arr: number[]) => arr.length > 0 ? arr.filter(r => r > 0).length / arr.length : 0;
    const std = (arr: number[]) => {
      if (arr.length < 2) return 0;
      const m = avg(arr);
      return Math.sqrt(arr.reduce((a, r) => a + (r - m) ** 2, 0) / (arr.length - 1));
    };

    const avgRet1d = avg(returns1d);
    const std1d = std(returns1d);
    const tStat = std1d > 0 && returns1d.length > 0
      ? avgRet1d / (std1d / Math.sqrt(returns1d.length))
      : 0;

    results.push({
      eventType: type,
      avgReturn1d: avgRet1d,
      avgReturn5d: avg(returns5d),
      avgReturn20d: avg(returns20d),
      winRate1d: winRate(returns1d),
      winRate5d: winRate(returns5d),
      winRate20d: winRate(returns20d),
      volatility: std(returns1d) * Math.sqrt(252),
      sampleSize: typeEvents.length,
      significance: tStat
    });
  }

  return results;
}

/**
 * 分析财报惊喜
 */
export function analyzeEarningsSurprises(
  surprises: EarningsSurprise[]
): {
  avgSurprise: number;
  positiveSurpriseWinRate: number;
  negativeSurpriseWinRate: number;
  surpriseReturnCorrelation: number;
  topSurprises: EarningsSurprise[];
} {
  const positive = surprises.filter(s => s.surprisePct > 0);
  const negative = surprises.filter(s => s.surprisePct <= 0);

  const avgSurprise = surprises.length > 0
    ? surprises.reduce((a, s) => a + s.surprisePct, 0) / surprises.length
    : 0;

  const positiveWinRate = positive.length > 0
    ? positive.filter(s => s.return5d > 0).length / positive.length
    : 0;

  const negativeWinRate = negative.length > 0
    ? negative.filter(s => s.return5d > 0).length / negative.length
    : 0;

  // 惊喜程度与收益的相关性
  const surpriseReturnCorrelation = pearsonCorrelation(
    surprises.map(s => s.surprisePct),
    surprises.map(s => s.return5d)
  );

  const topSurprises = [...surprises]
    .sort((a, b) => Math.abs(b.surprisePct) - Math.abs(a.surprisePct))
    .slice(0, 10);

  return {
    avgSurprise,
    positiveSurpriseWinRate: positiveWinRate,
    negativeSurpriseWinRate: negativeWinRate,
    surpriseReturnCorrelation,
    topSurprises
  };
}

/**
 * 事件策略回测
 */
export function backtestEventStrategy(
  strategy: EventStrategy,
  events: Event[],
  priceData: Map<string, number[]>,
  dates: Date[]
): EventBacktestResult {
  const trades: EventTrade[] = [];

  for (const event of events) {
    if (event.type !== strategy.eventType) continue;

    const prices = priceData.get(event.symbol);
    if (!prices) continue;

    const eventIdx = findDateIndex(dates, event.date);
    if (eventIdx < 0) continue;

    let entryIdx: number;
    let exitIdx: number;

    switch (strategy.entryTiming) {
      case 'before':
        entryIdx = Math.max(0, eventIdx - strategy.entryDays);
        exitIdx = Math.min(prices.length - 1, eventIdx + strategy.exitDays);
        break;
      case 'after':
        entryIdx = Math.min(prices.length - 1, eventIdx + strategy.entryDays);
        exitIdx = Math.min(prices.length - 1, entryIdx + strategy.exitDays);
        break;
      case 'on':
      default:
        entryIdx = eventIdx;
        exitIdx = Math.min(prices.length - 1, eventIdx + strategy.exitDays);
        break;
    }

    if (entryIdx >= prices.length || exitIdx >= prices.length || entryIdx >= exitIdx) continue;

    const entryPrice = prices[entryIdx];
    let exitPrice = prices[exitIdx];

    // 检查止损止盈
    for (let i = entryIdx + 1; i <= exitIdx; i++) {
      const ret = (prices[i] - entryPrice) / entryPrice;
      if (ret <= -strategy.stopLoss) {
        exitPrice = prices[i];
        exitIdx = i;
        break;
      }
      if (ret >= strategy.takeProfit) {
        exitPrice = prices[i];
        exitIdx = i;
        break;
      }
    }

    const returnPct = (exitPrice - entryPrice) / entryPrice;

    trades.push({
      symbol: event.symbol,
      eventType: event.type,
      entryDate: dates[entryIdx],
      exitDate: dates[exitIdx],
      entryPrice,
      exitPrice,
      return: returnPct,
      holdingDays: exitIdx - entryIdx
    });
  }

  // 计算汇总统计
  const returns = trades.map(t => t.return);
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const winRate = returns.length > 0 ? returns.filter(r => r > 0).length / returns.length : 0;

  const std = returns.length > 1
    ? Math.sqrt(returns.reduce((a, r) => a + (r - avgReturn) ** 2, 0) / (returns.length - 1))
    : 0;
  const sharpeRatio = std > 0 ? avgReturn / std * Math.sqrt(252 / 20) : 0;

  // 最大回撤
  let peak = 0;
  let cumReturn = 1;
  let maxDD = 0;
  for (const r of returns) {
    cumReturn *= (1 + r);
    if (cumReturn > peak) peak = cumReturn;
    const dd = (peak - cumReturn) / peak;
    if (dd > maxDD) maxDD = dd;
  }

  // 盈亏比
  const profits = returns.filter(r => r > 0).reduce((a, r) => a + r, 0);
  const losses = Math.abs(returns.filter(r => r < 0).reduce((a, r) => a + r, 0));
  const profitFactor = losses > 0 ? profits / losses : profits > 0 ? Infinity : 0;

  return {
    strategy,
    totalTrades: trades.length,
    avgReturn,
    winRate,
    sharpeRatio,
    maxDrawdown: maxDD,
    profitFactor,
    trades
  };
}

/**
 * 除权除息影响分析
 */
export function analyzeDividendEffect(
  exDividendDate: Date,
  dividendAmount: number,
  prices: number[],
  dates: Date[]
): {
  priceAdjustment: number;
  actualDrop: number;
  excessReturn: number;
  recoveryDays: number | null;
} {
  const idx = findDateIndex(dates, exDividendDate);
  if (idx <= 0 || idx >= prices.length) {
    return { priceAdjustment: 0, actualDrop: 0, excessReturn: 0, recoveryDays: null };
  }

  const prePrice = prices[idx - 1];
  const postPrice = prices[idx];
  const priceAdjustment = dividendAmount / prePrice;
  const actualDrop = (prePrice - postPrice) / prePrice;
  const excessReturn = priceAdjustment - actualDrop;

  // 恢复天数 (价格回到除权前水平)
  let recoveryDays: number | null = null;
  for (let i = idx + 1; i < Math.min(idx + 60, prices.length); i++) {
    if (prices[i] >= prePrice) {
      recoveryDays = i - idx;
      break;
    }
  }

  return { priceAdjustment, actualDrop, excessReturn, recoveryDays };
}

// ===== Helpers =====

function findDateIndex(dates: Date[], target: Date): number {
  const targetTime = target.getTime();
  for (let i = 0; i < dates.length; i++) {
    if (Math.abs(dates[i].getTime() - targetTime) < 86400000) {
      return i;
    }
  }
  return -1;
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  return den > 0 ? num / den : 0;
}
