import { describe, it, expect } from 'vitest';

// 指数计算与板块分析引擎
describe('指数计算与板块分析引擎', () => {
  describe('市值加权指数', () => {
    interface Stock { price: number; shares: number; prevPrice: number; }

    function marketCapWeightedIndex(stocks: Stock[], baseIndex = 1000): number {
      const totalCurrentCap = stocks.reduce((s, st) => s + st.price * st.shares, 0);
      const totalBaseCap = stocks.reduce((s, st) => s + st.prevPrice * st.shares, 0);
      return totalBaseCap === 0 ? baseIndex : (totalCurrentCap / totalBaseCap) * baseIndex;
    }

    it('价格不变指数不变', () => {
      const stocks = [{ price: 10, shares: 1000, prevPrice: 10 }, { price: 20, shares: 500, prevPrice: 20 }];
      expect(marketCapWeightedIndex(stocks)).toBe(1000);
    });

    it('全部上涨指数上升', () => {
      const stocks = [{ price: 11, shares: 1000, prevPrice: 10 }, { price: 22, shares: 500, prevPrice: 20 }];
      expect(marketCapWeightedIndex(stocks)).toBeGreaterThan(1000);
    });

    it('全部下跌指数下降', () => {
      const stocks = [{ price: 9, shares: 1000, prevPrice: 10 }, { price: 18, shares: 500, prevPrice: 20 }];
      expect(marketCapWeightedIndex(stocks)).toBeLessThan(1000);
    });

    it('空成分股返回基准值', () => {
      expect(marketCapWeightedIndex([])).toBe(1000);
    });

    it('大盘股影响更大', () => {
      const stocks1 = [{ price: 11, shares: 1000000, prevPrice: 10 }, { price: 20, shares: 100, prevPrice: 20 }];
      const stocks2 = [{ price: 10, shares: 1000000, prevPrice: 10 }, { price: 22, shares: 100, prevPrice: 20 }];
      const idx1 = marketCapWeightedIndex(stocks1);
      const idx2 = marketCapWeightedIndex(stocks2);
      expect(idx1).toBeGreaterThan(idx2);
    });

    it('等权重涨跌幅不同', () => {
      const stocks = [{ price: 12, shares: 100, prevPrice: 10 }, { price: 19, shares: 100, prevPrice: 20 }];
      const idx = marketCapWeightedIndex(stocks);
      expect(idx).not.toBe(1000);
    });
  });

  describe('等权重指数', () => {
    function equalWeightedIndex(returns: number[], baseIndex = 1000): number {
      if (returns.length === 0) return baseIndex;
      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      return baseIndex * (1 + avgReturn);
    }

    it('零收益率指数不变', () => {
      expect(equalWeightedIndex([0, 0, 0])).toBe(1000);
    });

    it('正收益率指数上升', () => {
      expect(equalWeightedIndex([0.01, 0.02, 0.03])).toBeGreaterThan(1000);
    });

    it('负收益率指数下降', () => {
      expect(equalWeightedIndex([-0.01, -0.02, -0.03])).toBeLessThan(1000);
    });

    it('空数组返回基准值', () => {
      expect(equalWeightedIndex([])).toBe(1000);
    });

    it('混合收益正确计算', () => {
      const idx = equalWeightedIndex([0.05, -0.05, 0]);
      expect(idx).toBe(1000);
    });

    it('自定义基准值', () => {
      expect(equalWeightedIndex([0.1], 500)).toBe(550);
    });
  });

  describe('板块涨跌统计', () => {
    interface SectorData { name: string; stocks: { change: number }[]; }

    function sectorStats(sectors: SectorData[]): { name: string; avgChange: number; upCount: number; downCount: number }[] {
      return sectors.map(s => {
        const changes = s.stocks.map(st => st.change);
        return {
          name: s.name,
          avgChange: changes.reduce((a, b) => a + b, 0) / changes.length,
          upCount: changes.filter(c => c > 0).length,
          downCount: changes.filter(c => c < 0).length,
        };
      });
    }

    it('统计板块平均涨跌幅', () => {
      const sectors = [{ name: '科技', stocks: [{ change: 0.02 }, { change: 0.04 }] }];
      const result = sectorStats(sectors);
      expect(result[0].avgChange).toBeCloseTo(0.03, 5);
    });

    it('统计上涨家数', () => {
      const sectors = [{ name: '银行', stocks: [{ change: 0.01 }, { change: -0.02 }, { change: 0.03 }] }];
      const result = sectorStats(sectors);
      expect(result[0].upCount).toBe(2);
    });

    it('统计下跌家数', () => {
      const sectors = [{ name: '医药', stocks: [{ change: -0.01 }, { change: -0.02 }, { change: 0.03 }] }];
      const result = sectorStats(sectors);
      expect(result[0].downCount).toBe(2);
    });

    it('空板块返回空数组', () => {
      expect(sectorStats([])).toEqual([]);
    });

    it('单股板块', () => {
      const sectors = [{ name: '测试', stocks: [{ change: 0.05 }] }];
      const result = sectorStats(sectors);
      expect(result[0].avgChange).toBe(0.05);
      expect(result[0].upCount).toBe(1);
    });

    it('多板块同时统计', () => {
      const sectors = [
        { name: 'A', stocks: [{ change: 0.01 }] },
        { name: 'B', stocks: [{ change: -0.01 }] },
      ];
      expect(sectorStats(sectors)).toHaveLength(2);
    });
  });

  describe('沪深港通资金流', () => {
    function northboundFlow(trades: { amount: number; type: 'buy' | 'sell' }[]): { netFlow: number; buyTotal: number; sellTotal: number } {
      const buyTotal = trades.filter(t => t.type === 'buy').reduce((s, t) => s + t.amount, 0);
      const sellTotal = trades.filter(t => t.type === 'sell').reduce((s, t) => s + t.amount, 0);
      return { netFlow: buyTotal - sellTotal, buyTotal, sellTotal };
    }

    it('净流入为正', () => {
      const trades = [{ amount: 100, type: 'buy' as const }, { amount: 50, type: 'sell' as const }];
      expect(northboundFlow(trades).netFlow).toBe(50);
    });

    it('净流出为负', () => {
      const trades = [{ amount: 50, type: 'buy' as const }, { amount: 100, type: 'sell' as const }];
      expect(northboundFlow(trades).netFlow).toBe(-50);
    });

    it('空交易列表', () => {
      const result = northboundFlow([]);
      expect(result.netFlow).toBe(0);
      expect(result.buyTotal).toBe(0);
    });

    it('单边买入', () => {
      const trades = [{ amount: 100, type: 'buy' as const }];
      expect(northboundFlow(trades).netFlow).toBe(100);
    });

    it('买卖均衡净流入为0', () => {
      const trades = [{ amount: 50, type: 'buy' as const }, { amount: 50, type: 'sell' as const }];
      expect(northboundFlow(trades).netFlow).toBe(0);
    });
  });

  describe('融资融券分析', () => {
    function marginAnalysis(data: { date: string; marginBuy: number; marginSell: number; shortSell: number; shortCover: number }[]): { netMargin: number; netShort: number; marginBalance: number } {
      const totalBuy = data.reduce((s, d) => s + d.marginBuy, 0);
      const totalSell = data.reduce((s, d) => s + d.marginSell, 0);
      const totalShort = data.reduce((s, d) => s + d.shortSell, 0);
      const totalCover = data.reduce((s, d) => s + d.shortCover, 0);
      return {
        netMargin: totalBuy - totalSell,
        netShort: totalShort - totalCover,
        marginBalance: totalBuy - totalSell + totalCover - totalShort,
      };
    }

    it('融资净买入为正', () => {
      const data = [{ date: '2024-01-15', marginBuy: 100, marginSell: 50, shortSell: 10, shortCover: 20 }];
      expect(marginAnalysis(data).netMargin).toBe(50);
    });

    it('融券净卖出为正', () => {
      const data = [{ date: '2024-01-15', marginBuy: 100, marginSell: 50, shortSell: 30, shortCover: 10 }];
      expect(marginAnalysis(data).netShort).toBe(20);
    });

    it('空数据返回零', () => {
      expect(marginAnalysis([]).netMargin).toBe(0);
    });

    it('多日累加', () => {
      const data = [
        { date: '2024-01-15', marginBuy: 100, marginSell: 50, shortSell: 10, shortCover: 20 },
        { date: '2024-01-16', marginBuy: 80, marginSell: 60, shortSell: 5, shortCover: 15 },
      ];
      expect(marginAnalysis(data).netMargin).toBe(70);
    });

    it('余额计算正确', () => {
      const data = [{ date: '2024-01-15', marginBuy: 100, marginSell: 30, shortSell: 20, shortCover: 10 }];
      const result = marginAnalysis(data);
      expect(result.marginBalance).toBe(result.netMargin - result.netShort);
    });
  });

  describe('涨跌家数统计', () => {
    function advanceDecline(changes: number[]): { advances: number; declines: number; unchanged: number; adLine: number } {
      const advances = changes.filter(c => c > 0).length;
      const declines = changes.filter(c => c < 0).length;
      const unchanged = changes.filter(c => c === 0).length;
      return { advances, declines, unchanged, adLine: advances - declines };
    }

    it('全部上涨', () => {
      const result = advanceDecline([0.01, 0.02, 0.03]);
      expect(result.advances).toBe(3);
      expect(result.declines).toBe(0);
    });

    it('全部下跌', () => {
      const result = advanceDecline([-0.01, -0.02, -0.03]);
      expect(result.advances).toBe(0);
      expect(result.declines).toBe(3);
    });

    it('涨跌各半', () => {
      const result = advanceDecline([0.01, -0.01, 0.02, -0.02]);
      expect(result.advances).toBe(2);
      expect(result.declines).toBe(2);
      expect(result.adLine).toBe(0);
    });

    it('空数组', () => {
      const result = advanceDecline([]);
      expect(result.advances).toBe(0);
      expect(result.unchanged).toBe(0);
    });

    it('包含平盘', () => {
      const result = advanceDecline([0.01, 0, -0.01, 0]);
      expect(result.unchanged).toBe(2);
    });

    it('AD线为涨跌差', () => {
      const result = advanceDecline([0.01, 0.02, -0.01]);
      expect(result.adLine).toBe(1);
    });
  });

  describe('ETF溢价率', () => {
    function etfPremium(price: number, nav: number): number {
      return nav === 0 ? 0 : ((price - nav) / nav) * 100;
    }

    it('溢价率为正', () => {
      expect(etfPremium(101, 100)).toBe(1);
    });

    it('折价率为负', () => {
      expect(etfPremium(99, 100)).toBe(-1);
    });

    it('平价为零', () => {
      expect(etfPremium(100, 100)).toBe(0);
    });

    it('零净值返回0', () => {
      expect(etfPremium(100, 0)).toBe(0);
    });

    it('高溢价', () => {
      expect(etfPremium(110, 100)).toBe(10);
    });

    it('深度折价', () => {
      expect(etfPremium(90, 100)).toBe(-10);
    });
  });
});
