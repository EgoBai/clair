/**
 * 量价分析引擎 (Volume-Price Analysis Engine)
 * - 量价配合/背离
 * - 缩量/放量模式
 * - 天量天价/地量地价
 * - 换手率分析
 * - OBV趋势
 * - 量比分析
 */

export interface VolumePriceData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
}

export interface VolumePriceSignal {
  type: 'volume_price_match' | 'volume_price_diverge' | 'extreme_volume' | 'shrink_volume'
    | 'obv_breakout' | 'volume_climax';
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number;
  description: string;
}

export interface VolumeAnalysis {
  volumeRatio: number;       // 量比(当日/5日均量)
  turnoverRate: number;      // 换手率
  obv: number;               // OBV值
  obvTrend: 'up' | 'down' | 'flat';
  avgVolume5: number;
  avgVolume20: number;
  volumeShrinkDays: number;  // 连续缩量天数
  volumeExpandDays: number;  // 连续放量天数
}

export interface VolumePattern {
  pattern: string;
  confidence: number;
  implication: string;
  historical: string;
}

/**
 * 计算OBV
 */
export function calculateOBV(data: VolumePriceData[]): number[] {
  if (data.length === 0) return [];

  const obv: number[] = [data[0].volume];

  for (let i = 1; i < data.length; i++) {
    const current = data[i];
    const prev = data[i - 1];
    const prevObv = obv[i - 1];
    
    if (!current || !prev || prevObv === undefined) continue;
    
    if (current.close > prev.close) {
      obv.push(prevObv + current.volume);
    } else if (current.close < prev.close) {
      obv.push(prevObv - current.volume);
    } else {
      obv.push(prevObv);
    }
  }

  return obv;
}

/**
 * 量价分析
 */
export function analyzeVolumePrice(data: VolumePriceData[]): {
  analysis: VolumeAnalysis;
  signals: VolumePriceSignal[];
} {
  if (data.length < 5) {
    return {
      analysis: { volumeRatio: 0, turnoverRate: 0, obv: 0, obvTrend: 'flat', avgVolume5: 0, avgVolume20: 0, volumeShrinkDays: 0, volumeExpandDays: 0 },
      signals: [],
    };
  }

  const latest = data[data.length - 1];
  if (!latest) {
    return {
      analysis: { volumeRatio: 0, turnoverRate: 0, obv: 0, obvTrend: 'flat', avgVolume5: 0, avgVolume20: 0, volumeShrinkDays: 0, volumeExpandDays: 0 },
      signals: [],
    };
  }
  const avgVolume5 = data.slice(-5).reduce((s, d) => s + d.volume, 0) / 5;
  const avgVolume20 = data.slice(-Math.min(20, data.length)).reduce((s, d) => s + d.volume, 0) / Math.min(20, data.length);
  const volumeRatio = avgVolume5 > 0 ? latest.volume / avgVolume5 : 0;

  // OBV
  const obvArr = calculateOBV(data);
  const obv = obvArr[obvArr.length - 1] || 0;
  const obvAvg5 = obvArr.slice(-5).reduce((s, v) => s + v, 0) / 5;
  const obvTrend = obv > obvAvg5 * 1.02 ? 'up' : obv < obvAvg5 * 0.98 ? 'down' : 'flat';

  // 连续缩量/放量
  let volumeShrinkDays = 0;
  let volumeExpandDays = 0;
  for (let i = data.length - 1; i > 0; i--) {
    const current = data[i];
    const prev = data[i - 1];
    if (!current || !prev) break;
    
    if (current.volume < prev.volume) {
      volumeShrinkDays++;
      volumeExpandDays = 0;
    } else if (current.volume > prev.volume) {
      volumeExpandDays++;
      volumeShrinkDays = 0;
    } else break;
  }

  const analysis: VolumeAnalysis = {
    volumeRatio: Math.round(volumeRatio * 100) / 100,
    turnoverRate: latest.turnover,
    obv,
    obvTrend,
    avgVolume5: Math.round(avgVolume5),
    avgVolume20: Math.round(avgVolume20),
    volumeShrinkDays,
    volumeExpandDays,
  };

  // 信号检测
  const signals: VolumePriceSignal[] = [];
  const priceChange = (latest.close - data[data.length - 2].close) / data[data.length - 2].close * 100;

  // 量价配合
  if (volumeRatio > 1.5 && priceChange > 2) {
    signals.push({
      type: 'volume_price_match',
      direction: 'bullish',
      strength: Math.min(100, Math.round(volumeRatio * 30 + priceChange * 10)),
      description: `放量上涨，量比${volumeRatio.toFixed(1)}，涨${priceChange.toFixed(1)}%`,
    });
  } else if (volumeRatio > 1.5 && priceChange < -2) {
    signals.push({
      type: 'volume_price_match',
      direction: 'bearish',
      strength: Math.min(100, Math.round(volumeRatio * 30 + Math.abs(priceChange) * 10)),
      description: `放量下跌，量比${volumeRatio.toFixed(1)}，跌${Math.abs(priceChange).toFixed(1)}%`,
    });
  }

  // 量价背离
  if (priceChange > 1 && volumeRatio < 0.7) {
    signals.push({
      type: 'volume_price_diverge',
      direction: 'bearish',
      strength: Math.min(100, Math.round(priceChange * 15 + (1 - volumeRatio) * 50)),
      description: '价涨量缩，上涨乏力信号',
    });
  } else if (priceChange < -1 && volumeRatio < 0.7) {
    signals.push({
      type: 'volume_price_diverge',
      direction: 'bullish',
      strength: Math.min(100, Math.round(Math.abs(priceChange) * 15 + (1 - volumeRatio) * 50)),
      description: '价跌量缩，下跌动能减弱',
    });
  }

  // 极端放量
  if (volumeRatio > 5) {
    signals.push({
      type: 'extreme_volume',
      direction: priceChange > 0 ? 'bullish' : 'bearish',
      strength: Math.min(100, Math.round(volumeRatio * 10)),
      description: `极端放量${volumeRatio.toFixed(1)}倍，关注后续走势`,
    });
  }

  // 持续缩量
  if (volumeShrinkDays >= 3) {
    signals.push({
      type: 'shrink_volume',
      direction: 'neutral',
      strength: Math.min(100, volumeShrinkDays * 20),
      description: `连续缩量${volumeShrinkDays}天，变盘在即`,
    });
  }

  return { analysis, signals };
}

