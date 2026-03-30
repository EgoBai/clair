import { describe, it, expect } from 'vitest';

// 大宗交易与机构行为分析引擎
describe('大宗交易与机构行为分析引擎', () => {
  interface BlockTrade {
    stock: string;
    price: number;
    volume: number;
    amount: number;
    buyer: string;
    seller: string;
    discount: number;
    date: string;
  }

  interface InstitutionalHoldings {
    stock: string;
    fundHoldings: number;
    qfiiHoldings: number;
    insuranceHoldings: number;
    socialSecurity: number;
    totalShares: number;
  }

  describe('大宗交易分析', () => {
    function discountAnalysis(trade: BlockTrade): { signal: string; strength: number } {
      if (trade.discount > 8) return { signal: '大幅折价卖出', strength: 0.9 };
      if (trade.discount > 5) return { signal: '折价卖出', strength: 0.7 };
      if (trade.discount > 2) return { signal: '小幅折价', strength: 0.4 };
      if (trade.discount > -2) return { signal: '平价成交', strength: 0.1 };
      if (trade.discount > -5) return { signal: '小幅溢价', strength: 0.3 };
      return { signal: '大幅溢价买入', strength: 0.8 };
    }

    function blockTradeConcentration(trades: BlockTrade[]): { stock: string; totalAmount: number }[] {
      const map = new Map<string, number>();
      trades.forEach(t => map.set(t.stock, (map.get(t.stock) || 0) + t.amount));
      return Array.from(map.entries())
        .map(([stock, totalAmount]) => ({ stock, totalAmount }))
        .sort((a, b) => b.totalAmount - a.totalAmount);
    }

    function sameDirectionTrades(trades: BlockTrade[]): { buyer: string; stocks: string[] }[] {
      const byBuyer = new Map<string, Set<string>>();
      trades.forEach(t => {
        if (!byBuyer.has(t.buyer)) byBuyer.set(t.buyer, new Set());
        byBuyer.get(t.buyer)!.add(t.stock);
      });
      return Array.from(byBuyer.entries())
        .filter(([_, stocks]) => stocks.size > 1)
        .map(([buyer, stocks]) => ({ buyer, stocks: Array.from(stocks) }));
    }

    it('大幅折价信号强', () => {
      const trade: BlockTrade = { stock: '000001', price: 10, volume: 1000000, amount: 10000000, buyer: '机构A', seller: '机构B', discount: 10, date: '2024-01-15' };
      const result = discountAnalysis(trade);
      expect(result.signal).toContain('折价');
      expect(result.strength).toBeGreaterThan(0.8);
    });

    it('溢价买入信号', () => {
      const trade: BlockTrade = { stock: '000001', price: 10, volume: 1000000, amount: 10000000, buyer: '机构A', seller: '机构B', discount: -6, date: '2024-01-15' };
      const result = discountAnalysis(trade);
      expect(result.signal).toContain('溢价');
    });

    it('平价成交信号弱', () => {
      const trade: BlockTrade = { stock: '000001', price: 10, volume: 1000000, amount: 10000000, buyer: '机构A', seller: '机构B', discount: 0, date: '2024-01-15' };
      const result = discountAnalysis(trade);
      expect(result.strength).toBeLessThan(0.5);
    });

    it('大宗交易集中度排序', () => {
      const trades: BlockTrade[] = [
        { stock: '000001', price: 10, volume: 100000, amount: 1000000, buyer: 'A', seller: 'B', discount: 3, date: '2024-01' },
        { stock: '000002', price: 20, volume: 200000, amount: 4000000, buyer: 'C', seller: 'D', discount: 2, date: '2024-01' },
        { stock: '000001', price: 10, volume: 150000, amount: 1500000, buyer: 'E', seller: 'F', discount: 4, date: '2024-01' },
      ];
      const result = blockTradeConcentration(trades);
      expect(result[0].stock).toBe('000002');
      expect(result[0].totalAmount).toBe(4000000);
    });

    it('同方向交易识别', () => {
      const trades: BlockTrade[] = [
        { stock: '000001', price: 10, volume: 100000, amount: 1000000, buyer: '机构A', seller: 'B', discount: 3, date: '2024-01' },
        { stock: '000002', price: 20, volume: 200000, amount: 4000000, buyer: '机构A', seller: 'D', discount: 2, date: '2024-01' },
      ];
      const result = sameDirectionTrades(trades);
      expect(result.length).toBe(1);
      expect(result[0].buyer).toBe('机构A');
      expect(result[0].stocks.length).toBe(2);
    });

    it('无同方向交易返回空', () => {
      const trades: BlockTrade[] = [
        { stock: '000001', price: 10, volume: 100000, amount: 1000000, buyer: 'A', seller: 'B', discount: 3, date: '2024-01' },
      ];
      expect(sameDirectionTrades(trades).length).toBe(0);
    });

    it('空交易列表', () => {
      expect(blockTradeConcentration([])).toEqual([]);
    });

    it('折价率范围合理', () => {
      const trade: BlockTrade = { stock: '000001', price: 10, volume: 100000, amount: 1000000, buyer: 'A', seller: 'B', discount: 15, date: '2024-01' };
      const result = discountAnalysis(trade);
      expect(result.strength).toBeLessThanOrEqual(1);
    });
  });

  describe('机构持仓分析', () => {
    function institutionalOwnershipRate(h: InstitutionalHoldings): number {
      return (h.fundHoldings + h.qfiiHoldings + h.insuranceHoldings + h.socialSecurity) / h.totalShares;
    }

    function ownershipChange(prev: InstitutionalHoldings, curr: InstitutionalHoldings): { changed: boolean; direction: 'increase' | 'decrease' | 'stable' } {
      const prevRate = institutionalOwnershipRate(prev);
      const currRate = institutionalOwnershipRate(curr);
      const diff = currRate - prevRate;
      if (Math.abs(diff) < 0.01) return { changed: false, direction: 'stable' };
      return { changed: true, direction: diff > 0 ? 'increase' : 'decrease' };
    }

    function concentratedOwnership(h: InstitutionalHoldings): { type: string; percentage: number }[] {
      const results: { type: string; percentage: number }[] = [];
      if (h.fundHoldings / h.totalShares > 0.1) results.push({ type: '公募基金', percentage: h.fundHoldings / h.totalShares });
      if (h.qfiiHoldings / h.totalShares > 0.05) results.push({ type: 'QFII', percentage: h.qfiiHoldings / h.totalShares });
      if (h.insuranceHoldings / h.totalShares > 0.05) results.push({ type: '保险', percentage: h.insuranceHoldings / h.totalShares });
      if (h.socialSecurity / h.totalShares > 0.03) results.push({ type: '社保', percentage: h.socialSecurity / h.totalShares });
      return results;
    }

    it('机构持股比例计算', () => {
      const h: InstitutionalHoldings = { stock: '000001', fundHoldings: 1000000, qfiiHoldings: 500000, insuranceHoldings: 300000, socialSecurity: 200000, totalShares: 10000000 };
      expect(institutionalOwnershipRate(h)).toBe(0.2);
    });

    it('机构增持', () => {
      const prev: InstitutionalHoldings = { stock: '000001', fundHoldings: 800000, qfiiHoldings: 400000, insuranceHoldings: 200000, socialSecurity: 100000, totalShares: 10000000 };
      const curr: InstitutionalHoldings = { stock: '000001', fundHoldings: 1200000, qfiiHoldings: 600000, insuranceHoldings: 300000, socialSecurity: 200000, totalShares: 10000000 };
      const result = ownershipChange(prev, curr);
      expect(result.direction).toBe('increase');
      expect(result.changed).toBe(true);
    });

    it('机构减持', () => {
      const prev: InstitutionalHoldings = { stock: '000001', fundHoldings: 1200000, qfiiHoldings: 600000, insuranceHoldings: 300000, socialSecurity: 200000, totalShares: 10000000 };
      const curr: InstitutionalHoldings = { stock: '000001', fundHoldings: 800000, qfiiHoldings: 400000, insuranceHoldings: 200000, socialSecurity: 100000, totalShares: 10000000 };
      expect(ownershipChange(prev, curr).direction).toBe('decrease');
    });

    it('小幅变动不触发', () => {
      const prev: InstitutionalHoldings = { stock: '000001', fundHoldings: 1000000, qfiiHoldings: 500000, insuranceHoldings: 300000, socialSecurity: 200000, totalShares: 10000000 };
      const curr: InstitutionalHoldings = { stock: '000001', fundHoldings: 1010000, qfiiHoldings: 505000, insuranceHoldings: 302000, socialSecurity: 201000, totalShares: 10000000 };
      expect(ownershipChange(prev, curr).changed).toBe(false);
    });

    it('集中持仓识别', () => {
      const h: InstitutionalHoldings = { stock: '000001', fundHoldings: 2000000, qfiiHoldings: 800000, insuranceHoldings: 100000, socialSecurity: 500000, totalShares: 10000000 };
      const result = concentratedOwnership(h);
      expect(result.find(r => r.type === '公募基金')).toBeDefined();
      expect(result.find(r => r.type === '社保')).toBeDefined();
    });

    it('无集中持仓', () => {
      const h: InstitutionalHoldings = { stock: '000001', fundHoldings: 50000, qfiiHoldings: 10000, insuranceHoldings: 10000, socialSecurity: 10000, totalShares: 10000000 };
      expect(concentratedOwnership(h).length).toBe(0);
    });

    it('零持仓比例为0', () => {
      const h: InstitutionalHoldings = { stock: '000001', fundHoldings: 0, qfiiHoldings: 0, insuranceHoldings: 0, socialSecurity: 0, totalShares: 10000000 };
      expect(institutionalOwnershipRate(h)).toBe(0);
    });
  });

  describe('北向资金分析', () => {
    interface NorthBound { date: string; netBuy: number; totalBuy: number; totalSell: number; }

    function northboundTrend(data: NorthBound[]): 'buying' | 'selling' | 'neutral' {
      const netFlow = data.reduce((s, d) => s + d.netBuy, 0);
      if (netFlow > 1e9) return 'buying';
      if (netFlow < -1e9) return 'selling';
      return 'neutral';
    }

    function consecutiveDays(data: NorthBound[], direction: 'buy' | 'sell'): number {
      let count = 0;
      for (let i = data.length - 1; i >= 0; i--) {
        if (direction === 'buy' && data[i].netBuy > 0) count++;
        else if (direction === 'sell' && data[i].netBuy < 0) count++;
        else break;
      }
      return count;
    }

    function northboundMomentum(data: NorthBound[], window: number): number {
      const recent = data.slice(-window);
      if (recent.length === 0) return 0;
      return recent.reduce((s, d) => s + d.netBuy, 0) / recent.length;
    }

    it('北向净买入趋势', () => {
      const data: NorthBound[] = [
        { date: '01-01', netBuy: 2e9, totalBuy: 5e9, totalSell: 3e9 },
        { date: '01-02', netBuy: 1.5e9, totalBuy: 4.5e9, totalSell: 3e9 },
        { date: '01-03', netBuy: 1e9, totalBuy: 4e9, totalSell: 3e9 },
      ];
      expect(northboundTrend(data)).toBe('buying');
    });

    it('北向净卖出趋势', () => {
      const data: NorthBound[] = [
        { date: '01-01', netBuy: -2e9, totalBuy: 3e9, totalSell: 5e9 },
        { date: '01-02', netBuy: -1.5e9, totalBuy: 3e9, totalSell: 4.5e9 },
        { date: '01-03', netBuy: -1e9, totalBuy: 3e9, totalSell: 4e9 },
      ];
      expect(northboundTrend(data)).toBe('selling');
    });

    it('连续买入天数', () => {
      const data: NorthBound[] = [
        { date: '01-01', netBuy: -1e8, totalBuy: 1e9, totalSell: 1.1e9 },
        { date: '01-02', netBuy: 1e8, totalBuy: 1.1e9, totalSell: 1e9 },
        { date: '01-03', netBuy: 2e8, totalBuy: 1.2e9, totalSell: 1e9 },
        { date: '01-04', netBuy: 3e8, totalBuy: 1.3e9, totalSell: 1e9 },
      ];
      expect(consecutiveDays(data, 'buy')).toBe(3);
    });

    it('连续卖出天数', () => {
      const data: NorthBound[] = [
        { date: '01-01', netBuy: 1e8, totalBuy: 1e9, totalSell: 0.9e9 },
        { date: '01-02', netBuy: -1e8, totalBuy: 0.9e9, totalSell: 1e9 },
        { date: '01-03', netBuy: -2e8, totalBuy: 0.8e9, totalSell: 1e9 },
      ];
      expect(consecutiveDays(data, 'sell')).toBe(2);
    });

    it('北向动量计算', () => {
      const data: NorthBound[] = [
        { date: '01-01', netBuy: 1e9, totalBuy: 3e9, totalSell: 2e9 },
        { date: '01-02', netBuy: 2e9, totalBuy: 4e9, totalSell: 2e9 },
        { date: '01-03', netBuy: 3e9, totalBuy: 5e9, totalSell: 2e9 },
      ];
      expect(northboundMomentum(data, 2)).toBe(2.5e9);
    });

    it('空数据动量为0', () => {
      expect(northboundMomentum([], 5)).toBe(0);
    });

    it('空数据趋势中性', () => {
      expect(northboundTrend([])).toBe('neutral');
    });
  });

  describe('龙虎榜分析', () => {
    interface LongHuEntry { stock: string; seat: string; buyAmount: number; sellAmount: number; netAmount: number; type: 'institutional' | 'broker' | 'hot_money'; }

    function topSeatsAnalysis(entries: LongHuEntry[]): { topBuyers: string[]; topSellers: string[] } {
      const bySeatBuy = new Map<string, number>();
      const bySeatSell = new Map<string, number>();
      entries.forEach(e => {
        bySeatBuy.set(e.seat, (bySeatBuy.get(e.seat) || 0) + e.buyAmount);
        bySeatSell.set(e.seat, (bySeatSell.get(e.seat) || 0) + e.sellAmount);
      });
      return {
        topBuyers: Array.from(bySeatBuy.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]),
        topSellers: Array.from(bySeatSell.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]),
      };
    }

    function institutionalVsRetail(entries: LongHuEntry[]): { inst: number; retail: number; hotMoney: number } {
      return {
        inst: entries.filter(e => e.type === 'institutional').reduce((s, e) => s + e.netAmount, 0),
        retail: entries.filter(e => e.type === 'broker').reduce((s, e) => s + e.netAmount, 0),
        hotMoney: entries.filter(e => e.type === 'hot_money').reduce((s, e) => s + e.netAmount, 0),
      };
    }

    it('龙虎榜买卖席位排序', () => {
      const entries: LongHuEntry[] = [
        { stock: '000001', seat: '机构专用', buyAmount: 50000000, sellAmount: 10000000, netAmount: 40000000, type: 'institutional' },
        { stock: '000001', seat: '东方财富拉萨', buyAmount: 20000000, sellAmount: 30000000, netAmount: -10000000, type: 'hot_money' },
        { stock: '000001', seat: '华泰深圳', buyAmount: 30000000, sellAmount: 5000000, netAmount: 25000000, type: 'broker' },
      ];
      const result = topSeatsAnalysis(entries);
      expect(result.topBuyers[0]).toBe('机构专用');
    });

    it('机构vs游资对比', () => {
      const entries: LongHuEntry[] = [
        { stock: '000001', seat: '机构专用', buyAmount: 50000000, sellAmount: 10000000, netAmount: 40000000, type: 'institutional' },
        { stock: '000001', seat: '东方财富拉萨', buyAmount: 20000000, sellAmount: 30000000, netAmount: -10000000, type: 'hot_money' },
      ];
      const result = institutionalVsRetail(entries);
      expect(result.inst).toBeGreaterThan(0);
      expect(result.hotMoney).toBeLessThan(0);
    });

    it('空龙虎榜数据', () => {
      const result = topSeatsAnalysis([]);
      expect(result.topBuyers).toEqual([]);
      expect(result.topSellers).toEqual([]);
    });

    it('机构净买入为正', () => {
      const entries: LongHuEntry[] = [
        { stock: '000001', seat: '机构A', buyAmount: 100000000, sellAmount: 20000000, netAmount: 80000000, type: 'institutional' },
      ];
      expect(institutionalVsRetail(entries).inst).toBe(80000000);
    });
  });
});
