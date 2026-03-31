/**
 * Order Flow Analysis Engine
 *
 * Analyzes order flow imbalance, volume profile, delta analysis,
 * trade classification, and liquidity metrics.
 */

// ==================== Types ====================

export interface Tick {
  timestamp: number;
  price: number;
  volume: number;
  isBuy: boolean; // buyer-initiated = true
}

export interface OrderFlowBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  buyVolume: number;
  sellVolume: number;
  delta: number;
  cumulativeDelta: number;
  imbalance: number;
  poc: number; // point of control price
}

export interface VolumeProfileLevel {
  price: number;
  totalVolume: number;
  buyVolume: number;
  sellVolume: number;
  delta: number;
  percentOfTotal: number;
}

export interface VolumeProfile {
  levels: VolumeProfileLevel[];
  poc: number; // price with highest volume
  valueAreaHigh: number;
  valueAreaLow: number;
  totalVolume: number;
  totalDelta: number;
  imbalance: number;
}

export interface DeltaAnalysis {
  cumulativeDelta: number[];
  deltaMA: number;
  deltaDivergence: boolean;
  absorptionPoints: number[];
  exhaustionPoints: number[];
  trendConfirmation: 'bullish' | 'bearish' | 'neutral';
}

export interface LiquidityMetrics {
  bidAskSpread: number;
  effectiveSpread: number;
  depthImbalance: number;
  turnoverRate: number;
  amihudIlliquidity: number;
  kyleLambda: number;
  liquidityScore: number; // 0-100
}

export interface TradeClassification {
  aggressiveBuys: number;
  aggressiveSells: number;
  passiveBuys: number;
  passiveSells: number;
  buyPressure: number; // -1 to 1
  institutionalFlow: number;
  retailFlow: number;
}

export interface FootprintBar {
  price: number;
  buyVolume: number;
  sellVolume: number;
  delta: number;
  rowImbalance: boolean;
}

export interface ImbalanceZone {
  startPrice: number;
  endPrice: number;
  totalDelta: number;
  significance: number;
  type: 'buying' | 'selling';
}

// ==================== Helpers ====================

function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

// ==================== Core Functions ====================

/**
 * Classify ticks using Lee-Ready algorithm
 */
export function classifyTicks(ticks: Tick[]): Tick[] {
  if (ticks.length === 0) return [];

  // Mid-price proxy: rolling average
  const midPrices: number[] = [];
  let cumSum = 0;
  for (let i = 0; i < ticks.length; i++) {
    cumSum += ticks[i].price;
    midPrices.push(cumSum / (i + 1));
  }

  return ticks.map((tick, i) => {
    const mid = midPrices[i];
    // If price > mid, buyer-initiated; if < mid, seller-initiated
    // If equal, use tick rule (compare to previous tick)
    let isBuy = tick.isBuy;
    if (tick.price > mid) isBuy = true;
    else if (tick.price < mid) isBuy = false;
    else if (i > 0) {
      isBuy = tick.price >= ticks[i - 1].price;
    }

    return { ...tick, isBuy };
  });
}

/**
 * Build order flow bars from ticks
 */
export function buildOrderFlowBars(
  ticks: Tick[],
  barSize: number = 60000 // ms
): OrderFlowBar[] {
  if (ticks.length === 0) return [];

  const bars: OrderFlowBar[] = [];
  let currentBar: {
    startTime: number;
    prices: number[];
    buyVolume: number;
    sellVolume: number;
  } | null = null;

  let cumulativeDelta = 0;

  const flushBar = () => {
    if (!currentBar || currentBar.prices.length === 0) return;

    const delta = currentBar.buyVolume - currentBar.sellVolume;
    cumulativeDelta += delta;
    const totalVol = currentBar.buyVolume + currentBar.sellVolume;
    const imbalance = totalVol === 0 ? 0 : delta / totalVol;

    bars.push({
      timestamp: currentBar.startTime,
      open: currentBar.prices[0],
      high: Math.max(...currentBar.prices),
      low: Math.min(...currentBar.prices),
      close: currentBar.prices[currentBar.prices.length - 1],
      buyVolume: currentBar.buyVolume,
      sellVolume: currentBar.sellVolume,
      delta,
      cumulativeDelta,
      imbalance,
      poc: mean(currentBar.prices),
    });
  };

  for (const tick of ticks) {
    const barStart = Math.floor(tick.timestamp / barSize) * barSize;

    if (!currentBar || currentBar.startTime !== barStart) {
      flushBar();
      currentBar = { startTime: barStart, prices: [], buyVolume: 0, sellVolume: 0 };
    }

    currentBar.prices.push(tick.price);
    if (tick.isBuy) currentBar.buyVolume += tick.volume;
    else currentBar.sellVolume += tick.volume;
  }

  flushBar();
  return bars;
}