/**
 * 量价形态识别
 */
export function identifyVolumePatterns(data: VolumePriceData[]): VolumePattern[] {
  if (data.length < 10) return [];

  const patterns: VolumePattern[] = [];
  const latest = data[data.length - 1];
  if (!latest) return [];

  // 天量天价
  const maxVolIdx = data.reduce((maxI, d, i) => d.volume > data[maxI].volume ? i : maxI, 0);
  const maxPriceIdx = data.reduce((maxI, d, i) => d.close > data[maxI].close ? i : maxI, 0);

  if (maxVolIdx === maxPriceIdx && maxVolIdx === data.length - 1) {
    patterns.push({
      pattern: '天量天价',
      confidence: 85,
      implication: '顶部信号，注意风险',
      historical: '天量天价通常出现在短期顶部',
    });
  }

  // 地量地价
  const recentAvgVol = data.slice(-20).reduce((s, d) => d ? s + d.volume : s, 0) / 20;
  if (latest && latest.volume < recentAvgVol * 0.3) {
    const minPrice = Math.min(...data.slice(-10).map(d => d ? d.close : Infinity));
    if (latest.close <= minPrice * 1.02) {
      patterns.push({
        pattern: '地量地价',
        confidence: 70,
        implication: '底部信号，可能反弹',
        historical: '地量地价常出现在底部区域',
      });
    }
  }

  // 放量突破
  const recentHigh = Math.max(...data.slice(-20, -1).map(d => d ? d.high : -Infinity));
  if (latest && latest.close > recentHigh && latest.volume > recentAvgVol * 2) {
    patterns.push({
      pattern: '放量突破',
      confidence: 80,
      implication: '突破信号，可能启动新一轮上涨',
      historical: '放量突破是强势信号',
    });
  }

  // 缩量回调
  if (data.length >= 5 && latest) {
    const prevHigh = Math.max(...data.slice(-10, -3).map(d => d ? d.close : -Infinity));
    const isPullback = latest.close < prevHigh * 0.97;
    const isShrinking = latest.volume < recentAvgVol * 0.6;
    if (isPullback && isShrinking) {
      patterns.push({
        pattern: '缩量回调',
        confidence: 65,
        implication: '回调中缩量，可能是健康调整',
        historical: '缩量回调后往往继续上涨',
      });
    }
  }

  return patterns;
}
