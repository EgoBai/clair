/**
 * 技术分析引擎 — 均线、支撑压力、交易信号
 * 输入日K线数据，输出多维度技术指标
 */

export interface KLine {
  tradeDate: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  turnover?: number;
}

export interface MA {
  ma5: number[];
  ma10: number[];
  ma20: number[];
  ma60: number[];
}

export interface SupportResistance {
  support: { price: number; strength: number; date: string }[];
  resistance: { price: number; strength: number; date: string }[];
}

export interface Signal {
  type: 'golden_cross' | 'death_cross' | 'oversold' | 'overbought' | 'volume_break';
  description: string;
  date: string;
  direction: 'buy' | 'sell' | 'neutral';
}

export interface StrategyResult {
  mas: MA;
  sr: SupportResistance;
  signals: Signal[];
  trend: 'up' | 'down' | 'sideways';
  trendStrength: number; // 0-100
  currentPrice: number;
}

/** 简单移动平均 */
function sma(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(NaN); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j];
    result.push(sum / period);
  }
  return result;
}

/** 计算全部均线 */
export function calcMA(kline: KLine[]): MA {
  const closes = kline.map(k => k.close);
  return {
    ma5: sma(closes, 5),
    ma10: sma(closes, 10),
    ma20: sma(closes, 20),
    ma60: sma(closes, 60),
  };
}

/** 计算支撑压力位 */
export function calcSupportResistance(kline: KLine[], lookback = 60): SupportResistance {
  const recent = kline.slice(-lookback);
  const _highs = recent.map(k => ({ price: k.high, date: k.tradeDate }));
  const _lows = recent.map(k => ({ price: k.low, date: k.tradeDate }));

  // 找局部极值点（左右3天内的最高/最低）
  const peaks: { price: number; strength: number; date: string }[] = [];
  const troughs: { price: number; strength: number; date: string }[] = [];

  for (let i = 3; i < recent.length - 3; i++) {
    const leftHighs = recent.slice(i - 3, i).map(k => k.high);
    const rightHighs = recent.slice(i + 1, i + 4).map(k => k.high);
    const leftLows = recent.slice(i - 3, i).map(k => k.low);
    const rightLows = recent.slice(i + 1, i + 4).map(k => k.low);

    if (recent[i].high > Math.max(...leftHighs, ...rightHighs)) {
      peaks.push({ price: recent[i].high, strength: 1, date: recent[i].tradeDate });
    }
    if (recent[i].low < Math.min(...leftLows, ...rightLows)) {
      troughs.push({ price: recent[i].low, strength: 1, date: recent[i].tradeDate });
    }
  }

  // 合并相近的支撑/压力位
  const merge = (levels: { price: number; strength: number; date: string }[]) => {
    const sorted = levels.sort((a, b) => b.price - a.price);
    const merged: { price: number; strength: number; date: string }[] = [];
    for (const level of sorted) {
      const existing = merged.find(m => Math.abs(m.price - level.price) / level.price < 0.02);
      if (existing) {
        existing.strength++;
        if (level.date > existing.date) existing.date = level.date;
      } else {
        merged.push({ ...level });
      }
    }
    return merged.slice(0, 3);
  };

  return {
    support: merge(troughs).sort((a, b) => b.price - a.price),
    resistance: merge(peaks).sort((a, b) => a.price - b.price),
  };
}

/** 金叉死叉检测 */
export function calcSignals(kline: KLine[], mas: MA): Signal[] {
  const signals: Signal[] = [];
  const n = Math.min(kline.length, mas.ma5.length, mas.ma10.length, mas.ma20.length);

  for (let i = 1; i < n; i++) {
    const prev = i - 1;
    // 金叉: MA5 上穿 MA20
    if (mas.ma5[prev] <= mas.ma20[prev] && mas.ma5[i] > mas.ma20[i]) {
      signals.push({ type: 'golden_cross', description: 'MA5 金叉 MA20', date: kline[i].tradeDate, direction: 'buy' });
    }
    // 死叉: MA5 下穿 MA20
    if (mas.ma5[prev] >= mas.ma20[prev] && mas.ma5[i] < mas.ma20[i]) {
      signals.push({ type: 'death_cross', description: 'MA5 死叉 MA20', date: kline[i].tradeDate, direction: 'sell' });
    }
  }

  // 只保留最近 5 个信号
  return signals.slice(-5);
}

/** 趋势判断 */
export function calcTrend(kline: KLine[], mas: MA): { trend: 'up' | 'down' | 'sideways'; strength: number } {
  const n = mas.ma20.length;
  if (n < 20) return { trend: 'sideways', strength: 0 };

  // 计算 MA20 斜率（最近10个周期）
  const start20 = mas.ma20[n - 11] || mas.ma20[n - 10];
  const end20 = mas.ma20[n - 1];
  const slope = ((end20 - start20) / start20) * 100;

  // 价格相对于 MA20 的位置
  const currentPrice = kline[kline.length - 1].close;
  const currentMA20 = mas.ma20[n - 1];
  const deviation = ((currentPrice - currentMA20) / currentMA20) * 100;

  if (slope > 0.3 && deviation > -1) return { trend: 'up', strength: Math.min(100, Math.abs(slope) * 30 + Math.abs(deviation) * 20) };
  if (slope < -0.3 && deviation < 1) return { trend: 'down', strength: Math.min(100, Math.abs(slope) * 30 + Math.abs(deviation) * 20) };
  return { trend: 'sideways', strength: Math.max(10, 50 - Math.abs(slope) * 30) };
}

/** 完整策略分析 */
export function analyze(kline: KLine[]): StrategyResult {
  const mas = calcMA(kline);
  const sr = calcSupportResistance(kline);
  const signals = calcSignals(kline, mas);
  const trend = calcTrend(kline, mas);
  return {
    mas, sr, signals,
    trend: trend.trend,
    trendStrength: trend.strength,
    currentPrice: kline[kline.length - 1]?.close || 0,
  };
}
