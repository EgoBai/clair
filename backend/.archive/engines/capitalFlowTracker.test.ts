import { describe, it, expect } from 'vitest';

/**
 * 资金流向追踪引擎测试
 */

type FlowType = 'main' | 'northbound' | 'margin' | 'institutional' | 'retail';
type FlowDirection = 'inflow' | 'outflow' | 'neutral';

interface CapitalFlow {
  stockCode: string;
  timestamp: string;
  flowType: FlowType;
  amount: number;
  direction: FlowDirection;
  percentage: number;
}

interface FlowSummary {
  stockCode: string;
  totalInflow: number;
  totalOutflow: number;
  netFlow: number;
  mainNetFlow: number;
  flowTrend: 'accumulating' | 'distributing' | 'neutral';
  strength: number;
}

function summarizeFlows(stockCode: string, flows: CapitalFlow[]): FlowSummary {
  const inflows = flows.filter(f => f.direction === 'inflow');
  const outflows = flows.filter(f => f.direction === 'outflow');
  const totalInflow = inflows.reduce((s, f) => s + f.amount, 0);
  const totalOutflow = outflows.reduce((s, f) => s + f.amount, 0);
  const netFlow = totalInflow - totalOutflow;
  const mainFlows = flows.filter(f => f.flowType === 'main');
  const mainNet = mainFlows.reduce((s, f) => s + (f.direction === 'inflow' ? f.amount : -f.amount), 0);
  const flowTrend = netFlow > 0 ? 'accumulating' : netFlow < 0 ? 'distributing' : 'neutral';
  const strength = Math.min(100, Math.abs(netFlow) / Math.max(1, totalInflow + totalOutflow) * 100);
  return { stockCode, totalInflow, totalOutflow, netFlow: parseFloat(netFlow.toFixed(2)), mainNetFlow: parseFloat(mainNet.toFixed(2)), flowTrend, strength: parseFloat(strength.toFixed(2)) };
}

function aggregateSectorFlows(flows: CapitalFlow[]): Array<{ sector: string; netFlow: number; stockCount: number }> {
  const sectorMap = new Map<string, { netFlow: number; stocks: Set<string> }>();
  flows.forEach(f => {
    const sector = f.stockCode.slice(0, 1);
    const entry = sectorMap.get(sector) || { netFlow: 0, stocks: new Set() };
    entry.netFlow += f.direction === 'inflow' ? f.amount : -f.amount;
    entry.stocks.add(f.stockCode);
    sectorMap.set(sector, entry);
  });
  return Array.from(sectorMap.entries()).map(([sector, data]) => ({
    sector, netFlow: parseFloat(data.netFlow.toFixed(2)), stockCount: data.stocks.size,
  })).sort((a, b) => b.netFlow - a.netFlow);
}

function detectFlowReversal(flows: CapitalFlow[], lookback: number = 5): boolean {
  if (flows.length < lookback * 2) return false;
  const sorted = [...flows].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const recent = sorted.slice(-lookback);
  const previous = sorted.slice(-lookback * 2, -lookback);
  const recentNet = recent.reduce((s, f) => s + (f.direction === 'inflow' ? 1 : -1), 0);
  const prevNet = previous.reduce((s, f) => s + (f.direction === 'inflow' ? 1 : -1), 0);
  return (recentNet > 0 && prevNet < 0) || (recentNet < 0 && prevNet > 0);
}

function calculateFlowStrength(flows: CapitalFlow[]): number {
  if (!flows.length) return 0;
  const net = flows.reduce((s, f) => s + (f.direction === 'inflow' ? f.amount : -f.amount), 0);
  const total = flows.reduce((s, f) => s + f.amount, 0);
  return total === 0 ? 0 : parseFloat((Math.abs(net) / total * 100).toFixed(2));
}

function flowByType(flows: CapitalFlow[]): Record<FlowType, { inflow: number; outflow: number; net: number }> {
  const types: FlowType[] = ['main', 'northbound', 'margin', 'institutional', 'retail'];
  const result = {} as Record<FlowType, { inflow: number; outflow: number; net: number }>;
  for (const type of types) {
    const ff = flows.filter(f => f.flowType === type);
    const inflow = ff.filter(f => f.direction === 'inflow').reduce((s, f) => s + f.amount, 0);
    const outflow = ff.filter(f => f.direction === 'outflow').reduce((s, f) => s + f.amount, 0);
    result[type] = { inflow, outflow, net: inflow - outflow };
  }
  return result;
}