/**
 * Calculate volume profile
 */
export function calculateVolumeProfile(
  ticks: Tick[],
  priceStep: number = 0.01,
  numLevels: number = 50
): VolumeProfile {
  if (ticks.length === 0) {
    return { levels: [], poc: 0, valueAreaHigh: 0, valueAreaLow: 0, totalVolume: 0, totalDelta: 0, imbalance: 0 };
  }

  const prices = ticks.map(t => t.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  // Create price levels
  const priceRange = maxPrice - minPrice;
  const step = priceRange / numLevels || priceStep;
  const levels: VolumeProfileLevel[] = [];

  for (let p = minPrice; p <= maxPrice + step; p += step) {
    levels.push({ price: p, totalVolume: 0, buyVolume: 0, sellVolume: 0, delta: 0, percentOfTotal: 0 });
  }

  // Accumulate volumes
  let totalVolume = 0;
  let totalDelta = 0;

  for (const tick of ticks) {
    const idx = Math.min(
      Math.floor((tick.price - minPrice) / step),
      levels.length - 1
    );
    if (idx >= 0 && idx < levels.length) {
      levels[idx].totalVolume += tick.volume;
      if (tick.isBuy) levels[idx].buyVolume += tick.volume;
      else levels[idx].sellVolume += tick.volume;
      levels[idx].delta = levels[idx].buyVolume - levels[idx].sellVolume;
      totalVolume += tick.volume;
      totalDelta += tick.isBuy ? tick.volume : -tick.volume;
    }
  }

  // Percent of total
  for (const level of levels) {
    level.percentOfTotal = totalVolume === 0 ? 0 : level.totalVolume / totalVolume;
  }

  // POC: price with highest volume
  const pocLevel = levels.reduce((max, l) => l.totalVolume > max.totalVolume ? l : max, levels[0]);

  // Value area: 70% of volume around POC
  const sortedByVolume = [...levels].sort((a, b) => b.totalVolume - a.totalVolume);
  let vaVolume = 0;
  const vaTarget = totalVolume * 0.7;
  const vaLevels: number[] = [];

  for (const l of sortedByVolume) {
    vaVolume += l.totalVolume;
    vaLevels.push(l.price);
    if (vaVolume >= vaTarget) break;
  }

  const imbalance = totalVolume === 0 ? 0 : totalDelta / totalVolume;

  return {
    levels: levels.filter(l => l.totalVolume > 0),
    poc: pocLevel?.price || 0,
    valueAreaHigh: vaLevels.length > 0 ? Math.max(...vaLevels) : 0,
    valueAreaLow: vaLevels.length > 0 ? Math.min(...vaLevels) : 0,
    totalVolume,
    totalDelta,
    imbalance,
  };
}

/**
 * Analyze delta (buy-sell pressure)
 */
export function analyzeDelta(ticks: Tick[], maPeriod: number = 20): DeltaAnalysis {
  const bars = buildOrderFlowBars(ticks, 1000); // 1-second bars
  const cumulativeDelta = bars.map(b => b.cumulativeDelta);

  const deltaMA = cumulativeDelta.length >= maPeriod
    ? mean(cumulativeDelta.slice(-maPeriod))
    : mean(cumulativeDelta);

  // Divergence: price rising but delta falling (or vice versa)
  const prices = bars.map(b => b.close);
  const deltaDivergence = detectDivergence(prices, cumulativeDelta);

  // Absorption: large volume at price level without price movement
  const absorptionPoints: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const priceChange = Math.abs(bars[i].close - bars[i - 1].close);
    const volumeRatio = (bars[i].buyVolume + bars[i].sellVolume) /
      Math.max(1, mean(bars.slice(Math.max(0, i - 5), i).map(b => b.buyVolume + b.sellVolume)));
    if (priceChange < 0.001 && volumeRatio > 2) {
      absorptionPoints.push(i);
    }
  }

  // Exhaustion: high delta but price reversal
  const exhaustionPoints: number[] = [];
  for (let i = 2; i < bars.length; i++) {
    const prevDelta = bars[i - 1].delta;
    const currDelta = bars[i].delta;
    if (Math.abs(prevDelta) > Math.abs(currDelta) * 2 &&
        ((prevDelta > 0 && bars[i].close < bars[i - 1].close) ||
         (prevDelta < 0 && bars[i].close > bars[i - 1].close))) {
      exhaustionPoints.push(i);
    }
  }

  const lastDelta = cumulativeDelta[cumulativeDelta.length - 1] || 0;
  let trendConfirmation: DeltaAnalysis['trendConfirmation'];
  if (lastDelta > deltaMA * 1.1) trendConfirmation = 'bullish';
  else if (lastDelta < deltaMA * 0.9) trendConfirmation = 'bearish';
  else trendConfirmation = 'neutral';

  return {
    cumulativeDelta,
    deltaMA,
    deltaDivergence,
    absorptionPoints,
    exhaustionPoints,
    trendConfirmation,
  };
}

