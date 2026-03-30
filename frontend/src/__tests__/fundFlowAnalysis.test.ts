import { describe, it, expect } from 'vitest';

// 资金流向分析引擎
describe('资金流向分析引擎', () => {
  interface FlowRecord { symbol: string; amount: number; direction: 'in' | 'out'; timestamp: number; type: 'main' | 'retail' | 'institutional' }

  function calcNetFlow(records: FlowRecord[]): number {
    return records.reduce((sum, r) => sum + (r.direction === 'in' ? r.amount : -r.amount), 0);
  }

  function groupByDirection(records: FlowRecord[]) {
    const inflow = records.filter(r => r.direction === 'in').reduce((s, r) => s + r.amount, 0);
    const outflow = records.filter(r => r.direction === 'out').reduce((s, r) => s + r.amount, 0);
    return { inflow, outflow, net: inflow - outflow };
  }

  function flowByType(records: FlowRecord[]) {
    const map: Record<string, { in: number; out: number }> = {};
    for (const r of records) {
      if (!map[r.type]) map[r.type] = { in: 0, out: 0 };
      if (r.direction === 'in') map[r.type]!.in += r.amount;
      else map[r.type]!.out += r.amount;
    }
    return map;
  }

  function dominantFlow(records: FlowRecord[]): 'in' | 'out' | 'neutral' {
    const { net } = groupByDirection(records);
    return net > 0 ? 'in' : net < 0 ? 'out' : 'neutral';
  }

  function flowMomentum(records: FlowRecord[], windowSize: number = 3): number[] {
    const sorted = [...records].sort((a, b) => a.timestamp - b.timestamp);
    const nets: number[] = sorted.map(r => r.direction === 'in' ? r.amount : -r.amount);
    const momentum: number[] = [];
    for (let i = 0; i < nets.length; i++) {
      const start = Math.max(0, i - windowSize + 1);
      const window = nets.slice(start, i + 1);
      momentum.push(window.reduce((s, v) => s + v, 0) / window.length);
    }
    return momentum;
  }

  function detectAbnormalFlow(records: FlowRecord[], threshold: number): FlowRecord[] {
    const avg = records.reduce((s, r) => s + r.amount, 0) / records.length;
    return records.filter(r => r.amount > avg * threshold);
  }

  it('应正确计算净流入', () => {
    const records: FlowRecord[] = [
      { symbol: '600000', amount: 1000, direction: 'in', timestamp: 1, type: 'main' },
      { symbol: '600000', amount: 300, direction: 'out', timestamp: 2, type: 'retail' },
    ];
    expect(calcNetFlow(records)).toBe(700);
  });

  it('空记录净流入应为0', () => {
    expect(calcNetFlow([])).toBe(0);
  });

  it('全部流出应返回负净流入', () => {
    const records: FlowRecord[] = [
      { symbol: '600000', amount: 500, direction: 'out', timestamp: 1, type: 'main' },
      { symbol: '600000', amount: 200, direction: 'out', timestamp: 2, type: 'retail' },
    ];
    expect(calcNetFlow(records)).toBe(-700);
  });

  it('应按方向分组', () => {
    const records: FlowRecord[] = [
      { symbol: '000001', amount: 5000, direction: 'in', timestamp: 1, type: 'institutional' },
      { symbol: '000001', amount: 2000, direction: 'out', timestamp: 2, type: 'retail' },
    ];
    const result = groupByDirection(records);
    expect(result.inflow).toBe(5000);
    expect(result.outflow).toBe(2000);
    expect(result.net).toBe(3000);
  });

  it('应按资金类型分组', () => {
    const records: FlowRecord[] = [
      { symbol: '600000', amount: 1000, direction: 'in', timestamp: 1, type: 'main' },
      { symbol: '600000', amount: 500, direction: 'out', timestamp: 2, type: 'main' },
      { symbol: '600000', amount: 800, direction: 'in', timestamp: 3, type: 'retail' },
    ];
    const byType = flowByType(records);
    expect(byType['main']!.in).toBe(1000);
    expect(byType['main']!.out).toBe(500);
    expect(byType['retail']!.in).toBe(800);
  });

  it('应判断主导方向', () => {
    expect(dominantFlow([
      { symbol: 'x', amount: 100, direction: 'in', timestamp: 1, type: 'main' },
      { symbol: 'x', amount: 50, direction: 'out', timestamp: 2, type: 'main' },
    ])).toBe('in');
  });

  it('净流出应判断正确', () => {
    expect(dominantFlow([
      { symbol: 'x', amount: 100, direction: 'out', timestamp: 1, type: 'main' },
    ])).toBe('out');
  });

  it('均衡应返回neutral', () => {
    expect(dominantFlow([
      { symbol: 'x', amount: 100, direction: 'in', timestamp: 1, type: 'main' },
      { symbol: 'x', amount: 100, direction: 'out', timestamp: 2, type: 'main' },
    ])).toBe('neutral');
  });

  it('应计算资金动量', () => {
    const records: FlowRecord[] = [
      { symbol: 'x', amount: 100, direction: 'in', timestamp: 1, type: 'main' },
      { symbol: 'x', amount: 200, direction: 'in', timestamp: 2, type: 'main' },
      { symbol: 'x', amount: 50, direction: 'out', timestamp: 3, type: 'main' },
    ];
    const momentum = flowMomentum(records, 2);
    expect(momentum).toHaveLength(3);
    expect(momentum[0]).toBe(100);
    expect(momentum[2]).toBe(75);
  });

  it('应检测异常资金流', () => {
    const records: FlowRecord[] = [
      { symbol: 'x', amount: 100, direction: 'in', timestamp: 1, type: 'main' },
      { symbol: 'x', amount: 100, direction: 'in', timestamp: 2, type: 'main' },
      { symbol: 'x', amount: 100, direction: 'in', timestamp: 3, type: 'main' },
      { symbol: 'x', amount: 500, direction: 'in', timestamp: 4, type: 'main' },
    ];
    const abnormal = detectAbnormalFlow(records, 2);
    expect(abnormal).toHaveLength(1);
    expect(abnormal[0]!.amount).toBe(500);
  });

  it('大量记录应正确处理', () => {
    const records: FlowRecord[] = Array.from({ length: 1000 }, (_, i) => ({
      symbol: 'x', amount: i + 1, direction: i % 2 === 0 ? 'in' : 'out' as const,
      timestamp: i, type: 'main' as const,
    }));
    const { net } = groupByDirection(records);
    expect(typeof net).toBe('number');
  });

  it('单笔记录应正确处理', () => {
    const records: FlowRecord[] = [
      { symbol: '600000', amount: 9999, direction: 'in', timestamp: 1, type: 'institutional' },
    ];
    expect(calcNetFlow(records)).toBe(9999);
    expect(dominantFlow(records)).toBe('in');
  });
});

