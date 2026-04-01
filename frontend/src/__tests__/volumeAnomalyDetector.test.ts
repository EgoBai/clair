import { describe, it, expect } from 'vitest';

// 量价异常检测引擎
interface PriceVolumeData {
  symbol: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
}

interface VolumeAnomaly {
  symbol: string;
  date: string;
  type: 'volume_spike' | 'volume_dry' | 'price_volume_diverge' | 'limit_up_heavy' | 'limit_down_heavy';
  severity: 'low' | 'medium' | 'high';
  description: string;
  volumeRatio: number;
  priceChange: number;
}

function calcVolumeMA(data: PriceVolumeData[], period: number = 20): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(0); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j].volume;
    result.push(sum / period);
  }
  return result;
}

function detectVolumeAnomalies(data: PriceVolumeData[], threshold: number = 2.5): VolumeAnomaly[] {
  const anomalies: VolumeAnomaly[] = [];
  const volMA = calcVolumeMA(data, 20);

  data.forEach((d, i) => {
    const avgVol = volMA[i];
    if (avgVol <= 0) return;
    const ratio = d.volume / avgVol;
    const priceChange = (d.close - d.open) / d.open;

    if (ratio > threshold && Math.abs(priceChange) > 0.03) {
      anomalies.push({
        symbol: d.symbol, date: d.date,
        type: priceChange > 0 ? 'volume_spike' : 'volume_spike',
        severity: ratio > 5 ? 'high' : ratio > 3 ? 'medium' : 'low',
        description: `放量${priceChange > 0 ? '上涨' : '下跌'}：成交量为20日均量的${ratio.toFixed(1)}倍`,
        volumeRatio: ratio, priceChange,
      });
    }

    if (ratio < 0.3 && Math.abs(priceChange) < 0.01) {
      anomalies.push({
        symbol: d.symbol, date: d.date,
        type: 'volume_dry',
        severity: ratio < 0.15 ? 'high' : 'medium',
        description: `极度缩量：成交量仅为20日均量的${(ratio * 100).toFixed(0)}%`,
        volumeRatio: ratio, priceChange,
      });
    }

    if (priceChange > 0.095) {
      anomalies.push({
        symbol: d.symbol, date: d.date,
        type: 'limit_up_heavy',
        severity: ratio > 3 ? 'high' : 'medium',
        description: `涨停放量：封板资金${(d.amount / 100000000).toFixed(1)}亿`,
        volumeRatio: ratio, priceChange,
      });
    }

    if (priceChange < -0.095) {
      anomalies.push({
        symbol: d.symbol, date: d.date,
        type: 'limit_down_heavy',
        severity: ratio > 2 ? 'high' : 'medium',
        description: `跌停放量：恐慌抛压${(d.amount / 100000000).toFixed(1)}亿`,
        volumeRatio: ratio, priceChange,
      });
    }
  });

  return anomalies;
}

function detectPriceVolumeDivergence(data: PriceVolumeData[]): { date: string; type: string }[] {
  const divergences: { date: string; type: string }[] = [];
  for (let i = 5; i < data.length; i++) {
    const priceUp = data[i].close > data[i - 5].close;
    const volUp = data[i].volume > data[i - 1].volume;
    if (priceUp && !volUp) divergences.push({ date: data[i].date, type: '价升量缩' });
    if (!priceUp && volUp) divergences.push({ date: data[i].date, type: '价跌量增' });
  }
  return divergences;
}

function calcVolumeProfile(data: PriceVolumeData[], bins: number = 10): { priceLevel: number; volume: number }[] {
  if (data.length === 0) return [];
  const prices = data.map(d => d.close);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const binSize = (max - min) / bins || 1;
  const profile: Map<number, number> = new Map();

  data.forEach(d => {
    const bin = Math.floor((d.close - min) / binSize);
    const key = Math.min(bin, bins - 1) * binSize + min;
    profile.set(key, (profile.get(key) || 0) + d.volume);
  });

  return [...profile.entries()]
    .map(([priceLevel, volume]) => ({ priceLevel, volume }))
    .sort((a, b) => a.priceLevel - b.priceLevel);
}

describe('量价异常检测引擎', () => {
  const data: PriceVolumeData[] = Array.from({ length: 30 }, (_, i) => ({
    symbol: '600519',
    date: `2024-03-${String(i + 1).padStart(2, '0')}`,
    open: 1800 + i * 2,
    high: 1810 + i * 2,
    low: 1795 + i * 2,
    close: 1805 + i * 2,
    volume: 10000 + Math.random() * 5000,
    amount: (1805 + i * 2) * (10000 + Math.random() * 5000),
  }));

  it('应计算量均线', () => {
    const ma = calcVolumeMA(data, 20);
    expect(ma.length).toBe(data.length);
    expect(ma[0]).toBe(0);
    expect(ma[19]).toBeGreaterThan(0);
  });

  it('应检测放量异常', () => {
    const spikeData = data.map((d, i) => ({
      ...d,
      volume: i === 25 ? 50000 : d.volume,
      close: i === 25 ? d.close * 1.05 : d.close,
      open: i === 25 ? d.close : d.open,
    }));
    const anomalies = detectVolumeAnomalies(spikeData);
    expect(anomalies.some(a => a.type === 'volume_spike')).toBe(true);
  });

  it('应检测缩量异常', () => {
    const dryData = data.map((d, i) => ({
      ...d,
      volume: i === 25 ? 500 : d.volume,
      close: i === 25 ? d.open * 1.001 : d.close,
    }));
    const anomalies = detectVolumeAnomalies(dryData, 2.5);
    expect(anomalies.some(a => a.type === 'volume_dry')).toBe(true);
  });

  it('应检测涨跌停', () => {
    const limitData = data.map((d, i) => ({
      ...d,
      close: i === 25 ? d.open * 1.1 : d.close,
      volume: i === 25 ? 30000 : d.volume,
    }));
    const anomalies = detectVolumeAnomalies(limitData);
    expect(anomalies.some(a => a.type === 'limit_up_heavy')).toBe(true);
  });

  it('应检测价量背离', () => {
    const divergeData = data.map((d, i) => ({
      ...d,
      close: i > 20 ? d.close + (i - 20) * 5 : d.close,
      volume: i > 20 ? d.volume * 0.5 : d.volume,
    }));
    const divs = detectPriceVolumeDivergence(divergeData);
    expect(divs.length).toBeGreaterThan(0);
    expect(divs.some(d => d.type === '价升量缩')).toBe(true);
  });

  it('应计算量价分布', () => {
    const profile = calcVolumeProfile(data);
    expect(profile.length).toBeGreaterThan(0);
    profile.forEach(p => {
      expect(p.volume).toBeGreaterThan(0);
    });
  });

  it('空数据量价分布应为空', () => {
    expect(calcVolumeProfile([])).toEqual([]);
  });

  it('异常严重程度应分级', () => {
    const anomalies = detectVolumeAnomalies(data);
    anomalies.forEach(a => {
      expect(['low', 'medium', 'high']).toContain(a.severity);
    });
  });

  it('单一数据点不应有背离', () => {
    expect(detectPriceVolumeDivergence([data[0]])).toEqual([]);
  });

  it('正常波动不应产生异常', () => {
    const normalData = data.map(d => ({ ...d, volume: 10000 + Math.random() * 100 }));
    const anomalies = detectVolumeAnomalies(normalData);
    expect(anomalies.length).toBe(0);
  });
});
