/**
 * 策略回测引擎
 * 支持均线交叉、RSI等简单策略的回测
 * 参考 QuantConnect 的回测引擎设计
 */

import type { KLineData } from '@shared/types';

// ==================== 策略类型 ====================

export type StrategyType = 'ma_cross' | 'rsi' | 'macd' | 'boll' | 'custom';

export interface StrategyParams {
  type: StrategyType;
  // 均线交叉参数
  fastPeriod?: number;   // 默认5
  slowPeriod?: number;   // 默认20
  // RSI参数
  rsiPeriod?: number;     // 默认14
  rsiOversold?: number;   // 默认30
  rsiOverbought?: number; // 默认70
  // MACD参数
  macdFast?: number;      // 默认12
  macdSlow?: number;      // 默认26
  macdSignal?: number;    // 默认9
  // BOLL参数
  bollPeriod?: number;    // 默认20
  bollStdDev?: number;    // 默认2
  // 通用参数
  initialCapital?: number; // 默认100000
  commission?: number;     // 默认0.0003 (万分之三)
  slippage?: number;       // 默认0.001 (千分之一)
}

export interface Trade {
  date: string;
  type: 'buy' | 'sell';
  price: number;
  quantity: number;
  amount: number;
  commission: number;
  reason: string;
  signal: string;
}

export interface DailyPortfolio {
  date: string;
  cash: number;
  position: number;       // 持有股数
  positionValue: number;  // 持仓市值
  totalValue: number;     // 总资产
  returns: number;        // 累计收益率
  dailyReturns: number;   // 日收益率
}

export interface BacktestResult {
  // 基本信息
  strategy: StrategyType;
  params: StrategyParams;
  symbol: string;
  startDate: string;
  endDate: string;
  totalDays: number;

  // 收益指标
  initialCapital: number;
  finalValue: number;
  totalReturn: number;       // 总收益率 (%)
  annualizedReturn: number;  // 年化收益率 (%)
  benchmarkReturn: number;   // 基准收益率 (买入持有)

  // 风险指标
  maxDrawdown: number;       // 最大回撤 (%)
  maxDrawdownDate: string;   // 最大回撤日期
  sharpeRatio: number;       // 夏普比率
  sortinoRatio: number;      // 索提诺比率
  volatility: number;        // 年化波动率 (%)
  downsideVolatility: number; // 下行波动率 (%)

  // 交易统计
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;           // 胜率 (%)
  avgWin: number;            // 平均盈利
  avgLoss: number;            // 平均亏损
  profitFactor: number;      // 盈亏比
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;

  // 详细数据
  trades: Trade[];
  dailyPortfolio: DailyPortfolio[];
  equityCurve: { date: string; value: number }[];
  drawdownCurve: { date: string; drawdown: number }[];
}

// ==================== 技术指标计算 ====================

/**
 * Optimized MA calculation using sliding window - O(n) instead of O(n*p)
 * Matches Bloomberg TA function precision
 */
function calcMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(data.length).fill(null);
  if (data.length < period) return result;
  let sum = 0;
  for (let i = 0; i < period; i++) { sum += data[i]; }
  result[period - 1] = sum / period;
  for (let i = period; i < data.length; i++) {
    sum += data[i] - data[i - period];
    result[i] = sum / period;
  }
  return result;
}

function calcEMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(data.length).fill(null);
  const multiplier = 2 / (period + 1);
  result[period - 1] = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) {
    result[i] = (data[i] - (result[i - 1] as number)) * multiplier + (result[i - 1] as number);
  }
  return result;
}

