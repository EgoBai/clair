/**
 * 订单流分析引擎 - 逐笔成交分析/买卖压力/CVP/足迹图
 */

export interface TickTrade {
  price: number;
  volume: number;
  time: string;
  direction: 'buy' | 'sell' | 'neutral';
  amount: number;
}

export interface OrderFlowResult {
  buyVolume: number;
  sellVolume: number;
  netFlow: number;
  buyPressure: number; // 0-1
  sellPressure: number;
  delta: number;
  cumulativeDelta: number;
  imbalanceRatio: number;
  vwap: number;
  poc: number; // Point of Control price
  valueAreaHigh: number;
  valueAreaLow: number;
}

export interface CVPLevel {
  price: number;
  buyVolume: number;
  sellVolume: number;
  delta: number;
  totalVolume: number;
  buyPercent: number;
}

export interface FootprintBar {
  price: number;
  buyVolume: number;
  sellVolume: number;
  delta: number;
  imbalance: 'buy' | 'sell' | 'neutral';
  isPOC: boolean;
}

export interface LargeOrderAlert {
  time: string;
  price: number;
  volume: number;
  direction: 'buy' | 'sell';
  significance: 'high' | 'extreme';
}

/**
 * 分析订单流
 */
export function analyzeOrderFlow(trades: TickTrade[]): OrderFlowResult {
  if (trades.length === 0) {
    return {
      buyVolume: 0, sellVolume: 0, netFlow: 0,
      buyPressure: 0.5, sellPressure: 0.5,
      delta: 0, cumulativeDelta: 0, imbalanceRatio: 1,
      vwap: 0, poc: 0, valueAreaHigh: 0, valueAreaLow: 0,
    };
  }

  let buyVolume = 0;
  let sellVolume = 0;
  let totalAmount = 0;
  let totalVol = 0;

  for (const t of trades) {
    if (t.direction === 'buy') buyVolume += t.volume;
    else if (t.direction === 'sell') sellVolume += t.volume;
    totalAmount += t.amount;
    totalVol += t.volume;
  }

  const total = buyVolume + sellVolume || 1;
  const buyPressure = Math.round((buyVolume / total) * 1000) / 1000;
  const sellPressure = Math.round((1 - buyPressure) * 1000) / 1000;
  const delta = buyVolume - sellVolume;
  const imbalanceRatio = sellVolume > 0 ? Math.round((buyVolume / sellVolume) * 100) / 100 : buyVolume > 0 ? Infinity : 1;
  const vwap = totalVol > 0 ? Math.round((totalAmount / totalVol) * 100) / 100 : 0;

  // Cumulative delta
  let cumDelta = 0;
  const deltaSeries: number[] = [];
  for (const t of trades) {
    const d = t.direction === 'buy' ? t.volume : t.direction === 'sell' ? -t.volume : 0;
    cumDelta += d;
    deltaSeries.push(cumDelta);
  }

  // POC via price volume distribution
  const priceVolMap = new Map<number, number>();
  for (const t of trades) {
    const rounded = Math.round(t.price * 100) / 100;
    priceVolMap.set(rounded, (priceVolMap.get(rounded) || 0) + t.volume);
  }

  let poc = trades[0].price;
  let maxVol = 0;
  for (const [price, vol] of priceVolMap) {
    if (vol > maxVol) {
      maxVol = vol;
      poc = price;
    }
  }

  // Value area (70% of volume around POC)
  const sortedPrices = [...priceVolMap.entries()].sort((a, b) => b[1] - a[1]);
  let vaVol = 0;
  const targetVA = totalVol * 0.7;
  const vaPrices: number[] = [];
  for (const [price, vol] of sortedPrices) {
    vaVol += vol;
    vaPrices.push(price);
    if (vaVol >= targetVA) break;
  }
  const valueAreaHigh = vaPrices.length > 0 ? Math.max(...vaPrices) : poc;
  const valueAreaLow = vaPrices.length > 0 ? Math.min(...vaPrices) : poc;

  return {
    buyVolume, sellVolume, netFlow: delta,
    buyPressure, sellPressure, delta,
    cumulativeDelta: cumDelta,
    imbalanceRatio,
    vwap, poc: Math.round(poc * 100) / 100,
    valueAreaHigh: Math.round(valueAreaHigh * 100) / 100,
    valueAreaLow: Math.round(valueAreaLow * 100) / 100,
  };
}

/**
 * 计算CVP (成交量分布)
 */
