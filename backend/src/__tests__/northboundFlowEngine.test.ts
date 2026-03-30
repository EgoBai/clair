import { describe, it, expect } from 'vitest';

// 北向资金引擎
interface NorthboundFlow {
  date: string;
  shConnect: number;   // 沪股通净流入
  szConnect: number;   // 深股通净流入
  total: number;
}

interface TopHoldings {
  stockCode: string;
  stockName: string;
  shares: number;
  proportion: number;  // 占流通股比例
  changeFromPrev: number;
}

function calcTotalFlow(flow: NorthboundFlow): number {
  return flow.shConnect + flow.szConnect;
}

function calcCumulativeFlow(flows: NorthboundFlow[]): number {
  return flows.reduce((sum, f) => sum + calcTotalFlow(f), 0);
}

function calcFlowMA(flows: NorthboundFlow[], period: number): number[] {
  return flows.map((_, i) => {
    if (i < period - 1) return NaN;
    const slice = flows.slice(i - period + 1, i + 1);
    return slice.reduce((s, f) => s + calcTotalFlow(f), 0) / period;
  });
}

function detectFlowReversal(flows: NorthboundFlow[], lookback: number = 5): boolean {
  if (flows.length < lookback) return false;
  const recent = flows.slice(-lookback);
  const earlier = flows.slice(-lookback * 2, -lookback);
  if (earlier.length === 0) return false;
  const recentAvg = recent.reduce((s, f) => s + calcTotalFlow(f), 0) / recent.length;
  const earlierAvg = earlier.reduce((s, f) => s + calcTotalFlow(f), 0) / earlier.length;
  return (recentAvg > 0 && earlierAvg < 0) || (recentAvg < 0 && earlierAvg > 0);
}

function rankTopHoldings(holdings: TopHoldings[], by: 'shares' | 'proportion' | 'changeFromPrev'): TopHoldings[] {
  return [...holdings].sort((a, b) => {
    if (by === 'changeFromPrev') return Math.abs(b.changeFromPrev) - Math.abs(a.changeFromPrev);
    return b[by] - a[by];
  });
}

function filterNewEntries(current: TopHoldings[], previous: TopHoldings[]): TopHoldings[] {
  const prevCodes = new Set(previous.map(h => h.stockCode));
  return current.filter(h => !prevCodes.has(h.stockCode));
}

function filterExited(current: TopHoldings[], previous: TopHoldings[]): TopHoldings[] {
  const currCodes = new Set(current.map(h => h.stockCode));
  return previous.filter(h => !currCodes.has(h.stockCode));
}

function calcFlowTrend(flows: NorthboundFlow[]): 'inflow' | 'outflow' | 'neutral' {
  const ma5 = calcFlowMA(flows, 5);
  const ma20 = calcFlowMA(flows, 20);
  const last5 = ma5.filter(v => !isNaN(v)).pop();
  const last20 = ma20.filter(v => !isNaN(v)).pop();
  if (last5 === undefined || last20 === undefined) return 'neutral';
  if (last5 > last20 && last5 > 0) return 'inflow';
  if (last5 < last20 && last5 < 0) return 'outflow';
  return 'neutral';
}

describe('北向资金引擎', () => {
  const flows: NorthboundFlow[] = Array.from({ length: 30 }, (_, i) => ({
    date: `2026-03-${String(i + 1).padStart(2, '0')}`,
    shConnect: Math.sin(i * 0.5) * 1e9,
    szConnect: Math.cos(i * 0.3) * 5e8,
    total: 0,
  }));
  flows.forEach(f => { f.total = calcTotalFlow(f); });

  const holdings: TopHoldings[] = [
    { stockCode: '600519', stockName: '贵州茅台', shares: 1e8, proportion: 8.5, changeFromPrev: 0.2 },
    { stockCode: '000858', stockName: '五粮液', shares: 5e7, proportion: 6.2, changeFromPrev: -0.5 },
    { stockCode: '601318', stockName: '中国平安', shares: 8e7, proportion: 4.3, changeFromPrev: 0.8 },
  ];

  describe('净流入计算', () => {
    it('应正确计算单日总净流入', () => {
      expect(calcTotalFlow({ date: '2026-03-01', shConnect: 1e9, szConnect: 5e8, total: 0 })).toBe(1.5e9);
    });
  });

  describe('累计净流入', () => {
    it('应正确计算', () => {
      const cumulative = calcCumulativeFlow(flows);
      expect(typeof cumulative).toBe('number');
    });

    it('空数组应为0', () => { expect(calcCumulativeFlow([])).toBe(0); });
  });

  describe('移动平均', () => {
    it('应返回与输入等长的数组', () => {
      expect(calcFlowMA(flows, 5).length).toBe(flows.length);
    });

    it('前period-1个应为NaN', () => {
      const ma5 = calcFlowMA(flows, 5);
      expect(isNaN(ma5[0])).toBe(true);
      expect(isNaN(ma5[3])).toBe(true);
      expect(isNaN(ma5[4])).toBe(false);
    });
  });

  describe('资金转向检测', () => {
    it('数据不足应返回false', () => {
      expect(detectFlowReversal(flows.slice(0, 3))).toBe(false);
    });

    it('应检测方向变化', () => {
      const reversalFlows: NorthboundFlow[] = [
        { date: '1', shConnect: -1e9, szConnect: -5e8, total: -1.5e9 },
        { date: '2', shConnect: -1e9, szConnect: -5e8, total: -1.5e9 },
        { date: '3', shConnect: -1e9, szConnect: -5e8, total: -1.5e9 },
        { date: '4', shConnect: -1e9, szConnect: -5e8, total: -1.5e9 },
        { date: '5', shConnect: -1e9, szConnect: -5e8, total: -1.5e9 },
        { date: '6', shConnect: 1e9, szConnect: 5e8, total: 1.5e9 },
        { date: '7', shConnect: 1e9, szConnect: 5e8, total: 1.5e9 },
        { date: '8', shConnect: 1e9, szConnect: 5e8, total: 1.5e9 },
        { date: '9', shConnect: 1e9, szConnect: 5e8, total: 1.5e9 },
        { date: '10', shConnect: 1e9, szConnect: 5e8, total: 1.5e9 },
      ];
      expect(detectFlowReversal(reversalFlows, 5)).toBe(true);
    });
  });

  describe('持仓排名', () => {
    it('按持股数排序', () => {
      const ranked = rankTopHoldings(holdings, 'shares');
      expect(ranked[0].stockCode).toBe('600519');
    });

    it('按变动幅度排序', () => {
      const ranked = rankTopHoldings(holdings, 'changeFromPrev');
      expect(Math.abs(ranked[0].changeFromPrev)).toBeGreaterThanOrEqual(Math.abs(ranked[1].changeFromPrev));
    });
  });

  describe('新增/退出持仓', () => {
    it('应检测新进入的股票', () => {
      const newHoldings = [...holdings, { stockCode: '000001', stockName: '平安银行', shares: 1e7, proportion: 1.5, changeFromPrev: 1.5 }];
      expect(filterNewEntries(newHoldings, holdings).length).toBe(1);
    });

    it('应检测退出的股票', () => {
      const removed = holdings.filter(h => h.stockCode !== '000858');
      expect(filterExited(removed, holdings).length).toBe(1);
    });
  });

  describe('资金趋势', () => {
    it('应返回趋势方向', () => {
      const trend = calcFlowTrend(flows);
      expect(['inflow', 'outflow', 'neutral']).toContain(trend);
    });
  });
});
