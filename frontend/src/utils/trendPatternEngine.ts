/**
 * 趋势形态识别引擎
 * 自动识别K线形态和趋势模式
 */

export interface CandleData {
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
  description: string;
  reliability: 'high' | 'medium' | 'low';
}

export interface TrendResult {
  direction: 'up' | 'down' | 'sideways';
  strength: number;
  support: number;
  resistance: number;
  duration: number;
}

export class TrendPatternEngine {
  /**
   * 识别单根K线形态
   */
  recognizeSingleCandle(candle: CandleData): PatternResult[] {
    const patterns: PatternResult[] = [];
    const bodySize = Math.abs(candle.close - candle.open);
    const totalRange = candle.high - candle.low;
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
    const isBullish = candle.close > candle.open;

    if (totalRange === 0) return patterns;

    const bodyRatio = bodySize / totalRange;

    // 十字星
    if (bodyRatio < 0.1) {
      patterns.push({
        name: '十字星',
        type: 'neutral',
        confidence: 0.7,
        description: '多空力量均衡，可能变盘',
        reliability: 'medium',
      });
    }

    // 锤子线 / 上吊线
    if (lowerShadow > bodySize * 2 && upperShadow < bodySize * 0.5) {
      patterns.push({
        name: isBullish ? '锤子线' : '上吊线',
        type: isBullish ? 'bullish' : 'bearish',
        confidence: 0.65,
        description: isBullish ? '低位锤子线，可能反转向上' : '高位上吊线，注意风险',
        reliability: 'medium',
      });
    }

    // 射击之星
    if (upperShadow > bodySize * 2 && lowerShadow < bodySize * 0.5) {
      patterns.push({
        name: '射击之星',
        type: 'bearish',
        confidence: 0.6,
        description: '高位射击之星，可能见顶回落',
        reliability: 'medium',
      });
    }

    // 大阳线/大阴线
    if (bodyRatio > 0.7) {
      patterns.push({
        name: isBullish ? '大阳线' : '大阴线',
        type: isBullish ? 'bullish' : 'bearish',
        confidence: 0.75,
        description: isBullish ? '多方强势，趋势向上' : '空方强势，趋势向下',
        reliability: 'high',
      });
    }

    // 纺锤线
    if (bodyRatio >= 0.1 && bodyRatio <= 0.3 && upperShadow > bodySize && lowerShadow > bodySize) {
      patterns.push({
        name: '纺锤线',
        type: 'neutral',
        confidence: 0.5,
        description: '趋势犹豫，等待确认',
        reliability: 'low',
      });
    }

    return patterns;
  }

  /**
   * 识别双K线形态
   */
  recognizeTwoCandle(candle1: CandleData, candle2: CandleData): PatternResult[] {
    const patterns: PatternResult[] = [];
    const bullish1 = candle1.close > candle1.open;
    const bullish2 = candle2.close > candle2.open;

    // 乌云盖顶
    if (bullish1 && !bullish2 &&
        candle2.open > candle1.close &&
        candle2.close < (candle1.open + candle1.close) / 2) {
      patterns.push({
        name: '乌云盖顶',
        type: 'bearish',
        confidence: 0.7,
        description: '高位反转信号，建议减仓',
        reliability: 'high',
      });
    }

    // 刺透形态
    if (!bullish1 && bullish2 &&
        candle2.open < candle1.close &&
        candle2.close > (candle1.open + candle1.close) / 2) {
      patterns.push({
        name: '刺透形态',
        type: 'bullish',
        confidence: 0.7,
        description: '低位反转信号，可考虑建仓',
        reliability: 'high',
      });
    }

    // 孕育线
    const body1 = Math.abs(candle1.close - candle1.open);
    const body2 = Math.abs(candle2.close - candle2.open);
    if (body2 < body1 * 0.3 &&
        candle2.high <= candle1.high &&
        candle2.low >= candle1.low) {
      patterns.push({
        name: '孕育线',
        type: bullish2 ? 'bullish' : 'bearish',
        confidence: 0.6,
        description: '趋势可能反转',
        reliability: 'medium',
      });
    }

    return patterns;
  }

  /**
   * 分析趋势
   */
  analyzeTrend(candles: CandleData[], lookback: number = 20): TrendResult {
    if (candles.length < lookback) {
      return { direction: 'sideways', strength: 0, support: 0, resistance: 0, duration: 0 };
    }

    const recent = candles.slice(-lookback);
    const closes = recent.map(c => c.close);
    const highs = recent.map(c => c.high);
    const lows = recent.map(c => c.low);

    // 简单线性回归
    const n = closes.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += closes[i];
      sumXY += i * closes[i];
      sumX2 += i * i;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const avgSlope = slope / (sumY / n); // 归一化斜率

    // 方向
    let direction: TrendResult['direction'];
    if (avgSlope > 0.001) direction = 'up';
    else if (avgSlope < -0.001) direction = 'down';
    else direction = 'sideways';

    // 强度 (R²)
    const intercept = (sumY - slope * sumX) / n;
    let ssRes = 0, ssTot = 0;
    const meanY = sumY / n;
    for (let i = 0; i < n; i++) {
      const predicted = slope * i + intercept;
      ssRes += (closes[i] - predicted) ** 2;
      ssTot += (closes[i] - meanY) ** 2;
    }
    const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
    const strength = Math.round(Math.max(0, rSquared) * 100);

    // 支撑和阻力
    const support = Math.min(...lows);
    const resistance = Math.max(...highs);

    // 持续天数
    let duration = 0;
    for (let i = closes.length - 1; i > 0; i--) {
      if ((direction === 'up' && closes[i] > closes[i - 1]) ||
          (direction === 'down' && closes[i] < closes[i - 1])) {
        duration++;
      } else break;
    }

    return { direction, strength, support, resistance, duration };
  }
}

export const trendPatternEngine = new TrendPatternEngine();
export default TrendPatternEngine;
