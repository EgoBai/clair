/**
 * 逐笔数据引擎
 * Tick-level data analysis: VWAP, TWAP, 交易成本分析, 订单执行质量
 */

export interface Tick {
  timestamp: number; // 毫秒时间戳
  price: number;
  volume: number;
  direction: 'buy' | 'sell' | 'neutral';
}

export interface VwapResult {
  vwap: number;
  cumulativeVolume: number;
  cumulativeValue: number;
  deviation: number; // 当前价格偏离 VWAP 的百分比
}

export interface TwapResult {
  twap: number;
  timeWeightedSum: number;
  totalDuration: number;
}

export interface TickStats {
  tickCount: number;
  avgSpread: number; // 平均买卖价差
  realizedVolatility: number;
  tickFrequency: number; // 每秒 tick 数
  avgTradeSize: number;
  largeTradeRatio: number; // 大单占比
  buyVolumeRatio: number;
  priceImpact: number; // 价格冲击（每1000股）
  kyleLambda: number; // Kyle's Lambda 流动性指标
  amihudIlliquidity: number; // Amihud 非流动性指标
}

export interface VolumeProfile {
  price: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
  poc: boolean; // Point of Control
  valueAreaHigh: number;
  valueAreaLow: number;
}

export interface OrderExecutionQuality {
  implementationShortfall: number;
  vwapSlippage: number;
  arrivalPrice: number;
  executionPrice: number;
  participationRate: number;
  marketImpact: number;
  timingCost: number;
}

/**
 * 计算 VWAP（成交量加权平均价格）
 */
export function calculateVwap(ticks: Tick[], currentTime?: number): VwapResult {
  const relevantTicks = currentTime
    ? ticks.filter(t => t.timestamp <= currentTime)
    : ticks;

  if (relevantTicks.length === 0) {
    return { vwap: 0, cumulativeVolume: 0, cumulativeValue: 0, deviation: 0 };
  }

  let cumulativeVolume = 0;
  let cumulativeValue = 0;

  for (const tick of relevantTicks) {
    cumulativeVolume += tick.volume;
    cumulativeValue += tick.price * tick.volume;
  }

  const vwap = cumulativeVolume > 0 ? cumulativeValue / cumulativeVolume : 0;
  const lastPrice = relevantTicks[relevantTicks.length - 1].price;
  const deviation = vwap > 0 ? ((lastPrice - vwap) / vwap) * 100 : 0;

  return {
    vwap: Math.round(vwap * 10000) / 10000,
    cumulativeVolume,
    cumulativeValue: Math.round(cumulativeValue * 100) / 100,
    deviation: Math.round(deviation * 100) / 100,
  };
}

/**
 * 计算滚动 VWAP
 */
export function rollingVwap(ticks: Tick[], windowTicks: number): number[] {
  const result: number[] = [];

  for (let i = 0; i < ticks.length; i++) {
    const start = Math.max(0, i - windowTicks + 1);
    const window = ticks.slice(start, i + 1);
    let vol = 0;
    let val = 0;
    for (const t of window) {
      vol += t.volume;
      val += t.price * t.volume;
    }
    result.push(vol > 0 ? val / vol : ticks[i].price);
  }

  return result;
}

/**
 * 计算 TWAP（时间加权平均价格）
 */
export function calculateTwap(ticks: Tick[], startTime?: number, endTime?: number): TwapResult {
  if (ticks.length < 2) {
    return { twap: ticks[0]?.price ?? 0, timeWeightedSum: 0, totalDuration: 0 };
  }

  const filteredTicks = ticks.filter(t => {
    if (startTime && t.timestamp < startTime) return false;
    if (endTime && t.timestamp > endTime) return false;
    return true;
  });

  if (filteredTicks.length < 2) {
    return { twap: filteredTicks[0]?.price ?? 0, timeWeightedSum: 0, totalDuration: 0 };
  }

  let timeWeightedSum = 0;
  let totalDuration = 0;

  for (let i = 1; i < filteredTicks.length; i++) {
    const duration = filteredTicks[i].timestamp - filteredTicks[i - 1].timestamp;
    timeWeightedSum += filteredTicks[i - 1].price * duration;
    totalDuration += duration;
  }

  const twap = totalDuration > 0 ? timeWeightedSum / totalDuration : filteredTicks[0].price;

  return {
    twap: Math.round(twap * 10000) / 10000,
    timeWeightedSum: Math.round(timeWeightedSum * 100) / 100,
    totalDuration,
  };
}

