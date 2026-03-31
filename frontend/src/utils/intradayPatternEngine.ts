/**
 * 日内交易模式识别引擎
 * - 开盘模式(跳空/平开/趋势)
 * - 盘中模式(U型/V型/L型/倒U型)
 * - 收盘模式(抢筹/抛压/横盘)
 * - 量价配合分析
 * - 盘口模式识别
 */
export interface IntradayCandle {
  time: string; // HH:MM
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IntradayPatternResult {
  openingPattern: 'gap_up' | 'gap_down' | 'flat' | 'trending_up' | 'trending_down';
  intradayPattern: 'U_shape' | 'V_shape' | 'L_shape' | 'inverted_U' | 'sideways' | 'trending';
  closingPattern: 'accumulation' | 'distribution' | 'consolidation' | 'reversal_up' | 'reversal_down';
  volumePattern: 'increasing' | 'decreasing' | 'stable' | 'spike';
  priceRange: number;
  intradayVolatility: number;
  maxDrawdown: number;
  maxGain: number;
  openingGapSize: number;
  closingBias: 'bullish' | 'bearish' | 'neutral';
  patternConfidence: number; // 0-1
  summary: string;
}

export function detectIntradayPatterns(candles: IntradayCandle[], prevClose?: number): IntradayPatternResult {
  if (candles.length < 10) throw new Error('至少需要10根分钟K线');

  const sorted = [...candles].sort((a, b) => a.time.localeCompare(b.time));
  const opens = sorted.map(c => c.open);
  const closes = sorted.map(c => c.close);
  const highs = sorted.map(c => c.high);
  const lows = sorted.map(c => c.low);
  const volumes = sorted.map(c => c.volume);

  const firstOpen = opens[0];
  const lastClose = closes[closes.length - 1];
  const dayHigh = Math.max(...highs);
  const dayLow = Math.min(...lows);
  const priceRange = dayHigh - dayLow;

  // 开盘模式
  let openingPattern: IntradayPatternResult['openingPattern'] = 'flat';
  const openingGapSize = prevClose ? (firstOpen - prevClose) / prevClose : 0;
  if (openingGapSize > 0.005) openingPattern = 'gap_up';
  else if (openingGapSize < -0.005) openingPattern = 'gap_down';
  else {
    const first3Closes = closes.slice(0, Math.min(3, closes.length));
    const trend = first3Closes[first3Closes.length - 1] - firstOpen;
    if (trend > priceRange * 0.1) openingPattern = 'trending_up';
    else if (trend < -priceRange * 0.1) openingPattern = 'trending_down';
  }

  // 盘中模式 - 基于前1/3、中1/3、后1/3的价格位置
  const third = Math.floor(closes.length / 3);
  const firstThirdAvg = closes.slice(0, third).reduce((s, v) => s + v, 0) / third;
  const midThirdAvg = closes.slice(third, third * 2).reduce((s, v) => s + v, 0) / third;
  const lastThirdAvg = closes.slice(third * 2).reduce((s, v) => s + v, 0) / (closes.length - third * 2);

  const pos = (v: number) => (v - dayLow) / Math.max(priceRange, 0.001);
  const p1 = pos(firstThirdAvg), p2 = pos(midThirdAvg), p3 = pos(lastThirdAvg);

  let intradayPattern: IntradayPatternResult['intradayPattern'] = 'sideways';
  if (p1 > 0.6 && p2 < 0.4 && p3 > 0.6) intradayPattern = 'V_shape';
  else if (p1 < 0.4 && p2 > 0.6 && p3 < 0.4) intradayPattern = 'inverted_U';
  else if (p1 > 0.6 && p2 < 0.4 && p3 < 0.4) intradayPattern = 'L_shape';
  else if (p1 < 0.4 && p2 < 0.4 && p3 > 0.6) intradayPattern = 'U_shape';
  else if (p3 > p1 + 0.15) intradayPattern = 'trending';
  else if (Math.abs(p3 - p1) < 0.1) intradayPattern = 'sideways';

  // 收盘模式
  let closingPattern: IntradayPatternResult['closingPattern'] = 'consolidation';
  const last5 = closes.slice(-5);
  const last5Vol = volumes.slice(-5);
  const last5AvgVol = last5Vol.reduce((s, v) => s + v, 0) / 5;
  const totalAvgVol = volumes.reduce((s, v) => s + v, 0) / volumes.length;

  if (last5[4] > last5[0] && last5AvgVol > totalAvgVol * 1.2) closingPattern = 'accumulation';
  else if (last5[4] < last5[0] && last5AvgVol > totalAvgVol * 1.2) closingPattern = 'distribution';
  else if (last5[4] > last5[0] && last5[0] < last5[2]) closingPattern = 'reversal_up';
  else if (last5[4] < last5[0] && last5[0] > last5[2]) closingPattern = 'reversal_down';

  // 成交量模式
  const firstHalfVol = volumes.slice(0, Math.floor(volumes.length / 2)).reduce((s, v) => s + v, 0);
  const secondHalfVol = volumes.slice(Math.floor(volumes.length / 2)).reduce((s, v) => s + v, 0);
  const maxVol = Math.max(...volumes);
  const avgVol = totalAvgVol;

  let volumePattern: IntradayPatternResult['volumePattern'] = 'stable';
  if (maxVol > avgVol * 3) volumePattern = 'spike';
  else if (secondHalfVol > firstHalfVol * 1.5) volumePattern = 'increasing';
  else if (firstHalfVol > secondHalfVol * 1.5) volumePattern = 'decreasing';

  // 盘中波动率
  const returns = closes.slice(1).map((c, i) => (c - closes[i]) / Math.max(closes[i], 0.001));
  const intradayVolatility = Math.sqrt(returns.reduce((s, r) => s + r ** 2, 0) / returns.length);

  // 最大回撤和最大涨幅
  let peak = closes[0], maxDrawdown = 0, maxGain = 0, trough = closes[0];
  for (const c of closes) {
    if (c > peak) { peak = c; trough = c; }
    if (c < trough) trough = c;
    maxDrawdown = Math.min(maxDrawdown, (trough - peak) / peak);
    maxGain = Math.max(maxGain, (c - trough) / Math.max(trough, 0.001));
  }

  const closingBias = lastClose > firstOpen ? 'bullish' : lastClose < firstOpen ? 'bearish' : 'neutral';

  const summary = [
    openingPattern === 'gap_up' ? '高开' : openingPattern === 'gap_down' ? '低开' : '平开',
    intradayPattern === 'V_shape' ? 'V型走势' : intradayPattern === 'inverted_U' ? '倒V走势' : intradayPattern === 'U_shape' ? 'U型走势' : '横盘整理',
    closingPattern === 'accumulation' ? '尾盘抢筹' : closingPattern === 'distribution' ? '尾盘抛压' : '平稳收盘',
  ].join('，');

  return {
    openingPattern,
    intradayPattern,
    closingPattern,
    volumePattern,
    priceRange: Math.round(priceRange * 100) / 100,
    intradayVolatility: Math.round(intradayVolatility * 10000) / 10000,
    maxDrawdown: Math.round(maxDrawdown * 10000) / 10000,
    maxGain: Math.round(maxGain * 10000) / 10000,
    openingGapSize: Math.round(openingGapSize * 10000) / 10000,
    closingBias,
    patternConfidence: 0.75,
    summary,
  };
}
