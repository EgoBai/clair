import { describe, it, expect } from 'vitest';

describe('暗池活动分析引擎', () => {
  interface DarkPoolTrade {
    timestamp: number;
    price: number;
    volume: number;
    venue: string;
  }

  function darkPoolVolumeRatio(trades: DarkPoolTrade[], litVolume: number[], window = 20) {
    if (trades.length < window) return [];
    const results: number[] = [];
    for (let i = window - 1; i < trades.length; i++) {
      const darkVol = trades.slice(i - window + 1, i + 1).reduce((s, t) => s + t.volume, 0);
      const litVol = litVolume.slice(i - window + 1, i + 1).reduce((s, v) => s + v, 0);
      results.push(litVol > 0 ? darkVol / (darkVol + litVol) : 0);
    }
    return results;
  }

  function darkPoolPremium(trades: DarkPoolTrade[], litPrices: number[], window = 20) {
    if (trades.length < window || litPrices.length < window) return [];
    const results: number[] = [];
    for (let i = window - 1; i < trades.length; i++) {
      const darkAvg = trades.slice(i - window + 1, i + 1).reduce((s, t) => s + t.price * t.volume, 0) /
        trades.slice(i - window + 1, i + 1).reduce((s, t) => s + t.volume, 0);
      const litAvg = litPrices.slice(i - window + 1, i + 1).reduce((a, b) => a + b, 0) / window;
      results.push(litAvg > 0 ? (darkAvg - litAvg) / litAvg * 10000 : 0); // bps
    }
    return results;
  }

  function blockTradeDetection(trades: DarkPoolTrade[], avgWindow = 20, threshold = 3) {
    if (trades.length < avgWindow) return [];
    const avgVol = trades.slice(0, avgWindow).reduce((s, t) => s + t.volume, 0) / avgWindow;
    return trades.filter(t => t.volume > avgVol * threshold).map(t => ({
      ...t,
      multiple: t.volume / avgVol,
      direction: t.price > trades[trades.indexOf(t) - 1]?.price ? 'buy' : 'sell',
    }));
  }

  function venueDistribution(trades: DarkPoolTrade[]) {
    const dist: Record<string, { count: number; volume: number; avgSize: number }> = {};
    for (const t of trades) {
      if (!dist[t.venue]) dist[t.venue] = { count: 0, volume: 0, avgSize: 0 };
      dist[t.venue].count++;
      dist[t.venue].volume += t.volume;
    }
    for (const v of Object.values(dist)) v.avgSize = v.volume / v.count;
    return dist;
  }

  function darkPoolImpact(trades: DarkPoolTrade[], litPrices: number[]) {
    if (trades.length < 2 || litPrices.length < 2) return { lambda: 0, rSquared: 0 };
    const darkVol = trades.map(t => t.volume);
    const priceChanges = litPrices.slice(1).map((p, i) => p - litPrices[i]);
    const minLen = Math.min(darkVol.length - 1, priceChanges.length);
    const x = darkVol.slice(0, minLen), y = priceChanges.slice(0, minLen);
    const mx = x.reduce((a, b) => a + b, 0) / x.length;
    const my = y.reduce((a, b) => a + b, 0) / y.length;
    const cov = x.reduce((s, xi, i) => s + (xi - mx) * (y[i] - my), 0) / x.length;
    const varX = x.reduce((s, xi) => s + (xi - mx) ** 2, 0) / x.length;
    const lambda = varX === 0 ? 0 : cov / varX;
    const ssRes = y.reduce((s, yi, i) => s + (yi - lambda * x[i]) ** 2, 0);
    const ssTot = y.reduce((s, yi) => s + (yi - my) ** 2, 0);
    return { lambda, rSquared: ssTot === 0 ? 0 : 1 - ssRes / ssTot };
  }

  function informationLeakage(trades: DarkPoolTrade[], litPrices: number[], window = 5) {
    if (trades.length < window || litPrices.length < window) return 0;
    let leakage = 0;
    for (let i = window; i < Math.min(trades.length, litPrices.length - window); i++) {
      const darkImbalance = trades.slice(i - window, i).reduce((s, t) => s + (t.price > trades[i - window].price ? 1 : -1) * t.volume, 0);
      const futureReturn = (litPrices[i + window] - litPrices[i]) / litPrices[i];
      if ((darkImbalance > 0 && futureReturn > 0) || (darkImbalance < 0 && futureReturn < 0)) leakage++;
    }
    return leakage / (Math.min(trades.length, litPrices.length) - window * 2);
  }

  function executionQuality(darkPrices: number[], litPrices: number[]) {
    const minLen = Math.min(darkPrices.length, litPrices.length);
    let priceImprovement = 0, matches = 0;
    for (let i = 0; i < minLen; i++) {
      if (Math.abs(darkPrices[i] - litPrices[i]) / litPrices[i] < 0.001) matches++;
      priceImprovement += litPrices[i] - darkPrices[i];
    }
    return {
      avgImprovement: minLen > 0 ? priceImprovement / minLen : 0,
      matchRate: minLen > 0 ? matches / minLen : 0,
      totalSamples: minLen,
    };
  }

  const venues = ['dark_pool_1', 'dark_pool_2', 'crossing_network'];
  const sampleTrades: DarkPoolTrade[] = Array.from({ length: 50 }, (_, i) => ({
    timestamp: i,
    price: 100 + Math.random() * 2 - 1,
    volume: 500 + Math.random() * 2000,
    venue: venues[i % 3],
  }));
  const litVols = Array.from({ length: 50 }, () => 10000 + Math.random() * 5000);
  const litPrices = Array.from({ length: 50 }, (_, i) => 100 + Math.random() * 2 - 1);

  describe('暗池成交量比率', () => {
    it('比率在0-1', () => {
      const ratio = darkPoolVolumeRatio(sampleTrades, litVols, 10);
      ratio.forEach(v => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      });
    });

    it('数据不足返回空', () => {
      expect(darkPoolVolumeRatio(sampleTrades.slice(0, 3), litVols, 10)).toEqual([]);
    });
  });

  describe('暗池溢价', () => {
    it('返回bps', () => {
      const premium = darkPoolPremium(sampleTrades, litPrices, 10);
      premium.forEach(v => expect(isNaN(v)).toBe(false));
    });
  });

  describe('大宗交易检测', () => {
    it('检测到异常大单', () => {
      const largeTrades = [...sampleTrades,
        { timestamp: 100, price: 101, volume: 50000, venue: 'dark_pool_1' },
        { timestamp: 101, price: 101.5, volume: 60000, venue: 'dark_pool_2' },
      ];
      const blocks = blockTradeDetection(largeTrades, 20, 3);
      expect(blocks.length).toBeGreaterThan(0);
    });

    it('倍率计算', () => {
      const blocks = blockTradeDetection(sampleTrades, 10, 2);
      blocks.forEach(b => expect(b.multiple).toBeGreaterThan(2));
    });
  });

  describe('交易所分布', () => {
    it('分布覆盖所有场所', () => {
      const dist = venueDistribution(sampleTrades);
      venues.forEach(v => {
        expect(dist[v]).toBeDefined();
        expect(dist[v].count).toBeGreaterThan(0);
      });
    });

    it('总交易数正确', () => {
      const dist = venueDistribution(sampleTrades);
      const total = Object.values(dist).reduce((s, d) => s + d.count, 0);
      expect(total).toBe(50);
    });
  });

  describe('暗池影响', () => {
    it('返回lambda和rSquared', () => {
      const impact = darkPoolImpact(sampleTrades, litPrices);
      expect(typeof impact.lambda).toBe('number');
      expect(typeof impact.rSquared).toBe('number');
    });
  });

  describe('信息泄露', () => {
    it('泄露率在0-1', () => {
      const leak = informationLeakage(sampleTrades, litPrices, 5);
      expect(leak).toBeGreaterThanOrEqual(0);
      expect(leak).toBeLessThanOrEqual(1);
    });
  });

  describe('执行质量', () => {
    it('匹配率在0-1', () => {
      const eq = executionQuality(sampleTrades.map(t => t.price), litPrices);
      expect(eq.matchRate).toBeGreaterThanOrEqual(0);
      expect(eq.matchRate).toBeLessThanOrEqual(1);
    });

    it('总样本数正确', () => {
      const eq = executionQuality(sampleTrades.map(t => t.price), litPrices);
      expect(eq.totalSamples).toBe(50);
    });
  });
});
