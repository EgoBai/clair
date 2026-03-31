/**
 * 筹码分布引擎 (Chip Distribution Engine)
 * - 筹码密集区/稀疏区识别
 * - 获利盘/套牢盘比例
 * - 筹码峰谷分析
 * - 主力筹码集中度
 * - 筹码迁移追踪
 * - 支撑/阻力位推断
 */

export interface ChipLevel {
  price: number;
  volume: number;
  percentage: number; // 占总筹码比例
}

export interface ChipDistribution {
  levels: ChipLevel[];
  totalVolume: number;
  avgCost: number;
  medianCost: number;
  peakPrice: number;
}

export interface ProfitLossAnalysis {
  profitRatio: number;    // 获利盘比例 0-1
  lossRatio: number;      // 套牢盘比例 0-1
  breakeven: number;      // 盈亏平衡价
  avgProfit: number;      // 平均获利百分比
  avgLoss: number;        // 平均亏损百分比
  trappedZone: { low: number; high: number }; // 套牢密集区
}

export interface ChipConcentration {
  giniCoefficient: number; // 基尼系数 0-1
  top10Pct: number;        // 前10%筹码占比
  hhi: number;             // 赫芬达尔指数
  score: number;           // 集中度评分 0-100
  level: 'high' | 'medium' | 'low';
}

export interface ChipSupportResistance {
  support: number[];       // 支撑位
  resistance: number[];    // 阻力位
  strongSupport: number;   // 最强支撑
  strongResistance: number; // 最强阻力
}

export interface ChipMigration {
  inflow: { price: number; volume: number }[];  // 筹码流入区
  outflow: { price: number; volume: number }[]; // 筹码流出区
  netDirection: 'accumulation' | 'distribution' | 'neutral';
  migrationStrength: number; // 0-100
}

export interface ChipPeakValley {
  peaks: { price: number; volume: number }[];
  valleys: { price: number; volume: number }[];
  dominantPeak: number;
  chipRange: { low: number; high: number };
}

/**
 * 计算筹码集中度（基尼系数）
 */
export function calculateGini(levels: ChipLevel[]): number {
  if (levels.length === 0) return 0;
  const volumes = levels.map(l => l.volume).sort((a, b) => a - b);
  const n = volumes.length;
  const sum = volumes.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;

  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * volumes[i];
  }
  return giniSum / (n * sum);
}

/**
 * 计算赫芬达尔指数
 */
export function calculateHHI(levels: ChipLevel[]): number {
  if (levels.length === 0) return 0;
  const total = levels.reduce((s, l) => s + l.volume, 0);
  if (total === 0) return 0;
  return levels.reduce((s, l) => {
    const share = l.volume / total;
    return s + share * share;
  }, 0);
}

/**
 * 分析筹码分布
 */
export function analyzeChipDistribution(prices: number[], volumes: number[]): ChipDistribution {
  if (prices.length === 0) {
    return { levels: [], totalVolume: 0, avgCost: 0, medianCost: 0, peakPrice: 0 };
  }

  const totalVolume = volumes.reduce((a, b) => a + b, 0);
  const levels: ChipLevel[] = prices.map((p, i) => ({
    price: p,
    volume: volumes[i],
    percentage: totalVolume > 0 ? volumes[i] / totalVolume : 0,
  }));

  // 加权平均成本
  const avgCost = totalVolume > 0
    ? prices.reduce((s, p, i) => s + p * volumes[i], 0) / totalVolume
    : 0;

  // 中位数成本
  const sorted = [...levels].sort((a, b) => a.price - b.price);
  let cumVol = 0;
  let medianCost = sorted[0]?.price || 0;
  for (const level of sorted) {
    cumVol += level.volume;
    if (cumVol >= totalVolume / 2) {
      medianCost = level.price;
      break;
    }
  }

  // 峰值价格
  const peakLevel = levels.reduce((max, l) => l.volume > max.volume ? l : max, levels[0]);

  return { levels, totalVolume, avgCost, medianCost, peakPrice: peakLevel.price };
}

