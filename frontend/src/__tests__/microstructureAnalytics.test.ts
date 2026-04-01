import { describe, it, expect } from 'vitest';

// 市场微观结构分析引擎
interface TradeRecord {
  price: number;
  volume: number;
  timestamp: number;
  aggressor: 'buy' | 'sell';
  isBlock: boolean;
}

interface MicrostructureMetrics {
  avgTradeSize: number;
  blockTradeRatio: number;
  buyPressure: number;
  tradeIntensity: number;
  priceImpact: number;
  amihudIlliquidity: number;
  kyleLambda: number;
  vpin: number;
}

function calcAvgTradeSize(trades: TradeRecord[]): number {
  if (trades.length === 0) return 0;
  return trades.reduce((s, t) => s + t.volume, 0) / trades.length;
}

function calcBlockTradeRatio(trades: TradeRecord[]): number {
  if (trades.length === 0) return 0;
  return trades.filter(t => t.isBlock).length / trades.length;
}

function calcBuyPressure(trades: TradeRecord[]): number {
  if (trades.length === 0) return 0.5;
  const buyVol = trades.filter(t => t.aggressor === 'buy').reduce((s, t) => s + t.volume, 0);
  const totalVol = trades.reduce((s, t) => s + t.volume, 0);
  return buyVol / totalVol;
}

function calcTradeIntensity(trades: TradeRecord[], windowMs: number = 60000): number {
  if (trades.length < 2) return 0;
  const sorted = [...trades].sort((a, b) => a.timestamp - b.timestamp);
  const duration = sorted[sorted.length - 1].timestamp - sorted[0].timestamp;
  return duration > 0 ? (trades.length / duration) * windowMs : 0;
}

function calcAmihudIlliquidity(trades: TradeRecord[]): number {
  if (trades.length < 2) return 0;
  const sorted = [...trades].sort((a, b) => a.timestamp - b.timestamp);
  let totalRatio = 0;
  for (let i = 1; i < sorted.length; i++) {
    const ret = Math.abs(sorted[i].price - sorted[i - 1].price) / sorted[i - 1].price;
    const dollarVol = sorted[i].price * sorted[i].volume;
    if (dollarVol > 0) totalRatio += ret / dollarVol;
  }
  return totalRatio / (sorted.length - 1);
}

function calcKyleLambda(trades: TradeRecord[]): number {
  if (trades.length < 2) return 0;
  const sorted = [...trades].sort((a, b) => a.timestamp - b.timestamp);
  let sumXY = 0, sumYY = 0;
  for (let i = 1; i < sorted.length; i++) {
    const dp = sorted[i].price - sorted[i - 1].price;
    const signedVol = sorted[i].volume * (sorted[i].aggressor === 'buy' ? 1 : -1);
    sumXY += dp * signedVol;
    sumYY += signedVol * signedVol;
  }
  return sumYY > 0 ? sumXY / sumYY : 0;
}

function calcVPIN(trades: TradeRecord[], buckets: number = 50): number {
  if (trades.length === 0) return 0;
  const totalVol = trades.reduce((s, t) => s + t.volume, 0);
  const bucketSize = totalVol / buckets;
  let imbalance = 0;
  let currentBuy = 0, currentSell = 0, currentVol = 0;

  trades.forEach(t => {
    const buyVol = t.aggressor === 'buy' ? t.volume : 0;
    const sellVol = t.aggressor === 'sell' ? t.volume : 0;
    currentBuy += buyVol;
    currentSell += sellVol;
    currentVol += t.volume;
    if (currentVol >= bucketSize) {
      imbalance += Math.abs(currentBuy - currentSell);
      currentBuy = 0;
      currentSell = 0;
      currentVol = 0;
    }
  });

  return buckets > 0 ? imbalance / (buckets * bucketSize || 1) : 0;
}

function analyzeMicrostructure(trades: TradeRecord[]): MicrostructureMetrics {
  return {
    avgTradeSize: calcAvgTradeSize(trades),
    blockTradeRatio: calcBlockTradeRatio(trades),
    buyPressure: calcBuyPressure(trades),
    tradeIntensity: calcTradeIntensity(trades),
    priceImpact: 0,
    amihudIlliquidity: calcAmihudIlliquidity(trades),
    kyleLambda: calcKyleLambda(trades),
    vpin: calcVPIN(trades),
  };
}

describe('市场微观结构分析引擎', () => {
  const trades: TradeRecord[] = [
    { price: 100, volume: 500, timestamp: 1000, aggressor: 'buy', isBlock: false },
    { price: 100.1, volume: 300, timestamp: 2000, aggressor: 'buy', isBlock: false },
    { price: 100.05, volume: 10000, timestamp: 3000, aggressor: 'sell', isBlock: true },
    { price: 99.9, volume: 400, timestamp: 4000, aggressor: 'sell', isBlock: false },
    { price: 100.2, volume: 600, timestamp: 5000, aggressor: 'buy', isBlock: false },
    { price: 100.3, volume: 200, timestamp: 6000, aggressor: 'buy', isBlock: false },
  ];

  it('应计算平均交易规模', () => {
    const avg = calcAvgTradeSize(trades);
    expect(avg).toBeGreaterThan(0);
  });

  it('空交易列表平均规模应为0', () => {
    expect(calcAvgTradeSize([])).toBe(0);
  });

  it('应计算大单比例', () => {
    const ratio = calcBlockTradeRatio(trades);
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThanOrEqual(1);
  });

  it('应计算买压', () => {
    const pressure = calcBuyPressure(trades);
    expect(pressure).toBeGreaterThan(0);
    expect(pressure).toBeLessThanOrEqual(1);
  });

  it('空交易买压应为0.5', () => {
    expect(calcBuyPressure([])).toBe(0.5);
  });

  it('应计算交易强度', () => {
    const intensity = calcTradeIntensity(trades);
    expect(intensity).toBeGreaterThan(0);
  });

  it('应计算Amihud非流动性指标', () => {
    const illiq = calcAmihudIlliquidity(trades);
    expect(illiq).toBeGreaterThanOrEqual(0);
  });

  it('应计算Kyle Lambda', () => {
    const lambda = calcKyleLambda(trades);
    expect(typeof lambda).toBe('number');
  });

  it('应计算VPIN', () => {
    const vpin = calcVPIN(trades);
    expect(vpin).toBeGreaterThanOrEqual(0);
    expect(vpin).toBeLessThanOrEqual(1);
  });

  it('应综合分析微观结构', () => {
    const metrics = analyzeMicrostructure(trades);
    expect(metrics.avgTradeSize).toBeGreaterThan(0);
    expect(metrics.buyPressure).toBeGreaterThan(0);
    expect(metrics.vpin).toBeGreaterThanOrEqual(0);
  });

  it('全买交易买压应接近1', () => {
    const allBuy: TradeRecord[] = trades.map(t => ({ ...t, aggressor: 'buy' as const }));
    expect(calcBuyPressure(allBuy)).toBe(1);
  });

  it('全卖交易买压应接近0', () => {
    const allSell: TradeRecord[] = trades.map(t => ({ ...t, aggressor: 'sell' as const }));
    expect(calcBuyPressure(allSell)).toBe(0);
  });
});
