/**
 * 趋势跟踪策略引擎 (Trend Following Strategy Engine)
 * - 多均线系统 (MA5/10/20/60/120/250)
 * - 趋势强度评分
 * - 买卖信号生成
 * - 止损止盈计算
 * - 趋势阶段判断
 * - 回撤分析
 */

export interface PriceData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MAValues {
  ma5: number;
  ma10: number;
  ma20: number;
  ma60: number;
  ma120: number;
  ma250: number;
}

export interface TrendSignal {
  type: 'golden_cross' | 'death_cross' | 'ma_breakout' | 'ma_breakdown' | 'trend_confirm';
  ma: keyof MAValues;
  price: number;
  maValue: number;
  strength: number; // 0-100
  direction: 'bullish' | 'bearish';
  description: string;
}

export interface TrendStrength {
  score: number;        // 0-100
  level: 'strong_up' | 'weak_up' | 'neutral' | 'weak_down' | 'strong_down';
  maAlignment: number;  // 均线排列度 0-1
  adx: number;          // 趋势强度指标
  duration: number;     // 趋势持续天数
}

export interface TrendPhase {
  phase: 'accumulation' | 'markup' | 'distribution' | 'decline';
  confidence: number;
  characteristics: string[];
  nextPhase: string;
}

export interface StopLossTakeProfit {
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  trailingStop: number;
  method: string;
}

export interface DrawdownAnalysis {
  maxDrawdown: number;
  maxDrawdownPct: number;
  currentDrawdown: number;
  recoveryDays: number;
  underwater: { date: string; drawdown: number }[];
}

/**
 * 计算移动平均值
 */
export function calculateMA(prices: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
  }
  return result;
}

/**
 * 计算所有均线
 */
export function calculateAllMAs(data: PriceData[]): (MAValues & { date: string; close: number })[] {
  const closes = data.map(d => d.close);
  const ma5 = calculateMA(closes, 5);
  const ma10 = calculateMA(closes, 10);
  const ma20 = calculateMA(closes, 20);
  const ma60 = calculateMA(closes, 60);
  const ma120 = calculateMA(closes, 120);
  const ma250 = calculateMA(closes, 250);

  return data.map((d, i) => ({
    date: d.date,
    close: d.close,
    ma5: ma5[i],
    ma10: ma10[i],
    ma20: ma20[i],
    ma60: ma60[i],
    ma120: ma120[i],
    ma250: ma250[i],
  }));
}

/**
 * 检测金叉死叉信号
 */
export function detectCrossovers(
  data: (MAValues & { date: string; close: number })[]
): TrendSignal[] {
  const signals: TrendSignal[] = [];
  if (data.length < 2) return signals;

  const maPairs: [keyof MAValues, keyof MAValues, string][] = [
    ['ma5', 'ma10', '5/10日线'],
    ['ma5', 'ma20', '5/20日线'],
    ['ma10', 'ma20', '10/20日线'],
    ['ma20', 'ma60', '20/60日线'],
    ['ma60', 'ma120', '60/120日线'],
  ];

  for (const [short, long, name] of maPairs) {
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];
      if (isNaN(prev[short]) || isNaN(prev[long]) || isNaN(curr[short]) || isNaN(curr[long])) continue;

      // 金叉：短期从下方穿越到上方
      if (prev[short] <= prev[long] && curr[short] > curr[long]) {
        const spread = (curr[short] - curr[long]) / curr[long] * 100;
        signals.push({
          type: 'golden_cross',
          ma: short,
          price: curr.close,
          maValue: curr[long],
          strength: Math.min(100, Math.round(spread * 20 + 50)),
          direction: 'bullish',
          description: `${name}金叉，短期均线上穿长期均线`,
        });
      }

      // 死叉：短期从上方穿越到下方
      if (prev[short] >= prev[long] && curr[short] < curr[long]) {
        const spread = (curr[long] - curr[short]) / curr[long] * 100;
        signals.push({
          type: 'death_cross',
          ma: short,
          price: curr.close,
          maValue: curr[long],
          strength: Math.min(100, Math.round(spread * 20 + 50)),
          direction: 'bearish',
          description: `${name}死叉，短期均线下穿长期均线`,
        });
      }
    }
  }

  return signals;
}