export function computeCVP(trades: TickTrade[], tickSize: number = 0.01): CVPLevel[] {
  if (trades.length === 0) return [];

  const priceMap = new Map<number, { buy: number; sell: number }>();

  for (const t of trades) {
    const rounded = Math.round(t.price / tickSize) * tickSize;
    const key = Math.round(rounded * 100) / 100;
    if (!priceMap.has(key)) priceMap.set(key, { buy: 0, sell: 0 });
    const entry = priceMap.get(key)!;
    if (t.direction === 'buy') entry.buy += t.volume;
    else if (t.direction === 'sell') entry.sell += t.volume;
    else {
      entry.buy += Math.floor(t.volume / 2);
      entry.sell += t.volume - Math.floor(t.volume / 2);
    }
  }

  const levels: CVPLevel[] = [];
  for (const [price, { buy, sell }] of priceMap) {
    const total = buy + sell;
    levels.push({
      price,
      buyVolume: buy,
      sellVolume: sell,
      delta: buy - sell,
      totalVolume: total,
      buyPercent: total > 0 ? Math.round((buy / total) * 1000) / 10 : 50,
    });
  }

  return levels.sort((a, b) => b.totalVolume - a.totalVolume);
}

/**
 * 生成足迹图数据
 */
export function generateFootprint(
  trades: TickTrade[],
  barsize: number = 10,
  tickSize: number = 0.01,
): FootprintBar[] {
  if (trades.length === 0) return [];

  const bars: FootprintBar[] = [];

  for (let i = 0; i < trades.length; i += barsize) {
    const chunk = trades.slice(i, i + barsize);
    const priceMap = new Map<number, { buy: number; sell: number }>();

    for (const t of chunk) {
      const rounded = Math.round(t.price / tickSize) * tickSize;
      const key = Math.round(rounded * 100) / 100;
      if (!priceMap.has(key)) priceMap.set(key, { buy: 0, sell: 0 });
      const entry = priceMap.get(key)!;
      if (t.direction === 'buy') entry.buy += t.volume;
      else entry.sell += t.volume;
    }

    let pocPrice = 0;
    let maxTotal = 0;

    for (const [price, { buy, sell }] of priceMap) {
      const total = buy + sell;
      if (total > maxTotal) {
        maxTotal = total;
        pocPrice = price;
      }

      const delta = buy - sell;
      const absImbalance = Math.abs(buy - sell);
      const minSide = Math.min(buy, sell);
      const hasImbalance = minSide > 0 ? absImbalance / minSide > 2 : absImbalance > 0;

      bars.push({
        price,
        buyVolume: buy,
        sellVolume: sell,
        delta,
        imbalance: hasImbalance ? (delta > 0 ? 'buy' : 'sell') : 'neutral',
        isPOC: false,
      });
    }

    // Mark POC
    for (const bar of bars) {
      if (Math.abs(bar.price - pocPrice) < tickSize) {
        bar.isPOC = true;
      }
    }
  }

  return bars;
}

/**
 * 检测大单
 */
export function detectLargeOrders(
  trades: TickTrade[],
  volumeThreshold: number = 100000,
): LargeOrderAlert[] {
  const alerts: LargeOrderAlert[] = [];

  for (const t of trades) {
    if (t.volume >= volumeThreshold * 3) {
      alerts.push({
        time: t.time,
        price: t.price,
        volume: t.volume,
        direction: t.direction === 'neutral' ? 'buy' : t.direction,
        significance: 'extreme',
      });
    } else if (t.volume >= volumeThreshold) {
      alerts.push({
        time: t.time,
        price: t.price,
        volume: t.volume,
        direction: t.direction === 'neutral' ? 'buy' : t.direction,
        significance: 'high',
      });
    }
  }

  return alerts;
}

/**
 * 买卖压力热力图数据
 */
export function computePressureHeatmap(
  trades: TickTrade[],
  _timeWindowMs: number = 60000,
): Array<{ time: string; buyPressure: number; sellPressure: number; volume: number }> {
  if (trades.length === 0) return [];

  const sorted = [...trades].sort((a, b) => a.time.localeCompare(b.time));
  const windows = new Map<string, { buy: number; sell: number; total: number }>();

  for (const t of sorted) {
    const windowKey = t.time.slice(0, 8); // HH:MM:SS grouping
    if (!windows.has(windowKey)) windows.set(windowKey, { buy: 0, sell: 0, total: 0 });
    const w = windows.get(windowKey)!;
    if (t.direction === 'buy') w.buy += t.volume;
    else if (t.direction === 'sell') w.sell += t.volume;
    w.total += t.volume;
  }

  return [...windows.entries()].map(([time, { buy, sell, total }]) => ({
    time,
    buyPressure: total > 0 ? Math.round((buy / total) * 1000) / 1000 : 0.5,
    sellPressure: total > 0 ? Math.round((sell / total) * 1000) / 1000 : 0.5,
    volume: total,
  }));
}
