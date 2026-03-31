/**
 * 轮动策略引擎
 * - 行业相对强弱轮动
 * - 大小盘风格轮动
 * - 动量轮动 (Momentum Rotation)
 * - 均值回归轮动
 * - 多因子轮动打分
 */

export interface RotationAsset {
  symbol: string;
  name: string;
  sector?: string;
  returns: number[];
  prices: number[];
  marketCap?: number;
  pe?: number;
  pb?: number;
}

export interface RotationSignal {
  symbol: string;
  action: 'overweight' | 'underweight' | 'neutral';
  score: number;
  momentum: number;
  meanReversion: number;
  value: number;
  composite: number;
  rank: number;
}

export interface StyleRotation {
  style: 'large_cap' | 'mid_cap' | 'small_cap' | 'growth' | 'value';
  currentSignal: 'bullish' | 'bearish' | 'neutral';
  relativeStrength: number;
  trend: number; // 0-100
  duration: number; // cycles
}

export interface RotationPortfolio {
  allocations: Array<{
    symbol: string;
    weight: number;
    reason: string;
  }>;
  turnover: number;
  expectedReturn: number;
  risk: number;
  sharpeRatio: number;
}

export interface RotationBacktest {
  totalReturn: number;
  annualizedReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  winRate: number;
  numTrades: number;
  avgHoldingPeriod: number;
  periods: Array<{
    date: string;
    holdings: string[];
    return: number;
    cumulative: number;
  }>;
}

export class RotationEngine {
  /**
   * 动量轮动排名
   */
  momentumRotation(assets: RotationAsset[], lookback: number = 20, topN: number = 3): RotationSignal[] {
    const signals: RotationSignal[] = [];

    for (const asset of assets) {
      if (asset.returns.length < lookback) continue;

      const recentReturns = asset.returns.slice(-lookback);
      const momentum = recentReturns.reduce((a, b) => a + b, 0);
      const volatility = this.std(recentReturns);
      const riskAdjMomentum = volatility > 0 ? momentum / volatility : 0;

      // Mean reversion signal
      const prices = asset.prices.slice(-lookback);
      const currentPrice = prices[prices.length - 1];
      const meanPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
      const meanReversion = meanPrice > 0 ? -(currentPrice - meanPrice) / meanPrice : 0;

      // Value signal (if data available)
      const value = asset.pe && asset.pe > 0 ? -Math.log(asset.pe) / 10 : 0;

      // Composite score
      const composite = riskAdjMomentum * 0.5 + meanReversion * 0.2 + value * 0.3;

      signals.push({
        symbol: asset.symbol,
        action: composite > 0.1 ? 'overweight' : composite < -0.1 ? 'underweight' : 'neutral',
        score: riskAdjMomentum,
        momentum,
        meanReversion,
        value,
        composite,
        rank: 0
      });
    }

    signals.sort((a, b) => b.composite - a.composite);
    signals.forEach((s, i) => s.rank = i + 1);

    return signals;
  }

  /**
   * 行业相对强弱轮动
   */
  sectorRelativeStrength(sectors: RotationAsset[], benchmark: number[]): RotationSignal[] {
    const signals: RotationSignal[] = [];

    for (const sector of sectors) {
      const minLength = Math.min(sector.returns.length, benchmark.length);
      if (minLength < 20) continue;

      const sectorReturns = sector.returns.slice(-minLength);
      const benchReturns = benchmark.slice(-minLength);

      // Relative strength
      let cumulativeSector = 1;
      let cumulativeBench = 1;
      const relativeStrengthSeries: number[] = [];

      for (let i = 0; i < minLength; i++) {
        cumulativeSector *= (1 + sectorReturns[i]);
        cumulativeBench *= (1 + benchReturns[i]);
        relativeStrengthSeries.push(cumulativeSector / cumulativeBench);
      }

      const currentRS = relativeStrengthSeries[relativeStrengthSeries.length - 1];
      const prevRS = relativeStrengthSeries[Math.max(0, relativeStrengthSeries.length - 20)];
      const rsMomentum = prevRS > 0 ? (currentRS - prevRS) / prevRS : 0;

      signals.push({
        symbol: sector.symbol,
        action: rsMomentum > 0.02 ? 'overweight' : rsMomentum < -0.02 ? 'underweight' : 'neutral',
        score: currentRS,
        momentum: rsMomentum,
        meanReversion: 0,
        value: 0,
        composite: rsMomentum,
        rank: 0
      });
    }

    signals.sort((a, b) => b.composite - a.composite);
    signals.forEach((s, i) => s.rank = i + 1);

    return signals;
  }

