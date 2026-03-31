/**
 * 分钟K线形态引擎
 * 分钟级K线形态识别/量价关系/分时特征/盘口语言
 */

export interface MinuteKline {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
}

export interface KlinePattern {
  name: string;
  type: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  startIndex: number;
  endIndex: number;
  description: string;
}

export interface VolumePriceRelation {
  time: string;
  priceChange: number;
  volumeRatio: number;     // 与5分钟均量比
  amountRatio: number;
  type: 'volume_up_price_up' | 'volume_up_price_down' | 'volume_down_price_up' | 'volume_down_price_down'
    | 'volume_divergence' | 'normal';
  signal: 'bullish' | 'bearish' | 'neutral';
}

export interface IntradayFeature {
  pattern: string;
  time: string;
  significance: 'high' | 'medium' | 'low';
  description: string;
}

/**
 * 识别K线形态
 */
export function recognizePatterns(klines: MinuteKline[]): KlinePattern[] {
  const patterns: KlinePattern[] = [];

  for (let i = 2; i < klines.length; i++) {
    const curr = klines[i];
    const prev = klines[i - 1];
    const prev2 = klines[i - 2];

    const body = Math.abs(curr.close - curr.open);
    const range = curr.high - curr.low;
    const upperShadow = curr.high - Math.max(curr.open, curr.close);
    const lowerShadow = Math.min(curr.open, curr.close) - curr.low;

    // 十字星
    if (range > 0 && body / range < 0.1) {
      patterns.push({
        name: '十字星',
        type: 'neutral',
        confidence: 0.6,
        startIndex: i,
        endIndex: i,
        description: '多空力量均衡，可能变盘',
      });
    }

    // 锤子线
    if (lowerShadow > body * 2 && upperShadow < body * 0.5 && curr.close > curr.open) {
      patterns.push({
        name: '锤子线',
        type: 'bullish',
        confidence: 0.65,
        startIndex: i,
        endIndex: i,
        description: '低位锤子线，可能反弹',
      });
    }

    // 上吊线
    if (lowerShadow > body * 2 && upperShadow < body * 0.5 && curr.close < curr.open) {
      patterns.push({
        name: '上吊线',
        type: 'bearish',
        confidence: 0.6,
        startIndex: i,
        endIndex: i,
        description: '高位上吊线，可能回调',
      });
    }

    // 吞没形态
    if (prev.close < prev.open && curr.close > curr.open &&
        curr.open < prev.close && curr.close > prev.open) {
      patterns.push({
        name: '看涨吞没',
        type: 'bullish',
        confidence: 0.7,
        startIndex: i - 1,
        endIndex: i,
        description: '阳线吞没前阴线，多方占优',
      });
    }

    if (prev.close > prev.open && curr.close < curr.open &&
        curr.open > prev.close && curr.close < prev.open) {
      patterns.push({
        name: '看跌吞没',
        type: 'bearish',
        confidence: 0.7,
        startIndex: i - 1,
        endIndex: i,
        description: '阴线吞没前阳线，空方占优',
      });
    }

    // 三连阳/三连阴
    if (i >= 2) {
      if (curr.close > curr.open && prev.close > prev.open && prev2.close > prev2.open &&
          curr.close > prev.close && prev.close > prev2.close) {
        patterns.push({
          name: '三连阳',
          type: 'bullish',
          confidence: 0.65,
          startIndex: i - 2,
          endIndex: i,
          description: '连续三根阳线且创新高',
        });
      }

      if (curr.close < curr.open && prev.close < prev.open && prev2.close < prev2.open &&
          curr.close < prev.close && prev.close < prev2.close) {
        patterns.push({
          name: '三连阴',
          type: 'bearish',
          confidence: 0.65,
          startIndex: i - 2,
          endIndex: i,
          description: '连续三根阴线且创新低',
        });
      }
    }
  }

  return patterns;
}

/**
 * 量价关系分析
 */
export function analyzeVolumePrice(klines: MinuteKline[]): VolumePriceRelation[] {
  if (klines.length < 6) return [];

  const results: VolumePriceRelation[] = [];

  for (let i = 5; i < klines.length; i++) {
    const curr = klines[i];
    const prev = klines[i - 1];
    const avg5Vol = klines.slice(i - 5, i).reduce((s, k) => s + k.volume, 0) / 5;

    const priceChange = prev.close > 0
      ? (curr.close - prev.close) / prev.close
      : 0;
    const volumeRatio = avg5Vol > 0 ? curr.volume / avg5Vol : 1;

    let type: VolumePriceRelation['type'];
    if (volumeRatio > 1.5 && priceChange > 0.002) type = 'volume_up_price_up';
    else if (volumeRatio > 1.5 && priceChange < -0.002) type = 'volume_up_price_down';
    else if (volumeRatio < 0.7 && priceChange > 0.002) type = 'volume_down_price_up';
    else if (volumeRatio < 0.7 && priceChange < -0.002) type = 'volume_down_price_down';
    else type = 'normal';

    let signal: VolumePriceRelation['signal'];
    if (type === 'volume_up_price_up') signal = 'bullish';
    else if (type === 'volume_up_price_down') signal = 'bearish';
    else signal = 'neutral';

    results.push({
      time: curr.time,
      priceChange,
      volumeRatio,
      amountRatio: volumeRatio,
      type,
      signal,
    });
  }

  return results;
}

/**
 * 分时特征识别
 */
export function identifyIntradayFeatures(klines: MinuteKline[]): IntradayFeature[] {
  const features: IntradayFeature[] = [];

  if (klines.length < 10) return features;

  // 高开
  if (klines[0].open > klines[0].close * 1.005) {
    features.push({
      pattern: '高开',
      time: klines[0].time,
      significance: 'medium',
      description: '开盘价高于前收盘',
    });
  }

  // 放量突破
  const volumes = klines.map(k => k.volume);
  const avgVol = volumes.reduce((s, v) => s + v, 0) / volumes.length;

  for (let i = 5; i < klines.length; i++) {
    if (klines[i].volume > avgVol * 3 &&
        klines[i].close > Math.max(...klines.slice(i - 5, i).map(k => k.high))) {
      features.push({
        pattern: '放量突破',
        time: klines[i].time,
        significance: 'high',
        description: `${klines[i].time} 放量突破前高，量比${(klines[i].volume / avgVol).toFixed(1)}x`,
      });
    }
  }

  // 缩量整理
  const recent5 = klines.slice(-5);
  const recentAvgVol = recent5.reduce((s, k) => s + k.volume, 0) / 5;
  const priceRange = Math.max(...recent5.map(k => k.high)) - Math.min(...recent5.map(k => k.low));
  const avgPrice = recent5.reduce((s, k) => s + k.close, 0) / 5;

  if (recentAvgVol < avgVol * 0.5 && priceRange / avgPrice < 0.01) {
    features.push({
      pattern: '缩量整理',
      time: recent5[recent5.length - 1].time,
      significance: 'medium',
      description: '近期缩量窄幅震荡，等待方向',
    });
  }

  return features;
}
