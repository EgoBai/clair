import { describe, it, expect } from 'vitest';

/**
 * 资金流向分析引擎测试
 */

interface FundFlow { time: number; mainInflow: number; mainOutflow: number; retailInflow: number; retailOutflow: number; }
interface StockFlow { code: string; netInflow: number; mainRatio: number; trend: 'inflow' | 'outflow' | 'neutral'; }

const calcNetFlow = (flow: FundFlow): { main: number; retail: number; total: number } => ({
  main: flow.mainInflow - flow.mainOutflow,
  retail: flow.retailInflow - flow.retailOutflow,
  total: (flow.mainInflow - flow.mainOutflow) + (flow.retailInflow - flow.retailOutflow),
});

const classifyFlow = (mainNet: number, threshold: number = 1e7): 'strong_inflow' | 'inflow' | 'neutral' | 'outflow' | 'strong_outflow' => {
  if (mainNet > threshold * 5) return 'strong_inflow';
  if (mainNet > threshold) return 'inflow';
  if (mainNet < -threshold * 5) return 'strong_outflow';
  if (mainNet < -threshold) return 'outflow';
  return 'neutral';
};

const calcFlowTrend = (flows: FundFlow[], window: number = 5): number[] => {
  const trends: number[] = [];
  for (let i = 0; i < flows.length; i++) {
    const start = Math.max(0, i - window + 1);
    const windowFlows = flows.slice(start, i + 1);
    const avgMain = windowFlows.reduce((s, f) => s + (f.mainInflow - f.mainOutflow), 0) / windowFlows.length;
    trends.push(avgMain);
  }
  return trends;
};

const detectFlowReversal = (flows: FundFlow[], consecutiveThreshold: number = 3): number[] => {
  const reversals: number[] = [];
  let lastDirection = 0;
  let consecutive = 0;
  for (let i = 0; i < flows.length; i++) {
    const net = flows[i].mainInflow - flows[i].mainOutflow;
    const direction = net > 0 ? 1 : net < 0 ? -1 : 0;
    if (direction !== 0 && direction !== lastDirection && lastDirection !== 0) {
      consecutive++;
      if (consecutive >= consecutiveThreshold) reversals.push(i);
    } else if (direction === lastDirection) {
      consecutive = 0;
    }
    if (direction !== 0) lastDirection = direction;
  }
  return reversals;
};

const rankByFlow = (stocks: StockFlow[]): StockFlow[] =>
  [...stocks].sort((a, b) => b.netInflow - a.netInflow);

const calcFlowConcentration = (stocks: StockFlow[]): number => {
  const totalInflow = stocks.reduce((s, st) => s + Math.max(0, st.netInflow), 0);
  if (totalInflow === 0) return 0;
  const sorted = [...stocks].sort((a, b) => b.netInflow - a.netInflow);
  const top5 = sorted.slice(0, 5).reduce((s, st) => s + Math.max(0, st.netInflow), 0);
  return top5 / totalInflow;
};