// 板块分析引擎
describe('板块分析引擎', () => {
  interface Sector { name: string; stocks: string[]; avgChange: number; turnover: number; marketCap: number }

  function rankByChange(sectors: Sector[]): Sector[] {
    return [...sectors].sort((a, b) => b.avgChange - a.avgChange);
  }

  function rankByTurnover(sectors: Sector[]): Sector[] {
    return [...sectors].sort((a, b) => b.turnover - a.turnover);
  }

  function findHotSectors(sectors: Sector[], threshold: number): Sector[] {
    return sectors.filter(s => s.avgChange > threshold);
  }

  function sectorCorrelation(s1: Sector, s2: Sector): number {
    const common = s1.stocks.filter(s => s2.stocks.includes(s));
    const union = new Set([...s1.stocks, ...s2.stocks]).size;
    return union === 0 ? 0 : common.length / union;
  }

  function sectorIndex(sectors: Sector[]): number {
    if (sectors.length === 0) return 0;
    const totalWeight = sectors.reduce((s, sec) => s + sec.marketCap, 0);
    return sectors.reduce((s, sec) => s + sec.avgChange * (sec.marketCap / totalWeight), 0);
  }

  it('应按涨跌幅排序', () => {
    const sectors: Sector[] = [
      { name: '科技', stocks: ['001'], avgChange: 2.5, turnover: 100, marketCap: 1000 },
      { name: '银行', stocks: ['002'], avgChange: -1.2, turnover: 80, marketCap: 2000 },
      { name: '医药', stocks: ['003'], avgChange: 3.1, turnover: 120, marketCap: 500 },
    ];
    const ranked = rankByChange(sectors);
    expect(ranked[0]!.name).toBe('医药');
    expect(ranked[2]!.name).toBe('银行');
  });

  it('应按成交额排序', () => {
    const sectors: Sector[] = [
      { name: 'A', stocks: [], avgChange: 1, turnover: 50, marketCap: 100 },
      { name: 'B', stocks: [], avgChange: 1, turnover: 200, marketCap: 100 },
    ];
    expect(rankByTurnover(sectors)[0]!.name).toBe('B');
  });

  it('应找到热门板块', () => {
    const sectors: Sector[] = [
      { name: 'A', stocks: [], avgChange: 5, turnover: 0, marketCap: 0 },
      { name: 'B', stocks: [], avgChange: -2, turnover: 0, marketCap: 0 },
      { name: 'C', stocks: [], avgChange: 3, turnover: 0, marketCap: 0 },
    ];
    expect(findHotSectors(sectors, 2)).toHaveLength(2);
  });

  it('应计算板块相关性', () => {
    const s1: Sector = { name: 'A', stocks: ['001', '002', '003'], avgChange: 0, turnover: 0, marketCap: 0 };
    const s2: Sector = { name: 'B', stocks: ['002', '003', '004'], avgChange: 0, turnover: 0, marketCap: 0 };
    expect(sectorCorrelation(s1, s2)).toBeCloseTo(2 / 4);
  });

  it('无共同股票相关性应为0', () => {
    const s1: Sector = { name: 'A', stocks: ['001'], avgChange: 0, turnover: 0, marketCap: 0 };
    const s2: Sector = { name: 'B', stocks: ['002'], avgChange: 0, turnover: 0, marketCap: 0 };
    expect(sectorCorrelation(s1, s2)).toBe(0);
  });

  it('应计算板块指数', () => {
    const sectors: Sector[] = [
      { name: 'A', stocks: [], avgChange: 2, turnover: 0, marketCap: 100 },
      { name: 'B', stocks: [], avgChange: 4, turnover: 0, marketCap: 100 },
    ];
    expect(sectorIndex(sectors)).toBe(3);
  });

  it('加权板块指数应正确', () => {
    const sectors: Sector[] = [
      { name: 'A', stocks: [], avgChange: 2, turnover: 0, marketCap: 300 },
      { name: 'B', stocks: [], avgChange: 8, turnover: 0, marketCap: 100 },
    ];
    expect(sectorIndex(sectors)).toBe(3.5);
  });

  it('空板块列表应返回0', () => {
    expect(sectorIndex([])).toBe(0);
  });

  it('排序不应修改原数组', () => {
    const sectors: Sector[] = [
      { name: 'A', stocks: [], avgChange: 1, turnover: 100, marketCap: 0 },
      { name: 'B', stocks: [], avgChange: 3, turnover: 200, marketCap: 0 },
    ];
    rankByChange(sectors);
    expect(sectors[0]!.name).toBe('A');
  });
});