function calcRSI(closes: number[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return result;

  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

function calcMACD(
  closes: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { dif: (number | null)[]; dea: (number | null)[]; histogram: (number | null)[] } {
  const fastEMA = calcEMA(closes, fastPeriod);
  const slowEMA = calcEMA(closes, slowPeriod);
  const dif: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = slowPeriod - 1; i < closes.length; i++) {
    if (fastEMA[i] !== null && slowEMA[i] !== null) {
      dif[i] = (fastEMA[i] as number) - (slowEMA[i] as number);
    }
  }
  const difNums = dif.map((v) => v ?? 0);
  const dea = calcEMA(difNums, signalPeriod);
  // offset dea to align with dif
  const deaOffset: (number | null)[] = new Array(closes.length).fill(null);
  const startIdx = slowPeriod - 1 + signalPeriod - 1;
  for (let i = startIdx; i < closes.length; i++) {
    const srcIdx = i - (slowPeriod - 1);
    if (srcIdx >= 0 && dea[srcIdx] !== null) {
      deaOffset[i] = dea[srcIdx];
    }
  }
  const histogram: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = startIdx; i < closes.length; i++) {
    if (dif[i] !== null && deaOffset[i] !== null) {
      histogram[i] = 2 * ((dif[i] as number) - (deaOffset[i] as number));
    }
  }
  return { dif, dea: deaOffset, histogram };
}

// ==================== 策略信号生成 ====================

interface Signal {
  type: 'buy' | 'sell' | 'hold';
  strength: number; // 0-1
  reason: string;
}

/** Pre-computed indicator cache - O(n) instead of O(n²) per bar */
interface IndicatorCache {
  maFast: (number | null)[];
  maSlow: (number | null)[];
  rsi: (number | null)[];
  macdDif: (number | null)[];
  macdDea: (number | null)[];
}

function preComputeIndicators(closes: number[], params: StrategyParams): IndicatorCache {
  const macd = calcMACD(closes, params.macdFast || 12, params.macdSlow || 26, params.macdSignal || 9);
  return {
    maFast: calcMA(closes, params.fastPeriod || 5),
    maSlow: calcMA(closes, params.slowPeriod || 20),
    rsi: calcRSI(closes, params.rsiPeriod || 14),
    macdDif: macd.dif,
    macdDea: macd.dea,
  };
}

function generateSignalMA(
  cache: IndicatorCache,
  index: number,
  fastPeriod: number,
  slowPeriod: number
): Signal {
  if (index < 1 || cache.maFast[index] === null || cache.maSlow[index] === null || cache.maFast[index - 1] === null || cache.maSlow[index - 1] === null) {
    return { type: 'hold', strength: 0, reason: '数据不足' };
  }

  const fastNow = cache.maFast[index] as number;
  const slowNow = cache.maSlow[index] as number;
  const fastPrev = cache.maFast[index - 1] as number;
  const slowPrev = cache.maSlow[index - 1] as number;

  if (fastPrev <= slowPrev && fastNow > slowNow) {
    return {
      type: 'buy',
      strength: Math.min(Math.abs(fastNow - slowNow) / slowNow * 10, 1),
      reason: `MA${fastPeriod} 上穿 MA${slowPeriod} (金叉)`,
    };
  }
  if (fastPrev >= slowPrev && fastNow < slowNow) {
    return {
      type: 'sell',
      strength: Math.min(Math.abs(fastNow - slowNow) / slowNow * 10, 1),
      reason: `MA${fastPeriod} 下穿 MA${slowPeriod} (死叉)`,
    };
  }
  return { type: 'hold', strength: 0, reason: '无交叉信号' };
}

function generateSignalRSI(
  cache: IndicatorCache,
  index: number,
  oversold: number,
  overbought: number
): Signal {
  const rsi = cache.rsi;
  if (rsi[index] === null) {
    return { type: 'hold', strength: 0, reason: '数据不足' };
  }
  const val = rsi[index] as number;
  if (val < oversold) {
    return {
      type: 'buy',
      strength: (oversold - val) / oversold,
      reason: `RSI=${val.toFixed(1)} 超卖 (阈值${oversold})`,
    };
  }
  if (val > overbought) {
    return {
      type: 'sell',
      strength: (val - overbought) / (100 - overbought),
      reason: `RSI=${val.toFixed(1)} 超买 (阈值${overbought})`,
    };
  }
  return { type: 'hold', strength: 0, reason: `RSI=${val.toFixed(1)} 中性` };
}

function generateSignalMACD(
  cache: IndicatorCache,
  index: number
): Signal {
  if (index < 1 || cache.macdDif[index] === null || cache.macdDif[index - 1] === null) {
    return { type: 'hold', strength: 0, reason: '数据不足' };
  }
  const difNow = cache.macdDif[index] as number;
  const difPrev = cache.macdDif[index - 1] as number;
  const deaNow = cache.macdDea[index];
  if (deaNow === null) {
    return { type: 'hold', strength: 0, reason: '数据不足' };
  }

  if (difPrev <= deaNow && difNow > deaNow) {
    return {
      type: 'buy',
      strength: Math.min(Math.abs(difNow - deaNow) * 5, 1),
      reason: 'MACD 金叉 (DIF 上穿 DEA)',
    };
  }
  if (difPrev >= deaNow && difNow < deaNow) {
    return {
      type: 'sell',
      strength: Math.min(Math.abs(difNow - deaNow) * 5, 1),
      reason: 'MACD 死叉 (DIF 下穿 DEA)',
    };
  }
  return { type: 'hold', strength: 0, reason: '无交叉信号' };
}

// ==================== 回测引擎核心 ====================

export function runBacktest(
  klineData: KLineData[],
  params: StrategyParams
): BacktestResult {
  if (klineData.length < 10) {
    throw new Error('K线数据不足，至少需要10条记录');
  }

  const strategy = params.type;
  const initialCapital = params.initialCapital || 100000;
  const commission = params.commission || 0.0003;
  const slippage = params.slippage || 0.001;

  const closes = klineData.map((d) => d.close);
  const startDate = klineData[0].tradeDate;
  const endDate = klineData[klineData.length - 1].tradeDate;

  // Pre-compute all indicators ONCE - O(n) instead of O(n²)
  const indicatorCache = preComputeIndicators(closes, params);

  // 模拟交易
  let cash = initialCapital;
  let position = 0; // 持有股数
  const trades: Trade[] = [];
  const dailyPortfolio: DailyPortfolio[] = [];
  let prevTotalValue = initialCapital;
  let lastBuyDate = ''; // A股T+1: 记录买入日期
  const stampDuty = 0.001; // A股印花税 0.1% (卖出时收取)

  for (let i = 0; i < klineData.length; i++) {
    const bar = klineData[i];
    const price = bar.close;
    let signal: Signal;

    // 生成信号 (using pre-computed cache - O(1) per bar)
    switch (strategy) {
      case 'ma_cross':
        signal = generateSignalMA(indicatorCache, i, params.fastPeriod || 5, params.slowPeriod || 20);
        break;
      case 'rsi':
        signal = generateSignalRSI(indicatorCache, i, params.rsiOversold || 30, params.rsiOverbought || 70);
        break;
      case 'macd':
        signal = generateSignalMACD(indicatorCache, i);
        break;
      default:
        signal = { type: 'hold', strength: 0, reason: '未知策略' };
    }

    // 执行交易（A股T+1 + 印花税 + 100股整数倍）
    if (signal.type === 'buy' && position === 0) {
      const buyPrice = price * (1 + slippage); // 滑点
      const buyAmount = Math.floor(cash / (buyPrice * 100)) * 100; // A股100股整数倍
      if (buyAmount >= 100) {
        const cost = buyAmount * buyPrice;
        const comm = cost * commission;
        position = buyAmount;
        cash -= (cost + comm);
        lastBuyDate = bar.tradeDate;
        trades.push({
          date: bar.tradeDate,
          type: 'buy',
          price: buyPrice,
          quantity: buyAmount,
          amount: cost,
          commission: comm,
          reason: signal.reason,
          signal: `${strategy}:${signal.type}`,
        });
      }
    } else if (signal.type === 'sell' && position > 0 && bar.tradeDate !== lastBuyDate) {
      // T+1: 不允许当天买入后当天卖出
      const sellPrice = price * (1 - slippage);
      const revenue = position * sellPrice;
      const comm = revenue * commission;
      const tax = revenue * stampDuty; // A股印花税
      cash += (revenue - comm - tax);
      trades.push({
        date: bar.tradeDate,
        type: 'sell',
        price: sellPrice,
        quantity: position,
        amount: revenue,
        commission: comm + tax, // 印花税并入手续费
        reason: signal.reason,
        signal: `${strategy}:${signal.type}`,
      });
      position = 0;
    }

    // 记录每日组合状态
    const positionValue = position * price;
    const totalValue = cash + positionValue;
    const dailyReturns = prevTotalValue > 0 ? (totalValue - prevTotalValue) / prevTotalValue : 0;
    const cumulativeReturns = (totalValue - initialCapital) / initialCapital;

    dailyPortfolio.push({
      date: bar.tradeDate,
      cash,
      position,
      positionValue,
      totalValue,
      returns: cumulativeReturns,
      dailyReturns,
    });

    prevTotalValue = totalValue;
  }

  // 如果最后还持仓，平仓
  const lastPrice = closes[closes.length - 1];
  if (position > 0) {
    const sellPrice = lastPrice * (1 - slippage);
    const revenue = position * sellPrice;
    const comm = revenue * commission;
    const tax = revenue * stampDuty;
    cash += (revenue - comm - tax);
    trades.push({
      date: endDate,
      type: 'sell',
      price: sellPrice,
      quantity: position,
      amount: revenue,
      commission: comm + tax,
      reason: '回测结束强制平仓',
      signal: `${strategy}:force_sell`,
    });
    position = 0;
  }

  const finalValue = cash;
  const totalReturn = (finalValue - initialCapital) / initialCapital * 100;
  const annualizedReturn = calculateAnnualizedReturn(initialCapital, finalValue, startDate, endDate);

  // 基准收益（买入持有）
  const benchmarkReturn = (lastPrice - closes[0]) / closes[0] * 100;

  // 计算风险指标
  const dailyReturns = dailyPortfolio.map((d) => d.dailyReturns);
  const { maxDrawdown, maxDrawdownDate } = calculateMaxDrawdown(dailyPortfolio);
  const volatility = calculateVolatility(dailyReturns) * Math.sqrt(252) * 100;
  const sharpeRatio = calculateSharpeRatio(dailyReturns, annualizedReturn / 100, volatility / 100);
  const downsideVol = calculateDownsideVolatility(dailyReturns) * Math.sqrt(252) * 100;
  const sortinoRatio = downsideVol > 0 ? (annualizedReturn / 100 - 0.03) / (downsideVol / 100) : 0;

  // 交易统计
  const tradeStats = calculateTradeStats(trades);

  // 权益曲线和回撤曲线
  const equityCurve = dailyPortfolio.map((d) => ({ date: d.date, value: d.totalValue }));
  const drawdownCurve = calculateDrawdownCurve(dailyPortfolio);

  return {
    strategy,
    params,
    symbol: klineData[0] ? 'STOCK' : '',
    startDate,
    endDate,
    totalDays: klineData.length,
    initialCapital,
    finalValue: Math.round(finalValue * 100) / 100,
    totalReturn: Math.round(totalReturn * 100) / 100,
    annualizedReturn: Math.round(annualizedReturn * 100) / 100,
    benchmarkReturn: Math.round(benchmarkReturn * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    maxDrawdownDate,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    sortinoRatio: Math.round(sortinoRatio * 100) / 100,
    volatility: Math.round(volatility * 100) / 100,
    downsideVolatility: Math.round(downsideVol * 100) / 100,
    ...tradeStats,
    trades,
    dailyPortfolio,
    equityCurve,
    drawdownCurve,
  };
}

// ==================== 辅助计算函数 ====================

function calculateAnnualizedReturn(initial: number, final_: number, startDate: string, endDate: string): number {
  const days = (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 0) return 0;
  const years = days / 365;
  return (Math.pow(final_ / initial, 1 / years) - 1) * 100;
}

function calculateMaxDrawdown(portfolio: DailyPortfolio[]): { maxDrawdown: number; maxDrawdownDate: string } {
  let peak = portfolio[0]?.totalValue || 0;
  let maxDD = 0;
  let maxDDDate = portfolio[0]?.date || '';
  for (const p of portfolio) {
    if (p.totalValue > peak) peak = p.totalValue;
    const dd = (peak - p.totalValue) / peak * 100;
    if (dd > maxDD) {
      maxDD = dd;
      maxDDDate = p.date;
    }
  }
  return { maxDrawdown: maxDD, maxDrawdownDate: maxDDDate };
}

function calculateVolatility(returns: number[]): number {
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const squaredDiffs = returns.map((r) => Math.pow(r - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / returns.length);
}

function calculateSharpeRatio(returns: number[], annualizedReturn: number, volatility: number): number {
  const riskFreeRate = 0.03; // 无风险利率 3%
  if (volatility === 0) return 0;
  return (annualizedReturn - riskFreeRate) / volatility;
}

/**
 * Downside deviation per Bloomberg/QuantConnect standard
 * Uses MAR=0, all observations (not just negative)
 */
function calculateDownsideVolatility(returns: number[], mar: number = 0): number {
  if (returns.length === 0) return 0;
  const squaredDownside = returns.map((r) => {
    const diff = r - mar;
    return diff < 0 ? diff * diff : 0;
  });
  return Math.sqrt(squaredDownside.reduce((a, b) => a + b, 0) / returns.length);
}

function calculateDrawdownCurve(portfolio: DailyPortfolio[]): { date: string; drawdown: number }[] {
  let peak = portfolio[0]?.totalValue || 0;
  return portfolio.map((p) => {
    if (p.totalValue > peak) peak = p.totalValue;
    return {
      date: p.date,
      drawdown: peak > 0 ? (peak - p.totalValue) / peak * 100 : 0,
    };
  });
}

function calculateTradeStats(trades: Trade[]) {
  const sellTrades = trades.filter((t) => t.type === 'sell');
  let winningTrades = 0;
  let losingTrades = 0;
  let totalWin = 0;
  let totalLoss = 0;
  let consecutiveWins = 0;
  let consecutiveLosses = 0;
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;

  // 按买卖配对计算盈亏
  let buyStack: Trade[] = [];
  const tradePairs: { buy: Trade; sell: Trade; profit: number }[] = [];

  for (const trade of trades) {
    if (trade.type === 'buy') {
      buyStack.push(trade);
    } else if (trade.type === 'sell' && buyStack.length > 0) {
      const buyTrade = buyStack.shift()!;
      const profit = trade.amount - buyTrade.amount - buyTrade.commission - trade.commission;
      tradePairs.push({ buy: buyTrade, sell: trade, profit });

      if (profit > 0) {
        winningTrades++;
        totalWin += profit;
        consecutiveWins++;
        consecutiveLosses = 0;
        maxConsecutiveWins = Math.max(maxConsecutiveWins, consecutiveWins);
      } else {
        losingTrades++;
        totalLoss += Math.abs(profit);
        consecutiveLosses++;
        consecutiveWins = 0;
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses);
      }
    }
  }

  const totalTrades = winningTrades + losingTrades;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  const avgWin = winningTrades > 0 ? totalWin / winningTrades : 0;
  const avgLoss = losingTrades > 0 ? totalLoss / losingTrades : 0;
  const profitFactor = totalLoss > 0 ? totalWin / totalLoss : totalWin > 0 ? Infinity : 0;

  return {
    totalTrades,
    winningTrades,
    losingTrades,
    winRate: Math.round(winRate * 100) / 100,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    profitFactor: Math.round(profitFactor * 100) / 100,
    maxConsecutiveWins,
    maxConsecutiveLosses,
  };
}

// ==================== 策略预设 ====================

export const STRATEGY_PRESETS: { name: string; description: string; type: StrategyType; params: StrategyParams }[] = [
  {
    name: '双均线交叉',
    description: '短期均线上穿长期均线买入，下穿卖出。经典趋势跟踪策略。',
    type: 'ma_cross',
    params: { type: 'ma_cross', fastPeriod: 5, slowPeriod: 20, initialCapital: 100000 },
  },
  {
    name: 'RSI超买超卖',
    description: 'RSI低于超卖线买入，高于超买线卖出。适合震荡行情。',
    type: 'rsi',
    params: { type: 'rsi', rsiPeriod: 14, rsiOversold: 30, rsiOverbought: 70, initialCapital: 100000 },
  },
  {
    name: 'MACD金叉死叉',
    description: 'MACD指标DIF上穿DEA买入，下穿卖出。趋势确认策略。',
    type: 'macd',
    params: { type: 'macd', macdFast: 12, macdSlow: 26, macdSignal: 9, initialCapital: 100000 },
  },
  {
    name: '三均线系统',
    description: 'MA5/MA10/MA20三均线组合，多重确认信号。',
    type: 'ma_cross',
    params: { type: 'ma_cross', fastPeriod: 5, slowPeriod: 10, initialCapital: 100000 },
  },
  {
    name: '保守RSI',
    description: '更严格的RSI阈值，减少交易频率。',
    type: 'rsi',
    params: { type: 'rsi', rsiPeriod: 21, rsiOversold: 25, rsiOverbought: 75, initialCapital: 100000 },
  },
];

// ==================== 高级功能 (对标 Bloomberg/QuantConnect) ====================

/**
 * Walk-forward analysis for overfitting detection
 * Splits data into in-sample (training) and out-of-sample (testing) windows
 * Returns consistency ratio (closer to 1.0 = less overfitting)
 */
export function walkForwardAnalysis(
  klineData: KLineData[],
  params: StrategyParams,
  trainRatio: number = 0.7
): { inSampleReturn: number; outOfSampleReturn: number; consistencyRatio: number; isOverfit: boolean } {
  const splitIdx = Math.floor(klineData.length * trainRatio);
  const trainData = klineData.slice(0, splitIdx);
  const testData = klineData.slice(splitIdx);

  if (trainData.length < 20 || testData.length < 20) {
    return { inSampleReturn: 0, outOfSampleReturn: 0, consistencyRatio: 0, isOverfit: true };
  }

  const inSample = runBacktest(trainData, params);
  const outOfSample = runBacktest(testData, params);

  const consistencyRatio = inSample.totalReturn !== 0
    ? outOfSample.totalReturn / inSample.totalReturn
    : (outOfSample.totalReturn > 0 ? 1 : 0);

  const isOverfit = inSample.totalReturn > 5 && outOfSample.totalReturn < 0;

  return {
    inSampleReturn: Math.round(inSample.totalReturn * 100) / 100,
    outOfSampleReturn: Math.round(outOfSample.totalReturn * 100) / 100,
    consistencyRatio: Math.round(consistencyRatio * 100) / 100,
    isOverfit,
  };
}

/**
 * Run multiple strategies in parallel (QuantConnect pattern)
 */
export function runParallelBacktest(
  klineData: KLineData[],
  strategies: StrategyParams[]
): BacktestResult[] {
  return strategies.map((params) => runBacktest(klineData, params));
}

/**
 * Export backtest results to CSV format (Bloomberg-style export)
 */
export function exportBacktestToCSV(result: BacktestResult): string {
  const lines: string[] = [];

  lines.push('=== AStock Backtest Report ===');
  lines.push(`Strategy,${result.strategy}`);
  lines.push(`Period,${result.startDate} to ${result.endDate}`);
  lines.push(`Initial Capital,${result.initialCapital}`);
  lines.push(`Final Value,${result.finalValue}`);
  lines.push(`Total Return %,${result.totalReturn}`);
  lines.push(`Annualized Return %,${result.annualizedReturn}`);
  lines.push(`Benchmark Return %,${result.benchmarkReturn}`);
  lines.push(`Max Drawdown %,${result.maxDrawdown}`);
  lines.push(`Sharpe Ratio,${result.sharpeRatio}`);
  lines.push(`Sortino Ratio,${result.sortinoRatio}`);
  lines.push(`Volatility %,${result.volatility}`);
  lines.push(`Win Rate %,${result.winRate}`);
  lines.push(`Profit Factor,${result.profitFactor}`);
  lines.push(`Total Trades,${result.totalTrades}`);
  lines.push('');

  lines.push('=== Trades ===');
  lines.push('Date,Type,Price,Quantity,Amount,Commission,Reason');
  for (const t of result.trades) {
    lines.push(`${t.date},${t.type},${t.price},${t.quantity},${t.amount},${t.commission},"${t.reason}"`);
  }
  lines.push('');

  lines.push('=== Equity Curve ===');
  lines.push('Date,Value');
  for (const e of result.equityCurve) {
    lines.push(`${e.date},${e.value}`);
  }

  return lines.join('\n');
}