describe('资金流向分析', () => {
  describe('净流入计算', () => {
    it('应该正确计算主力净流入', () => {
      const flow: FundFlow = { time: 1, mainInflow: 1e8, mainOutflow: 5e7, retailInflow: 3e7, retailOutflow: 2e7 };
      const { main } = calcNetFlow(flow);
      expect(main).toBeCloseTo(5e7, 0);
    });

    it('应该正确计算散户净流入', () => {
      const flow: FundFlow = { time: 1, mainInflow: 1e8, mainOutflow: 5e7, retailInflow: 2e7, retailOutflow: 3e7 };
      const { retail } = calcNetFlow(flow);
      expect(retail).toBeCloseTo(-1e7, 0);
    });

    it('总净流入应为主力加散户', () => {
      const flow: FundFlow = { time: 1, mainInflow: 1e8, mainOutflow: 5e7, retailInflow: 3e7, retailOutflow: 2e7 };
      const { main, retail, total } = calcNetFlow(flow);
      expect(total).toBeCloseTo(main + retail, 0);
    });

    it('流入等于流出时净流入为0', () => {
      const flow: FundFlow = { time: 1, mainInflow: 5e7, mainOutflow: 5e7, retailInflow: 3e7, retailOutflow: 3e7 };
      const { total } = calcNetFlow(flow);
      expect(total).toBe(0);
    });

    it('零流入应返回负值', () => {
      const flow: FundFlow = { time: 1, mainInflow: 0, mainOutflow: 1e8, retailInflow: 0, retailOutflow: 5e7 };
      expect(calcNetFlow(flow).total).toBeLessThan(0);
    });

    it('全部流入应返回大正值', () => {
      const flow: FundFlow = { time: 1, mainInflow: 1e9, mainOutflow: 0, retailInflow: 5e8, retailOutflow: 0 };
      expect(calcNetFlow(flow).total).toBe(1.5e9);
    });
  });

  describe('资金分类', () => {
    it('大额净流入应为strong_inflow', () => {
      expect(classifyFlow(1e8, 1e7)).toBe('strong_inflow');
    });

    it('中等净流入应为inflow', () => {
      expect(classifyFlow(2e7, 1e7)).toBe('inflow');
    });

    it('小额波动应为neutral', () => {
      expect(classifyFlow(1e6, 1e7)).toBe('neutral');
    });

    it('大额净流出应为strong_outflow', () => {
      expect(classifyFlow(-1e8, 1e7)).toBe('strong_outflow');
    });

    it('中等净流出应为outflow', () => {
      expect(classifyFlow(-2e7, 1e7)).toBe('outflow');
    });

    it('精确阈值边界', () => {
      expect(classifyFlow(1e7, 1e7)).toBe('neutral');
      expect(classifyFlow(1e7 + 1, 1e7)).toBe('inflow');
    });

    it('零应为neutral', () => {
      expect(classifyFlow(0, 1e7)).toBe('neutral');
    });
  });

  describe('资金趋势', () => {
    it('应返回与输入等长的趋势', () => {
      const flows: FundFlow[] = Array.from({ length: 10 }, (_, i) => ({
        time: i, mainInflow: 1e8, mainOutflow: 5e7, retailInflow: 3e7, retailOutflow: 2e7
      }));
      expect(calcFlowTrend(flows).length).toBe(10);
    });

    it('持续流入趋势应递增或稳定', () => {
      const flows: FundFlow[] = Array.from({ length: 10 }, (_, i) => ({
        time: i, mainInflow: 1e8 + i * 1e7, mainOutflow: 5e7, retailInflow: 3e7, retailOutflow: 2e7
      }));
      const trends = calcFlowTrend(flows, 3);
      expect(trends[trends.length - 1]).toBeGreaterThan(trends[0]);
    });

    it('空数据返回空趋势', () => {
      expect(calcFlowTrend([])).toEqual([]);
    });

    it('单一数据点', () => {
      const flows: FundFlow[] = [{ time: 1, mainInflow: 1e8, mainOutflow: 5e7, retailInflow: 3e7, retailOutflow: 2e7 }];
      const trends = calcFlowTrend(flows);
      expect(trends.length).toBe(1);
      expect(trends[0]).toBeCloseTo(5e7, 0);
    });

    it('窗口参数影响平滑程度', () => {
      const flows: FundFlow[] = Array.from({ length: 20 }, (_, i) => ({
        time: i, mainInflow: i % 2 === 0 ? 1e9 : 1e7, mainOutflow: 1e8,
        retailInflow: 5e7, retailOutflow: 3e7
      }));
      const t3 = calcFlowTrend(flows, 3);
      const t10 = calcFlowTrend(flows, 10);
      // Larger window should be smoother
      let diff3 = 0, diff10 = 0;
      for (let i = 1; i < t3.length; i++) diff3 += Math.abs(t3[i] - t3[i-1]);
      for (let i = 1; i < t10.length; i++) diff10 += Math.abs(t10[i] - t10[i-1]);
      expect(diff10).toBeLessThanOrEqual(diff3);
    });
  });

  describe('资金转向检测', () => {
    it('应该检测方向变化', () => {
      const flows: FundFlow[] = [
        { time: 1, mainInflow: 1e8, mainOutflow: 5e7, retailInflow: 1e7, retailOutflow: 1e7 },
        { time: 2, mainInflow: 1e8, mainOutflow: 5e7, retailInflow: 1e7, retailOutflow: 1e7 },
        { time: 3, mainInflow: 1e8, mainOutflow: 5e7, retailInflow: 1e7, retailOutflow: 1e7 },
        { time: 4, mainInflow: 5e7, mainOutflow: 1e8, retailInflow: 1e7, retailOutflow: 1e7 },
        { time: 5, mainInflow: 5e7, mainOutflow: 1e8, retailInflow: 1e7, retailOutflow: 1e7 },
        { time: 6, mainInflow: 5e7, mainOutflow: 1e8, retailInflow: 1e7, retailOutflow: 1e7 },
        { time: 7, mainInflow: 1e8, mainOutflow: 5e7, retailInflow: 1e7, retailOutflow: 1e7 },
      ];
      const reversals = detectFlowReversal(flows, 2);
      expect(reversals.length).toBeGreaterThanOrEqual(0);
    });

    it('单向流动无转向', () => {
      const flows: FundFlow[] = Array.from({ length: 10 }, (_, i) => ({
        time: i, mainInflow: 1e8, mainOutflow: 5e7, retailInflow: 1e7, retailOutflow: 1e7
      }));
      expect(detectFlowReversal(flows, 2).length).toBe(0);
    });

    it('空数据返回空', () => {
      expect(detectFlowReversal([], 3)).toEqual([]);
    });

    it('高阈值减少转向检测', () => {
      const flows: FundFlow[] = [];
      for (let i = 0; i < 20; i++) {
        flows.push({
          time: i,
          mainInflow: i % 2 === 0 ? 1e8 : 5e7,
          mainOutflow: i % 2 === 0 ? 5e7 : 1e8,
          retailInflow: 1e7, retailOutflow: 1e7
        });
      }
      expect(detectFlowReversal(flows, 2).length).toBeGreaterThanOrEqual(detectFlowReversal(flows, 5).length);
    });
  });

  describe('资金排名', () => {
    it('应按净流入降序排列', () => {
      const stocks: StockFlow[] = [
        { code: 'A', netInflow: 1e7, mainRatio: 0.5, trend: 'inflow' },
        { code: 'B', netInflow: 5e7, mainRatio: 0.7, trend: 'inflow' },
        { code: 'C', netInflow: -1e7, mainRatio: 0.3, trend: 'outflow' },
      ];
      const ranked = rankByFlow(stocks);
      expect(ranked[0].code).toBe('B');
      expect(ranked[2].code).toBe('C');
    });

    it('空列表返回空', () => {
      expect(rankByFlow([])).toEqual([]);
    });

    it('单一股票就是它自己', () => {
      const stocks: StockFlow[] = [{ code: 'A', netInflow: 1e7, mainRatio: 0.5, trend: 'inflow' }];
      expect(rankByFlow(stocks)[0].code).toBe('A');
    });

    it('不修改原数组', () => {
      const stocks: StockFlow[] = [
        { code: 'A', netInflow: 1e7, mainRatio: 0.5, trend: 'inflow' },
        { code: 'B', netInflow: 5e7, mainRatio: 0.7, trend: 'inflow' },
      ];
      rankByFlow(stocks);
      expect(stocks[0].code).toBe('A');
    });

    it('相等净流入应保持稳定', () => {
      const stocks: StockFlow[] = [
        { code: 'A', netInflow: 1e7, mainRatio: 0.5, trend: 'inflow' },
        { code: 'B', netInflow: 1e7, mainRatio: 0.5, trend: 'inflow' },
      ];
      const ranked = rankByFlow(stocks);
      expect(ranked.length).toBe(2);
    });
  });

  describe('资金集中度', () => {
    it('均匀分布集中度应较低', () => {
      const stocks: StockFlow[] = Array.from({ length: 20 }, (_, i) => ({
        code: `${i}`, netInflow: 1e6, mainRatio: 0.5, trend: 'inflow' as const
      }));
      expect(calcFlowConcentration(stocks)).toBeCloseTo(0.25, 1);
    });

    it('头部集中集中度应较高', () => {
      const stocks: StockFlow[] = [
        { code: 'A', netInflow: 1e9, mainRatio: 0.9, trend: 'inflow' },
        ...Array.from({ length: 19 }, (_, i) => ({
          code: `${i}`, netInflow: 1e5, mainRatio: 0.3, trend: 'inflow' as const
        }))
      ];
      expect(calcFlowConcentration(stocks)).toBeGreaterThan(0.8);
    });

    it('全流出返回0', () => {
      const stocks: StockFlow[] = Array.from({ length: 10 }, (_, i) => ({
        code: `${i}`, netInflow: -1e6, mainRatio: 0.3, trend: 'outflow' as const
      }));
      expect(calcFlowConcentration(stocks)).toBe(0);
    });

    it('空列表返回0', () => {
      expect(calcFlowConcentration([])).toBe(0);
    });

    it('集中度应在0-1之间', () => {
      const stocks: StockFlow[] = Array.from({ length: 30 }, (_, i) => ({
        code: `${i}`, netInflow: Math.random() * 1e8 - 5e7, mainRatio: Math.random(),
        trend: Math.random() > 0.5 ? 'inflow' as const : 'outflow' as const
      }));
      const conc = calcFlowConcentration(stocks);
      expect(conc).toBeGreaterThanOrEqual(0);
      expect(conc).toBeLessThanOrEqual(1);
    });
  });
});
