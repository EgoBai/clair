import { describe, it, expect } from 'vitest';

/**
 * 资金流向追踪测试
 */

interface CapitalFlow {
  code: string;
  timestamp: string;
  superLarge: { inflow: number; outflow: number };
  large: { inflow: number; outflow: number };
  medium: { inflow: number; outflow: number };
  small: { inflow: number; outflow: number };
}

interface FlowSummary {
  code: string;
  mainNet: number;
  retailNet: number;
  totalNet: number;
  mainRatio: number;
  strength: 'strong_inflow' | 'inflow' | 'neutral' | 'outflow' | 'strong_outflow';
  trend: 'accelerating' | 'stable' | 'decelerating';
}

function summarizeFlow(flows: CapitalFlow[]): FlowSummary[] {
  const byCode = new Map<string, CapitalFlow[]>();
  for (const flow of flows) {
    const existing = byCode.get(flow.code) || [];
    existing.push(flow);
    byCode.set(flow.code, existing);
  }

  const results: FlowSummary[] = [];
  for (const [code, codeFlows] of byCode) {
    const sorted = codeFlows.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const superNet = sorted.reduce((s, f) => s + f.superLarge.inflow - f.superLarge.outflow, 0);
    const largeNet = sorted.reduce((s, f) => s + f.large.inflow - f.large.outflow, 0);
    const mediumNet = sorted.reduce((s, f) => s + f.medium.inflow - f.medium.outflow, 0);
    const smallNet = sorted.reduce((s, f) => s + f.small.inflow - f.small.outflow, 0);

    const mainNet = superNet + largeNet;
    const retailNet = mediumNet + smallNet;
    const totalNet = mainNet + retailNet;
    const totalVolume = sorted.reduce((s, f) =>
      s + f.superLarge.inflow + f.superLarge.outflow +
      f.large.inflow + f.large.outflow +
      f.medium.inflow + f.medium.outflow +
      f.small.inflow + f.small.outflow, 0
    );
    const mainRatio = totalVolume > 0 ? Math.abs(mainNet) / totalVolume * 100 : 0;

    let strength: FlowSummary['strength'];
    if (totalNet > 1e9) strength = 'strong_inflow';
    else if (totalNet > 0) strength = 'inflow';
    else if (totalNet > -1e9) strength = 'outflow';
    else strength = 'strong_outflow';
    if (Math.abs(totalNet) < 1e8) strength = 'neutral';

    let trend: FlowSummary['trend'] = 'stable';
    if (sorted.length >= 3) {
      const recent = sorted.slice(-3);
      const flows = recent.map(f =>
        (f.superLarge.inflow - f.superLarge.outflow) + (f.large.inflow - f.large.outflow)
      );
      if (flows[2] > flows[1] && flows[1] > flows[0]) trend = 'accelerating';
      else if (flows[2] < flows[1] && flows[1] < flows[0]) trend = 'decelerating';
    }

    results.push({
      code,
      mainNet: Math.round(mainNet),
      retailNet: Math.round(retailNet),
      totalNet: Math.round(totalNet),
      mainRatio: Math.round(mainRatio * 100) / 100,
      strength,
      trend,
    });
  }

  return results;
}

function detectSmartMoney(flows: CapitalFlow[], threshold: number = 0.6): string[] {
  const byCode = new Map<string, number[]>();
  for (const flow of flows) {
    const mainIn = flow.superLarge.inflow + flow.large.inflow;
    const totalIn = mainIn + flow.medium.inflow + flow.small.inflow;
    const ratio = totalIn > 0 ? mainIn / totalIn : 0;
    const existing = byCode.get(flow.code) || [];
    existing.push(ratio);
    byCode.set(flow.code, existing);
  }

  const smartMoney: string[] = [];
  for (const [code, ratios] of byCode) {
    const avgRatio = ratios.reduce((s, r) => s + r, 0) / ratios.length;
    if (avgRatio >= threshold) smartMoney.push(code);
  }
  return smartMoney;
}

describe('Capital Flow Tracking', () => {
  const flows: CapitalFlow[] = [
    {
      code: '000001', timestamp: '2024-01-01',
      superLarge: { inflow: 5e8, outflow: 3e8 },
      large: { inflow: 4e8, outflow: 3.5e8 },
      medium: { inflow: 3e8, outflow: 4e8 },
      small: { inflow: 2e8, outflow: 3e8 },
    },
    {
      code: '000001', timestamp: '2024-01-02',
      superLarge: { inflow: 6e8, outflow: 2e8 },
      large: { inflow: 5e8, outflow: 3e8 },
      medium: { inflow: 3.5e8, outflow: 4.5e8 },
      small: { inflow: 2.5e8, outflow: 3.5e8 },
    },
    {
      code: '600519', timestamp: '2024-01-01',
      superLarge: { inflow: 2e8, outflow: 5e8 },
      large: { inflow: 3e8, outflow: 4e8 },
      medium: { inflow: 5e8, outflow: 3e8 },
      small: { inflow: 4e8, outflow: 2e8 },
    },
  ];

  describe('资金流向汇总', () => {
    it('应该计算主力净流入', () => {
      const summary = summarizeFlow(flows);
      const stock1 = summary.find(s => s.code === '000001');
      expect(stock1?.mainNet).toBeGreaterThan(0);
    });

    it('应该计算散户净流入', () => {
      const summary = summarizeFlow(flows);
      const stock1 = summary.find(s => s.code === '000001');
      expect(stock1?.retailNet).toBeLessThan(0);
    });

    it('应该判断资金强度', () => {
      const summary = summarizeFlow(flows);
      for (const s of summary) {
        expect(['strong_inflow', 'inflow', 'neutral', 'outflow', 'strong_outflow']).toContain(s.strength);
      }
    });

    it('应该判断趋势', () => {
      const summary = summarizeFlow(flows);
      for (const s of summary) {
        expect(['accelerating', 'stable', 'decelerating']).toContain(s.trend);
      }
    });
  });

  describe('聪明钱检测', () => {
    it('应该识别主力资金占比高的股票', () => {
      const smart = detectSmartMoney(flows, 0.5);
      expect(smart).toContain('000001');
    });

    it('应该按阈值过滤', () => {
      const smart = detectSmartMoney(flows, 0.9);
      expect(smart.length).toBeLessThanOrEqual(2);
    });
  });
});