  /**
   * 风格轮动分析
   */
  analyzeStyleRotation(
    largeCap: number[],
    midCap: number[],
    smallCap: number[],
    growth: number[],
    value: number[]
  ): StyleRotation[] {
    const styles: Array<{ style: StyleRotation['style']; returns: number[] }> = [
      { style: 'large_cap', returns: largeCap },
      { style: 'mid_cap', returns: midCap },
      { style: 'small_cap', returns: smallCap },
      { style: 'growth', returns: growth },
      { style: 'value', returns: value },
    ];

    return styles.map(({ style, returns }) => {
      if (returns.length < 20) {
        return { style, currentSignal: 'neutral' as const, relativeStrength: 0, trend: 50, duration: 0 };
      }

      const recent = returns.slice(-20);
      const momentum = recent.reduce((a, b) => a + b, 0);
      const trend = Math.min(100, Math.max(0, 50 + momentum * 500));

      // Duration of current trend
      let duration = 0;
      const isPositive = momentum > 0;
      for (let i = returns.length - 1; i >= 0; i--) {
        if ((returns[i] > 0) === isPositive) duration++;
        else break;
      }

      const relativeStrength = this.std(recent) > 0 ? momentum / this.std(recent) : 0;

      let currentSignal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
      if (relativeStrength > 0.5) currentSignal = 'bullish';
      else if (relativeStrength < -0.5) currentSignal = 'bearish';

      return { style, currentSignal, relativeStrength, trend, duration };
    });
  }

  /**
   * 构建轮动组合
   */
  buildRotationPortfolio(
    assets: RotationAsset[],
    totalCapital: number,
    topN: number = 5,
    lookback: number = 20
  ): RotationPortfolio {
    const signals = this.momentumRotation(assets, lookback, topN);
    const selected = signals.filter(s => s.action === 'overweight').slice(0, topN);

    if (selected.length === 0) {
      return { allocations: [], turnover: 0, expectedReturn: 0, risk: 0, sharpeRatio: 0 };
    }

    // Equal weight with score tilt
    const totalScore = selected.reduce((sum, s) => sum + Math.max(0.01, s.composite), 0);

    const allocations = selected.map(s => {
      const weight = Math.max(0.01, s.composite) / totalScore;
      return {
        symbol: s.symbol,
        weight,
        reason: `动量排名#${s.rank}, 综合得分${s.composite.toFixed(3)}`
      };
    });

    // Normalize weights
    const sumWeight = allocations.reduce((sum, a) => sum + a.weight, 0);
    allocations.forEach(a => a.weight /= sumWeight);

    // Estimate risk/return
    const expectedReturn = selected.reduce((sum, s) => sum + s.momentum, 0) / selected.length;
    const asset = assets.find(a => a.symbol === selected[0].symbol);
    const risk = asset ? this.std(asset.returns.slice(-lookback)) * Math.sqrt(252) : 0;
    const sharpeRatio = risk > 0 ? (expectedReturn * 252) / risk : 0;

    return {
      allocations,
      turnover: 0.3, // estimated
      expectedReturn: expectedReturn * 252,
      risk,
      sharpeRatio
    };
  }

  /**
   * 简单轮动回测
   */
  backtestRotation(
    assets: RotationAsset[],
    rebalanceDays: number = 20,
    lookback: number = 60,
    topN: number = 3
  ): RotationBacktest {
    if (assets.length === 0) {
      return { totalReturn: 0, annualizedReturn: 0, maxDrawdown: 0, sharpeRatio: 0, winRate: 0, numTrades: 0, avgHoldingPeriod: rebalanceDays, periods: [] };
    }

    const maxLen = Math.max(...assets.map(a => a.returns.length));
    const periods: RotationBacktest['periods'] = [];
    let cumulative = 1;
    let peak = 1;
    let maxDD = 0;
    let wins = 0;
    let totalTrades = 0;

    for (let i = lookback; i < maxLen; i += rebalanceDays) {
      // Build window
      const windowAssets = assets.map(a => ({
        ...a,
        returns: a.returns.slice(Math.max(0, i - lookback), i)
      })).filter(a => a.returns.length >= lookback * 0.5);

      const signals = this.momentumRotation(windowAssets, Math.min(lookback, windowAssets[0]?.returns.length || lookback), topN);
      const selected = signals.filter(s => s.action === 'overweight').slice(0, topN);

      // Calculate period return
      let periodReturn = 0;
      for (const sel of selected) {
        const asset = assets.find(a => a.symbol === sel.symbol);
        if (asset) {
          for (let j = i; j < Math.min(i + rebalanceDays, asset.returns.length); j++) {
            periodReturn += asset.returns[j] / selected.length;
          }
        }
      }

      cumulative *= (1 + periodReturn);
      if (cumulative > peak) peak = cumulative;
      const dd = (peak - cumulative) / peak;
      if (dd > maxDD) maxDD = dd;

      if (periodReturn > 0) wins++;
      totalTrades++;

      periods.push({
        date: `period_${i}`,
        holdings: selected.map(s => s.symbol),
        return: periodReturn,
        cumulative
      });
    }

    const totalReturn = cumulative - 1;
    const years = maxLen / 252;
    const annualizedReturn = years > 0 ? Math.pow(cumulative, 1 / years) - 1 : 0;
    const returns = periods.map(p => p.return);
    const vol = this.std(returns) * Math.sqrt(252 / rebalanceDays);
    const sharpeRatio = vol > 0 ? annualizedReturn / vol : 0;
    const winRate = totalTrades > 0 ? wins / totalTrades : 0;

    return {
      totalReturn,
      annualizedReturn,
      maxDrawdown: maxDD,
      sharpeRatio,
      winRate,
      numTrades: totalTrades,
      avgHoldingPeriod: rebalanceDays,
      periods
    };
  }

  private std(data: number[]): number {
    if (data.length === 0) return 0;
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    return Math.sqrt(data.reduce((sum, v) => sum + (v - mean) ** 2, 0) / data.length);
  }
}

export default new RotationEngine();
