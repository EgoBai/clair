import { describe, it, expect } from 'vitest';

// 市场情绪分析引擎测试
describe('市场情绪分析引擎', () => {
  describe('涨跌比分析', () => {
    function advanceDeclineRatio(advances: number, declines: number): { ratio: number; signal: string } {
      if (declines === 0) return { ratio: Infinity, signal: '极度乐观' };
      const ratio = advances / declines;
      if (ratio > 3) return { ratio, signal: '极度乐观' };
      if (ratio > 1.5) return { ratio, signal: '乐观' };
      if (ratio > 0.67) return { ratio, signal: '中性' };
      if (ratio > 0.33) return { ratio, signal: '悲观' };
      return { ratio, signal: '极度悲观' };
    }

    it('涨远多于跌为极度乐观', () => {
      expect(advanceDeclineRatio(900, 100).signal).toBe('极度乐观');
    });

    it('跌远多于涨为极度悲观', () => {
      expect(advanceDeclineRatio(100, 900).signal).toBe('极度悲观');
    });

    it('均衡为中性', () => {
      expect(advanceDeclineRatio(500, 500).signal).toBe('中性');
    });

    it('跌为零返回无穷比', () => {
      expect(advanceDeclineRatio(100, 0).ratio).toBe(Infinity);
    });
  });

  describe('恐慌贪婪指数', () => {
    function fearGreedIndex(metrics: {
      momentum: number;    // -1 to 1
      volatility: number;  // 0 to 1 (inverse)
      breadth: number;     // -1 to 1
      putCallRatio: number; // 0 to 2
      junkBondDemand: number; // -1 to 1
    }): { score: number; label: string } {
      const volScore = 1 - metrics.volatility;
      const pcrScore = Math.max(0, Math.min(1, 1 - (metrics.putCallRatio - 0.5) / 1));
      const raw = (metrics.momentum * 0.25 + volScore * 0.2 + metrics.breadth * 0.2 + pcrScore * 0.2 + metrics.junkBondDemand * 0.15);
      const score = Math.max(0, Math.min(100, (raw + 1) * 50));
      let label = '中性';
      if (score > 80) label = '极度贪婪';
      else if (score > 60) label = '贪婪';
      else if (score < 20) label = '极度恐慌';
      else if (score < 40) label = '恐慌';
      return { score, label };
    }

    it('所有正向指标为贪婪', () => {
      const result = fearGreedIndex({ momentum: 1, volatility: 0, breadth: 1, putCallRatio: 0.5, junkBondDemand: 1 });
      expect(result.score).toBeGreaterThan(80);
    });

    it('所有负向指标为恐慌', () => {
      const result = fearGreedIndex({ momentum: -1, volatility: 1, breadth: -1, putCallRatio: 2, junkBondDemand: -1 });
      expect(result.score).toBeLessThanOrEqual(20);
    });

    it('分数在0-100之间', () => {
      const result = fearGreedIndex({ momentum: 0.2, volatility: 0.5, breadth: 0.1, putCallRatio: 0.8, junkBondDemand: 0 });
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  describe('资金流向分析', () => {
    interface FlowData { inflow: number; outflow: number; }

    function moneyFlow(data: FlowData[]): { netFlow: number; flowTrend: 'in' | 'out' | 'neutral'; accumulation: number } {
      const netFlow = data.reduce((s, d) => s + d.inflow - d.outflow, 0);
      const flowTrend = netFlow > 0 ? 'in' : netFlow < 0 ? 'out' : 'neutral';
      let accumulation = 0;
      for (const d of data) {
        const total = d.inflow + d.outflow;
        if (total > 0) accumulation += (d.inflow - d.outflow) / total;
      }
      return { netFlow, flowTrend, accumulation };
    }

    it('净流入为正', () => {
      const data: FlowData[] = [{ inflow: 100, outflow: 50 }, { inflow: 80, outflow: 30 }];
      expect(moneyFlow(data).netFlow).toBe(100);
      expect(moneyFlow(data).flowTrend).toBe('in');
    });

    it('净流出为负', () => {
      const data: FlowData[] = [{ inflow: 30, outflow: 80 }];
      expect(moneyFlow(data).netFlow).toBe(-50);
      expect(moneyFlow(data).flowTrend).toBe('out');
    });

    it('空数据为零', () => {
      expect(moneyFlow([]).netFlow).toBe(0);
    });

    it('累积资金流向在-1到1之间', () => {
      const data: FlowData[] = [{ inflow: 100, outflow: 50 }, { inflow: 30, outflow: 80 }];
      const result = moneyFlow(data);
      expect(result.accumulation).toBeGreaterThanOrEqual(-1);
      expect(result.accumulation).toBeLessThanOrEqual(1);
    });
  });

  describe('板块轮动检测', () => {
    interface SectorReturn { name: string; returns: number[]; }

    function detectRotation(sectors: SectorReturn[], window: number): { leaders: string[]; laggards: string[] } {
      const recentReturns = sectors.map(s => ({
        name: s.name,
        avgReturn: s.returns.slice(-window).reduce((a, b) => a + b, 0) / window,
      }));
      recentReturns.sort((a, b) => b.avgReturn - a.avgReturn);
      return {
        leaders: recentReturns.slice(0, 3).map(s => s.name),
        laggards: recentReturns.slice(-3).reverse().map(s => s.name),
      };
    }

    it('识别领涨板块', () => {
      const sectors: SectorReturn[] = [
        { name: '科技', returns: [0.02, 0.03, 0.01] },
        { name: '金融', returns: [-0.01, 0.01, 0.02] },
        { name: '消费', returns: [0.01, 0.01, 0.01] },
        { name: '医药', returns: [-0.02, -0.01, 0] },
      ];
      const result = detectRotation(sectors, 3);
      expect(result.leaders[0]).toBe('科技');
    });

    it('识别领跌板块', () => {
      const sectors: SectorReturn[] = [
        { name: '科技', returns: [0.02, 0.03, 0.01] },
        { name: '医药', returns: [-0.02, -0.01, 0] },
      ];
      const result = detectRotation(sectors, 3);
      expect(result.laggards).toContain('医药');
    });
  });

  describe('情绪指标技术指标', () => {
    function putCallSignal(putVolume: number, callVolume: number): { pcr: number; signal: string } {
      const pcr = callVolume === 0 ? Infinity : putVolume / callVolume;
      let signal = '中性';
      if (pcr > 1.2) signal = '看跌过度(反向看涨)';
      else if (pcr > 0.8) signal = '中性';
      else signal = '看涨过度(反向看跌)';
      return { pcr, signal };
    }

    it('高PCR表示看跌过度', () => {
      expect(putCallSignal(120, 80).signal).toContain('看跌过度');
    });

    it('低PCR表示看涨过度', () => {
      expect(putCallSignal(40, 100).signal).toContain('看涨过度');
    });

    it('call为零PCR无穷大', () => {
      expect(putCallSignal(100, 0).pcr).toBe(Infinity);
    });
  });

  describe('散户情绪指数', () => {
    function retailSentiment(buyOrders: number, sellOrders: number, newAccounts: number, avgHoldingDays: number): {
      score: number;
      interpretation: string;
    } {
      const buyRatio = buyOrders + sellOrders === 0 ? 0.5 : buyOrders / (buyOrders + sellOrders);
      const newAccountScore = Math.min(newAccounts / 10000, 1);
      const holdingScore = Math.min(avgHoldingDays / 365, 1);
      const score = buyRatio * 40 + newAccountScore * 30 + (1 - holdingScore) * 30;
      let interpretation = '中性';
      if (score > 70) interpretation = '散户极度乐观(注意风险)';
      else if (score > 55) interpretation = '散户偏乐观';
      else if (score < 30) interpretation = '散户极度悲观(关注机会)';
      else if (score < 45) interpretation = '散户偏悲观';
      return { score, interpretation };
    }

    it('大量买入+新户为极度乐观', () => {
      const result = retailSentiment(900, 100, 20000, 10);
      expect(result.score).toBeGreaterThan(70);
    });

    it('大量卖出+短线为极度悲观', () => {
      const result = retailSentiment(100, 900, 100, 365);
      expect(result.score).toBeLessThan(45);
    });

    it('分数在0-100之间', () => {
      const result = retailSentiment(500, 500, 5000, 100);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });
});
