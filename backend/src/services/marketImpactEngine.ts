/**
 * 市场冲击模型引擎
 * - 线性冲击模型
 * - 平方根冲击模型 (Almgren)
 * - 订单拆分优化
 * - 流动性消耗模型
 * - 冲击衰减分析
 * - VWAP 偏差预测
 */

export interface ImpactParams {
  dailyVolume: number;       // 日均成交量
  volatility: number;        // 日波动率
  spread: number;            // 买卖价差
  participationRate: number; // 参与率目标
}

export interface ImpactEstimate {
  temporaryImpact: number;   // 临时冲击 (bps)
  permanentImpact: number;   // 永久冲击 (bps)
  totalImpact: number;       // 总冲击 (bps)
  executionCost: number;     // 执行成本
  duration: number;          // 预计执行时间 (分钟)
}

export interface OrderSplitPlan {
  sliceSize: number;
  numSlices: number;
  intervalMinutes: number;
  expectedImpact: number;
  riskReduction: number;
}

export interface LiquidityProfile {
  hour: number;
  relativeVolume: number;
  effectiveSpread: number;
  depth: number;
  impactMultiplier: number;
}

export interface ImpactDecay {
  halfLife: number;          // 半衰期 (秒)
  decayRate: number;
  initialImpact: number;
  residualImpact: number;    // 1小时后残余冲击
}

export interface VWAPDeviation {
  expectedVWAP: number;
  upperBound: number;
  lowerBound: number;
  confidence: number;
}

export class MarketImpactEngine {
  /**
   * 线性冲击模型
   * Impact = η * (Q/V) + σ * √(Q/V)
   */
  linearImpact(params: ImpactParams, orderSize: number): ImpactEstimate {
    const { dailyVolume, volatility, spread, participationRate } = params;
    if (dailyVolume <= 0 || orderSize <= 0) {
      return { temporaryImpact: 0, permanentImpact: 0, totalImpact: 0, executionCost: 0, duration: 0 };
    }

    const participation = orderSize / dailyVolume;
    const eta = spread / 2 + volatility * Math.sqrt(participation);
    const temporaryImpact = eta * participation * 10000; // bps
    const permanentImpact = volatility * Math.sqrt(participation) * 0.1 * 10000;
    const totalImpact = temporaryImpact + permanentImpact;

    const duration = participationRate > 0
      ? (orderSize / (dailyVolume * participationRate / 390)) // ~390 trading minutes
      : 0;

    return {
      temporaryImpact,
      permanentImpact,
      totalImpact,
      executionCost: totalImpact * orderSize / 10000,
      duration
    };
  }

  /**
   * Almgren 平方根冲击模型
   */
  almgrenImpact(params: ImpactParams, orderSize: number): ImpactEstimate {
    const { dailyVolume, volatility, spread } = params;
    if (dailyVolume <= 0 || orderSize <= 0) {
      return { temporaryImpact: 0, permanentImpact: 0, totalImpact: 0, executionCost: 0, duration: 0 };
    }

    const x = orderSize / dailyVolume;
    const sigma = volatility;

    // Temporary: γ * σ * √x
    const gamma = 0.5; // market impact parameter
    const temporaryImpact = gamma * sigma * Math.sqrt(x) * 10000;

    // Permanent: η * σ * x
    const eta = 0.3;
    const permanentImpact = eta * sigma * x * 10000;

    const totalImpact = temporaryImpact + permanentImpact + spread / 2 * 10000;
    const duration = (orderSize / dailyVolume) * 390;

    return {
      temporaryImpact,
      permanentImpact,
      totalImpact: totalImpact,
      executionCost: totalImpact * orderSize / 10000,
      duration
    };
  }

  /**
   * 订单拆分优化
   */
  optimizeOrderSplit(
    params: ImpactParams,
    totalSize: number,
    maxDuration: number = 390 // minutes
  ): OrderSplitPlan {
    const { dailyVolume, volatility } = params;
    if (dailyVolume <= 0 || totalSize <= 0) {
      return { sliceSize: 0, numSlices: 0, intervalMinutes: 0, expectedImpact: 0, riskReduction: 0 };
    }

    // Optimal slice: minimize impact + risk tradeoff
    const participation = totalSize / dailyVolume;
    const optimalSliceRatio = Math.sqrt(volatility * 2 / (0.5 * Math.sqrt(participation)));
    const sliceSize = Math.max(1, Math.floor(totalSize * Math.min(0.5, optimalSliceRatio)));
    const numSlices = Math.ceil(totalSize / sliceSize);
    const intervalMinutes = Math.max(1, Math.floor(maxDuration / numSlices));

    // Impact per slice
    const sliceParams = { ...params, participationRate: sliceSize / dailyVolume };
    const perSliceImpact = this.linearImpact(sliceParams, sliceSize);
    const expectedImpact = perSliceImpact.totalImpact * Math.sqrt(numSlices) / numSlices;

    // Risk reduction vs single execution
    const singleRisk = volatility * Math.sqrt(maxDuration / 390);
    const splitRisk = volatility * Math.sqrt(intervalMinutes / 390) * Math.sqrt(numSlices);
    const riskReduction = singleRisk > 0 ? Math.max(0, 1 - splitRisk / singleRisk) : 0;

    return { sliceSize, numSlices, intervalMinutes, expectedImpact, riskReduction };
  }

