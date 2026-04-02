/**
 * 价差交易引擎 (Spread Trading Engine)
 * - 期现价差
 * - 跨期价差
 * - 跨品种价差
 * - Z-score信号
 */

export interface SpreadData {
  timestamp: number;
  price1: number;
  price2: number;
  ratio?: number;
}

export interface SpreadSignal {
  zScore: number;
  signal: 'long_spread' | 'short_spread' | 'neutral';
  confidence: number;
  entryThreshold: number;
  exitThreshold: number;
  halfLife: number;
}

export interface SpreadStats {
  mean: number;
  std: number;
  currentZScore: number;
  minRatio: number;
  maxRatio: number;
  correlation: number;
}

export class SpreadTradingEngine {
  analyzeSpread(data: SpreadData[], entryZ: number = 2.0, exitZ: number = 0.5): SpreadSignal {
    if (data.length < 10) {
      return { zScore: 0, signal: 'neutral', confidence: 0, entryThreshold: entryZ, exitThreshold: exitZ, halfLife: 0 };
    }
    const ratios = data.map(d => d.ratio ?? (d.price2 > 0 ? d.price1 / d.price2 : 1));
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    const std = Math.sqrt(ratios.reduce((a, r) => a + (r - mean) ** 2, 0) / ratios.length);
    const currentRatio = ratios[ratios.length - 1];
    const zScore = std > 0 ? (currentRatio - mean) / std : 0;

    let signal: SpreadSignal['signal'] = 'neutral';
    if (zScore > entryZ) signal = 'short_spread';
    else if (zScore < -entryZ) signal = 'long_spread';
    else if (Math.abs(zScore) < exitZ) signal = 'neutral';

    const halfLife = this.calculateHalfLife(ratios);
    const confidence = Math.min(1, Math.abs(zScore) / (entryZ * 1.5));

    return {
      zScore: Math.round(zScore * 100) / 100,
      signal,
      confidence: Math.round(confidence * 100) / 100,
      entryThreshold: entryZ,
      exitThreshold: exitZ,
      halfLife: Math.round(halfLife * 100) / 100,
    };
  }

  calculateStats(data: SpreadData[]): SpreadStats {
    const ratios = data.map(d => d.ratio ?? (d.price2 > 0 ? d.price1 / d.price2 : 1));
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    const std = Math.sqrt(ratios.reduce((a, r) => a + (r - mean) ** 2, 0) / ratios.length);
    const current = ratios[ratios.length - 1];
    const prices1 = data.map(d => d.price1);
    const prices2 = data.map(d => d.price2);
    const corr = this.correlation(prices1, prices2);
    return {
      mean: Math.round(mean * 10000) / 10000,
      std: Math.round(std * 10000) / 10000,
      currentZScore: std > 0 ? Math.round(((current - mean) / std) * 100) / 100 : 0,
      minRatio: Math.min(...ratios),
      maxRatio: Math.max(...ratios),
      correlation: Math.round(corr * 10000) / 10000,
    };
  }

  private calculateHalfLife(values: number[]): number {
    const n = values.length;
    if (n < 3) return 0;
    let num = 0, den = 0;
    for (let i = 1; i < n; i++) {
      num += (values[i - 1] - values[0]) * (values[i] - values[i - 1]);
      den += (values[i - 1] - values[0]) ** 2;
    }
    const b = den !== 0 ? num / den : 0;
    return b < 0 ? Math.log(0.5) / Math.log(1 + b) : n;
  }

  private correlation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 2) return 0;
    const mx = x.reduce((a, b) => a + b, 0) / n;
    const my = y.reduce((a, b) => a + b, 0) / n;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
      num += (x[i] - mx) * (y[i] - my);
      dx += (x[i] - mx) ** 2;
      dy += (y[i] - my) ** 2;
    }
    const den = Math.sqrt(dx * dy);
    return den > 0 ? num / den : 0;
  }
}

export default new SpreadTradingEngine();
