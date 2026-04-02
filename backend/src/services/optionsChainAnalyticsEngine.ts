/**
 * 期权链分析引擎
 * - Put/Call 比率分析
 * - 最大痛点 (Max Pain) 计算
 * - 期权链异常检测
 * - Gamma 敞口分析
 * - 隐含波动率偏斜
 * - 期权交易量分布
 */

export interface OptionContract {
  strike: number;
  expiry: string; // YYYY-MM-DD
  type: 'call' | 'put';
  bid: number;
  ask: number;
  last: number;
  volume: number;
  openInterest: number;
  impliedVol: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

export interface MaxPainResult {
  strike: number;
  totalPain: number;
  painByStrike: Map<number, number>;
}

export interface PCRAnalysis {
  putVolume: number;
  callVolume: number;
  volumeRatio: number;
  putOI: number;
  callOI: number;
  oiRatio: number;
  signal: 'bearish' | 'bullish' | 'neutral';
}

export interface GammaExposure {
  strike: number;
  netGamma: number;
  callGamma: number;
  putGamma: number;
  cumulativeGamma: number;
}

export interface IVSkewPoint {
  strike: number;
  moneyness: number; // strike / spot - 1
  callIV: number;
  putIV: number;
  skew: number; // putIV - callIV
}

export interface OptionFlowAnomaly {
  contract: OptionContract;
  volumeOIRatio: number;
  unusualVolume: boolean;
  direction: 'bullish' | 'bearish' | 'unclear';
  confidence: number;
}

export class OptionsChainAnalyticsEngine {
  /**
   * 计算最大痛点
   */
  calculateMaxPain(options: OptionContract[], spotPrice: number): MaxPainResult | null {
    if (options.length === 0) return null;

    const strikes = [...new Set(options.map(o => o.strike))].sort((a, b) => a - b);
    if (strikes.length === 0) return null;

    const painByStrike = new Map<number, number>();
    let minPain = Infinity;
    let maxPainStrike = strikes[0];

    for (const testStrike of strikes) {
      let totalPain = 0;

      for (const opt of options) {
        const oi = opt.openInterest * 100; // 100 shares per contract
        if (opt.type === 'call') {
          // Call holder pain if spot < strike
          if (testStrike < opt.strike) {
            totalPain += (opt.strike - testStrike) * oi;
          }
        } else {
          // Put holder pain if spot > strike
          if (testStrike > opt.strike) {
            totalPain += (testStrike - opt.strike) * oi;
          }
        }
      }

      painByStrike.set(testStrike, totalPain);
      if (totalPain < minPain) {
        minPain = totalPain;
        maxPainStrike = testStrike;
      }
    }

    return { strike: maxPainStrike, totalPain: minPain, painByStrike };
  }

  /**
   * Put/Call 比率分析
   */
  analyzePCR(options: OptionContract[]): PCRAnalysis {
    let putVolume = 0, callVolume = 0;
    let putOI = 0, callOI = 0;

    for (const opt of options) {
      if (opt.type === 'put') {
        putVolume += opt.volume;
        putOI += opt.openInterest;
      } else {
        callVolume += opt.volume;
        callOI += opt.openInterest;
      }
    }

    const volumeRatio = callVolume > 0 ? putVolume / callVolume : 0;
    const oiRatio = callOI > 0 ? putOI / callOI : 0;

    // Signal interpretation
    let signal: 'bearish' | 'bullish' | 'neutral';
    if (volumeRatio > 1.2 && oiRatio > 1.1) {
      signal = 'bearish'; // High put activity
    } else if (volumeRatio < 0.7 && oiRatio < 0.8) {
      signal = 'bullish'; // High call activity
    } else {
      signal = 'neutral';
    }

    return { putVolume, callVolume, volumeRatio, putOI, callOI, oiRatio, signal };
  }

  /**
   * Gamma 敞口分析
   */
  analyzeGammaExposure(options: OptionContract[], spotPrice: number): GammaExposure[] {
    const strikeMap = new Map<number, { callGamma: number; putGamma: number }>();

    for (const opt of options) {
      if (!strikeMap.has(opt.strike)) {
        strikeMap.set(opt.strike, { callGamma: 0, putGamma: 0 });
      }
      const entry = strikeMap.get(opt.strike)!;
      const gammaExposure = opt.gamma * opt.openInterest * spotPrice * 0.01;

      if (opt.type === 'call') {
        entry.callGamma += gammaExposure;
      } else {
        entry.putGamma -= gammaExposure; // Negative for dealers short puts
      }
    }

    const strikes = [...strikeMap.keys()].sort((a, b) => a - b);
    let cumulative = 0;
    const result: GammaExposure[] = [];

    for (const strike of strikes) {
      const { callGamma, putGamma } = strikeMap.get(strike)!;
      const netGamma = callGamma + putGamma;
      cumulative += netGamma;
      result.push({ strike, netGamma, callGamma, putGamma, cumulativeGamma: cumulative });
    }

    return result;
  }

