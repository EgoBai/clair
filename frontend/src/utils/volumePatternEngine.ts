/**
 * 成交量形态引擎
 * - 放量/缩量检测
 * - 量价配合分析
 * - 底部放量/顶部放量
 * - 量能背离
 */
export interface VolumeCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface VolumePattern {
  type: 'volume_spike' | 'volume_dry_up' | 'bottom_volume' | 'top_volume' | 'bullish_divergence' | 'bearish_divergence' | 'climax' | 'normal';
  date: string;
  volumeRatio: number;
  priceChange: number;
  significance: number; // 0-1
  description: string;
}

export interface VolumePatternAnalysis {
  patterns: VolumePattern[];
  currentPattern: VolumePattern | null;
  avgVolume: number;
  volumeTrend: 'increasing' | 'decreasing' | 'stable';
  priceVolumeCorrelation: number;
  alerts: string[];
}

export function detectVolumePatterns(candles: VolumeCandle[], period: number = 20): VolumePatternAnalysis {
  if (candles.length < period) throw new Error(`至少需要${period}根K线`);

  const sorted = [...candles].sort((a, b) => a.date.localeCompare(b.date));
  const volumes = sorted.map(c => c.volume);
  const avgVolume = volumes.reduce((s, v) => s + v, 0) / volumes.length;

  const patterns: VolumePattern[] = [];

  for (let i = period; i < sorted.length; i++) {
    const recentAvg = volumes.slice(i - period, i).reduce((s, v) => s + v, 0) / period;
    const vol = sorted[i].volume;
    const ratio = vol / Math.max(recentAvg, 1);
    const priceChange = (sorted[i].close - sorted[i].open) / Math.max(sorted[i].open, 0.01);

    let type: VolumePattern['type'] = 'normal';
    let significance = 0;
    let description = '';

    if (ratio > 3 && Math.abs(priceChange) > 0.03) {
      type = 'volume_spike';
      significance = Math.min(1, (ratio - 3) / 5 + Math.abs(priceChange));
      description = priceChange > 0 ? '放量上涨' : '放量下跌';
    } else if (ratio < 0.3) {
      type = 'volume_dry_up';
      significance = Math.min(1, (0.3 - ratio) / 0.3);
      description = '极度缩量';
    } else if (ratio > 2 && sorted[i].close < sorted[i - 1].close && sorted[i].low < sorted.slice(i - 5, i).reduce((mn, c) => Math.min(mn, c.low), Infinity)) {
      type = 'bottom_volume';
      significance = Math.min(1, ratio / 4);
      description = '底部放量';
    } else if (ratio > 2 && sorted[i].close > sorted[i - 1].close && sorted[i].high > sorted.slice(i - 5, i).reduce((mx, c) => Math.max(mx, c.high), 0)) {
      type = 'top_volume';
      significance = Math.min(1, ratio / 4);
      description = '顶部放量';
    } else if (ratio > 4) {
      type = 'climax';
      significance = Math.min(1, ratio / 6);
      description = '天量';
    }

    // 量价背离
    if (i >= 5) {
      const priceTrend = sorted[i].close - sorted[i - 5].close;
      const volTrend = vol - volumes[i - 5];
      if (priceTrend > 0 && volTrend < -recentAvg * 0.3) {
        type = 'bearish_divergence';
        significance = 0.6;
        description = '量价顶背离';
      } else if (priceTrend < 0 && volTrend > recentAvg * 0.3 && vol > recentAvg) {
        type = 'bullish_divergence';
        significance = 0.6;
        description = '量价底背离';
      }
    }

    if (type !== 'normal') {
      patterns.push({ type, date: sorted[i].date, volumeRatio: ratio, priceChange, significance, description });
    }
  }

  const currentPattern = patterns.length > 0 ? patterns[patterns.length - 1] : null;

  // 量能趋势
  const recent10Vol = volumes.slice(-10);
  const older10Vol = volumes.slice(-20, -10);
  const recentAvg = recent10Vol.reduce((s, v) => s + v, 0) / recent10Vol.length;
  const olderAvg = older10Vol.length > 0 ? older10Vol.reduce((s, v) => s + v, 0) / older10Vol.length : recentAvg;
  const volumeTrend = recentAvg > olderAvg * 1.1 ? 'increasing' : recentAvg < olderAvg * 0.9 ? 'decreasing' : 'stable';

  // 量价相关性
  const priceChanges = sorted.slice(-period).map(c => c.close - c.open);
  const volChanges = sorted.slice(-period).map(c => c.volume);
  const priceVolumeCorrelation = computeCorrelation(priceChanges, volChanges);

  const alerts: string[] = [];
  if (currentPattern && currentPattern.significance > 0.7) alerts.push(`检测到显著${currentPattern.description}`);
  if (volumeTrend === 'decreasing' && sorted[sorted.length - 1].close > sorted[sorted.length - 10].close) alerts.push('价涨量缩，注意风险');

  return { patterns, currentPattern, avgVolume, volumeTrend, priceVolumeCorrelation, alerts };
}

function computeCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const mx = x.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const my = y.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) {
    cov += (x[i] - mx) * (y[i] - my);
    vx += (x[i] - mx) ** 2;
    vy += (y[i] - my) ** 2;
  }
  return vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : 0;
}
