/**
 * 市场画像(Market Profile)引擎
 * - TPO分布构建
 * - 价值区域(Value Area)计算
 * - POC(Point of Control)定位
 * - 开盘类型判断
 * - 行情结构分析
 */
export interface PriceLevel {
  price: number;
  volume: number;
  tpoCount: number; // 时间价格机会计数
  buyVolume: number;
  sellVolume: number;
}

export interface MarketProfileData {
  symbol: string;
  date: string;
  priceLevels: PriceLevel[];
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ValueArea {
  poc: number;
  vah: number; // Value Area High
  val: number; // Value Area Low
  valueAreaPct: number;
}

export interface OpenType {
  type: 'open_drive' | 'open_test_drive' | 'open_rejection' | 'open_auction' | 'unknown';
  description: string;
  expectedRange: 'expanded' | 'normal' | 'contracted';
}

export interface MarketProfileAnalysis {
  symbol: string;
  valueArea: ValueArea;
  openType: OpenType;
  profileType: 'b' | 'b_shape' | 'p_shape' | 'd_shape' | 'poor' | 'neutral';
  excessHigh: number;
  excessLow: number;
  volumeDistribution: 'balanced' | 'skewed_high' | 'skewed_low' | 'double_distribution';
  keyLevels: number[];
  alerts: string[];
}

export function analyzeMarketProfile(data: MarketProfileData): MarketProfileAnalysis {
  const { priceLevels, open, high, low, close } = data;
  
  if (priceLevels.length === 0) throw new Error('价格水平数据不能为空');

  // POC: 最大成交量价格
  const poc = priceLevels.reduce((best, pl) => pl.volume > best.volume ? pl : best).price;

  // 价值区域 (70%成交量)
  const totalVolume = priceLevels.reduce((s, pl) => s + pl.volume, 0);
  const targetVolume = totalVolume * 0.7;
  const sortedByVolume = [...priceLevels].sort((a, b) => b.volume - a.volume);

  let accumulatedVolume = 0;
  const valuePrices: number[] = [];
  for (const pl of sortedByVolume) {
    accumulatedVolume += pl.volume;
    valuePrices.push(pl.price);
    if (accumulatedVolume >= targetVolume) break;
  }

  const vah = Math.max(...valuePrices);
  const val = Math.min(...valuePrices);
  const valueAreaPct = accumulatedVolume / totalVolume;

  const valueArea: ValueArea = { poc, vah, val, valueAreaPct };

  // 开盘类型
  const openType = classifyOpenType(open, poc, vah, val, high, low);

  // 轮廓类型
  const profileType = classifyProfile(priceLevels, poc, vah, val);

  // 高低点过剩
  const topLevels = priceLevels.filter(pl => pl.price > vah);
  const bottomLevels = priceLevels.filter(pl => pl.price < val);
  const excessHigh = topLevels.reduce((s, pl) => s + pl.volume, 0) / totalVolume;
  const excessLow = bottomLevels.reduce((s, pl) => s + pl.volume, 0) / totalVolume;

  // 成交量分布
  const volumeDistribution = classifyVolumeDistribution(priceLevels, poc);

  // 关键价位
  const keyLevels = [poc, vah, val, high, low, close].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);

  const alerts: string[] = [];
  if (close > vah * 1.02) alerts.push('收盘价显著高于价值区域');
  if (close < val * 0.98) alerts.push('收盘价显著低于价值区域');
  if (excessHigh > 0.2) alerts.push('高点存在过剩');
  if (excessLow > 0.2) alerts.push('低点存在过剩');

  return { symbol: data.symbol, valueArea, openType, profileType, excessHigh, excessLow, volumeDistribution, keyLevels, alerts };
}

function classifyOpenType(open: number, poc: number, vah: number, val: number, high: number, low: number): OpenType {
  const range = high - low;
  const vahValRange = vah - val;
  
  if (open > vah) {
    return { type: 'open_drive', description: '向上开盘驱动', expectedRange: 'expanded' };
  } else if (open < val) {
    return { type: 'open_drive', description: '向下开盘驱动', expectedRange: 'expanded' };
  } else if (Math.abs(open - poc) < vahValRange * 0.1) {
    return { type: 'open_auction', description: '价值区域开盘拍卖', expectedRange: 'normal' };
  } else if (range < vahValRange * 0.5) {
    return { type: 'open_rejection', description: '开盘回撤', expectedRange: 'contracted' };
  } else {
    return { type: 'open_test_drive', description: '开盘测试驱动', expectedRange: 'normal' };
  }
}

function classifyProfile(levels: PriceLevel[], poc: number, vah: number, val: number): 'b' | 'b_shape' | 'p_shape' | 'd_shape' | 'poor' | 'neutral' {
  const midPrice = (vah + val) / 2;
  const aboveMid = levels.filter(l => l.price > midPrice);
  const belowMid = levels.filter(l => l.price <= midPrice);
  const aboveVol = aboveMid.reduce((s, l) => s + l.volume, 0);
  const belowVol = belowMid.reduce((s, l) => s + l.volume, 0);
  
  if (poc > vah * 0.95) return 'p_shape';
  if (poc < val * 1.05) return 'd_shape';
  if (Math.abs(aboveVol - belowVol) < (aboveVol + belowVol) * 0.1) return 'b_shape';
  if (aboveVol > belowVol * 1.5) return 'b';
  return 'neutral';
}

function classifyVolumeDistribution(levels: PriceLevel[], poc: number): 'balanced' | 'skewed_high' | 'skewed_low' | 'double_distribution' {
  const sorted = [...levels].sort((a, b) => a.price - b.price);
  const pocIdx = sorted.findIndex(l => l.price === poc);
  const aboveVol = sorted.slice(pocIdx + 1).reduce((s, l) => s + l.volume, 0);
  const belowVol = sorted.slice(0, pocIdx).reduce((s, l) => s + l.volume, 0);
  const total = aboveVol + belowVol;

  if (Math.abs(aboveVol - belowVol) / total < 0.15) return 'balanced';
  if (aboveVol > belowVol * 1.5) return 'skewed_high';
  if (belowVol > aboveVol * 1.5) return 'skewed_low';
  return 'double_distribution';
}
