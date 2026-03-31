import { describe, it, expect } from 'vitest';

/**
 * 资金流向分析测试
 */

interface FundFlow {
  code: string;
  date: string;
  mainInflow: number;     // 主力资金净流入
  mainOutflow: number;    // 主力资金净流出
  retailInflow: number;   // 散户资金净流入
  retailOutflow: number;  // 散户资金净流出
  northbound: number;     // 北向资金净买入
  marginBalance: number;  // 融资余额
  marginChange: number;   // 融资余额变动
}

interface FlowAnalysis {
  code: string;
  mainNetFlow: number;
  retailNetFlow: number;
  totalNetFlow: number;
  mainFlowTrend: 'inflow' | 'outflow' | 'neutral';
  consecutiveDays: number;
  flowStrength: number; // 0-100
  signal: 'bullish' | 'bearish' | 'neutral';
}

function analyzeFundFlow(flows: FundFlow[]): FlowAnalysis[] {
  const byCode = new Map<string, FundFlow[]>();
  for (const flow of flows) {
    const existing = byCode.get(flow.code) || [];
    existing.push(flow);
    byCode.set(flow.code, existing);
  }

  const results: FlowAnalysis[] = [];
  for (const [code, codeFlows] of byCode) {
    const sorted = codeFlows.sort((a, b) => a.date.localeCompare(b.date));
    const mainNetFlow = sorted.reduce((s, f) => s + f.mainInflow - f.mainOutflow, 0);
    const retailNetFlow = sorted.reduce((s, f) => s + f.retailInflow - f.retailOutflow, 0);
    const totalNetFlow = mainNetFlow + retailNetFlow;

    let consecutiveDays = 0;
    const lastFlow = sorted[sorted.length - 1];
    const isMainInflow = lastFlow.mainInflow > lastFlow.mainOutflow;
    for (let i = sorted.length - 1; i >= 0; i--) {
      const f = sorted[i];
      if (isMainInflow && f.mainInflow > f.mainOutflow) consecutiveDays++;
      else if (!isMainInflow && f.mainOutflow > f.mainInflow) consecutiveDays++;
      else break;
    }

    const flowStrength = Math.min(100, Math.abs(mainNetFlow) / 1e8);
    const mainFlowTrend = mainNetFlow > 0 ? 'inflow' : mainNetFlow < 0 ? 'outflow' : 'neutral';
    const signal = mainNetFlow > 0 && consecutiveDays >= 3 ? 'bullish'
      : mainNetFlow < 0 && consecutiveDays >= 3 ? 'bearish'
      : 'neutral';

    results.push({
      code,
      mainNetFlow: Math.round(mainNetFlow),
      retailNetFlow: Math.round(retailNetFlow),
      totalNetFlow: Math.round(totalNetFlow),
      mainFlowTrend,
      consecutiveDays,
      flowStrength: Math.round(flowStrength),
      signal,
    });
  }

  return results;
}

function calcSectorFlow(flows: FundFlow[], sectorMap: Map<string, string>): Map<string, number> {
  const sectorFlow = new Map<string, number>();
  for (const flow of flows) {
    const sector = sectorMap.get(flow.code) || '未知';
    const current = sectorFlow.get(sector) || 0;
    sectorFlow.set(sector, current + flow.mainInflow - flow.mainOutflow);
  }
  return sectorFlow;
}

function detectFlowReversal(flows: FundFlow[], threshold: number = 2): boolean {
  if (flows.length < 2) return false;
  const sorted = flows.sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-3);
  let reversals = 0;
  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1].mainInflow - recent[i - 1].mainOutflow;
    const curr = recent[i].mainInflow - recent[i].mainOutflow;
    if ((prev > 0 && curr < 0) || (prev < 0 && curr > 0)) reversals++;
  }
  return reversals >= threshold;
}