/**
 * Calculate liquidity metrics
 */
export function calculateLiquidity(
  ticks: Tick[],
  bidPrices: number[],
  askPrices: number[],
  volumes: number[]
): LiquidityMetrics {
  // Bid-ask spread
  const spreads = bidPrices.map((b, i) => (askPrices[i] || b) - b);
  const bidAskSpread = mean(spreads);

  // Effective spread: 2 * |price - mid|
  const mids = bidPrices.map((b, i) => (b + (askPrices[i] || b)) / 2);
  const effectiveSpreads = ticks.map((t, i) => 2 * Math.abs(t.price - (mids[i] || t.price)));
  const effectiveSpread = mean(effectiveSpreads);

  // Depth imbalance
  const depthImbalance = volumes.length > 0 ? std(volumes) / Math.max(0.001, mean(volumes)) : 0;

  // Amihud illiquidity: |return| / dollar volume
  const returns: number[] = [];
  const dollarVolumes: number[] = [];
  for (let i = 1; i < ticks.length; i++) {
    const ret = Math.abs((ticks[i].price - ticks[i - 1].price) / ticks[i - 1].price);
    const dv = ticks[i].price * ticks[i].volume;
    returns.push(ret);
    dollarVolumes.push(dv);
  }
  const avgDollarVol = mean(dollarVolumes);
  const amihudIlliquidity = avgDollarVol === 0 ? 0 : mean(returns) / avgDollarVol;

  // Kyle's lambda: price impact per unit volume
  const priceChanges: number[] = [];
  const signedVolumes: number[] = [];
  for (let i = 1; i < ticks.length; i++) {
    priceChanges.push(ticks[i].price - ticks[i - 1].price);
    signedVolumes.push(ticks[i].isBuy ? ticks[i].volume : -ticks[i].volume);
  }
  const cov = priceChanges.length >= 2
    ? priceChanges.reduce((s, p, i) => s + (p - mean(priceChanges)) * (signedVolumes[i] - mean(signedVolumes)), 0) / priceChanges.length
    : 0;
  const volVar = signedVolumes.length >= 2
    ? signedVolumes.reduce((s, v) => s + (v - mean(signedVolumes)) ** 2, 0) / signedVolumes.length
    : 1;
  const kyleLambda = volVar === 0 ? 0 : Math.abs(cov / volVar);

  // Liquidity score
  const spreadScore = Math.max(0, 100 - bidAskSpread * 1000);
  const depthScore = Math.max(0, 100 - depthImbalance * 10);
  const liquidityScore = (spreadScore + depthScore) / 2;

  return {
    bidAskSpread,
    effectiveSpread,
    depthImbalance,
    turnoverRate: avgDollarVol === 0 ? 0 : mean(volumes) / avgDollarVol,
    amihudIlliquidity,
    kyleLambda,
    liquidityScore: Math.min(100, Math.max(0, liquidityScore)),
  };
}

/**
 * Classify trades (institutional vs retail)
 */
export function classifyTrades(ticks: Tick[], avgVolume: number = 1000): TradeClassification {
  let aggressiveBuys = 0, aggressiveSells = 0;
  let passiveBuys = 0, passiveSells = 0;
  let institutionalVolume = 0, retailVolume = 0;

  const largeThreshold = avgVolume * 5;

  for (const tick of ticks) {
    if (tick.isBuy) {
      if (tick.volume > avgVolume) aggressiveBuys++;
      else passiveBuys++;
    } else {
      if (tick.volume > avgVolume) aggressiveSells++;
      else passiveSells++;
    }

    if (tick.volume > largeThreshold) {
      institutionalVolume += tick.volume;
    } else {
      retailVolume += tick.volume;
    }
  }

  const total = ticks.length || 1;
  const buyPressure = (aggressiveBuys - aggressiveSells) / total;
  const totalVolume = institutionalVolume + retailVolume || 1;

  return {
    aggressiveBuys,
    aggressiveSells,
    passiveBuys,
    passiveSells,
    buyPressure,
    institutionalFlow: institutionalVolume / totalVolume,
    retailFlow: retailVolume / totalVolume,
  };
}