/**
 * 分析获利盘/套牢盘
 */
export function analyzeProfitLoss(distribution: ChipDistribution, currentPrice: number): ProfitLossAnalysis {
  if (distribution.levels.length === 0) {
    return {
      profitRatio: 0, lossRatio: 0, breakeven: currentPrice,
      avgProfit: 0, avgLoss: 0, trappedZone: { low: currentPrice, high: currentPrice },
    };
  }

  let profitVol = 0;
  let lossVol = 0;
  let profitSum = 0;
  let lossSum = 0;

  for (const level of distribution.levels) {
    if (level.price < currentPrice) {
      profitVol += level.volume;
      profitSum += (currentPrice - level.price) / level.price * 100 * level.volume;
    } else if (level.price > currentPrice) {
      lossVol += level.volume;
      lossSum += (level.price - currentPrice) / currentPrice * 100 * level.volume;
    }
  }

  const total = profitVol + lossVol;
  const profitRatio = total > 0 ? profitVol / total : 0;
  const lossRatio = total > 0 ? lossVol / total : 0;

  // 套牢密集区：亏损筹码最密集的价格区间
  const lossLevels = distribution.levels
    .filter(l => l.price > currentPrice)
    .sort((a, b) => b.volume - a.volume);

  const trappedTop = lossLevels.slice(0, Math.max(1, Math.floor(lossLevels.length * 0.3)));
  const trappedLow = trappedTop.length > 0 ? Math.min(...trappedTop.map(l => l.price)) : currentPrice;
  const trappedHigh = trappedTop.length > 0 ? Math.max(...trappedTop.map(l => l.price)) : currentPrice;

  return {
    profitRatio,
    lossRatio,
    breakeven: distribution.avgCost,
    avgProfit: profitVol > 0 ? profitSum / profitVol : 0,
    avgLoss: lossVol > 0 ? lossSum / lossVol : 0,
    trappedZone: { low: trappedLow, high: trappedHigh },
  };
}

/**
 * 分析筹码集中度
 */
export function analyzeChipConcentration(distribution: ChipDistribution): ChipConcentration {
  const levels = distribution.levels;
  if (levels.length === 0) {
    return { giniCoefficient: 0, top10Pct: 0, hhi: 0, score: 0, level: 'low' };
  }

  const gini = calculateGini(levels);
  const hhi = calculateHHI(levels);

  // 前10%筹码占比
  const sorted = [...levels].sort((a, b) => b.volume - a.volume);
  const top10Count = Math.max(1, Math.ceil(sorted.length * 0.1));
  const top10Vol = sorted.slice(0, top10Count).reduce((s, l) => s + l.volume, 0);
  const top10Pct = distribution.totalVolume > 0 ? top10Vol / distribution.totalVolume : 0;

  // 综合评分
  const score = Math.min(100, Math.round((gini * 40 + top10Pct * 30 + hhi * 300) / 1));

  let level: 'high' | 'medium' | 'low';
  if (score > 70) level = 'high';
  else if (score > 40) level = 'medium';
  else level = 'low';

  return { giniCoefficient: gini, top10Pct, hhi, score, level };
}

/**
 * 推断支撑/阻力位
 */