describe('Fund Flow Analysis', () => {
  const flows: FundFlow[] = [
    { code: '000001', date: '2024-01-01', mainInflow: 5e8, mainOutflow: 3e8, retailInflow: 2e8, retailOutflow: 4e8, northbound: 1e8, marginBalance: 10e8, marginChange: 0.5e8 },
    { code: '000001', date: '2024-01-02', mainInflow: 6e8, mainOutflow: 2e8, retailInflow: 3e8, retailOutflow: 5e8, northbound: 2e8, marginBalance: 10.5e8, marginChange: 0.5e8 },
    { code: '000001', date: '2024-01-03', mainInflow: 4e8, mainOutflow: 4e8, retailInflow: 2e8, retailOutflow: 3e8, northbound: 0.5e8, marginBalance: 10.3e8, marginChange: -0.2e8 },
    { code: '600519', date: '2024-01-01', mainInflow: 2e8, mainOutflow: 5e8, retailInflow: 4e8, retailOutflow: 2e8, northbound: -1e8, marginBalance: 8e8, marginChange: -0.3e8 },
    { code: '600519', date: '2024-01-02', mainInflow: 3e8, mainOutflow: 6e8, retailInflow: 5e8, retailOutflow: 3e8, northbound: -0.5e8, marginBalance: 7.7e8, marginChange: -0.3e8 },
  ];

  describe('资金流向分析', () => {
    it('应该计算主力净流入', () => {
      const analysis = analyzeFundFlow(flows);
      const stock1 = analysis.find(a => a.code === '000001');
      expect(stock1?.mainNetFlow).toBeGreaterThan(0);
    });

    it('应该计算散户净流入', () => {
      const analysis = analyzeFundFlow(flows);
      const stock1 = analysis.find(a => a.code === '000001');
      expect(stock1?.retailNetFlow).toBeLessThan(0); // 散户净流出
    });

    it('应该判断主力趋势', () => {
      const analysis = analyzeFundFlow(flows);
      const stock1 = analysis.find(a => a.code === '000001');
      const stock2 = analysis.find(a => a.code === '600519');
      expect(stock1?.mainFlowTrend).toBe('inflow');
      expect(stock2?.mainFlowTrend).toBe('outflow');
    });

    it('应该计算连续天数', () => {
      const analysis = analyzeFundFlow(flows);
      for (const a of analysis) {
        expect(a.consecutiveDays).toBeGreaterThanOrEqual(0);
      }
    });

    it('应该生成信号', () => {
      const analysis = analyzeFundFlow(flows);
      for (const a of analysis) {
        expect(['bullish', 'bearish', 'neutral']).toContain(a.signal);
      }
    });
  });

  describe('板块资金', () => {
    it('应该按板块汇总', () => {
      const sectorMap = new Map([
        ['000001', '银行'],
        ['600519', '白酒'],
      ]);
      const sectorFlow = calcSectorFlow(flows, sectorMap);
      expect(sectorFlow.get('银行')).toBeGreaterThan(0);
      expect(sectorFlow.get('白酒')).toBeLessThan(0);
    });
  });

  describe('流向反转', () => {
    it('应该检测到反转', () => {
      const reversalFlows: FundFlow[] = [
        { code: '000001', date: '2024-01-01', mainInflow: 5e8, mainOutflow: 3e8, retailInflow: 2e8, retailOutflow: 4e8, northbound: 1e8, marginBalance: 10e8, marginChange: 0.5e8 },
        { code: '000001', date: '2024-01-02', mainInflow: 3e8, mainOutflow: 5e8, retailInflow: 4e8, retailOutflow: 2e8, northbound: -1e8, marginBalance: 9.5e8, marginChange: -0.5e8 },
        { code: '000001', date: '2024-01-03', mainInflow: 6e8, mainOutflow: 2e8, retailInflow: 2e8, retailOutflow: 5e8, northbound: 2e8, marginBalance: 10e8, marginChange: 0.5e8 },
      ];
      expect(detectFlowReversal(reversalFlows, 2)).toBe(true);
    });

    it('单向流动不应该触发', () => {
      expect(detectFlowReversal(flows.filter(f => f.code === '000001'), 2)).toBe(false);
    });
  });
});
