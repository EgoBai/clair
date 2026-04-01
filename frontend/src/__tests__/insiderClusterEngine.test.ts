import { describe, it, expect } from 'vitest';

/**
 * 内部人集群分析引擎测试
 */

interface InsiderTrade {
  insider: string;
  role: 'ceo' | 'cfo' | 'director' | 'officer' | 'other';
  date: number;
  type: 'buy' | 'sell';
  shares: number;
  price: number;
  amount: number;
}

interface ClusterDetection {
  detected: boolean;
  clusterSize: number;
  timeWindow: number;
  direction: 'buy' | 'sell' | 'mixed';
  avgTradeSize: number;
  significance: number;
}

function detectCluster(trades: InsiderTrade[], windowDays = 30): ClusterDetection {
  if (trades.length < 2) return { detected: false, clusterSize: 0, timeWindow: windowDays, direction: 'mixed', avgTradeSize: 0, significance: 0 };
  const sorted = [...trades].sort((a, b) => a.date - b.date);
  const msWindow = windowDays * 86400000;
  let maxCluster: InsiderTrade[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const cluster = sorted.filter(t => t.date >= sorted[i].date && t.date <= sorted[i].date + msWindow);
    if (cluster.length > maxCluster.length) maxCluster = cluster;
  }
  if (maxCluster.length < 2) return { detected: false, clusterSize: 0, timeWindow: windowDays, direction: 'mixed', avgTradeSize: 0, significance: 0 };
  const buys = maxCluster.filter(t => t.type === 'buy').length;
  const sells = maxCluster.filter(t => t.type === 'sell').length;
  const direction = buys > sells ? 'buy' : sells > buys ? 'sell' : 'mixed';
  const avgTradeSize = maxCluster.reduce((s, t) => s + t.shares, 0) / maxCluster.length;
  const significance = Math.min(100, maxCluster.length * 15 + (maxCluster.length >= 3 ? 20 : 0));
  return { detected: true, clusterSize: maxCluster.length, timeWindow: windowDays, direction, avgTradeSize: parseFloat(avgTradeSize.toFixed(0)), significance };
}

function analyzeByRole(trades: InsiderTrade[]): Array<{ role: string; buyCount: number; sellCount: number; netDirection: string; totalAmount: number }> {
  const roles = new Map<string, { buyCount: number; sellCount: number; totalAmount: number }>();
  trades.forEach(t => {
    const r = roles.get(t.role) || { buyCount: 0, sellCount: 0, totalAmount: 0 };
    if (t.type === 'buy') r.buyCount++; else r.sellCount++;
    r.totalAmount += t.amount;
    roles.set(t.role, r);
  });
  return Array.from(roles.entries()).map(([role, data]) => ({
    role,
    buyCount: data.buyCount,
    sellCount: data.sellCount,
    netDirection: data.buyCount > data.sellCount ? 'buy' : data.sellCount > data.buyCount ? 'sell' : 'neutral',
    totalAmount: parseFloat(data.totalAmount.toFixed(2)),
  }));
}

function calculateInsiderSentiment(trades: InsiderTrade[]): { score: number; label: string; buyVolume: number; sellVolume: number } {
  const buys = trades.filter(t => t.type === 'buy');
  const sells = trades.filter(t => t.type === 'sell');
  const buyVolume = buys.reduce((s, t) => s + t.amount, 0);
  const sellVolume = sells.reduce((s, t) => s + t.amount, 0);
  const total = buyVolume + sellVolume;
  const score = total > 0 ? ((buyVolume - sellVolume) / total) * 100 : 0;
  const label = score > 20 ? 'bullish' : score < -20 ? 'bearish' : 'neutral';
  return { score: parseFloat(score.toFixed(2)), label, buyVolume, sellVolume };
}

describe('内部人集群分析引擎', () => {
  const makeTrade = (overrides: Partial<InsiderTrade> = {}): InsiderTrade => ({
    insider: 'Zhang', role: 'ceo', date: Date.now(), type: 'buy', shares: 10000, price: 50, amount: 500000, ...overrides,
  });

  describe('detectCluster', () => {
    it('should detect cluster of trades within window', () => {
      const now = Date.now();
      const trades = [
        makeTrade({ date: now }),
        makeTrade({ date: now + 86400000 * 5, insider: 'Li', role: 'director' }),
        makeTrade({ date: now + 86400000 * 10, insider: 'Wang', role: 'cfo' }),
      ];
      const result = detectCluster(trades, 30);
      expect(result.detected).toBe(true);
      expect(result.clusterSize).toBe(3);
      expect(result.direction).toBe('buy');
    });

    it('should not detect cluster for single trade', () => {
      expect(detectCluster([makeTrade()]).detected).toBe(false);
    });

    it('should handle mixed direction', () => {
      const now = Date.now();
      const trades = [
        makeTrade({ date: now, type: 'buy' }),
        makeTrade({ date: now + 86400000, type: 'sell', insider: 'Li' }),
      ];
      const result = detectCluster(trades, 30);
      expect(result.direction).toBe('mixed');
    });

    it('significance should increase with cluster size', () => {
      const now = Date.now();
      const small = detectCluster([
        makeTrade({ date: now }),
        makeTrade({ date: now + 86400000, insider: 'Li' }),
      ], 30);
      const large = detectCluster([
        makeTrade({ date: now }),
        makeTrade({ date: now + 86400000, insider: 'Li' }),
        makeTrade({ date: now + 86400000 * 2, insider: 'Wang' }),
        makeTrade({ date: now + 86400000 * 3, insider: 'Zhao' }),
      ], 30);
      expect(large.significance).toBeGreaterThan(small.significance);
    });
  });

  describe('analyzeByRole', () => {
    it('should group trades by role', () => {
      const trades = [
        makeTrade({ role: 'ceo', type: 'buy' }),
        makeTrade({ role: 'ceo', type: 'sell' }),
        makeTrade({ role: 'cfo', type: 'buy', insider: 'Li' }),
      ];
      const result = analyzeByRole(trades);
      expect(result.find(r => r.role === 'ceo')?.buyCount).toBe(1);
      expect(result.find(r => r.role === 'ceo')?.sellCount).toBe(1);
      expect(result.find(r => r.role === 'cfo')?.netDirection).toBe('buy');
    });
  });

  describe('calculateInsiderSentiment', () => {
    it('should return bullish for more buys', () => {
      const trades = [makeTrade({ type: 'buy', amount: 1000000 }), makeTrade({ type: 'sell', amount: 100000, insider: 'Li' })];
      const result = calculateInsiderSentiment(trades);
      expect(result.label).toBe('bullish');
      expect(result.score).toBeGreaterThan(0);
    });

    it('should return bearish for more sells', () => {
      const trades = [makeTrade({ type: 'sell', amount: 1000000 }), makeTrade({ type: 'buy', amount: 100000, insider: 'Li' })];
      const result = calculateInsiderSentiment(trades);
      expect(result.label).toBe('bearish');
    });

    it('should return neutral for balanced trades', () => {
      const trades = [makeTrade({ type: 'buy', amount: 500000 }), makeTrade({ type: 'sell', amount: 500000, insider: 'Li' })];
      const result = calculateInsiderSentiment(trades);
      expect(result.label).toBe('neutral');
    });
  });
});