/**
 * 计算 Tick 统计指标
 */
export function calculateTickStats(ticks: Tick[]): TickStats {
  if (ticks.length === 0) {
    return {
      tickCount: 0, avgSpread: 0, realizedVolatility: 0,
      tickFrequency: 0, avgTradeSize: 0, largeTradeRatio: 0,
      buyVolumeRatio: 0, priceImpact: 0, kyleLambda: 0, amihudIlliquidity: 0,
    };
  }

  const tickCount = ticks.length;

  // 收益率
  const returns: number[] = [];
  for (let i = 1; i < ticks.length; i++) {
    if (ticks[i - 1].price > 0) {
      returns.push(Math.log(ticks[i].price / ticks[i - 1].price));
    }
  }

  // 已实现波动率
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const realizedVariance = returns.length > 0
    ? returns.reduce((a, b) => a + (b - avgReturn) ** 2, 0) / returns.length
    : 0;
  const realizedVolatility = Math.sqrt(realizedVariance * 252 * 390 * 60); // 年化

  // Tick 频率
  const totalMs = ticks[ticks.length - 1].timestamp - ticks[0].timestamp;
  const tickFrequency = totalMs > 0 ? (tickCount / totalMs) * 1000 : 0;

  // 平均交易量和大单
  const volumes = ticks.map(t => t.volume);
  const totalVolume = volumes.reduce((a, b) => a + b, 0);
  const avgTradeSize = totalVolume / tickCount;
  const largeTradeThreshold = avgTradeSize * 3;
  const largeTrades = volumes.filter(v => v >= largeTradeThreshold);
  const largeTradeRatio = largeTrades.length / tickCount;

  // 买卖比
  const buyVolume = ticks.filter(t => t.direction === 'buy').reduce((a, t) => a + t.volume, 0);
  const buyVolumeRatio = totalVolume > 0 ? buyVolume / totalVolume : 0.5;

  // Kyle's Lambda: |Δprice| / volume (价格冲击)
  let kyleLambda = 0;
  if (returns.length > 0) {
    const priceChanges = returns.map(Math.abs);
    const volumesForLambda = ticks.slice(1).map(t => t.volume);
    const avgAbsReturn = priceChanges.reduce((a, b) => a + b, 0) / priceChanges.length;
    const avgVolume = volumesForLambda.reduce((a, b) => a + b, 0) / volumesForLambda.length;
    kyleLambda = avgVolume > 0 ? avgAbsReturn / avgVolume : 0;
  }

  // Amihud 非流动性: |return| / (price * volume)
  let amihudIlliquidity = 0;
  if (returns.length > 0) {
    let sum = 0;
    for (let i = 0; i < returns.length; i++) {
      const dollarVolume = ticks[i + 1].price * ticks[i + 1].volume;
      if (dollarVolume > 0) sum += Math.abs(returns[i]) / dollarVolume;
    }
    amihudIlliquidity = sum / returns.length;
  }

  // 价格冲击（每1000股的价格变化）
  const priceImpact = kyleLambda * 1000;

  return {
    tickCount,
    avgSpread: 0, // 需要买卖盘口数据
    realizedVolatility: Math.round(realizedVolatility * 10000) / 10000,
    tickFrequency: Math.round(tickFrequency * 100) / 100,
    avgTradeSize: Math.round(avgTradeSize),
    largeTradeRatio: Math.round(largeTradeRatio * 10000) / 10000,
    buyVolumeRatio: Math.round(buyVolumeRatio * 10000) / 10000,
    priceImpact: Math.round(priceImpact * 1000000) / 1000000,
    kyleLambda: Math.round(kyleLambda * 1000000) / 1000000,
    amihudIlliquidity: Math.round(amihudIlliquidity * 100000000) / 100000000,
  };
}

/**
 * 构建成交量分布图（Volume Profile）
 */
