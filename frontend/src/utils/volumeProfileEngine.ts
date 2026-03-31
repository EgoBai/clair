/**
 * 成交量分布引擎
 * - Volume Profile构建
 * - POC/VAH/VAL计算
 * - 高/低成交量节点
 * - 成交量缺口
 * - 控制权转移检测
 */
export interface VolumeBar {
  price: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
  timestamp: number;
}

export interface VolumeNode {
  price: number;
  volume: number;
  volumePct: number;
  type: 'high' | 'low' | 'normal';
}

export interface VolumeProfileResult {
  poc: number;
  vah: number;
  val: number;
  highNodes: VolumeNode[];
  lowNodes: VolumeNode[];
  volumeGaps: Array<{ top: number; bottom: number; width: number }>;
  controlShift: { from: number; to: number; strength: number } | null;
  valueAreaVolume: number;
  totalVolume: number;
  volumeDistribution: 'normal' | 'bimodal' | 'uniform' | 'skewed';
}

export function buildVolumeProfile(
  bars: VolumeBar[],
  priceStep: number = 0.01,
  valueAreaPct: number = 0.7
): VolumeProfileResult {
  if (bars.length === 0) throw new Error('成交量数据不能为空');

  // 按价格聚合
  const priceVolMap = new Map<number, { volume: number; buyVolume: number; sellVolume: number }>();
  for (const bar of bars) {
    const roundedPrice = Math.round(bar.price / priceStep) * priceStep;
    const existing = priceVolMap.get(roundedPrice) ?? { volume: 0, buyVolume: 0, sellVolume: 0 };
    existing.volume += bar.volume;
    existing.buyVolume += bar.buyVolume;
    existing.sellVolume += bar.sellVolume;
    priceVolMap.set(roundedPrice, existing);
  }

  const totalVolume = bars.reduce((s, b) => s + b.volume, 0);

  // 转为数组并排序
  const volumeNodes: VolumeNode[] = [...priceVolMap.entries()]
    .map(([price, data]) => ({
      price,
      volume: data.volume,
      volumePct: data.volume / totalVolume,
      type: 'normal' as const,
    }))
    .sort((a, b) => a.price - b.price);

  // POC
  const poc = volumeNodes.reduce((best, n) => n.volume > best.volume ? n : best).price;

  // VAH/VAL
  const targetVol = totalVolume * valueAreaPct;
  const sortedByVolume = [...volumeNodes].sort((a, b) => b.volume - a.volume);
  let accumulatedVol = 0;
  const valueAreaPrices: number[] = [];
  for (const n of sortedByVolume) {
    accumulatedVol += n.volume;
    valueAreaPrices.push(n.price);
    if (accumulatedVol >= targetVol) break;
  }
  const vah = Math.max(...valueAreaPrices);
  const val = Math.min(...valueAreaPrices);
  const valueAreaVolume = accumulatedVol;

  // 高/低成交量节点
  const avgVol = totalVolume / volumeNodes.length;
  const nodes: VolumeNode[] = volumeNodes.map(n => ({
    ...n,
    type: n.volume > avgVol * 2 ? 'high' : n.volume < avgVol * 0.3 ? 'low' : 'normal',
  }));
  const highNodes = nodes.filter(n => n.type === 'high');
  const lowNodes = nodes.filter(n => n.type === 'low');

  // 成交量缺口
  const volumeGaps: Array<{ top: number; bottom: number; width: number }> = [];
  let gapStart: number | null = null;
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].volume < avgVol * 0.1) {
      if (gapStart === null) gapStart = nodes[i].price;
    } else {
      if (gapStart !== null) {
        volumeGaps.push({ top: nodes[i - 1].price, bottom: gapStart, width: nodes[i - 1].price - gapStart });
        gapStart = null;
      }
    }
  }

  // 控制权转移 (前后半段POC不同)
  const midIdx = Math.floor(bars.length / 2);
  const firstHalf = bars.slice(0, midIdx);
  const secondHalf = bars.slice(midIdx);
  let controlShift = null;
  if (firstHalf.length > 0 && secondHalf.length > 0) {
    const firstPoc = findPOC(firstHalf, priceStep);
    const secondPoc = findPOC(secondHalf, priceStep);
    if (Math.abs(firstPoc - secondPoc) > priceStep * 5) {
      const strength = Math.abs(secondPoc - firstPoc) / firstPoc;
      controlShift = { from: firstPoc, to: secondPoc, strength };
    }
  }

  // 分布类型
  const volumes = volumeNodes.map(n => n.volume);
  const maxVol = Math.max(...volumes);
  const minVol = Math.min(...volumes);
  const peaks = volumeNodes.filter(n => n.volume > maxVol * 0.7).length;
  let volumeDistribution: 'normal' | 'bimodal' | 'uniform' | 'skewed';
  if (peaks > 2) volumeDistribution = 'bimodal';
  else if ((maxVol - minVol) / maxVol < 0.3) volumeDistribution = 'uniform';
  else if (Math.abs(highNodes.length - lowNodes.length) > nodes.length * 0.2) volumeDistribution = 'skewed';
  else volumeDistribution = 'normal';

  return {
    poc, vah, val, highNodes, lowNodes, volumeGaps, controlShift,
    valueAreaVolume, totalVolume, volumeDistribution,
  };
}

function findPOC(bars: VolumeBar[], step: number): number {
  const map = new Map<number, number>();
  for (const b of bars) {
    const p = Math.round(b.price / step) * step;
    map.set(p, (map.get(p) ?? 0) + b.volume);
  }
  let bestPrice = 0, bestVol = 0;
  for (const [p, v] of map) {
    if (v > bestVol) { bestVol = v; bestPrice = p; }
  }
  return bestPrice;
}