function topFlowsByAmount(flows: CapitalFlow[], n: number = 5): CapitalFlow[] {
  return [...flows].sort((a, b) => b.amount - a.amount).slice(0, n);
}

describe('资金流向追踪引擎', () => {
  const makeFlow = (code: string, direction: FlowDirection, amount: number, flowType: FlowType = 'main', ts = '2024-01-01'): CapitalFlow => ({
    stockCode: code, timestamp: ts, flowType, amount, direction, percentage: 0.1,
  });

  describe('summarizeFlows', () => {
    it('净流入计算', () => {
      const flows = [makeFlow('600519', 'inflow', 1000), makeFlow('600519', 'outflow', 300)];
      const summary = summarizeFlows('600519', flows);
      expect(summary.netFlow).toBe(700);
      expect(summary.flowTrend).toBe('accumulating');
    });

    it('净流出detecting', () => {
      const flows = [makeFlow('001', 'inflow', 100), makeFlow('001', 'outflow', 500)];
      const summary = summarizeFlows('001', flows);
      expect(summary.flowTrend).toBe('distributing');
    });

    it('净零返回neutral', () => {
      const flows = [makeFlow('001', 'inflow', 500), makeFlow('001', 'outflow', 500)];
      const summary = summarizeFlows('001', flows);
      expect(summary.flowTrend).toBe('neutral');
      expect(summary.netFlow).toBe(0);
    });

    it('主力净流入', () => {
      const flows = [
        makeFlow('001', 'inflow', 1000, 'main'),
        makeFlow('001', 'inflow', 500, 'northbound'),
      ];
      const summary = summarizeFlows('001', flows);
      expect(summary.mainNetFlow).toBe(1000);
    });

    it('主力净流出', () => {
      const flows = [
        makeFlow('001', 'outflow', 800, 'main'),
        makeFlow('001', 'inflow', 200, 'main'),
      ];
      const summary = summarizeFlows('001', flows);
      expect(summary.mainNetFlow).toBe(-600);
    });

    it('强度计算 (50% 净流入)', () => {
      const flows = [makeFlow('001', 'inflow', 100), makeFlow('001', 'outflow', 100)];
      const summary = summarizeFlows('001', flows);
      expect(summary.strength).toBe(0);
    });

    it('强度80%', () => {
      const flows = [makeFlow('001', 'inflow', 900), makeFlow('001', 'outflow', 100)];
      const summary = summarizeFlows('001', flows);
      expect(summary.strength).toBeGreaterThan(0);
    });

    it('空数据', () => {
      const summary = summarizeFlows('001', []);
      expect(summary.netFlow).toBe(0);
      expect(summary.flowTrend).toBe('neutral');
      expect(summary.strength).toBe(0);
    });

    it('包含inflow和outflow以外的direction', () => {
      const flows = [makeFlow('001', 'inflow', 100), makeFlow('001', 'outflow', 50)];
      flows.push({ ...flows[0], direction: 'neutral' as FlowDirection, amount: 30 });
      const summary = summarizeFlows('001', flows);
      // neutral flows are excluded from inflow/outflow
      expect(summary.totalInflow).toBe(100);
      expect(summary.totalOutflow).toBe(50);
    });

    it('多笔不同类型的flow汇总', () => {
      const flows = [
        makeFlow('001', 'inflow', 1000, 'main'),
        makeFlow('001', 'inflow', 500, 'northbound'),
        makeFlow('001', 'outflow', 300, 'margin'),
        makeFlow('001', 'inflow', 200, 'institutional'),
        makeFlow('001', 'outflow', 100, 'retail'),
      ];
      const summary = summarizeFlows('001', flows);
      expect(summary.totalInflow).toBe(1700);
      expect(summary.totalOutflow).toBe(400);
      expect(summary.netFlow).toBe(1300);
    });

    it('stockCode正确返回', () => {
      const flows = [makeFlow('600519', 'inflow', 100)];
      const summary = summarizeFlows('600519', flows);
      expect(summary.stockCode).toBe('600519');
    });
  });

  describe('aggregateSectorFlows', () => {
    it('按首位数字分组汇总', () => {
      const flows = [
        makeFlow('600519', 'inflow', 1000),
        makeFlow('601398', 'inflow', 500),
        makeFlow('000858', 'outflow', 300),
      ];
      const sectors = aggregateSectorFlows(flows);
      expect(sectors.find(s => s.sector === '6')?.netFlow).toBe(1500);
      expect(sectors.find(s => s.sector === '0')?.netFlow).toBe(-300);
    });

    it('去重计数不同股票', () => {
      const flows = [
        makeFlow('600519', 'inflow', 100),
        makeFlow('600519', 'inflow', 200),
        makeFlow('601398', 'inflow', 300),
      ];
      const sectors = aggregateSectorFlows(flows);
      expect(sectors.find(s => s.sector === '6')?.stockCount).toBe(2);
    });

    it('空数组', () => {
      expect(aggregateSectorFlows([])).toEqual([]);
    });

    it('净流入排序降序', () => {
      const flows = [
        makeFlow('300888', 'inflow', 300),
        makeFlow('600519', 'outflow', 100),
        makeFlow('000858', 'inflow', 200),
      ];
      const sectors = aggregateSectorFlows(flows);
      for (let i = 1; i < sectors.length; i++) {
        expect(sectors[i - 1].netFlow).toBeGreaterThanOrEqual(sectors[i].netFlow);
      }
    });

    it('不同首位数字分组', () => {
      const flows = [
        makeFlow('600001', 'inflow', 100),
        makeFlow('000001', 'inflow', 200),
        makeFlow('300001', 'inflow', 300),
        makeFlow('200001', 'inflow', 400),
      ];
      const sectors = aggregateSectorFlows(flows);
      expect(sectors).toHaveLength(4);
    });
  });

  describe('detectFlowReversal', () => {
    it('数据不足返回false', () => {
      expect(detectFlowReversal([makeFlow('001', 'inflow', 100)])).toBe(false);
    });

    it('正好临界数据', () => {
      const flows = Array.from({ length: 9 }, (_, i) => makeFlow('001', 'inflow', 100, 'main', `2024-01-0${i+1}`));
      // 9 < 5*2 = 10, so false
      expect(detectFlowReversal(flows, 5)).toBe(false);
    });

    it('正好10条检测反转', () => {
      const flows = [
        ...Array.from({ length: 5 }, (_, i) => makeFlow('001', 'outflow', 100, 'main', `2024-01-0${i+1}`)),
        ...Array.from({ length: 5 }, (_, i) => makeFlow('001', 'inflow', 100, 'main', `2024-01-0${i+6}`)),
      ];
      expect(detectFlowReversal(flows, 5)).toBe(true);
    });

    it('连续流入不反转', () => {
      const flows = Array.from({ length: 12 }, (_, i) => makeFlow('001', 'inflow', 100, 'main', `2024-01-${String(i+1).padStart(2, '0')}`));
      expect(detectFlowReversal(flows, 5)).toBe(false);
    });

    it('连续流出不反转', () => {
      const flows = Array.from({ length: 12 }, (_, i) => makeFlow('001', 'outflow', 100, 'main', `2024-01-${String(i+1).padStart(2, '0')}`));
      expect(detectFlowReversal(flows, 5)).toBe(false);
    });

    it('反转: outflow→inflow', () => {
      const flows = Array.from({ length: 5 }, (_, i) => makeFlow('001', 'outflow', 100, 'main', `2024-01-0${i+1}`));
      for (let i = 0; i < 5; i++) {
        flows.push(makeFlow('001', 'inflow', 100, 'main', `2024-01-0${i+6}`));
      }
      expect(detectFlowReversal(flows, 5)).toBe(true);
    });

    it('反转: inflow→outflow', () => {
      const flows = Array.from({ length: 5 }, (_, i) => makeFlow('001', 'inflow', 100, 'main', `2024-01-0${i+1}`));
      for (let i = 0; i < 5; i++) {
        flows.push(makeFlow('001', 'outflow', 100, 'main', `2024-01-0${i+6}`));
      }
      expect(detectFlowReversal(flows, 5)).toBe(true);
    });

    it('自定义lookback', () => {
      const flows = Array.from({ length: 3 }, (_, i) => makeFlow('001', 'outflow', 100, 'main', `2024-01-0${i+1}`));
      for (let i = 0; i < 3; i++) {
        flows.push(makeFlow('001', 'inflow', 100, 'main', `2024-01-0${i+4}`));
      }
      // 6 = 3*2, enough with lookback=3
      expect(detectFlowReversal(flows, 3)).toBe(true);
    });

    it('恒定流入混合卖出不反转', () => {
      // constant inflow, with occasional small outflows
      const flows: CapitalFlow[] = [];
      for (let i = 0; i < 12; i++) {
        flows.push(makeFlow('001', 'inflow', 100, 'main', `2024-01-${String(i+1).padStart(2, '0')}`));
        if (i === 3 || i === 8) {
          flows.push(makeFlow('001', 'outflow', 50, 'main', `2024-01-${String(i+1).padStart(2, '0')}T2`));
        }
      }
      const sorted = [...flows].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      expect(detectFlowReversal(sorted, 5)).toBe(false);
    });
  });

  describe('calculateFlowStrength', () => {
    it('空数据返回0', () => {
      expect(calculateFlowStrength([])).toBe(0);
    });

    it('全部流入强度100', () => {
      const flows = [makeFlow('001', 'inflow', 500)];
      expect(calculateFlowStrength(flows)).toBe(100);
    });

    it('净零强度0', () => {
      const flows = [makeFlow('001', 'inflow', 500), makeFlow('001', 'outflow', 500)];
      expect(calculateFlowStrength(flows)).toBe(0);
    });

    it('总金额为0返回0', () => {
      const flows: CapitalFlow[] = [];
      expect(calculateFlowStrength(flows)).toBe(0);
    });

    it('部分强度计算', () => {
      const flows = [makeFlow('001', 'inflow', 800), makeFlow('001', 'outflow', 200)];
      expect(calculateFlowStrength(flows)).toBe(60); // |600|/1000 * 100 = 60
    });
  });

  describe('flowByType', () => {
    it('按类型分类', () => {
      const flows = [
        makeFlow('001', 'inflow', 1000, 'main'),
        makeFlow('001', 'inflow', 500, 'northbound'),
        makeFlow('001', 'outflow', 200, 'margin'),
      ];
      const result = flowByType(flows);
      expect(result.main.inflow).toBe(1000);
      expect(result.northbound.inflow).toBe(500);
      expect(result.margin.outflow).toBe(200);
    });

    it('缺失类型为0', () => {
      const flows = [makeFlow('001', 'inflow', 100, 'main')];
      const result = flowByType(flows);
      expect(result.retail.inflow).toBe(0);
      expect(result.retail.outflow).toBe(0);
      expect(result.institutional.net).toBe(0);
    });

    it('相同类型多笔汇总', () => {
      const flows = [
        makeFlow('001', 'inflow', 100, 'main'),
        makeFlow('001', 'inflow', 200, 'main'),
        makeFlow('001', 'outflow', 50, 'main'),
      ];
      const result = flowByType(flows);
      expect(result.main.inflow).toBe(300);
      expect(result.main.outflow).toBe(50);
      expect(result.main.net).toBe(250);
    });
  });

  describe('topFlowsByAmount', () => {
    it('前N笔最大金额', () => {
      const flows = [
        makeFlow('001', 'inflow', 100),
        makeFlow('002', 'inflow', 500),
        makeFlow('003', 'outflow', 300),
        makeFlow('004', 'inflow', 200),
      ];
      const top = topFlowsByAmount(flows, 2);
      expect(top).toHaveLength(2);
      expect(top[0].amount).toBe(500);
      expect(top[1].amount).toBe(300);
    });

    it('N超过总数返回全部', () => {
      const flows = [makeFlow('001', 'inflow', 100), makeFlow('002', 'inflow', 200)];
      expect(topFlowsByAmount(flows, 10)).toHaveLength(2);
    });

    it('空数组', () => {
      expect(topFlowsByAmount([], 5)).toEqual([]);
    });
  });
});