  /**
   * 日内流动性分布 (简化的 U 型曲线)
   */
  intradayLiquidityProfile(): LiquidityProfile[] {
    const profile: LiquidityProfile[] = [];

    for (let hour = 9; hour <= 15; hour++) {
      let relativeVolume: number;
      if (hour === 9) relativeVolume = 1.8;        // 开盘高
      else if (hour === 10) relativeVolume = 1.3;
      else if (hour === 11) relativeVolume = 0.9;
      else if (hour === 12) relativeVolume = 0.6;   // 午间低
      else if (hour === 13) relativeVolume = 0.7;
      else if (hour === 14) relativeVolume = 1.0;
      else relativeVolume = 1.5;                     // 尾盘高

      const effectiveSpread = 1 / relativeVolume * 0.001;
      const depth = relativeVolume * 1000000;
      const impactMultiplier = 1 / Math.sqrt(relativeVolume);

      profile.push({ hour, relativeVolume, effectiveSpread, depth, impactMultiplier });
    }

    return profile;
  }

  /**
   * 冲击衰减模型
   */
  impactDecay(initialImpact: number, avgDailyVolume: number): ImpactDecay {
    // Half-life proportional to sqrt(volume) — larger stocks decay faster
    const halfLife = Math.max(10, 60 * Math.sqrt(1000000 / Math.max(avgDailyVolume, 1)));
    const decayRate = Math.log(2) / halfLife;
    const residualImpact = initialImpact * Math.exp(-decayRate * 3600); // 1 hour

    return { halfLife, decayRate, initialImpact, residualImpact: Math.max(0, residualImpact) };
  }

  /**
   * VWAP 偏差预测
   */
  predictVWAPDeviation(
    params: ImpactParams,
    orderSize: number,
    horizon: number = 390 // minutes
  ): VWAPDeviation {
    const { dailyVolume, volatility } = params;
    if (dailyVolume <= 0) {
      return { expectedVWAP: 0, upperBound: 0, lowerBound: 0, confidence: 0 };
    }

    const participation = orderSize / dailyVolume;
    const impact = this.linearImpact(params, orderSize);

    // VWAP deviation ~ impact + noise
    const noise = volatility * Math.sqrt(participation) * Math.sqrt(horizon / 390);
    const expectedVWAP = impact.totalImpact / 10000;
    const upperBound = expectedVWAP + 2 * noise;
    const lowerBound = expectedVWAP - 2 * noise;
    const confidence = Math.min(0.95, 0.5 + 0.3 / (1 + participation * 10));

    return { expectedVWAP, upperBound, lowerBound, confidence };
  }

  /**
   * 参与率优化
   */
  optimizeParticipationRate(
    params: ImpactParams,
    orderSize: number,
    riskAversion: number = 0.5 // 0 = minimize cost, 1 = minimize risk
  ): {
    optimalRate: number;
    expectedCost: number;
    expectedRisk: number;
    totalCost: number;
  } {
    const { dailyVolume, volatility } = params;
    if (dailyVolume <= 0 || orderSize <= 0) {
      return { optimalRate: 0, expectedCost: 0, expectedRisk: 0, totalCost: 0 };
    }

    let bestRate = 0.05;
    let bestCost = Infinity;

    for (let rate = 0.01; rate <= 0.5; rate += 0.01) {
      const p = { ...params, participationRate: rate };
      const impact = this.linearImpact(p, orderSize);
      const duration = orderSize / (dailyVolume * rate / 390);
      const risk = volatility * Math.sqrt(duration / 390) * orderSize;
      const totalCost = impact.executionCost * (1 - riskAversion) + risk * riskAversion * 10000;

      if (totalCost < bestCost) {
        bestCost = totalCost;
        bestRate = rate;
      }
    }

    const finalImpact = this.linearImpact({ ...params, participationRate: bestRate }, orderSize);
    const finalDuration = orderSize / (dailyVolume * bestRate / 390);
    const finalRisk = volatility * Math.sqrt(finalDuration / 390) * orderSize;

    return {
      optimalRate: bestRate,
      expectedCost: finalImpact.executionCost,
      expectedRisk: finalRisk,
      totalCost: bestCost
    };
  }

  /**
   * 多资产冲击相关性
   */
  crossAssetImpact(
    primaryImpact: number,
    correlation: number,
    secondaryADV: number,
    primaryADV: number
  ): number {
    if (primaryADV <= 0 || secondaryADV <= 0) return 0;
    const sizeRatio = primaryADV / secondaryADV;
    return primaryImpact * correlation * Math.sqrt(sizeRatio) * 0.3;
  }
}
