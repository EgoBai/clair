import { describe, it, expect } from 'vitest';

// 流动性分析引擎
interface LiquidityMetrics {
  avgDailyVolume: number;
  volumeStdDev: number;
  bidAskSpread: number;
  marketDepth: number;
  turnoverRate: number;
  liquidityScore: number;
  amihudIlliquidity: number;
  kyleLambda: number;
}

function calcAmihudIlliquidity(dailyReturns: number[], dailyVolumes: number[]): number {
  if (dailyReturns.length !== dailyVolumes.length || dailyReturns.length === 0) return 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < dailyReturns.length; i++) {
    if (dailyVolumes[i] > 0) {
      sum += Math.abs(dailyReturns[i]) / dailyVolumes[i];
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

function calcKyleLambda(priceChanges: number[], signedVolumes: number[]): number {
  if (priceChanges.length !== signedVolumes.length || priceChanges.length < 2) return 0;
  let sumXY = 0, sumXX = 0;
  for (let i = 0; i < priceChanges.length; i++) {
    sumXY += priceChanges[i] * signedVolumes[i];
    sumXX += signedVolumes[i] * signedVolumes[i];
  }
  return sumXX > 0 ? sumXY / sumXX : 0;
}

function calcLiquidityScore(metrics: Partial<LiquidityMetrics>): number {
  const weights = { volume: 0.3, spread: 0.25, depth: 0.25, turnover: 0.2 };
  let score = 0;
  if (metrics.avgDailyVolume) score += Math.min(metrics.avgDailyVolume / 1e8, 1) * weights.volume * 100;
  if (metrics.bidAskSpread !== undefined) score += Math.max(0, 1 - metrics.bidAskSpread / 0.05) * weights.spread * 100;
  if (metrics.marketDepth) score += Math.min(metrics.marketDepth / 1e6, 1) * weights.depth * 100;
  if (metrics.turnoverRate) score += Math.min(metrics.turnoverRate / 10, 1) * weights.turnover * 100;
  return Math.round(score);
}

function calcVolumeProfile(prices: number[], volumes: number[], bins: number = 10): { price: number; volume: number; poc: boolean }[] {
  if (prices.length === 0) return [];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const binSize = (max - min) / bins || 1;
  const profile: Map<number, number> = new Map();

  for (let i = 0; i < prices.length; i++) {
    const bin = Math.floor((prices[i] - min) / binSize);
    const key = Math.min(bin, bins - 1);
    profile.set(key, (profile.get(key) || 0) + volumes[i]);
  }

  const result = Array.from(profile.entries()).map(([bin, vol]) => ({
    price: min + (bin + 0.5) * binSize,
    volume: vol,
    poc: false,
  }));

  const maxVol = Math.max(...result.map(r => r.volume));
  result.forEach(r => { if (r.volume === maxVol) r.poc = true; });
  return result.sort((a, b) => a.price - b.price);
}

function calcTurnoverRate(volume: number, freeFloatShares: number): number {
  if (freeFloatShares <= 0) return 0;
  return (volume / freeFloatShares) * 100;
}

describe('流动性分析引擎', () => {
  describe('Amihud非流动性指标', () => {
    it('应正确计算Amihud指标', () => {
      const returns = [0.01, -0.02, 0.005, 0.015];
      const volumes = [1e7, 2e7, 1.5e7, 3e7];
      const result = calcAmihudIlliquidity(returns, volumes);
      expect(result).toBeGreaterThan(0);
    });

    it('应处理零成交量', () => {
      const returns = [0.01, -0.02];
      const volumes = [0, 2e7];
      const result = calcAmihudIlliquidity(returns, volumes);
      expect(result).toBeGreaterThan(0);
    });

    it('空数组应返回0', () => {
      expect(calcAmihudIlliquidity([], [])).toBe(0);
    });

    it('长度不匹配应返回0', () => {
      expect(calcAmihudIlliquidity([0.01], [1e7, 2e7])).toBe(0);
    });

    it('所有成交量为零应返回0', () => {
      expect(calcAmihudIlliquidity([0.01, 0.02], [0, 0])).toBe(0);
    });
  });

  describe('Kyle Lambda', () => {
    it('应正确计算价格冲击系数', () => {
      const priceChanges = [0.1, 0.2, -0.1, 0.15];
      const signedVolumes = [1000, 2000, -1500, 1800];
      const result = calcKyleLambda(priceChanges, signedVolumes);
      expect(result).toBeGreaterThan(0);
    });

    it('空数据应返回0', () => {
      expect(calcKyleLambda([], [])).toBe(0);
    });

    it('单点数据应返回0', () => {
      expect(calcKyleLambda([0.1], [1000])).toBe(0);
    });
  });

  describe('流动性评分', () => {
    it('高流动性应得高分', () => {
      const score = calcLiquidityScore({
        avgDailyVolume: 5e8,
        bidAskSpread: 0.001,
        marketDepth: 5e6,
        turnoverRate: 8,
      });
      expect(score).toBeGreaterThan(70);
    });

    it('低流动性应得低分', () => {
      const score = calcLiquidityScore({
        avgDailyVolume: 1e5,
        bidAskSpread: 0.1,
        marketDepth: 1000,
        turnoverRate: 0.1,
      });
      expect(score).toBeLessThan(30);
    });

    it('空指标应返回0', () => {
      expect(calcLiquidityScore({})).toBe(0);
    });
  });

  describe('成交量分布', () => {
    it('应正确生成成交量分布图', () => {
      const prices = [10, 10.5, 11, 11.5, 12, 10, 11, 12, 11.5, 10.5];
      const volumes = [1000, 2000, 3000, 1500, 500, 1200, 2800, 700, 1600, 2100];
      const profile = calcVolumeProfile(prices, volumes, 5);
      expect(profile.length).toBeGreaterThan(0);
      expect(profile.some(p => p.poc)).toBe(true);
    });

    it('空数据应返回空数组', () => {
      expect(calcVolumeProfile([], [], 5)).toEqual([]);
    });

    it('所有价格相同应正常处理', () => {
      const profile = calcVolumeProfile([10, 10, 10], [100, 200, 300]);
      expect(profile.length).toBeGreaterThan(0);
    });
  });

  describe('换手率', () => {
    it('应正确计算换手率', () => {
      expect(calcTurnoverRate(1e7, 1e8)).toBe(10);
    });

    it('流通股本为零应返回0', () => {
      expect(calcTurnoverRate(1e7, 0)).toBe(0);
    });

    it('负值流通股本应返回0', () => {
      expect(calcTurnoverRate(1e7, -1)).toBe(0);
    });
  });
});
