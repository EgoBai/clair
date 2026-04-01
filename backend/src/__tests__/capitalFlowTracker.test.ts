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

describe('资金流向追踪引擎', () => {
  const makeFlow = (code: string, direction: FlowDirection, amount: number, flowType: FlowType = 'main', ts = '2024-01-01'): CapitalFlow => ({
    stockCode: code, timestamp: ts, flowType, amount, direction, percentage: 0.1,
  });

  describe('summarizeFlows', () => {
    it('should calculate net flow', () => {
      const flows = [makeFlow('600519', 'inflow', 1000), makeFlow('600519', 'outflow', 300)];
      const summary = summarizeFlows('600519', flows);
      expect(summary.netFlow).toBe(700);
      expect(summary.flowTrend).toBe('accumulating');
    });

    it('should detect distributing', () => {
      const flows = [makeFlow('001', 'inflow', 100), makeFlow('001', 'outflow', 500)];
      const summary = summarizeFlows('001', flows);
      expect(summary.flowTrend).toBe('distributing');
    });

    it('should calculate main net flow', () => {
      const flows = [
        makeFlow('001', 'inflow', 1000, 'main'),
        makeFlow('001', 'inflow', 500, 'northbound'),
      ];
      const summary = summarizeFlows('001', flows);
      expect(summary.mainNetFlow).toBe(1000);
    });
  });

  describe('aggregateSectorFlows', () => {
    it('should aggregate by first digit', () => {
      const flows = [
        makeFlow('600519', 'inflow', 1000),
        makeFlow('601398', 'inflow', 500),
        makeFlow('000858', 'outflow', 300),
      ];
      const sectors = aggregateSectorFlows(flows);
      expect(sectors.find(s => s.sector === '6')?.netFlow).toBe(1500);
      expect(sectors.find(s => s.sector === '0')?.netFlow).toBe(-300);
    });

    it('should count unique stocks', () => {
      const flows = [
        makeFlow('600519', 'inflow', 100),
        makeFlow('600519', 'inflow', 200),
        makeFlow('601398', 'inflow', 300),
      ];
      const sectors = aggregateSectorFlows(flows);
      expect(sectors.find(s => s.sector === '6')?.stockCount).toBe(2);
    });
  });

  describe('detectFlowReversal', () => {
    it('should return false for insufficient data', () => {
      expect(detectFlowReversal([makeFlow('001', 'inflow', 100)])).toBe(false);
    });

    it('should detect reversal', () => {
      const flows = [
        ...Array.from({ length: 5 }, (_, i) => makeFlow('001', 'outflow', 100, 'main', `2024-01-0${i+1}`)),
        ...Array.from({ length: 5 }, (_, i) => makeFlow('001', 'inflow', 100, 'main', `2024-01-0${i+6}`)),
      ];
      expect(detectFlowReversal(flows, 5)).toBe(true);
    });

    it('should not detect reversal for consistent flow', () => {
      const flows = Array.from({ length: 12 }, (_, i) => makeFlow('001', 'inflow', 100, 'main', `2024-01-${String(i+1).padStart(2, '0')}`));
      expect(detectFlowReversal(flows, 5)).toBe(false);
    });
  });
});