export function buildVolumeProfile(
  ticks: Tick[],
  priceStep: number = 0.01,
  valueAreaPercent: number = 0.7
): VolumeProfile[] {
  if (ticks.length === 0) return [];

  const _minPrice = Math.min(...ticks.map(t => t.price));
  const _maxPrice = Math.max(...ticks.map(t => t.price));

  // 按价格区间聚合
  const buckets = new Map<number, { volume: number; buyVolume: number; sellVolume: number }>();

  for (const tick of ticks) {
    const bucket = Math.round(tick.price / priceStep) * priceStep;
    const key = Math.round(bucket * 100) / 100;

    if (!buckets.has(key)) {
      buckets.set(key, { volume: 0, buyVolume: 0, sellVolume: 0 });
    }
    const b = buckets.get(key)!;
    b.volume += tick.volume;
    if (tick.direction === 'buy') b.buyVolume += tick.volume;
    else if (tick.direction === 'sell') b.sellVolume += tick.volume;
  }

  // 转成数组并排序
  const profile: VolumeProfile[] = Array.from(buckets.entries())
    .map(([price, data]) => ({
      price,
      volume: data.volume,
      buyVolume: data.buyVolume,
      sellVolume: data.sellVolume,
      poc: false,
      valueAreaHigh: 0,
      valueAreaLow: 0,
    }))
    .sort((a, b) => a.price - b.price);

  if (profile.length === 0) return [];

  // POC: 最大成交量的价格
  let pocIndex = 0;
  for (let i = 1; i < profile.length; i++) {
    if (profile[i].volume > profile[pocIndex].volume) {
      pocIndex = i;
    }
  }
  profile[pocIndex].poc = true;

  // Value Area: 围绕 POC 的 70% 成交量区域
  const totalVolume = profile.reduce((a, p) => a + p.volume, 0);
  const targetVolume = totalVolume * valueAreaPercent;

  let accumulatedVolume = profile[pocIndex].volume;
  let highIdx = pocIndex;
  let lowIdx = pocIndex;

  while (accumulatedVolume < targetVolume && (highIdx < profile.length - 1 || lowIdx > 0)) {
    const upVol = highIdx < profile.length - 1 ? profile[highIdx + 1].volume : 0;
    const downVol = lowIdx > 0 ? profile[lowIdx - 1].volume : 0;

    if (upVol >= downVol && highIdx < profile.length - 1) {
      highIdx++;
      accumulatedVolume += profile[highIdx].volume;
    } else if (lowIdx > 0) {
      lowIdx--;
      accumulatedVolume += profile[lowIdx].volume;
    } else {
      break;
    }
  }

  const valueAreaHigh = profile[highIdx].price;
  const valueAreaLow = profile[lowIdx].price;

  return profile.map(p => ({ ...p, valueAreaHigh, valueAreaLow }));
}

/**
 * 评估订单执行质量
 */
export function evaluateExecution(
  ticks: Tick[],
  arrivalPrice: number,
  targetVolume: number,
  startTime: number,
  endTime: number
): OrderExecutionQuality {
  const executionTicks = ticks.filter(t => t.timestamp >= startTime && t.timestamp <= endTime);

  if (executionTicks.length === 0) {
    return {
      implementationShortfall: 0, vwapSlippage: 0, arrivalPrice,
      executionPrice: arrivalPrice, participationRate: 0,
      marketImpact: 0, timingCost: 0,
    };
  }

  // 执行均价
  let totalValue = 0;
  let totalVolume = 0;
  for (const tick of executionTicks) {
    totalValue += tick.price * tick.volume;
    totalVolume += tick.volume;
  }
  const executionPrice = totalVolume > 0 ? totalValue / totalVolume : arrivalPrice;

  // VWAP
  const marketVwap = calculateVwap(executionTicks);

  // Implementation Shortfall
  const implementationShortfall = ((executionPrice - arrivalPrice) / arrivalPrice) * 10000; // bps

  // VWAP Slippage
  const vwapSlippage = marketVwap.vwap > 0
    ? ((executionPrice - marketVwap.vwap) / marketVwap.vwap) * 10000
    : 0;

  // 参与率
  const totalMarketVolume = ticks
    .filter(t => t.timestamp >= startTime && t.timestamp <= endTime)
    .reduce((a, t) => a + t.volume, 0);
  const participationRate = totalMarketVolume > 0 ? totalVolume / totalMarketVolume : 0;

  // 市场冲击和择时成本分离
  // Market Impact ≈ 执行均价 - 到达价（在执行窗口开始时的价格）
  const marketImpact = ((executionPrice - arrivalPrice) / arrivalPrice) * 10000;
  // Timing Cost = 实际市场变动 - 市场冲击
  const endPrice = executionTicks[executionTicks.length - 1].price;
  const timingCost = ((endPrice - arrivalPrice) / arrivalPrice) * 10000 - marketImpact;

  return {
    implementationShortfall: Math.round(implementationShortfall * 100) / 100,
    vwapSlippage: Math.round(vwapSlippage * 100) / 100,
    arrivalPrice: Math.round(arrivalPrice * 10000) / 10000,
    executionPrice: Math.round(executionPrice * 10000) / 10000,
    participationRate: Math.round(participationRate * 10000) / 10000,
    marketImpact: Math.round(marketImpact * 100) / 100,
    timingCost: Math.round(timingCost * 100) / 100,
  };
}