/**
 * Build footprint chart data
 */
export function buildFootprint(
  ticks: Tick[],
  priceStep: number = 0.01
): FootprintBar[] {
  if (ticks.length === 0) return [];

  const prices = ticks.map(t => t.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  const priceMap = new Map<number, { buyVolume: number; sellVolume: number }>();

  for (const tick of ticks) {
    const rounded = Math.round(tick.price / priceStep) * priceStep;
    if (!priceMap.has(rounded)) {
      priceMap.set(rounded, { buyVolume: 0, sellVolume: 0 });
    }
    const entry = priceMap.get(rounded)!;
    if (tick.isBuy) entry.buyVolume += tick.volume;
    else entry.sellVolume += tick.volume;
  }

  const bars: FootprintBar[] = [];
  const sortedPrices = Array.from(priceMap.keys()).sort((a, b) => a - b);

  for (let i = 0; i < sortedPrices.length; i++) {
    const price = sortedPrices[i];
    const entry = priceMap.get(price)!;
    const delta = entry.buyVolume - entry.sellVolume;

    // Row imbalance: compare with adjacent
    let rowImbalance = false;
    if (i > 0) {
      const prevEntry = priceMap.get(sortedPrices[i - 1])!;
      const prevDelta = prevEntry.buyVolume - prevEntry.sellVolume;
      rowImbalance = Math.sign(delta) !== Math.sign(prevDelta) && Math.abs(delta) > Math.abs(prevDelta) * 1.5;
    }

    bars.push({
      price,
      buyVolume: entry.buyVolume,
      sellVolume: entry.sellVolume,
      delta,
      rowImbalance,
    });
  }

  return bars;
}

/**
 * Detect imbalance zones
 */
export function detectImbalanceZones(
  footprint: FootprintBar[],
  threshold: number = 0.7
): ImbalanceZone[] {
  const zones: ImbalanceZone[] = [];
  let currentZone: {
    startPrice: number;
    endPrice: number;
    totalDelta: number;
    count: number;
    type: 'buying' | 'selling';
  } | null = null;

  for (const bar of footprint) {
    const totalVol = bar.buyVolume + bar.sellVolume;
    if (totalVol === 0) continue;

    const imbalanceRatio = Math.abs(bar.delta) / totalVol;
    if (imbalanceRatio < threshold) {
      if (currentZone) {
        zones.push({
          startPrice: currentZone.startPrice,
          endPrice: currentZone.endPrice,
          totalDelta: currentZone.totalDelta,
          significance: Math.abs(currentZone.totalDelta) / currentZone.count,
          type: currentZone.type,
        });
        currentZone = null;
      }
      continue;
    }

    const type = bar.delta > 0 ? 'buying' : 'selling';

    if (currentZone && currentZone.type === type) {
      currentZone.endPrice = bar.price;
      currentZone.totalDelta += bar.delta;
      currentZone.count++;
    } else {
      if (currentZone) {
        zones.push({
          startPrice: currentZone.startPrice,
          endPrice: currentZone.endPrice,
          totalDelta: currentZone.totalDelta,
          significance: Math.abs(currentZone.totalDelta) / currentZone.count,
          type: currentZone.type,
        });
      }
      currentZone = { startPrice: bar.price, endPrice: bar.price, totalDelta: bar.delta, count: 1, type };
    }
  }

  if (currentZone) {
    zones.push({
      startPrice: currentZone.startPrice,
      endPrice: currentZone.endPrice,
      totalDelta: currentZone.totalDelta,
      significance: Math.abs(currentZone.totalDelta) / currentZone.count,
      type: currentZone.type,
    });
  }

  return zones;
}

// ==================== Internal Helpers ====================

function detectDivergence(prices: number[], indicator: number[]): boolean {
  if (prices.length < 10 || indicator.length < 10) return false;

  const lastPrices = prices.slice(-10);
  const lastIndicator = indicator.slice(-10);

  const priceDirection = lastPrices[lastPrices.length - 1] - lastPrices[0];
  const indicatorDirection = lastIndicator[lastIndicator.length - 1] - lastIndicator[0];

  // Divergence: price up but indicator down, or vice versa
  return (priceDirection > 0 && indicatorDirection < 0) ||
         (priceDirection < 0 && indicatorDirection > 0);
}