/**
 * 计算趋势强度
 */
export function calculateTrendStrength(
  data: (MAValues & { date: string; close: number })[]
): TrendStrength {
  if (data.length === 0) {
    return { score: 50, level: 'neutral', maAlignment: 0, adx: 0, duration: 0 };
  }

  const latest = data[data.length - 1];
  const { close, ma5, ma10, ma20, ma60, ma120 } = latest;

  // 均线排列度（多头排列得分）
  const validMAs = [ma5, ma10, ma20, ma60, ma120].filter(m => !isNaN(m));
  let alignmentScore = 0;
  for (let i = 0; i < validMAs.length - 1; i++) {
    if (validMAs[i] > validMAs[i + 1]) alignmentScore += 20;
  }
  const maAlignment = alignmentScore / 100;

  // ADX近似（使用价格与均线的距离波动）
  const recent = data.slice(-14);
  let directionalMovement = 0;
  for (let i = 1; i < recent.length; i++) {
    const diff = recent[i].close - recent[i - 1].close;
    directionalMovement += Math.abs(diff);
  }
  const adx = Math.min(100, directionalMovement / recent.length * 5);

  // 趋势方向评分
  let trendScore = 50;
  if (!isNaN(ma20)) {
    const priceVsMA = (close - ma20) / ma20 * 100;
    trendScore = Math.max(0, Math.min(100, 50 + priceVsMA * 10));
  }
  // 方向性权重更高，ADX做归一化修正而非绝对加成
  const directionWeight = 0.7;
  const alignmentWeight = 0.2;
  const adxWeight = 0.1;
  trendScore = trendScore * directionWeight + maAlignment * 100 * alignmentWeight + (trendScore >= 50 ? adx : -adx) * adxWeight;

  // 持续天数
  let duration = 0;
  const isUp = !isNaN(ma20) && close > ma20;
  for (let i = data.length - 1; i >= 0; i--) {
    if ((isUp && data[i].close > data[i].ma20) || (!isUp && data[i].close < data[i].ma20)) {
      duration++;
    } else {
      break;
    }
  }

  let level: TrendStrength['level'];
  if (trendScore > 75) level = 'strong_up';
  else if (trendScore > 55) level = 'weak_up';
  else if (trendScore > 45) level = 'neutral';
  else if (trendScore > 25) level = 'weak_down';
  else level = 'strong_down';

  return {
    score: Math.round(trendScore),
    level,
    maAlignment,
    adx: Math.round(adx),
    duration,
  };
}

/**
 * 判断趋势阶段
 */
export function identifyTrendPhase(
  data: (MAValues & { date: string; close: number })[],
  volumes: number[]
): TrendPhase {
  if (data.length < 20) {
    return {
      phase: 'accumulation',
      confidence: 0,
      characteristics: ['数据不足'],
      nextPhase: '待确认',
    };
  }

  const recent20 = data.slice(-20);
  const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const recentVolume = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const volRatio = recentVolume / Math.max(avgVolume, 1);

  const latest = data[data.length - 1];
  const priceRange = (Math.max(...recent20.map(d => d.close)) - Math.min(...recent20.map(d => d.close)))
    / Math.min(...recent20.map(d => d.close)) * 100;

  const trend = calculateTrendStrength(data);
  const priceVsMA60 = !isNaN(latest.ma60) ? (latest.close - latest.ma60) / latest.ma60 * 100 : 0;

  let phase: TrendPhase['phase'];
  let confidence = 50;
  const characteristics: string[] = [];

  if (trend.level === 'strong_up' && volRatio > 1.2) {
    phase = 'markup';
    confidence = 80;
    characteristics.push('均线多头排列', '放量上涨', '趋势强劲');
  } else if (trend.level === 'weak_up' && volRatio < 0.8 && priceVsMA60 > 10) {
    phase = 'distribution';
    confidence = 70;
    characteristics.push('高位缩量', '涨幅收窄', '获利盘回吐');
  } else if (trend.level === 'strong_down' || trend.level === 'weak_down') {
    phase = 'decline';
    confidence = 75;
    characteristics.push('均线空头排列', '趋势向下');
  } else {
    phase = 'accumulation';
    confidence = 60;
    characteristics.push('底部盘整', '量能萎缩', '筑底阶段');
  }

  const nextPhaseMap: Record<string, string> = {
    accumulation: 'markup (主升浪)',
    markup: 'distribution (派发)',
    distribution: 'decline (下跌)',
    decline: 'accumulation (筑底)',
  };

  return { phase, confidence, characteristics, nextPhase: nextPhaseMap[phase] };
}

