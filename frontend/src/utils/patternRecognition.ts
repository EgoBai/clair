/**
 * 技术形态识别引擎
 * 支撑/阻力位、趋势线、图表形态、量价关系
 */

export interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SupportResistance {
  level: number;
  type: 'support' | 'resistance';
  strength: number; // 触及次数
  lastTouch: string;
}

export interface TrendLine {
  type: 'up' | 'down' | 'channel';
  points: { date: string; price: number }[];
  slope: number;
  r2: number; // 拟合度
}

export interface PatternResult {
  pattern: string;
  confidence: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  targetPrice: number;
  stopLoss: number;
  description: string;
}

export interface VolumePriceSignal {
  type: 'bullish' | 'bearish' | 'neutral';
  pattern: string;
  strength: number;
  description: string;
}

/**
 * 支撑阻力位检测
 */
export function findSupportResistance(
  ohlcv: OHLCV[],
  minTouches: number = 2,
  tolerance: number = 0.02
): SupportResistance[] {
  const levels: SupportResistance[] = [];
  const prices = ohlcv.flatMap((bar) => [bar.high, bar.low]);

  // 聚类价格水平
  const clusters = clusterPrices(prices, tolerance);

  for (const cluster of clusters) {
    if (cluster.touches < minTouches) continue;

    const isResistance = cluster.avgPrice > ohlcv[ohlcv.length - 1].close;
    levels.push({
      level: Math.round(cluster.avgPrice * 100) / 100,
      type: isResistance ? 'resistance' : 'support',
      strength: cluster.touches,
      lastTouch: cluster.lastDate,
    });
  }

  return levels.sort((a, b) => b.strength - a.strength);
}

interface PriceCluster {
  avgPrice: number;
  touches: number;
  lastDate: string;
}

function clusterPrices(prices: number[], tolerance: number): PriceCluster[] {
  const sorted = [...prices].sort((a, b) => a - b);
  const clusters: { prices: number[] }[] = [];
  let current: number[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    if ((sorted[i] - current[current.length - 1]) / current[current.length - 1] < tolerance) {
      current.push(sorted[i]);
    } else {
      clusters.push({ prices: current });
      current = [sorted[i]];
    }
  }
  clusters.push({ prices: current });

  return clusters
    .filter((c) => c.prices.length >= 2)
    .map((c) => ({
      avgPrice: c.prices.reduce((a, b) => a + b, 0) / c.prices.length,
      touches: c.prices.length,
      lastDate: new Date().toISOString().split('T')[0],
    }));
}

/**
 * 图表形态识别
 */
export function detectPatterns(ohlcv: OHLCV[]): PatternResult[] {
  const patterns: PatternResult[] = [];
  if (ohlcv.length < 20) return patterns;

  const recent = ohlcv.slice(-20);
  const closes = recent.map((b) => b.close);
  const highs = recent.map((b) => b.high);
  const lows = recent.map((b) => b.low);

  // 双底形态
  if (isDoubleBottom(lows, closes)) {
    const neckline = Math.max(...closes.slice(5, 15));
    patterns.push({
      pattern: '双底',
      confidence: 0.7,
      direction: 'bullish',
      targetPrice: Math.round((neckline + (neckline - Math.min(...lows))) * 100) / 100,
      stopLoss: Math.round(Math.min(...lows) * 0.98 * 100) / 100,
      description: 'W底形态确认，突破颈线看涨',
    });
  }

  // 双顶形态
  if (isDoubleTop(highs, closes)) {
    const neckline = Math.min(...closes.slice(5, 15));
    patterns.push({
      pattern: '双顶',
      confidence: 0.7,
      direction: 'bearish',
      targetPrice: Math.round((neckline - (Math.max(...highs) - neckline)) * 100) / 100,
      stopLoss: Math.round(Math.max(...highs) * 1.02 * 100) / 100,
      description: 'M顶形态确认，跌破颈线看跌',
    });
  }

  // 头肩底
  if (isHeadAndShouldersBottom(lows)) {
    const headPrice = Math.min(...lows.slice(5, 15));
    const shoulderAvg = (lows[2] + lows[17]) / 2;
    patterns.push({
      pattern: '头肩底',
      confidence: 0.65,
      direction: 'bullish',
      targetPrice: Math.round((shoulderAvg + (shoulderAvg - headPrice)) * 100) / 100,
      stopLoss: Math.round(headPrice * 0.98 * 100) / 100,
      description: '头肩底形态，右肩形成后看涨',
    });
  }

  // 上升通道
  const trend = detectTrend(closes);
  if (trend === 'up') {
    patterns.push({
      pattern: '上升趋势',
      confidence: 0.6,
      direction: 'bullish',
      targetPrice: Math.round(closes[closes.length - 1] * 1.05 * 100) / 100,
      stopLoss: Math.round(Math.min(...lows.slice(-5)) * 100) / 100,
      description: '处于上升趋势中，顺势做多',
    });
  } else if (trend === 'down') {
    patterns.push({
      pattern: '下降趋势',
      confidence: 0.6,
      direction: 'bearish',
      targetPrice: Math.round(closes[closes.length - 1] * 0.95 * 100) / 100,
      stopLoss: Math.round(Math.max(...highs.slice(-5)) * 100) / 100,
      description: '处于下降趋势中，观望或做空',
    });
  }

  return patterns;
}

