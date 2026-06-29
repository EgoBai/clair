/**
 * 高频数据流引擎 (High-Frequency Data Stream Engine)
 * - 分笔数据聚合
 * - VWAP计算
 * - 订单流失衡
 * - 成交量分布
 * - 价格冲击模型
 * - 微观价格模式
 */

export interface TickData {
  timestamp: number;
  price: number;
  volume: number;
  direction: 'buy' | 'sell' | 'neutral';
  bidPrice: number;
  askPrice: number;
  bidSize: number;
  askSize: number;
}

export interface VWAPResult {
  vwap: number;
  upperBand: number;
  lowerBand: number;
  deviation: number;     // 价格偏离VWAP的百分比
  volumeWeight: number;
}

export interface OrderFlowImbalance {
  buyVolume: number;
  sellVolume: number;
  netVolume: number;
  imbalanceRatio: number; // -1 to 1
  aggressorSide: 'buy' | 'sell' | 'neutral';
  pressure: number;       // 0-100
}

export interface VolumeProfile {
  price: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
  poc: number;            // Point of Control (成交量最大价位)
  valueAreaHigh: number;
  valueAreaLow: number;
}

export interface MicroPricePattern {
  pattern: 'uptick_downtick_ratio' | 'bid_ask_bounce' | 'price_momentum' | 'mean_reversion';
  value: number;
  strength: number;
  description: string;
}

/**
 * 计算VWAP
 */
export function calculateVWAP(ticks: TickData[]): VWAPResult {
  if (ticks.length === 0) {
    return { vwap: 0, upperBand: 0, lowerBand: 0, deviation: 0, volumeWeight: 0 };
  }

  let totalPV = 0;
  let totalVolume = 0;

  for (const tick of ticks) {
    const midPrice = (tick.bidPrice + tick.askPrice) / 2;
    totalPV += midPrice * tick.volume;
    totalVolume += tick.volume;
  }

  const vwap = totalVolume > 0 ? totalPV / totalVolume : ticks[ticks.length - 1].price;

  // 标准差
  let variance = 0;
  for (const tick of ticks) {
    const midPrice = (tick.bidPrice + tick.askPrice) / 2;
    variance += tick.volume * (midPrice - vwap) ** 2;
  }
  const stdDev = totalVolume > 0 ? Math.sqrt(variance / totalVolume) : 0;

  const lastPrice = ticks[ticks.length - 1].price;
  const deviation = vwap > 0 ? (lastPrice - vwap) / vwap * 100 : 0;

  return {
    vwap: Math.round(vwap * 100) / 100,
    upperBand: Math.round((vwap + stdDev) * 100) / 100,
    lowerBand: Math.round((vwap - stdDev) * 100) / 100,
    deviation: Math.round(deviation * 100) / 100,
    volumeWeight: totalVolume,
  };
}

/**
 * 计算订单流失衡
 */
export function calculateOrderFlowImbalance(ticks: TickData[]): OrderFlowImbalance {
  let buyVolume = 0;
  let sellVolume = 0;

  for (const tick of ticks) {
    if (tick.direction === 'buy') buyVolume += tick.volume;
    else if (tick.direction === 'sell') sellVolume += tick.volume;
  }

  const total = buyVolume + sellVolume;
  const netVolume = buyVolume - sellVolume;
  const imbalanceRatio = total > 0 ? netVolume / total : 0;

  let aggressorSide: 'buy' | 'sell' | 'neutral';
  if (imbalanceRatio > 0.1) aggressorSide = 'buy';
  else if (imbalanceRatio < -0.1) aggressorSide = 'sell';
  else aggressorSide = 'neutral';

  const pressure = Math.min(100, Math.round((Math.abs(imbalanceRatio) * 100)));

  return { buyVolume, sellVolume, netVolume, imbalanceRatio, aggressorSide, pressure };
}

/**
 * 计算成交量分布
 */
export function calculateVolumeProfile(
  ticks: TickData[],
  priceStep: number = 0.01
): VolumeProfile[] {
  const profile = new Map<number, { volume: number; buyVolume: number; sellVolume: number }>();

  for (const tick of ticks) {
    const priceLevel = Math.round(tick.price / priceStep) * priceStep;
    const key = Math.round(priceLevel * 100);

    if (!profile.has(key)) {
      profile.set(key, { volume: 0, buyVolume: 0, sellVolume: 0 });
    }

    const entry = profile.get(key)!;
    entry.volume += tick.volume;
    if (tick.direction === 'buy') entry.buyVolume += tick.volume;
    else if (tick.direction === 'sell') entry.sellVolume += tick.volume;
  }

  const result: VolumeProfile[] = [];
  for (const [key, data] of profile) {
    result.push({
      price: key / 100,
      volume: data.volume,
      buyVolume: data.buyVolume,
      sellVolume: data.sellVolume,
      poc: 0,
      valueAreaHigh: 0,
      valueAreaLow: 0,
    });
  }

  result.sort((a, b) => a.price - b.price);

  // POC
  if (result.length > 0) {
    const pocIndex = result.reduce((maxI, r, i) => r.volume > result[maxI].volume ? i : maxI, 0);
    for (let i = 0; i < result.length; i++) {
      result[i].poc = i === pocIndex ? 1 : 0;
    }

    // Value Area (70% of volume around POC)
    const totalVol = result.reduce((s, r) => s + r.volume, 0);
    const targetVol = totalVol * 0.7;
    let cumVol = 0;
    let lowIdx = pocIndex;
    let highIdx = pocIndex;
    cumVol = result[pocIndex].volume;

    while (cumVol < targetVol && (lowIdx > 0 || highIdx < result.length - 1)) {
      const upVol = highIdx < result.length - 1 ? result[highIdx + 1].volume : 0;
      const downVol = lowIdx > 0 ? result[lowIdx - 1].volume : 0;

      if (upVol >= downVol && highIdx < result.length - 1) {
        highIdx++;
        cumVol += result[highIdx].volume;
      } else if (lowIdx > 0) {
        lowIdx--;
        cumVol += result[lowIdx].volume;
      } else break;
    }

    const vaHigh = result[highIdx].price;
    const vaLow = result[lowIdx].price;
    for (const r of result) {
      r.valueAreaHigh = vaHigh;
      r.valueAreaLow = vaLow;
    }
  }

  return result;
}

