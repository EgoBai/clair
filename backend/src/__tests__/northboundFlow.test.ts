import { describe, it, expect } from 'vitest';

// 北向资金分析
interface NorthboundFlow {
  date: string;
  shConnect: number;   // 沪股通净流入（亿）
  szConnect: number;   // 深股通净流入
  totalFlow: number;   // 合计净流入
  shBuyAmount: number;
  shSellAmount: number;
  szBuyAmount: number;
  szSellAmount: number;
}

interface NorthboundAnalysis {
  totalNetFlow: number;
  avgDailyFlow: number;
  consecutiveInflowDays: number;
  consecutiveOutflowDays: number;
  flowTrend: 'accelerating_in' | 'decelerating_in' | 'stable' | 'accelerating_out' | 'decelerating_out';
  topHoldingsChange: { code: string; change: number }[];
  monthlyStats: { month: string; netFlow: number; tradingDays: number }[];
}

function analyzeNorthboundFlow(flows: NorthboundFlow[]): NorthboundAnalysis {
  if (flows.length === 0) {
    return {
      totalNetFlow: 0, avgDailyFlow: 0, consecutiveInflowDays: 0,
      consecutiveOutflowDays: 0, flowTrend: 'stable',
      topHoldingsChange: [], monthlyStats: [],
    };
  }

  const totalNetFlow = flows.reduce((s, f) => s + f.totalFlow, 0);
  const avgDailyFlow = totalNetFlow / flows.length;

  // 连续流入/流出天数
  let consecutiveInflowDays = 0;
  let consecutiveOutflowDays = 0;
  for (let i = flows.length - 1; i >= 0; i--) {
    if (flows[i].totalFlow > 0) {
      consecutiveInflowDays++;
      if (consecutiveOutflowDays > 0) break;
    } else if (flows[i].totalFlow < 0) {
      consecutiveOutflowDays++;
      if (consecutiveInflowDays > 0) break;
    }
  }

  // 流入趋势
  let flowTrend: NorthboundAnalysis['flowTrend'] = 'stable';
  if (flows.length >= 5) {
    const recent5 = flows.slice(-5);
    const prev5 = flows.slice(-10, -5);
    if (prev5.length > 0) {
      const recentAvg = recent5.reduce((s, f) => s + f.totalFlow, 0) / recent5.length;
      const prevAvg = prev5.reduce((s, f) => s + f.totalFlow, 0) / prev5.length;
      if (recentAvg > 0 && recentAvg > prevAvg * 1.2) flowTrend = 'accelerating_in';
      else if (recentAvg > 0 && recentAvg < prevAvg * 0.8) flowTrend = 'decelerating_in';
      else if (recentAvg < 0 && recentAvg < prevAvg * 1.2) flowTrend = 'accelerating_out';
      else if (recentAvg < 0 && recentAvg > prevAvg * 0.8) flowTrend = 'decelerating_out';
    }
  }

  // 月度统计
  const monthlyMap = new Map<string, { netFlow: number; tradingDays: number }>();
  for (const f of flows) {
    const month = f.date.substring(0, 7);
    const m = monthlyMap.get(month) || { netFlow: 0, tradingDays: 0 };
    m.netFlow += f.totalFlow;
    m.tradingDays++;
    monthlyMap.set(month, m);
  }

  const monthlyStats = Array.from(monthlyMap.entries())
    .map(([month, stats]) => ({ month, ...stats }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return {
    totalNetFlow,
    avgDailyFlow,
    consecutiveInflowDays,
    consecutiveOutflowDays,
    flowTrend,
    topHoldingsChange: [],
    monthlyStats,
  };
}

function calculateFlowMomentum(flows: NorthboundFlow[], period = 10): { momentum: number; signal: 'bullish' | 'bearish' | 'neutral' }[] {
  const result: { momentum: number; signal: 'bullish' | 'bearish' | 'neutral' }[] = [];

  for (let i = period - 1; i < flows.length; i++) {
    const current = flows[i].totalFlow;
    const prev = flows[i - period + 1].totalFlow;
    const momentum = current - prev;
    const signal = momentum > 5 ? 'bullish' : momentum < -5 ? 'bearish' : 'neutral';
    result.push({ momentum, signal });
  }

  return result;
}

function detectFlowReversal(flows: NorthboundFlow[], threshold = 3): { date: string; fromFlow: number; toFlow: number; magnitude: number }[] {
  const reversals: { date: string; fromFlow: number; toFlow: number; magnitude: number }[] = [];

  for (let i = 1; i < flows.length; i++) {
    const prev = flows[i - 1].totalFlow;
    const curr = flows[i].totalFlow;

    // 方向反转且幅度超过阈值
    if ((prev > 0 && curr < 0) || (prev < 0 && curr > 0)) {
      const magnitude = Math.abs(curr - prev);
      if (magnitude >= threshold) {
        reversals.push({
          date: flows[i].date,
          fromFlow: prev,
          toFlow: curr,
          magnitude,
        });
      }
    }
  }

  return reversals;
}

function generateMockNorthboundData(days: number): NorthboundFlow[] {
  const flows: NorthboundFlow[] = [];
  for (let i = 0; i < days; i++) {
    const shFlow = (Math.random() - 0.45) * 100;
    const szFlow = (Math.random() - 0.45) * 80;
    const date = new Date(2024, 0, i + 1);
    flows.push({
      date: date.toISOString().split('T')[0],
      shConnect: shFlow,
      szConnect: szFlow,
      totalFlow: shFlow + szFlow,
      shBuyAmount: Math.random() * 500,
      shSellAmount: Math.random() * 500,
      szBuyAmount: Math.random() * 400,
      szSellAmount: Math.random() * 400,
    });
  }
  return flows;
}

describe('北向资金分析', () => {
  describe('analyzeNorthboundFlow', () => {
    it('应该计算总净流入', () => {
      const flows: NorthboundFlow[] = [
        { date: '2024-01-02', shConnect: 10, szConnect: 5, totalFlow: 15, shBuyAmount: 100, shSellAmount: 90, szBuyAmount: 80, szSellAmount: 75 },
        { date: '2024-01-03', shConnect: -5, szConnect: 3, totalFlow: -2, shBuyAmount: 85, shSellAmount: 90, szBuyAmount: 78, szSellAmount: 75 },
      ];
      const result = analyzeNorthboundFlow(flows);
      expect(result.totalNetFlow).toBe(13);
    });

    it('应该计算日均流入', () => {
      const flows: NorthboundFlow[] = [
        { date: '2024-01-02', shConnect: 10, szConnect: 10, totalFlow: 20, shBuyAmount: 100, shSellAmount: 90, szBuyAmount: 80, szSellAmount: 70 },
        { date: '2024-01-03', shConnect: 10, szConnect: 10, totalFlow: 20, shBuyAmount: 100, shSellAmount: 90, szBuyAmount: 80, szSellAmount: 70 },
      ];
      const result = analyzeNorthboundFlow(flows);
      expect(result.avgDailyFlow).toBe(20);
    });

    it('应该计算连续流入天数', () => {
      const flows: NorthboundFlow[] = [
        { date: '2024-01-01', shConnect: 1, szConnect: 1, totalFlow: 2, shBuyAmount: 0, shSellAmount: 0, szBuyAmount: 0, szSellAmount: 0 },
        { date: '2024-01-02', shConnect: 1, szConnect: 1, totalFlow: 2, shBuyAmount: 0, shSellAmount: 0, szBuyAmount: 0, szSellAmount: 0 },
        { date: '2024-01-03', shConnect: 1, szConnect: 1, totalFlow: 2, shBuyAmount: 0, shSellAmount: 0, szBuyAmount: 0, szSellAmount: 0 },
        { date: '2024-01-04', shConnect: -1, szConnect: -1, totalFlow: -2, shBuyAmount: 0, shSellAmount: 0, szBuyAmount: 0, szSellAmount: 0 },
      ];
      const result = analyzeNorthboundFlow(flows);
      expect(result.consecutiveInflowDays).toBe(1); // 倒数第二天是流入
      expect(result.consecutiveOutflowDays).toBe(1);
    });

    it('应该按月统计', () => {
      const flows: NorthboundFlow[] = [
        { date: '2024-01-02', shConnect: 10, szConnect: 10, totalFlow: 20, shBuyAmount: 0, shSellAmount: 0, szBuyAmount: 0, szSellAmount: 0 },
        { date: '2024-01-03', shConnect: 5, szConnect: 5, totalFlow: 10, shBuyAmount: 0, shSellAmount: 0, szBuyAmount: 0, szSellAmount: 0 },
        { date: '2024-02-01', shConnect: -10, szConnect: -10, totalFlow: -20, shBuyAmount: 0, shSellAmount: 0, szBuyAmount: 0, szSellAmount: 0 },
      ];
      const result = analyzeNorthboundFlow(flows);
      expect(result.monthlyStats).toHaveLength(2);
      expect(result.monthlyStats[0].month).toBe('2024-01');
      expect(result.monthlyStats[0].netFlow).toBe(30);
      expect(result.monthlyStats[1].month).toBe('2024-02');
    });

    it('空数据应该返回默认值', () => {
      const result = analyzeNorthboundFlow([]);
      expect(result.totalNetFlow).toBe(0);
      expect(result.flowTrend).toBe('stable');
    });
  });

  describe('calculateFlowMomentum', () => {
    it('应该计算动量', () => {
      const flows = generateMockNorthboundData(20);
      const momentum = calculateFlowMomentum(flows, 10);
      expect(momentum.length).toBeGreaterThan(0);
      momentum.forEach(m => {
        expect(['bullish', 'bearish', 'neutral']).toContain(m.signal);
        expect(typeof m.momentum).toBe('number');
      });
    });

    it('数据不足应该返回空', () => {
      const flows = generateMockNorthboundData(5);
      expect(calculateFlowMomentum(flows, 10)).toEqual([]);
    });
  });

  describe('detectFlowReversal', () => {
    it('应该检测到方向反转', () => {
      const flows: NorthboundFlow[] = [
        { date: '2024-01-01', shConnect: 10, szConnect: 10, totalFlow: 20, shBuyAmount: 0, shSellAmount: 0, szBuyAmount: 0, szSellAmount: 0 },
        { date: '2024-01-02', shConnect: -10, szConnect: -10, totalFlow: -20, shBuyAmount: 0, shSellAmount: 0, szBuyAmount: 0, szSellAmount: 0 },
      ];
      const result = detectFlowReversal(flows, 3);
      expect(result).toHaveLength(1);
      expect(result[0].fromFlow).toBe(20);
      expect(result[0].toFlow).toBe(-20);
    });

    it('小幅反转不应该被检测', () => {
      const flows: NorthboundFlow[] = [
        { date: '2024-01-01', shConnect: 1, szConnect: 1, totalFlow: 2, shBuyAmount: 0, shSellAmount: 0, szBuyAmount: 0, szSellAmount: 0 },
        { date: '2024-01-02', shConnect: -0.5, szConnect: -0.5, totalFlow: -1, shBuyAmount: 0, shSellAmount: 0, szBuyAmount: 0, szSellAmount: 0 },
      ];
      const result = detectFlowReversal(flows, 5);
      expect(result).toHaveLength(0);
    });

    it('同方向不应该被检测为反转', () => {
      const flows: NorthboundFlow[] = [
        { date: '2024-01-01', shConnect: 5, szConnect: 5, totalFlow: 10, shBuyAmount: 0, shSellAmount: 0, szBuyAmount: 0, szSellAmount: 0 },
        { date: '2024-01-02', shConnect: 6, szConnect: 6, totalFlow: 12, shBuyAmount: 0, shSellAmount: 0, szBuyAmount: 0, szSellAmount: 0 },
      ];
      expect(detectFlowReversal(flows, 3)).toHaveLength(0);
    });
  });

  describe('大数据量测试', () => {
    it('应该高效处理90天数据', () => {
      const flows = generateMockNorthboundData(90);
      const start = Date.now();
      const result = analyzeNorthboundFlow(flows);
      const elapsed = Date.now() - start;
      expect(result.monthlyStats.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(100);
    });
  });
});