function isDoubleBottom(lows: number[], closes: number[]): boolean {
  if (lows.length < 15) return false;
  const first = Math.min(...lows.slice(0, 7));
  const second = Math.min(...lows.slice(8, 15));
  const between = Math.max(...lows.slice(5, 10));
  return Math.abs(first - second) / first < 0.03 && between > first * 1.03;
}

function isDoubleTop(highs: number[], closes: number[]): boolean {
  if (highs.length < 15) return false;
  const first = Math.max(...highs.slice(0, 7));
  const second = Math.max(...highs.slice(8, 15));
  const between = Math.min(...highs.slice(5, 10));
  return Math.abs(first - second) / first < 0.03 && between < first * 0.97;
}

function isHeadAndShouldersBottom(lows: number[]): boolean {
  if (lows.length < 18) return false;
  const leftShoulder = Math.min(...lows.slice(0, 5));
  const head = Math.min(...lows.slice(7, 13));
  const rightShoulder = Math.min(...lows.slice(14, 18));
  return head < leftShoulder * 0.97 && head < rightShoulder * 0.97 &&
    Math.abs(leftShoulder - rightShoulder) / leftShoulder < 0.05;
}

function detectTrend(closes: number[]): 'up' | 'down' | 'sideways' {
  if (closes.length < 10) return 'sideways';
  const first = closes.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  const last = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const change = (last - first) / first;
  if (change > 0.03) return 'up';
  if (change < -0.03) return 'down';
  return 'sideways';
}

/**
 * 量价关系分析
 */
export function analyzeVolumePrice(ohlcv: OHLCV[]): VolumePriceSignal[] {
  const signals: VolumePriceSignal[] = [];
  if (ohlcv.length < 5) return signals;

  const avgVolume = ohlcv.slice(-20).reduce((s, b) => s + b.volume, 0) / Math.min(20, ohlcv.length);
  const latest = ohlcv[ohlcv.length - 1];
  const prev = ohlcv[ohlcv.length - 2];

  // 放量上涨
  if (latest.close > prev.close && latest.volume > avgVolume * 1.5) {
    signals.push({
      type: 'bullish',
      pattern: '放量上涨',
      strength: Math.min(100, 50 + (latest.volume / avgVolume - 1) * 30),
      description: `成交量放大${(latest.volume / avgVolume).toFixed(1)}倍，上涨有量支撑`,
    });
  }

  // 缩量上涨
  if (latest.close > prev.close && latest.volume < avgVolume * 0.7) {
    signals.push({
      type: 'bearish',
      pattern: '缩量上涨',
      strength: 55,
      description: '上涨但成交量萎缩，上涨动力不足',
    });
  }

  // 放量下跌
  if (latest.close < prev.close && latest.volume > avgVolume * 1.5) {
    signals.push({
      type: 'bearish',
      pattern: '放量下跌',
      strength: Math.min(100, 50 + (latest.volume / avgVolume - 1) * 30),
      description: `放量下跌，抛压沉重`,
    });
  }

  // 缩量下跌
  if (latest.close < prev.close && latest.volume < avgVolume * 0.7) {
    signals.push({
      type: 'bullish',
      pattern: '缩量下跌',
      strength: 55,
      description: '缩量回调，抛压减弱',
    });
  }

  // 底部放量
  const isNearLow = latest.close <= Math.min(...ohlcv.slice(-20).map((b) => b.low)) * 1.02;
  if (isNearLow && latest.volume > avgVolume * 2) {
    signals.push({
      type: 'bullish',
      pattern: '底部放量',
      strength: 80,
      description: '低位大幅放量，可能是底部吸筹',
    });
  }

  return signals;
}
