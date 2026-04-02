/**
 * VolumeProfileEngine - 量价分布引擎
 * 计算成交量加权价格分布、POC、VAH/VAL等
 */

export interface VolumeBar {
  price: number;
  volume: number;
}

export interface VolumeProfileResult {
  poc: number;           // Point of Control (最大成交量价格)
  vah: number;           // Value Area High
  val: number;           // Value Area Low
  totalVolume: number;
  profileBins: Array<{ price: number; volume: number; percent: number }>;
  buyVolume: number;
  sellVolume: number;
  buySellRatio: number;
  profileType: 'balanced' | 'double_distribution' | 'trend_up' | 'trend_down' | 'p_shape' | 'b_shape';
}

export interface VolumeConfig {
  binSize: number;
  valueAreaPercent: number;
}

const DEFAULT_CONFIG: VolumeConfig = {
  binSize: 0.5,
  valueAreaPercent: 0.70,
};

export function computeVolumeProfile(
  bars: VolumeBar[],
  config: Partial<VolumeConfig> = {}
): VolumeProfileResult | null {
  if (bars.length < 2) return null;
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // 分桶
  const binMap = new Map<number, number>();
  for (const bar of bars) {
    const bin = Math.round(bar.price / cfg.binSize) * cfg.binSize;
    binMap.set(bin, (binMap.get(bin) || 0) + bar.volume);
  }

  const profileBins = Array.from(binMap.entries())
    .map(([price, volume]) => ({ price, volume, percent: 0 }))
    .sort((a, b) => b.volume - a.volume);

  const totalVolume = profileBins.reduce((s, b) => s + b.volume, 0);
  profileBins.forEach(b => { b.percent = totalVolume > 0 ? b.volume / totalVolume : 0; });

  if (profileBins.length === 0) return null;

  const poc = profileBins[0].price;

  // Value Area: 从POC开始，向上下扩展直到达到70%成交量
  const sortedBins = [...profileBins].sort((a, b) => a.price - b.price);
  const pocIdx = sortedBins.findIndex(b => b.price === poc);
  let vaVolume = sortedBins[pocIdx].volume;
  let upper = pocIdx, lower = pocIdx;
  const target = totalVolume * cfg.valueAreaPercent;

  while (vaVolume < target && (upper < sortedBins.length - 1 || lower > 0)) {
    const upVol = upper < sortedBins.length - 1 ? sortedBins[upper + 1].volume : 0;
    const downVol = lower > 0 ? sortedBins[lower - 1].volume : 0;
    if (upVol >= downVol && upper < sortedBins.length - 1) {
      upper++;
      vaVolume += sortedBins[upper].volume;
    } else if (lower > 0) {
      lower--;
      vaVolume += sortedBins[lower].volume;
    } else break;
  }

  const vah = sortedBins[upper].price;
  const val = sortedBins[lower].price;

  // 买卖量 (简化: 用价格变化方向区分)
  let buyVolume = 0, sellVolume = 0;
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) { buyVolume += bars[i].volume * 0.5; sellVolume += bars[i].volume * 0.5; continue; }
    if (bars[i].price >= bars[i - 1].price) buyVolume += bars[i].volume;
    else sellVolume += bars[i].volume;
  }
  const buySellRatio = sellVolume > 0 ? buyVolume / sellVolume : 1;

  // Profile形态
  const upperHalf = sortedBins.filter(b => b.price > poc);
  const lowerHalf = sortedBins.filter(b => b.price < poc);
  const upperVol = upperHalf.reduce((s, b) => s + b.volume, 0);
  const lowerVol = lowerHalf.reduce((s, b) => s + b.volume, 0);

  let profileType: VolumeProfileResult['profileType'];
  const ratio = totalVolume > 0 ? upperVol / totalVolume : 0.5;
  if (ratio > 0.6) profileType = 'p_shape';
  else if (ratio < 0.4) profileType = 'b_shape';
  else if (profileBins.length > 3 && profileBins[1].volume > profileBins[0].volume * 0.8) profileType = 'double_distribution';
  else if (buySellRatio > 1.5) profileType = 'trend_up';
  else if (buySellRatio < 0.67) profileType = 'trend_down';
  else profileType = 'balanced';

  return { poc, vah, val, totalVolume, profileBins, buyVolume, sellVolume, buySellRatio, profileType };
}

export function volumeProfileSupportResistance(
  result: VolumeProfileResult
): { supports: number[]; resistances: number[] } {
  const sorted = [...result.profileBins].sort((a, b) => a.price - b.price);
  const highVolBins = sorted.filter(b => b.percent > 0.05);
  const supports = highVolBins.filter(b => b.price < result.poc).map(b => b.price);
  const resistances = highVolBins.filter(b => b.price > result.poc).map(b => b.price);
  return { supports, resistances };
}
