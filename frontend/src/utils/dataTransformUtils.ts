/**
 * DataTransformUtils - 数据转换工具
 * 前端数据格式化、转换、聚合工具函数
 */

export interface RawStockData {
  code: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  amount: number;
  high: number;
  low: number;
  open: number;
  preClose: number;
  turnover: number;
  pe: number;
  pb: number;
  marketCap: number;
}

export interface FormattedStockData extends RawStockData {
  priceFormatted: string;
  changeFormatted: string;
  volumeFormatted: string;
  amountFormatted: string;
  marketCapFormatted: string;
  turnoverFormatted: string;
  amplitude: number;
  color: 'red' | 'green' | 'gray';
}

export interface AggregatedSector {
  sectorName: string;
  stockCount: number;
  avgChange: number;
  totalVolume: number;
  totalAmount: number;
  topStock: { name: string; change: number } | null;
  bottomStock: { name: string; change: number } | null;
}

export function formatAmount(amount: number): string {
  if (amount >= 1e12) return `${(amount / 1e12).toFixed(2)}万亿`;
  if (amount >= 1e8) return `${(amount / 1e8).toFixed(2)}亿`;
  if (amount >= 1e4) return `${(amount / 1e4).toFixed(2)}万`;
  return amount.toFixed(2);
}

export function formatVolume(volume: number): string {
  if (volume >= 1e8) return `${(volume / 1e8).toFixed(2)}亿手`;
  if (volume >= 1e4) return `${(volume / 1e4).toFixed(2)}万手`;
  return `${volume}手`;
}

export function formatMarketCap(cap: number): string {
  if (cap >= 1e12) return `${(cap / 1e12).toFixed(2)}万亿`;
  if (cap >= 1e8) return `${(cap / 1e8).toFixed(2)}亿`;
  return `${(cap / 1e4).toFixed(2)}万`;
}

export function formatChange(change: number): string {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}`;
}

export function formatChangePercent(pct: number): string {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

export function transformStock(raw: RawStockData): FormattedStockData {
  const amplitude = raw.preClose > 0 ? ((raw.high - raw.low) / raw.preClose) * 100 : 0;
  let color: 'red' | 'green' | 'gray';
  if (raw.change > 0) color = 'red';
  else if (raw.change < 0) color = 'green';
  else color = 'gray';

  return {
    ...raw,
    priceFormatted: raw.price.toFixed(2),
    changeFormatted: formatChangePercent(raw.changePercent),
    volumeFormatted: formatVolume(raw.volume),
    amountFormatted: formatAmount(raw.amount),
    marketCapFormatted: formatMarketCap(raw.marketCap),
    turnoverFormatted: `${raw.turnover.toFixed(2)}%`,
    amplitude: Math.round(amplitude * 100) / 100,
    color,
  };
}

export function transformBatch(stocks: RawStockData[]): FormattedStockData[] {
  return stocks.map(transformStock);
}

export function aggregateSector(
  sectorName: string,
  stocks: RawStockData[]
): AggregatedSector {
  if (stocks.length === 0) {
    return { sectorName, stockCount: 0, avgChange: 0, totalVolume: 0, totalAmount: 0, topStock: null, bottomStock: null };
  }

  const sorted = [...stocks].sort((a, b) => b.changePercent - a.changePercent);
  const avgChange = stocks.reduce((s, st) => s + st.changePercent, 0) / stocks.length;

  return {
    sectorName,
    stockCount: stocks.length,
    avgChange: Math.round(avgChange * 100) / 100,
    totalVolume: stocks.reduce((s, st) => s + st.volume, 0),
    totalAmount: stocks.reduce((s, st) => s + st.amount, 0),
    topStock: { name: sorted[0].name, change: sorted[0].changePercent },
    bottomStock: { name: sorted[sorted.length - 1].name, change: sorted[sorted.length - 1].changePercent },
  };
}

export function sortByField<T extends Record<string, any>>(
  data: T[],
  field: keyof T,
  order: 'asc' | 'desc' = 'desc'
): T[] {
  return [...data].sort((a, b) => {
    const va = a[field], vb = b[field];
    if (typeof va === 'number' && typeof vb === 'number') {
      return order === 'desc' ? vb - va : va - vb;
    }
    return order === 'desc'
      ? String(vb).localeCompare(String(va))
      : String(va).localeCompare(String(vb));
  });
}

export function filterByChangeRange(
  stocks: RawStockData[],
  minPct: number,
  maxPct: number
): RawStockData[] {
  return stocks.filter(s => s.changePercent >= minPct && s.changePercent <= maxPct);
}

export function computePercentileRank(value: number, sortedArray: number[]): number {
  if (sortedArray.length === 0) return 0;
  let count = 0;
  for (const v of sortedArray) {
    if (v < value) count++;
    else if (v === value) count += 0.5;
  }
  return Math.round((count / sortedArray.length) * 100);
}
