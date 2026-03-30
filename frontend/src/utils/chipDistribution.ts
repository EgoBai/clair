/**
 * 筹码分布分析引擎
 * 持仓成本分布、获利比例、压力支撑位分析
 */

export interface ChipDistribution {
  price: number;
  volume: number;
  percentage: number;
}

export interface ChipAnalysis {
  costDistribution: ChipDistribution[];
  avgCost: number;         // 平均成本
  medianCost: number;      // 中位数成本
  profitRatio: number;     // 获利比例 (0-1)
  concentration: number;   // 集中度 (0-1, 越高越集中)
  supportLevel: number;    // 支撑位
  resistanceLevel: number; // 压力位
  chipStructure: 'concentrated' | 'dispersed' | 'mixed';
}

export interface ProfitLossAnalysis {
  currentPrice: number;
  profitableRatio: number;
  breakEvenRatio: number;
  lossRatio: number;
  avgProfitRate: number;
  maxPainPrice: number; // 最大痛价位
}

/**
 * 筹码分布计算
 * 基于历史成交量分布估算当前筹码分布
 */
export function calculateChipDistribution(
  historicalPrices: { close: number; volume: number }[],
  currentPrice: number,
  decayFactor: number = 0.95,
  binCount: number = 50
): ChipAnalysis {
  if (historicalPrices.length === 0) {
    return {
      costDistribution: [],
      avgCost: currentPrice,
      medianCost: currentPrice,
      profitRatio: 0.5,
      concentration: 0,
      supportLevel: currentPrice * 0.95,
      resistanceLevel: currentPrice * 1.05,
      chipStructure: 'mixed',
    };
  }

  // 找出价格范围
  const prices = historicalPrices.map((h) => h.close);
  const minPrice = Math.min(...prices) * 0.95;
  const maxPrice = Math.max(...prices) * 1.05;
  const binWidth = (maxPrice - minPrice) / binCount;

  // 初始化 bins
  const bins = new Array(binCount).fill(0);
  const binPrices: number[] = [];
  for (let i = 0; i < binCount; i++) {
    binPrices.push(minPrice + binWidth * (i + 0.5));
  }

  // 时间衰减分配 (越近的交易日权重越高)
  const totalEntries = historicalPrices.length;
  let totalWeightedVolume = 0;

  for (let i = 0; i < totalEntries; i++) {
    const entry = historicalPrices[i];
    const timeWeight = Math.pow(decayFactor, totalEntries - 1 - i);
    const weightedVol = entry.volume * timeWeight;
    totalWeightedVolume += weightedVol;

    // 找到对应的 bin
    const binIndex = Math.min(
      binCount - 1,
      Math.max(0, Math.floor((entry.close - minPrice) / binWidth))
    );
    bins[binIndex] += weightedVol;
  }

  // 生成分布
  const costDistribution: ChipDistribution[] = binPrices
    .map((price, i) => ({
      price: Math.round(price * 100) / 100,
      volume: Math.round(bins[i]),
      percentage: totalWeightedVolume > 0 ? Math.round((bins[i] / totalWeightedVolume) * 10000) / 100 : 0,
    }))
    .filter((d) => d.volume > 0);

  // 平均成本
  let sumWeightedPrice = 0;
  let sumVolume = 0;
  for (let i = 0; i < binCount; i++) {
    sumWeightedPrice += binPrices[i] * bins[i];
    sumVolume += bins[i];
  }
  const avgCost = sumVolume > 0 ? sumWeightedPrice / sumVolume : currentPrice;

  // 中位数成本
  let cumVolume = 0;
  const halfVolume = sumVolume / 2;
  let medianCost = avgCost;
  for (let i = 0; i < binCount; i++) {
    cumVolume += bins[i];
    if (cumVolume >= halfVolume) {
      medianCost = binPrices[i];
      break;
    }
  }

  // 获利比例
  let profitableVolume = 0;
  for (let i = 0; i < binCount; i++) {
    if (binPrices[i] < currentPrice) {
      profitableVolume += bins[i];
    }
  }
  const profitRatio = sumVolume > 0 ? profitableVolume / sumVolume : 0.5;

  // 集中度 (赫芬达尔指数)
  const hhi = bins.reduce((sum, b) => {
    const share = sumVolume > 0 ? b / sumVolume : 0;
    return sum + share * share;
  }, 0);
  const maxHHI = 1; // 全部集中在一个价位
  const minHHI = 1 / binCount; // 均匀分布
  const concentration = minHHI !== maxHHI ? (hhi - minHHI) / (maxHHI - minHHI) : 0;

  // 支撑位 (最大筹码密集区的下方)
  const maxBinIndex = bins.indexOf(Math.max(...bins));
  const supportLevel = binPrices[Math.max(0, maxBinIndex - 2)];
  const resistanceLevel = binPrices[Math.min(binCount - 1, maxBinIndex + 2)];

  // 筹码结构判断
  let chipStructure: ChipAnalysis['chipStructure'];
  if (concentration > 0.5) chipStructure = 'concentrated';
  else if (concentration < 0.15) chipStructure = 'dispersed';
  else chipStructure = 'mixed';

  return {
    costDistribution,
    avgCost: Math.round(avgCost * 100) / 100,
    medianCost: Math.round(medianCost * 100) / 100,
    profitRatio: Math.round(profitRatio * 10000) / 10000,
    concentration: Math.round(concentration * 10000) / 10000,
    supportLevel: Math.round(supportLevel * 100) / 100,
    resistanceLevel: Math.round(resistanceLevel * 100) / 100,
    chipStructure,
  };
}

