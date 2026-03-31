/**
 * 技术形态识别引擎
 * K线形态、趋势线、支撑阻力识别
 */

export interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PatternResult {
  name: string;
  type: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  startIndex: number;
  endIndex: number;
  description: string;
}

export interface SupportResistance {
  level: number;
  type: 'support' | 'resistance';
  strength: number;
  touches: number;
}

/**
 * 十字星
 */
function detectDoji(candles: OHLCV[], i: number): PatternResult | null {
  const c = candles[i];
  const body = Math.abs(c.close - c.open);
  const range = c.high - c.low;
  if (range === 0) return null;
  if (body / range < 0.1) {
    return {
      name: '十字星', type: 'neutral', confidence: 0.6,
      startIndex: i, endIndex: i, description: '多空均衡，可能反转',
    };
  }
  return null;
}

/**
 * 锤子线/上吊线
 */
function detectHammer(candles: OHLCV[], i: number): PatternResult | null {
  if (i < 2) return null;
  const c = candles[i];
  const body = Math.abs(c.close - c.open);
  const lowerShadow = Math.min(c.open, c.close) - c.low;
  const upperShadow = c.high - Math.max(c.open, c.close);
  const range = c.high - c.low;
  if (range === 0) return null;

  if (lowerShadow > body * 2 && upperShadow < body * 0.5 && body / range > 0.05) {
    const prevDown = candles[i - 1].close < candles[i - 1].open;
    return {
      name: prevDown ? '锤子线' : '上吊线',
      type: prevDown ? 'bullish' : 'bearish',
      confidence: 0.65,
      startIndex: i, endIndex: i,
      description: prevDown ? '底部反转信号' : '顶部反转信号',
    };
  }
  return null;
}

/**
 * 吞没形态
 */
function detectEngulfing(candles: OHLCV[], i: number): PatternResult | null {
  if (i < 1) return null;
  const prev = candles[i - 1], curr = candles[i];
  const prevBody = prev.close - prev.open;
  const currBody = curr.close - curr.open;

  if (prevBody < 0 && currBody > 0 && curr.open < prev.close && curr.close > prev.open) {
    return { name: '看涨吞没', type: 'bullish', confidence: 0.7, startIndex: i - 1, endIndex: i, description: '底部反转，多方占优' };
  }
  if (prevBody > 0 && currBody < 0 && curr.open > prev.close && curr.close < prev.open) {
    return { name: '看跌吞没', type: 'bearish', confidence: 0.7, startIndex: i - 1, endIndex: i, description: '顶部反转，空方占优' };
  }
  return null;
}

/**
 * 早晨之星/黄昏之星
 */
function detectStar(candles: OHLCV[], i: number): PatternResult | null {
  if (i < 2) return null;
  const c1 = candles[i - 2], c2 = candles[i - 1], c3 = candles[i];
  const body2 = Math.abs(c2.close - c2.open);
  const body1 = Math.abs(c1.close - c1.open);
  const body3 = Math.abs(c3.close - c3.open);

  if (body2 < body1 * 0.3 && body2 < body3 * 0.3) {
    if (c1.close < c1.open && c3.close > c3.open && c3.close > (c1.open + c1.close) / 2) {
      return { name: '早晨之星', type: 'bullish', confidence: 0.75, startIndex: i - 2, endIndex: i, description: '强烈底部反转信号' };
    }
    if (c1.close > c1.open && c3.close < c3.open && c3.close < (c1.open + c1.close) / 2) {
      return { name: '黄昏之星', type: 'bearish', confidence: 0.75, startIndex: i - 2, endIndex: i, description: '强烈顶部反转信号' };
    }
  }
  return null;
}

/**
 * 三只乌鸦/红三兵
 */
function detectThreeMethods(candles: OHLCV[], i: number): PatternResult | null {
  if (i < 2) return null;
  const c1 = candles[i - 2], c2 = candles[i - 1], c3 = candles[i];

  // 红三兵
  if (c1.close > c1.open && c2.close > c2.open && c3.close > c3.open &&
      c2.close > c1.close && c3.close > c2.close) {
    return { name: '红三兵', type: 'bullish', confidence: 0.8, startIndex: i - 2, endIndex: i, description: '连续上涨，趋势明确' };
  }

  // 三只乌鸦
  if (c1.close < c1.open && c2.close < c2.open && c3.close < c3.open &&
      c2.close < c1.close && c3.close < c2.close) {
    return { name: '三只乌鸦', type: 'bearish', confidence: 0.8, startIndex: i - 2, endIndex: i, description: '连续下跌，趋势明确' };
  }
  return null;
}

/**
 * 识别所有形态
 */
export function detectPatterns(candles: OHLCV[]): PatternResult[] {
  const patterns: PatternResult[] = [];
  for (let i = 2; i < candles.length; i++) {
    const detectors = [detectDoji, detectHammer, detectEngulfing, detectStar, detectThreeMethods];
    for (const det of detectors) {
      const p = det(candles, i);
      if (p) patterns.push(p);
    }
  }
  return patterns;
}

/**
 * 支撑阻力识别
 */
export function findSupportResistance(candles: OHLCV[], lookback: number = 20): SupportResistance[] {
  const levels: SupportResistance[] = [];
  const tolerance = 0.005; // 0.5%

  for (let i = lookback; i < candles.length - lookback; i++) {
    const h = candles[i].high, l = candles[i].low;

    // 局部高点 → 阻力
    let isLocalMax = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && candles[j].high >= h) { isLocalMax = false; break; }
    }
    if (isLocalMax) {
      const existing = levels.find(lv => Math.abs(lv.level - h) / h < tolerance && lv.type === 'resistance');
      if (existing) { existing.touches++; existing.strength++; }
      else levels.push({ level: h, type: 'resistance', strength: 1, touches: 1 });
    }

    // 局部低点 → 支撑
    let isLocalMin = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && candles[j].low <= l) { isLocalMin = false; break; }
    }
    if (isLocalMin) {
      const existing = levels.find(lv => Math.abs(lv.level - l) / l < tolerance && lv.type === 'support');
      if (existing) { existing.touches++; existing.strength++; }
      else levels.push({ level: l, type: 'support', strength: 1, touches: 1 });
    }
  }

  return levels.sort((a, b) => b.strength - a.strength);
}