export function findSupportResistance(distribution: ChipDistribution, currentPrice: number): ChipSupportResistance {
  const levels = distribution.levels;
  if (levels.length < 3) {
    return { support: [], resistance: [], strongSupport: currentPrice, strongResistance: currentPrice };
  }

  // 找峰谷
  const sorted = [...levels].sort((a, b) => a.price - b.price);
  const peaks: ChipLevel[] = [];
  const valleys: ChipLevel[] = [];

  for (let i = 1; i < sorted.length - 1; i++) {
    if (sorted[i].volume > sorted[i - 1].volume && sorted[i].volume > sorted[i + 1].volume) {
      peaks.push(sorted[i]);
    }
    if (sorted[i].volume < sorted[i - 1].volume && sorted[i].volume < sorted[i + 1].volume) {
      valleys.push(sorted[i]);
    }
  }

  // 支撑位：当前价下方的筹码密集峰
  const supportPeaks = peaks
    .filter(p => p.price < currentPrice)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 3);

  // 阻力位：当前价上方的筹码密集峰
  const resistancePeaks = peaks
    .filter(p => p.price > currentPrice)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 3);

  return {
    support: supportPeaks.map(p => p.price),
    resistance: resistancePeaks.map(p => p.price),
    strongSupport: supportPeaks[0]?.price || currentPrice * 0.95,
    strongResistance: resistancePeaks[0]?.price || currentPrice * 1.05,
  };
}

/**
 * 分析筹码峰谷
 */
export function analyzeChipPeaksValleys(distribution: ChipDistribution): ChipPeakValley {
  const levels = distribution.levels;
  if (levels.length < 3) {
    return {
      peaks: [], valleys: [], dominantPeak: 0,
      chipRange: { low: 0, high: 0 },
    };
  }

  const sorted = [...levels].sort((a, b) => a.price - b.price);
  const peaks: { price: number; volume: number }[] = [];
  const valleys: { price: number; volume: number }[] = [];

  for (let i = 1; i < sorted.length - 1; i++) {
    if (sorted[i].volume > sorted[i - 1].volume && sorted[i].volume > sorted[i + 1].volume) {
      peaks.push({ price: sorted[i].price, volume: sorted[i].volume });
    }
    if (sorted[i].volume < sorted[i - 1].volume && sorted[i].volume < sorted[i + 1].volume) {
      valleys.push({ price: sorted[i].price, volume: sorted[i].volume });
    }
  }

  const dominantPeak = peaks.length > 0
    ? peaks.reduce((max, p) => p.volume > max.volume ? p : max, peaks[0]).price
    : distribution.peakPrice;

  const prices = levels.map(l => l.price);
  return {
    peaks,
    valleys,
    dominantPeak,
    chipRange: { low: Math.min(...prices), high: Math.max(...prices) },
  };
}

/**
 * 筹码迁移分析
 */
export function analyzeChipMigration(
  previous: ChipDistribution,
  current: ChipDistribution
): ChipMigration {
  const inflow: { price: number; volume: number }[] = [];
  const outflow: { price: number; volume: number }[] = [];

  const prevMap = new Map(previous.levels.map(l => [l.price, l.volume]));
  const currMap = new Map(current.levels.map(l => [l.price, l.volume]));

  // 所有价格点
  const allPrices = new Set([...prevMap.keys(), ...currMap.keys()]);

  for (const price of allPrices) {
    const prevVol = prevMap.get(price) || 0;
    const currVol = currMap.get(price) || 0;
    const diff = currVol - prevVol;

    if (diff > 0) {
      inflow.push({ price, volume: diff });
    } else if (diff < 0) {
      outflow.push({ price, volume: Math.abs(diff) });
    }
  }

  const totalInflow = inflow.reduce((s, i) => s + i.volume, 0);
  const totalOutflow = outflow.reduce((s, o) => s + o.volume, 0);

  let netDirection: 'accumulation' | 'distribution' | 'neutral';
  if (totalInflow > totalOutflow * 1.2) netDirection = 'accumulation';
  else if (totalOutflow > totalInflow * 1.2) netDirection = 'distribution';
  else netDirection = 'neutral';

  const migrationStrength = Math.min(100, Math.round(
    Math.abs(totalInflow - totalOutflow) / Math.max(totalInflow + totalOutflow, 1) * 200
  ));

  return {
    inflow: inflow.sort((a, b) => b.volume - a.volume).slice(0, 5),
    outflow: outflow.sort((a, b) => b.volume - a.volume).slice(0, 5),
    netDirection,
    migrationStrength,
  };
}