// 龙虎榜分析
describe('龙虎榜分析引擎', () => {
  interface DragonEntry { symbol: string; buyAmount: number; sellAmount: number; netAmount: number; seats: number }

  function rankByNet(entries: DragonEntry[]): DragonEntry[] {
    return [...entries].sort((a, b) => b.netAmount - a.netAmount);
  }

  function totalBuyAmount(entries: DragonEntry[]): number {
    return entries.reduce((s, e) => s + e.buyAmount, 0);
  }

  function totalSellAmount(entries: DragonEntry[]): number {
    return entries.reduce((s, e) => s + e.sellAmount, 0);
  }

  function averageSeats(entries: DragonEntry[]): number {
    if (entries.length === 0) return 0;
    return entries.reduce((s, e) => s + e.seats, 0) / entries.length;
  }

  it('应按净买入排序', () => {
    const entries: DragonEntry[] = [
      { symbol: '001', buyAmount: 1000, sellAmount: 500, netAmount: 500, seats: 3 },
      { symbol: '002', buyAmount: 2000, sellAmount: 500, netAmount: 1500, seats: 5 },
    ];
    const ranked = rankByNet(entries);
    expect(ranked[0]!.symbol).toBe('002');
  });

  it('应计算总买入额', () => {
    const entries: DragonEntry[] = [
      { symbol: '001', buyAmount: 1000, sellAmount: 0, netAmount: 1000, seats: 1 },
      { symbol: '002', buyAmount: 2000, sellAmount: 0, netAmount: 2000, seats: 2 },
    ];
    expect(totalBuyAmount(entries)).toBe(3000);
  });

  it('应计算总卖出额', () => {
    const entries: DragonEntry[] = [
      { symbol: '001', buyAmount: 0, sellAmount: 1500, netAmount: -1500, seats: 1 },
    ];
    expect(totalSellAmount(entries)).toBe(1500);
  });

  it('应计算平均席位数', () => {
    const entries: DragonEntry[] = [
      { symbol: '001', buyAmount: 0, sellAmount: 0, netAmount: 0, seats: 2 },
      { symbol: '002', buyAmount: 0, sellAmount: 0, netAmount: 0, seats: 4 },
    ];
    expect(averageSeats(entries)).toBe(3);
  });

  it('空列表平均席位应为0', () => {
    expect(averageSeats([])).toBe(0);
  });

  it('大量龙虎榜数据应正确处理', () => {
    const entries: DragonEntry[] = Array.from({ length: 100 }, (_, i) => ({
      symbol: `${i}`, buyAmount: i * 100, sellAmount: i * 50, netAmount: i * 50, seats: i % 10 + 1,
    }));
    expect(rankByNet(entries)).toHaveLength(100);
    expect(totalBuyAmount(entries)).toBeGreaterThan(0);
  });
});