/**
 * 盈亏分析
 */
export function analyzeProfitLoss(
  costDistribution: ChipDistribution[],
  currentPrice: number
): ProfitLossAnalysis {
  let profitableVol = 0;
  let breakEvenVol = 0;
  let lossVol = 0;
  let totalVol = 0;
  let sumProfitRate = 0;

  const threshold = currentPrice * 0.01; // 1% 以内算持平

  for (const chip of costDistribution) {
    totalVol += chip.volume;
    const diff = currentPrice - chip.price;

    if (diff > threshold) {
      profitableVol += chip.volume;
      sumProfitRate += (diff / chip.price) * chip.volume;
    } else if (diff < -threshold) {
      lossVol += chip.volume;
      sumProfitRate += (diff / chip.price) * chip.volume;
    } else {
      breakEvenVol += chip.volume;
    }
  }

  // 最大痛价位 (Max Pain) - 使最多期权/筹码亏损的价格
  // 简化计算：筹码量最大的价格区间
  const maxPainPrice =
    costDistribution.length > 0
      ? costDistribution.reduce((max, c) => (c.volume > max.volume ? c : max)).price
      : currentPrice;

  return {
    currentPrice,
    profitableRatio: totalVol > 0 ? Math.round((profitableVol / totalVol) * 10000) / 10000 : 0,
    breakEvenRatio: totalVol > 0 ? Math.round((breakEvenVol / totalVol) * 10000) / 10000 : 0,
    lossRatio: totalVol > 0 ? Math.round((lossVol / totalVol) * 10000) / 10000 : 0,
    avgProfitRate: totalVol > 0 ? Math.round((sumProfitRate / totalVol) * 10000) / 10000 : 0,
    maxPainPrice: Math.round(maxPainPrice * 100) / 100,
  };
}

/**
 * 筹码转换分析
 * 识别筹码从分散到集中或从集中到分散的转变
 */
export interface ChipTransition {
  type: 'gathering' | 'distributing' | 'stable';
  intensity: number; // 0-100
  description: string;
}

export function detectChipTransition(
  current: ChipAnalysis,
  previous: ChipAnalysis
): ChipTransition {
  const concDelta = current.concentration - previous.concentration;
  const profitDelta = current.profitRatio - previous.profitRatio;

  let type: ChipTransition['type'];
  let intensity: number;
  let description: string;

  if (concDelta > 0.05) {
    type = 'gathering';
    intensity = Math.min(100, Math.round(concDelta * 500));
    description = `筹码集中度提升${(concDelta * 100).toFixed(1)}%，主力正在吸筹`;
  } else if (concDelta < -0.05) {
    type = 'distributing';
    intensity = Math.min(100, Math.round(Math.abs(concDelta) * 500));
    description = `筹码集中度下降${(Math.abs(concDelta) * 100).toFixed(1)}%，筹码正在分散`;
  } else {
    type = 'stable';
    intensity = 50;
    description = '筹码分布相对稳定';
  }

  if (profitDelta > 0.1) {
    description += '，获利盘增加';
  } else if (profitDelta < -0.1) {
    description += '，套牢盘增加';
  }

  return { type, intensity, description };
}