/**
 * 检测异常交易（大单、脉冲交易等）
 */
export function detectAnomalousTicks(
  ticks: Tick[],
  config: {
    volumeThreshold?: number; // 成交量倍数阈值
    priceJumpThreshold?: number; // 价格跳变标准差阈值
    windowSize?: number;
  } = {}
): { index: number; type: 'large_volume' | 'price_jump' | 'burst'; tick: Tick }[] {
  const {
    volumeThreshold = 5,
    priceJumpThreshold = 3,
    windowSize = 20,
  } = config;

  const anomalies: { index: number; type: 'large_volume' | 'price_jump' | 'burst'; tick: Tick }[] = [];

  if (ticks.length < windowSize) return anomalies;

  for (let i = windowSize; i < ticks.length; i++) {
    const window = ticks.slice(i - windowSize, i);

    // 成交量异常
    const avgVolume = window.reduce((a, t) => a + t.volume, 0) / windowSize;
    if (ticks[i].volume > avgVolume * volumeThreshold) {
      anomalies.push({ index: i, type: 'large_volume', tick: ticks[i] });
    }

    // 价格跳变
    const returns = [];
    for (let j = 1; j < window.length; j++) {
      returns.push(Math.log(window[j].price / window[j - 1].price));
    }
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdReturn = Math.sqrt(returns.reduce((a, b) => a + (b - avgReturn) ** 2, 0) / returns.length);
    const currentReturn = Math.log(ticks[i].price / ticks[i - 1].price);
    const zReturn = stdReturn > 0 ? (currentReturn - avgReturn) / stdReturn : 0;

    if (Math.abs(zReturn) > priceJumpThreshold) {
      anomalies.push({ index: i, type: 'price_jump', tick: ticks[i] });
    }

    // 脉冲交易：短时间内连续大单
    const recentBurst = ticks.slice(Math.max(0, i - 5), i + 1);
    const burstVolume = recentBurst.reduce((a, t) => a + t.volume, 0);
    if (burstVolume > avgVolume * windowSize * 0.5) {
      anomalies.push({ index: i, type: 'burst', tick: ticks[i] });
    }
  }

  return anomalies;
}

/**
 * 计算微观价格（Micro Price）
 * 根据买卖盘口加权的最优价格估计
 */
export function calculateMicroPrice(
  bidPrice: number,
  askPrice: number,
  bidSize: number,
  askSize: number
): number {
  const totalSize = bidSize + askSize;
  if (totalSize === 0) return (bidPrice + askPrice) / 2;
  return (bidPrice * askSize + askPrice * bidSize) / totalSize;
}

/**
 * 计算加权中间价（Weighted Mid Price）
 */
export function calculateWeightedMidPrice(
  bidLevels: { price: number; size: number }[],
  askLevels: { price: number; size: number }[]
): number {
  if (bidLevels.length === 0 || askLevels.length === 0) return 0;

  const bestBid = bidLevels[0].price;
  const bestAsk = askLevels[0].price;
  const mid = (bestBid + bestAsk) / 2;

  // 根据盘口深度加权
  let weightedSum = 0;
  let totalWeight = 0;

  for (const level of [...bidLevels, ...askLevels]) {
    const distance = Math.abs(level.price - mid);
    const weight = level.size / (1 + distance);
    weightedSum += level.price * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : mid;
}