/**
 * 检测微观价格模式
 */
export function detectMicroPatterns(ticks: TickData[]): MicroPricePattern[] {
  if (ticks.length < 10) return [];

  const patterns: MicroPricePattern[] = [];

  // 涨跌比
  let upticks = 0;
  let downticks = 0;
  for (let i = 1; i < ticks.length; i++) {
    if (ticks[i].price > ticks[i - 1].price) upticks++;
    else if (ticks[i].price < ticks[i - 1].price) downticks++;
  }

  if (downticks > 0) {
    const ratio = upticks / downticks;
    patterns.push({
      pattern: 'uptick_downtick_ratio',
      value: ratio,
      strength: Math.min(100, Math.round(Math.abs(ratio - 1) * 50)),
      description: ratio > 1.2 ? '涨多跌少，短期偏多' : ratio < 0.8 ? '跌多涨少，短期偏空' : '涨跌均衡',
    });
  }

  // Bid-Ask Bounce
  let bounces = 0;
  for (let i = 1; i < ticks.length; i++) {
    const prevMid = (ticks[i - 1].bidPrice + ticks[i - 1].askPrice) / 2;
    const currMid = (ticks[i].bidPrice + ticks[i].askPrice) / 2;
    if (Math.abs(currMid - prevMid) < 0.001) bounces++;
  }
  const bounceRate = bounces / (ticks.length - 1);
  patterns.push({
    pattern: 'bid_ask_bounce',
    value: bounceRate,
    strength: Math.round(bounceRate * 100),
    description: bounceRate > 0.5 ? '高频震荡，流动性充足' : '价格趋势性强',
  });

  // 价格动量
  const recentPrice = ticks[ticks.length - 1].price;
  const earlierPrice = ticks[Math.max(0, ticks.length - 10)].price;
  const momentum = (recentPrice - earlierPrice) / earlierPrice * 100;

  patterns.push({
    pattern: 'price_momentum',
    value: momentum,
    strength: Math.min(100, Math.round(Math.abs(momentum) * 20)),
    description: momentum > 0.1 ? '短期上升动量' : momentum < -0.1 ? '短期下降动量' : '价格平稳',
  });

  // 均值回归
  const midPrices = ticks.map(t => (t.bidPrice + t.askPrice) / 2);
  const avg = midPrices.reduce((a, b) => a + b, 0) / midPrices.length;
  const devFromMean = (recentPrice - avg) / avg * 100;

  patterns.push({
    pattern: 'mean_reversion',
    value: devFromMean,
    strength: Math.min(100, Math.round(Math.abs(devFromMean) * 50)),
    description: Math.abs(devFromMean) > 0.5 ? '偏离均值，可能回归' : '价格在均值附近',
  });

  return patterns;
}

/**
 * 计算价格冲击
 */
export function estimatePriceImpact(
  ticks: TickData[],
  orderSize: number
): {
  temporaryImpact: number;
  permanentImpact: number;
  totalImpact: number;
  costEstimate: number;
} {
  if (ticks.length < 2) {
    return { temporaryImpact: 0, permanentImpact: 0, totalImpact: 0, costEstimate: 0 };
  }

  // 平均价差
  const avgSpread = ticks.reduce((s, t) => s + (t.askPrice - t.bidPrice), 0) / ticks.length;

  // 平均成交量
  const avgVolume = ticks.reduce((s, t) => s + t.volume, 0) / ticks.length;

  // Kyle's Lambda (简化版)
  const priceChanges = [];
  for (let i = 1; i < ticks.length; i++) {
    priceChanges.push(Math.abs(ticks[i].price - ticks[i - 1].price));
  }
  const avgPriceChange = priceChanges.reduce((a, b) => a + b, 0) / priceChanges.length;

  const temporaryImpact = avgSpread / 2;
  const permanentImpact = avgVolume > 0 ? (orderSize / avgVolume) * avgPriceChange : 0;
  const totalImpact = temporaryImpact + permanentImpact;
  const _lastPrice = ticks[ticks.length - 1].price;
  const costEstimate = totalImpact * orderSize;

  return {
    temporaryImpact: Math.round(temporaryImpact * 10000) / 10000,
    permanentImpact: Math.round(permanentImpact * 10000) / 10000,
    totalImpact: Math.round(totalImpact * 10000) / 10000,
    costEstimate: Math.round(costEstimate * 100) / 100,
  };
}