/**
 * 计算止损止盈位
 */
export function calculateStopLossTakeProfit(
  entryPrice: number,
  atr: number,
  method: 'atr' | 'percentage' | 'ma' = 'atr',
  maValue?: number
): StopLossTakeProfit {
  let stopLoss: number;
  let takeProfit: number;
  let methodDesc: string;

  if (method === 'atr' && atr > 0) {
    stopLoss = entryPrice - atr * 2;
    takeProfit = entryPrice + atr * 3;
    methodDesc = `ATR止损法 (2x ATR止损, 3x ATR止盈)`;
  } else if (method === 'ma' && maValue) {
    stopLoss = maValue * 0.98;
    takeProfit = entryPrice * 1.15;
    methodDesc = `均线止损法 (跌破均线2%止损)`;
  } else {
    stopLoss = entryPrice * 0.95;
    takeProfit = entryPrice * 1.10;
    methodDesc = `百分比止损法 (5%止损, 10%止盈)`;
  }

  const risk = entryPrice - stopLoss;
  const reward = takeProfit - entryPrice;
  const riskReward = risk > 0 ? reward / risk : 0;
  const trailingStop = entryPrice - (entryPrice - stopLoss) * 0.5;

  return { stopLoss, takeProfit, riskReward, trailingStop, method: methodDesc };
}

/**
 * 回撤分析
 */
export function analyzeDrawdown(data: PriceData[]): DrawdownAnalysis {
  if (data.length === 0) {
    return { maxDrawdown: 0, maxDrawdownPct: 0, currentDrawdown: 0, recoveryDays: 0, underwater: [] };
  }

  let peak = data[0].close;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  const underwater: { date: string; drawdown: number }[] = [];

  for (const d of data) {
    if (d.close > peak) peak = d.close;
    const drawdown = peak - d.close;
    const drawdownPct = drawdown / peak * 100;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownPct = drawdownPct;
    }
    underwater.push({ date: d.date, drawdown: drawdownPct });
  }

  // 当前回撤
  const latestClose = data[data.length - 1].close;
  const recentPeak = Math.max(...data.slice(-20).map(d => d.close));
  const currentDrawdown = (recentPeak - latestClose) / recentPeak * 100;

  // 回恢复天数（从最大回撤到创新高）
  let recoveryDays = 0;
  let foundMaxDD = false;
  for (const d of data) {
    if (foundMaxDD) {
      recoveryDays++;
      if (d.close >= peak) break;
    }
    if (peak - d.close >= maxDrawdown * 0.99) foundMaxDD = true;
  }

  return { maxDrawdown, maxDrawdownPct, currentDrawdown, recoveryDays, underwater };
}

/**
 * 计算ATR (Average True Range)
 */
export function calculateATR(data: PriceData[], period: number = 14): number[] {
  if (data.length === 0) return [];

  const tr: number[] = [data[0].high - data[0].low];
  for (let i = 1; i < data.length; i++) {
    const hl = data[i].high - data[i].low;
    const hpc = Math.abs(data[i].high - data[i - 1].close);
    const lpc = Math.abs(data[i].low - data[i - 1].close);
    tr.push(Math.max(hl, hpc, lpc));
  }

  return calculateMA(tr, period);
}
