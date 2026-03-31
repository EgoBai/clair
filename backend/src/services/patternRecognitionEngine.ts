/**
 * 技术形态自动识别引擎
 * - 经典形态: 头肩顶/底, 双顶/底, 三角形, 旗形, 楔形
 * - 缺口识别: 普通/突破/竭尽缺口
 * - 趋势线/通道自动绘制
 * - 支撑/阻力位识别
 * - 形态完成度评估
 */

export interface PricePoint {
  high: number;
  low: number;
  close: number;
  open: number;
  volume: number;
  timestamp: number;
}

export interface PivotPoint {
  index: number;
  price: number;
  type: 'high' | 'low';
  strength: number; // 0-1
}

export interface ChartPattern {
  type: 'head_shoulders' | 'inv_head_shoulders' | 'double_top' | 'double_bottom' |
        'triangle_ascending' | 'triangle_descending' | 'triangle_symmetric' |
        'flag_bull' | 'flag_bear' | 'wedge_rising' | 'wedge_falling' |
        'channel_up' | 'channel_down' | 'rectangle' | 'cup_handle';
  direction: 'bullish' | 'bearish' | 'neutral';
  startIndex: number;
  endIndex: number;
  completionPercent: number;
  targetPrice: number;
  stopLoss: number;
  confidence: number;
  keyPoints: Array<{ index: number; price: number; role: string }>;
}

export interface GapPattern {
  index: number;
  type: 'common' | 'breakaway' | 'runaway' | 'exhaustion';
  upperBound: number;
  lowerBound: number;
  gapSize: number;
  gapPercent: number;
  filled: boolean;
  fillIndex?: number;
}

export interface TrendLine {
  type: 'support' | 'resistance' | 'channel_upper' | 'channel_lower';
  points: Array<{ index: number; price: number }>;
  slope: number;
  strength: number; // number of touches
  currentLevel: number;
  breakoutIndex?: number;
}

export interface SupportResistance {
  level: number;
  type: 'support' | 'resistance';
  strength: number;
  touchCount: number;
  firstTouchIndex: number;
  lastTouchIndex: number;
}

export interface PatternRecognitionResult {
  patterns: ChartPattern[];
  gaps: GapPattern[];
  trendLines: TrendLine[];
  supportResistance: SupportResistance[];
  pivots: PivotPoint[];
  currentBias: 'bullish' | 'bearish' | 'neutral';
}

export class PatternRecognitionEngine {
  private readonly minPivotStrength = 3;

  /**
   * 识别枢轴点(高低点)
   */
  findPivots(prices: PricePoint[], strength: number = 3): PivotPoint[] {
    const pivots: PivotPoint[] = [];

    for (let i = strength; i < prices.length - strength; i++) {
      // Check for high pivot
      let isHigh = true;
      for (let j = 1; j <= strength; j++) {
        if (prices[i].high <= prices[i - j].high || prices[i].high <= prices[i + j].high) {
          isHigh = false;
          break;
        }
      }
      if (isHigh) {
        let s = 0;
        for (let j = 1; j <= strength; j++) {
          if (prices[i].high > prices[i - j].high && prices[i].high > prices[i + j].high) s++;
        }
        pivots.push({ index: i, price: prices[i].high, type: 'high', strength: s / strength });
      }

      // Check for low pivot
      let isLow = true;
      for (let j = 1; j <= strength; j++) {
        if (prices[i].low >= prices[i - j].low || prices[i].low >= prices[i + j].low) {
          isLow = false;
          break;
        }
      }
      if (isLow) {
        let s = 0;
        for (let j = 1; j <= strength; j++) {
          if (prices[i].low < prices[i - j].low && prices[i].low < prices[i + j].low) s++;
        }
        pivots.push({ index: i, price: prices[i].low, type: 'low', strength: s / strength });
      }
    }

    return pivots.sort((a, b) => a.index - b.index);
  }