  /**
   * IV 偏斜分析
   */
  analyzeIVSkew(options: OptionContract[], spotPrice: number): IVSkewPoint[] {
    const strikeMap = new Map<number, { callIV: number; putIV: number }>();

    for (const opt of options) {
      if (!strikeMap.has(opt.strike)) {
        strikeMap.set(opt.strike, { callIV: 0, putIV: 0 });
      }
      const entry = strikeMap.get(opt.strike)!;
      if (opt.type === 'call') entry.callIV = opt.impliedVol;
      else entry.putIV = opt.impliedVol;
    }

    return [...strikeMap.entries()]
      .map(([strike, { callIV, putIV }]) => ({
        strike,
        moneyness: spotPrice > 0 ? (strike / spotPrice) - 1 : 0,
        callIV,
        putIV,
        skew: putIV - callIV
      }))
      .sort((a, b) => a.strike - b.strike);
  }

  /**
   * 异常期权流检测
   */
  detectUnusualFlow(options: OptionContract[]): OptionFlowAnomaly[] {
    if (options.length === 0) return [];

    // Calculate volume/OI statistics
    const volOIRatios = options.map(o => ({
      opt: o,
      ratio: o.openInterest > 0 ? o.volume / o.openInterest : o.volume
    }));

    const ratios = volOIRatios.map(v => v.ratio);
    const mean = ratios.reduce((s, v) => s + v, 0) / ratios.length;
    const std = Math.sqrt(ratios.reduce((s, v) => s + (v - mean) ** 2, 0) / ratios.length);

    return volOIRatios.map(({ opt, ratio }) => {
      const unusualVolume = ratio > mean + 2 * std && opt.volume > 100;
      const confidence = std > 0 ? Math.min(1, (ratio - mean) / (3 * std)) : 0;

      let direction: 'bullish' | 'bearish' | 'unclear';
      if (opt.type === 'call' && opt.last > (opt.bid + opt.ask) / 2) {
        direction = 'bullish';
      } else if (opt.type === 'put' && opt.last > (opt.bid + opt.ask) / 2) {
        direction = 'bearish';
      } else {
        direction = 'unclear';
      }

      return {
        contract: opt,
        volumeOIRatio: ratio,
        unusualVolume,
        direction,
        confidence: Math.max(0, confidence)
      };
    });
  }

  /**
   * 期权链流动性评分
   */
  liquidityScore(options: OptionContract[]): {
    strike: number;
    bidAskSpread: number;
    spreadPercent: number;
    volume: number;
    score: number;
  }[] {
    return options.map(opt => {
      const mid = (opt.bid + opt.ask) / 2;
      const bidAskSpread = opt.ask - opt.bid;
      const spreadPercent = mid > 0 ? bidAskSpread / mid : 1;
      const volumeScore = Math.min(1, opt.volume / 1000);
      const spreadScore = Math.max(0, 1 - spreadPercent * 10);
      const oiScore = Math.min(1, opt.openInterest / 5000);
      const score = (volumeScore * 0.4 + spreadScore * 0.4 + oiScore * 0.2);

      return {
        strike: opt.strike,
        bidAskSpread,
        spreadPercent,
        volume: opt.volume,
        score: Math.max(0, Math.min(1, score))
      };
    });
  }

  /**
   * 到期日分布分析
   */
  expirationDistribution(options: OptionContract[]): {
    expiry: string;
    totalVolume: number;
    totalOI: number;
    putCallRatio: number;
    avgIV: number;
  }[] {
    const expMap = new Map<string, { volume: number; oi: number; puts: number; calls: number; ivs: number[] }>();

    for (const opt of options) {
      if (!expMap.has(opt.expiry)) {
        expMap.set(opt.expiry, { volume: 0, oi: 0, puts: 0, calls: 0, ivs: [] });
      }
      const entry = expMap.get(opt.expiry)!;
      entry.volume += opt.volume;
      entry.oi += opt.openInterest;
      entry.ivs.push(opt.impliedVol);
      if (opt.type === 'put') entry.puts += opt.volume;
      else entry.calls += opt.volume;
    }

    return [...expMap.entries()].map(([expiry, data]) => ({
      expiry,
      totalVolume: data.volume,
      totalOI: data.oi,
      putCallRatio: data.calls > 0 ? data.puts / data.calls : 0,
      avgIV: data.ivs.length > 0 ? data.ivs.reduce((s, v) => s + v, 0) / data.ivs.length : 0
    })).sort((a, b) => a.expiry.localeCompare(b.expiry));
  }

  /**
   * 希腊字母聚合
   */
  aggregateGreeks(options: OptionContract[]): {
    totalDelta: number;
    totalGamma: number;
    totalTheta: number;
    totalVega: number;
    netDeltaExposure: number;
  } {
    let totalDelta = 0, totalGamma = 0, totalTheta = 0, totalVega = 0;

    for (const opt of options) {
      const contracts = opt.openInterest;
      totalDelta += opt.delta * contracts;
      totalGamma += opt.gamma * contracts;
      totalTheta += opt.theta * contracts;
      totalVega += opt.vega * contracts;
    }

    return {
      totalDelta,
      totalGamma,
      totalTheta,
      totalVega,
      netDeltaExposure: totalDelta * 100 // Notional
    };
  }
}
