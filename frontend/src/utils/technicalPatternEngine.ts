/**
 * 技术形态识别引擎
 * - K线形态识别
 * - 支撑/阻力位检测
 * - 趋势线识别
 * - 价格形态匹配
 */

export interface OHLCV {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  date: string;
}

export interface PatternResult {
  name: string;
  type: 'bullish' | 'bearish' | 'neutral';
  startIndex: number;
  endIndex: number;
  confidence: number;
  description: string;
}

export interface SupportResistance {
  level: number;
  type: 'support' | 'resistance';
  strength: number; // 0-100
  touchCount: number;
  lastTouch: number; // index
}

export interface TrendLine {
  type: 'up' | 'down' | 'horizontal';
  points: Array<{ index: number; price: number }>;
  slope: number;
  rSquared: number;
}

export class TechnicalPatternEngine {
  /**
   * 识别K线形态
   */
  detectPatterns(candles: OHLCV[]): PatternResult[] {
    const patterns: PatternResult[] = [];

    for (let i = 2; i < candles.length; i++) {
      const curr = candles[i];
      const prev = candles[i - 1];
      const prev2 = candles[i - 2];

      const body = Math.abs(curr.close - curr.open);
      const upperWick = curr.high - Math.max(curr.close, curr.open);
      const lowerWick = Math.min(curr.close, curr.open) - curr.low;
      const range = curr.high - curr.low;

      // 锤子线
      if (lowerWick > body * 2 && upperWick < body * 0.5 && range > 0) {
        patterns.push({
          name: '锤子线',
          type: curr.close > curr.open ? 'bullish' : 'bearish',
          startIndex: i,
          endIndex: i,
          confidence: 0.7,
          description: '下影线较长，可能反转',
        });
      }

      // 吞没形态
      const prevBody = Math.abs(prev.close - prev.open);
      if (body > prevBody) {
        const engulfing = curr.open <= prev.close && curr.close >= prev.open && prev.close < prev.open;
        const bullishEngulf = curr.open >= prev.close && curr.close <= prev.open && prev.close > prev.open;

        if (engulfing) {
          patterns.push({
            name: '看涨吞没',
            type: 'bullish',
            startIndex: i - 1,
            endIndex: i,
            confidence: 0.75,
            description: '阳线吞没前一根阴线',
          });
        }
      }

      // 三只乌鸦/红三兵
      if (i >= 2) {
        const threeDown = prev2.close < prev2.open && prev.close < prev.open && curr.close < curr.open;
        const consecutiveDown = prev2.close > prev.close && prev.close > curr.close;
        if (threeDown && consecutiveDown) {
          patterns.push({
            name: '三只乌鸦',
            type: 'bearish',
            startIndex: i - 2,
            endIndex: i,
            confidence: 0.8,
            description: '连续三根阴线，看跌信号',
          });
        }

        const threeUp = prev2.close > prev2.open && prev.close > prev.open && curr.close > curr.open;
        const consecutiveUp = prev2.close < prev.close && prev.close < curr.close;
        if (threeUp && consecutiveUp) {
          patterns.push({
            name: '红三兵',
            type: 'bullish',
            startIndex: i - 2,
            endIndex: i,
            confidence: 0.8,
            description: '连续三根阳线，看涨信号',
          });
        }
      }

      // 十字星
      if (body < range * 0.1 && range > 0) {
        patterns.push({
          name: '十字星',
          type: 'neutral',
          startIndex: i,
          endIndex: i,
          confidence: 0.6,
          description: '多空平衡，等待方向',
        });
      }
    }

    return patterns;
  }

  /**
   * 检测支撑/阻力位
   */
  detectSupportResistance(candles: OHLCV[], lookback: number = 20): SupportResistance[] {
    const levels: SupportResistance[] = [];
    const n = candles.length;

    for (let i = lookback; i < n - lookback; i++) {
      const localHighs = [];
      const localLows = [];

      for (let j = i - lookback; j <= i + lookback; j++) {
        localHighs.push(candles[j].high);
        localLows.push(candles[j].low);
      }

      const maxHigh = Math.max(...localHighs);
      const minLow = Math.min(...localLows);

      // 局部高点 = 阻力
      if (candles[i].high === maxHigh) {
        const touchCount = candles.filter((c, j) => Math.abs(c.high - maxHigh) / maxHigh < 0.01).length;
        levels.push({
          level: Math.round(maxHigh * 100) / 100,
          type: 'resistance',
          strength: Math.min(100, touchCount * 20),
          touchCount,
          lastTouch: i,
        });
      }

      // 局部低点 = 支撑
      if (candles[i].low === minLow) {
        const touchCount = candles.filter((c, j) => Math.abs(c.low - minLow) / minLow < 0.01).length;
        levels.push({
          level: Math.round(minLow * 100) / 100,
          type: 'support',
          strength: Math.min(100, touchCount * 20),
          touchCount,
          lastTouch: i,
        });
      }
    }

    // 去重(合并接近的水平)
    const merged: SupportResistance[] = [];
    const sorted = levels.sort((a, b) => a.level - b.level);
    for (const level of sorted) {
      const existing = merged.find(m => Math.abs(m.level - level.level) / level.level < 0.02);
      if (existing) {
        existing.touchCount += level.touchCount;
        existing.strength = Math.min(100, existing.strength + level.strength);
      } else {
        merged.push(level);
      }
    }

    return merged.sort((a, b) => b.strength - a.strength);
  }

  /**
   * 趋势线识别
   */
  detectTrendLines(candles: OHLCV[], minTouches: number = 3): TrendLine[] {
    const trendLines: TrendLine[] = [];
    const n = candles.length;

    if (n < minTouches * 2) return trendLines;

    // 高点趋势线
    const highs = candles.map((c, i) => ({ index: i, price: c.high }));
    const lows = candles.map((c, i) => ({ index: i, price: c.low }));

    // 简化: 取首尾中点连线
    const upLine = this.fitLine(lows);
    const downLine = this.fitLine(highs);

    if (upLine.rSquared > 0.5) {
      trendLines.push({ type: upLine.slope > 0 ? 'up' : upLine.slope < 0 ? 'down' : 'horizontal', points: [lows[0], lows[Math.floor(n / 2)], lows[n - 1]], ...upLine });
    }
    if (downLine.rSquared > 0.5) {
      trendLines.push({ type: downLine.slope > 0 ? 'up' : downLine.slope < 0 ? 'down' : 'horizontal', points: [highs[0], highs[Math.floor(n / 2)], highs[n - 1]], ...downLine });
    }

    return trendLines;
  }

  private fitLine(points: Array<{ index: number; price: number }>): { slope: number; rSquared: number } {
    const n = points.length;
    const xMean = points.reduce((s, p) => s + p.index, 0) / n;
    const yMean = points.reduce((s, p) => s + p.price, 0) / n;

    let num = 0, denX = 0, denY = 0;
    for (const p of points) {
      const dx = p.index - xMean;
      const dy = p.price - yMean;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }

    const slope = denX > 0 ? num / denX : 0;
    const rSquared = (denX > 0 && denY > 0) ? (num ** 2) / (denX * denY) : 0;

    return { slope: Math.round(slope * 10000) / 10000, rSquared: Math.round(rSquared * 10000) / 10000 };
  }
}

export default new TechnicalPatternEngine();