  /**
   * 识别图表形态
   */
  identifyPatterns(prices: PricePoint[], pivots?: PivotPoint[]): ChartPattern[] {
    const pvt = pivots || this.findPivots(prices, this.minPivotStrength);
    const patterns: ChartPattern[] = [];

    // Head and Shoulders
    patterns.push(...this.findHeadShoulders(prices, pvt));
    // Double Top/Bottom
    patterns.push(...this.findDoubleTopBottom(prices, pvt));
    // Triangles
    patterns.push(...this.findTriangles(prices, pvt));
    // Wedges
    patterns.push(...this.findWedges(prices, pvt));
    // Flags
    patterns.push(...this.findFlags(prices, pvt));

    return patterns.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * 识别缺口
   */
  identifyGaps(prices: PricePoint[]): GapPattern[] {
    const gaps: GapPattern[] = [];

    for (let i = 1; i < prices.length; i++) {
      const prev = prices[i - 1];
      const curr = prices[i];

      // Upward gap
      if (curr.low > prev.high) {
        const gapSize = curr.low - prev.high;
        const gapPercent = gapSize / prev.high;
        const type = this.classifyGap(prices, i, 'up', gapPercent);
        const filled = this.checkGapFilled(prices, i, curr.low, prev.high, 'up');

        gaps.push({
          index: i, type, upperBound: curr.low, lowerBound: prev.high,
          gapSize, gapPercent, filled, fillIndex: filled ? undefined : undefined
        });
      }

      // Downward gap
      if (curr.high < prev.low) {
        const gapSize = prev.low - curr.high;
        const gapPercent = gapSize / prev.low;
        const type = this.classifyGap(prices, i, 'down', gapPercent);
        const filled = this.checkGapFilled(prices, i, prev.low, curr.high, 'down');

        gaps.push({
          index: i, type, upperBound: prev.low, lowerBound: curr.high,
          gapSize, gapPercent, filled
        });
      }
    }

    return gaps;
  }

  /**
   * 自动绘制趋势线
   */
  drawTrendLines(prices: PricePoint[], pivots?: PivotPoint[]): TrendLine[] {
    const pvt = pivots || this.findPivots(prices, this.minPivotStrength);
    const lines: TrendLine[] = [];

    const highs = pvt.filter(p => p.type === 'high');
    const lows = pvt.filter(p => p.type === 'low');

    // Resistance lines (connecting highs)
    if (highs.length >= 2) {
      for (let i = 0; i < highs.length - 1; i++) {
        for (let j = i + 1; j < highs.length; j++) {
          const p1 = highs[i];
          const p2 = highs[j];
          const slope = (p2.price - p1.price) / (p2.index - p1.index);

          // Count touches
          let touches = 2;
          for (const h of highs) {
            if (h === p1 || h === p2) continue;
            const expectedPrice = p1.price + slope * (h.index - p1.index);
            if (Math.abs(h.price - expectedPrice) / expectedPrice < 0.01) touches++;
          }

          if (touches >= 2) {
            const currentLevel = p1.price + slope * (prices.length - 1 - p1.index);
            lines.push({
              type: 'resistance',
              points: [{ index: p1.index, price: p1.price }, { index: p2.index, price: p2.price }],
              slope,
              strength: touches,
              currentLevel
            });
          }
        }
      }
    }

    // Support lines (connecting lows)
    if (lows.length >= 2) {
      for (let i = 0; i < lows.length - 1; i++) {
        for (let j = i + 1; j < lows.length; j++) {
          const p1 = lows[i];
          const p2 = lows[j];
          const slope = (p2.price - p1.price) / (p2.index - p1.index);

          let touches = 2;
          for (const l of lows) {
            if (l === p1 || l === p2) continue;
            const expectedPrice = p1.price + slope * (l.index - p1.index);
            if (Math.abs(l.price - expectedPrice) / expectedPrice < 0.01) touches++;
          }

          if (touches >= 2) {
            const currentLevel = p1.price + slope * (prices.length - 1 - p1.index);
            lines.push({
              type: 'support',
              points: [{ index: p1.index, price: p1.price }, { index: p2.index, price: p2.price }],
              slope,
              strength: touches,
              currentLevel
            });
          }
        }
      }
    }

    return lines.sort((a, b) => b.strength - a.strength);
  }

  /**
   * 识别支撑/阻力位
   */
  findSupportResistance(prices: PricePoint[], tolerance: number = 0.02): SupportResistance[] {
    const levels: Map<number, { count: number; first: number; last: number; type: 'support' | 'resistance' }> = new Map();

    for (let i = 0; i < prices.length; i++) {
      // Check if price is near existing level
      let matched = false;
      for (const [level, data] of levels) {
        if (Math.abs(prices[i].high - level) / level < tolerance ||
            Math.abs(prices[i].low - level) / level < tolerance) {
          data.count++;
          data.last = i;
          matched = true;
          break;
        }
      }

      if (!matched) {
        // Use high as potential resistance, low as potential support
        const midPrice = (prices[i].high + prices[i].low) / 2;
        levels.set(midPrice, { count: 1, first: i, last: i, type: prices[i].close > midPrice ? 'support' : 'resistance' });
      }
    }

    return Array.from(levels.entries())
      .filter(([, data]) => data.count >= 2)
      .map(([level, data]) => ({
        level,
        type: data.type,
        strength: Math.min(1, data.count / 5),
        touchCount: data.count,
        firstTouchIndex: data.first,
        lastTouchIndex: data.last
      }))
      .sort((a, b) => b.touchCount - a.touchCount);
  }

  /**
   * 完整形态识别
   */
  recognizeAll(prices: PricePoint[]): PatternRecognitionResult {
    const pivots = this.findPivots(prices, this.minPivotStrength);
    const patterns = this.identifyPatterns(prices, pivots);
    const gaps = this.identifyGaps(prices);
    const trendLines = this.drawTrendLines(prices, pivots);
    const supportResistance = this.findSupportResistance(prices);

    // Determine current bias
    const bullishPatterns = patterns.filter(p => p.direction === 'bullish').length;
    const bearishPatterns = patterns.filter(p => p.direction === 'bearish').length;

    let currentBias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (bullishPatterns > bearishPatterns + 1) currentBias = 'bullish';
    else if (bearishPatterns > bullishPatterns + 1) currentBias = 'bearish';

    return { patterns, gaps, trendLines, supportResistance, pivots, currentBias };
  }

  // --- Private Pattern Finders ---

  private findHeadShoulders(prices: PricePoint[], pivots: PivotPoint[]): ChartPattern[] {
    const patterns: ChartPattern[] = [];
    const highs = pivots.filter(p => p.type === 'high');

    for (let i = 0; i < highs.length - 2; i++) {
      const lShoulder = highs[i];
      const head = highs[i + 1];
      const rShoulder = highs[i + 2];

      // Head should be higher than shoulders
      if (head.price > lShoulder.price && head.price > rShoulder.price) {
        // Shoulders roughly equal
        const shoulderDiff = Math.abs(lShoulder.price - rShoulder.price) / lShoulder.price;
        if (shoulderDiff < 0.03) {
          const neckline = Math.min(
            ...pivots.filter(p => p.type === 'low' && p.index > lShoulder.index && p.index < rShoulder.index).map(p => p.price)
          );

          if (neckline > 0) {
            const targetPrice = neckline - (head.price - neckline);
            patterns.push({
              type: 'head_shoulders',
              direction: 'bearish',
              startIndex: lShoulder.index,
              endIndex: rShoulder.index,
              completionPercent: 100,
              targetPrice,
              stopLoss: head.price,
              confidence: 0.7,
              keyPoints: [
                { index: lShoulder.index, price: lShoulder.price, role: 'left_shoulder' },
                { index: head.index, price: head.price, role: 'head' },
                { index: rShoulder.index, price: rShoulder.price, role: 'right_shoulder' },
              ]
            });
          }
        }
      }
    }

    return patterns;
  }

  private findDoubleTopBottom(prices: PricePoint[], pivots: PivotPoint[]): ChartPattern[] {
    const patterns: ChartPattern[] = [];
    const highs = pivots.filter(p => p.type === 'high');
    const lows = pivots.filter(p => p.type === 'low');

    // Double top
    for (let i = 0; i < highs.length - 1; i++) {
      for (let j = i + 1; j < highs.length; j++) {
        const diff = Math.abs(highs[i].price - highs[j].price) / highs[i].price;
        if (diff < 0.02 && j - i <= 3) {
          patterns.push({
            type: 'double_top',
            direction: 'bearish',
            startIndex: highs[i].index,
            endIndex: highs[j].index,
            completionPercent: 100,
            targetPrice: highs[i].price - (highs[i].price * 0.05),
            stopLoss: Math.max(highs[i].price, highs[j].price) * 1.01,
            confidence: 0.65,
            keyPoints: [
              { index: highs[i].index, price: highs[i].price, role: 'first_top' },
              { index: highs[j].index, price: highs[j].price, role: 'second_top' },
            ]
          });
        }
      }
    }

    // Double bottom
    for (let i = 0; i < lows.length - 1; i++) {
      for (let j = i + 1; j < lows.length; j++) {
        const diff = Math.abs(lows[i].price - lows[j].price) / lows[i].price;
        if (diff < 0.02 && j - i <= 3) {
          patterns.push({
            type: 'double_bottom',
            direction: 'bullish',
            startIndex: lows[i].index,
            endIndex: lows[j].index,
            completionPercent: 100,
            targetPrice: lows[i].price + (lows[i].price * 0.05),
            stopLoss: Math.min(lows[i].price, lows[j].price) * 0.99,
            confidence: 0.65,
            keyPoints: [
              { index: lows[i].index, price: lows[i].price, role: 'first_bottom' },
              { index: lows[j].index, price: lows[j].price, role: 'second_bottom' },
            ]
          });
        }
      }
    }

    return patterns;
  }

  private findTriangles(prices: PricePoint[], pivots: PivotPoint[]): ChartPattern[] {
    const patterns: ChartPattern[] = [];
    const highs = pivots.filter(p => p.type === 'high');
    const lows = pivots.filter(p => p.type === 'low');

    if (highs.length < 2 || lows.length < 2) return patterns;

    // Check for ascending triangle (flat top, rising bottom)
    const highSlope = (highs[highs.length - 1].price - highs[0].price) / (highs[highs.length - 1].index - highs[0].index);
    const lowSlope = (lows[lows.length - 1].price - lows[0].price) / (lows[lows.length - 1].index - lows[0].index);

    if (Math.abs(highSlope) < 0.001 && lowSlope > 0.001) {
      patterns.push({
        type: 'triangle_ascending',
        direction: 'bullish',
        startIndex: Math.min(highs[0].index, lows[0].index),
        endIndex: Math.max(highs[highs.length - 1].index, lows[lows.length - 1].index),
        completionPercent: 70,
        targetPrice: highs[0].price * 1.05,
        stopLoss: lows[lows.length - 1].price * 0.98,
        confidence: 0.6,
        keyPoints: []
      });
    } else if (Math.abs(lowSlope) < 0.001 && highSlope < -0.001) {
      patterns.push({
        type: 'triangle_descending',
        direction: 'bearish',
        startIndex: Math.min(highs[0].index, lows[0].index),
        endIndex: Math.max(highs[highs.length - 1].index, lows[lows.length - 1].index),
        completionPercent: 70,
        targetPrice: lows[0].price * 0.95,
        stopLoss: highs[highs.length - 1].price * 1.02,
        confidence: 0.6,
        keyPoints: []
      });
    } else if (highSlope < 0 && lowSlope > 0) {
      patterns.push({
        type: 'triangle_symmetric',
        direction: 'neutral',
        startIndex: Math.min(highs[0].index, lows[0].index),
        endIndex: Math.max(highs[highs.length - 1].index, lows[lows.length - 1].index),
        completionPercent: 60,
        targetPrice: (highs[0].price + lows[0].price) / 2,
        stopLoss: lows[lows.length - 1].price * 0.98,
        confidence: 0.5,
        keyPoints: []
      });
    }

    return patterns;
  }

  private findWedges(prices: PricePoint[], pivots: PivotPoint[]): ChartPattern[] {
    const patterns: ChartPattern[] = [];
    const highs = pivots.filter(p => p.type === 'high');
    const lows = pivots.filter(p => p.type === 'low');

    if (highs.length < 2 || lows.length < 2) return patterns;

    const highSlope = (highs[highs.length - 1].price - highs[0].price) / (highs[highs.length - 1].index - highs[0].index);
    const lowSlope = (lows[lows.length - 1].price - lows[0].price) / (lows[lows.length - 1].index - lows[0].index);

    // Rising wedge (bearish): both lines rising, but converging
    if (highSlope > 0 && lowSlope > 0 && lowSlope > highSlope) {
      patterns.push({
        type: 'wedge_rising',
        direction: 'bearish',
        startIndex: Math.min(highs[0].index, lows[0].index),
        endIndex: Math.max(highs[highs.length - 1].index, lows[lows.length - 1].index),
        completionPercent: 65,
        targetPrice: lows[0].price,
        stopLoss: highs[highs.length - 1].price * 1.01,
        confidence: 0.55,
        keyPoints: []
      });
    }

    // Falling wedge (bullish): both lines falling, but converging
    if (highSlope < 0 && lowSlope < 0 && highSlope > lowSlope) {
      patterns.push({
        type: 'wedge_falling',
        direction: 'bullish',
        startIndex: Math.min(highs[0].index, lows[0].index),
        endIndex: Math.max(highs[highs.length - 1].index, lows[lows.length - 1].index),
        completionPercent: 65,
        targetPrice: highs[0].price,
        stopLoss: lows[lows.length - 1].price * 0.99,
        confidence: 0.55,
        keyPoints: []
      });
    }

    return patterns;
  }

  private findFlags(prices: PricePoint[], pivots: PivotPoint[]): ChartPattern[] {
    const patterns: ChartPattern[] = [];

    // Look for strong move followed by consolidation
    for (let i = 20; i < prices.length - 10; i++) {
      const prevPrices = prices.slice(i - 20, i);
      const currPrices = prices.slice(i, Math.min(i + 10, prices.length));

      const prevReturn = (prevPrices[prevPrices.length - 1].close - prevPrices[0].close) / prevPrices[0].close;
      const currRange = Math.max(...currPrices.map(p => p.high)) - Math.min(...currPrices.map(p => p.low));
      const prevRange = Math.max(...prevPrices.map(p => p.high)) - Math.min(...prevPrices.map(p => p.low));

      // Strong move followed by tight consolidation
      if (Math.abs(prevReturn) > 0.05 && currRange < prevRange * 0.5) {
        patterns.push({
          type: prevReturn > 0 ? 'flag_bull' : 'flag_bear',
          direction: prevReturn > 0 ? 'bullish' : 'bearish',
          startIndex: i - 20,
          endIndex: i + currPrices.length - 1,
          completionPercent: 50,
          targetPrice: prevReturn > 0
            ? prices[i].close + Math.abs(prevReturn) * prices[i].close
            : prices[i].close - Math.abs(prevReturn) * prices[i].close,
          stopLoss: prevReturn > 0
            ? Math.min(...currPrices.map(p => p.low)) * 0.98
            : Math.max(...currPrices.map(p => p.high)) * 1.02,
          confidence: 0.5,
          keyPoints: []
        });
      }
    }

    return patterns;
  }

  private classifyGap(prices: PricePoint[], index: number, direction: 'up' | 'down', gapPercent: number): GapPattern['type'] {
    if (gapPercent > 0.03) {
      // Check for trend before gap
      const prevTrend = index >= 5
        ? (prices[index - 1].close - prices[index - 5].close) / prices[index - 5].close
        : 0;

      if ((direction === 'up' && prevTrend > 0.02) || (direction === 'down' && prevTrend < -0.02)) {
        return 'breakaway';
      }
      return 'runaway';
    }
    return 'common';
  }

  private checkGapFilled(prices: PricePoint[], gapIndex: number, upper: number, lower: number, direction: 'up' | 'down'): boolean {
    for (let i = gapIndex + 1; i < prices.length; i++) {
      if (direction === 'up' && prices[i].low <= lower) return true;
      if (direction === 'down' && prices[i].high >= upper) return true;
    }
    return false;
  }
}

export default new PatternRecognitionEngine();
