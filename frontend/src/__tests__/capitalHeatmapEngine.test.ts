import { describe, it, expect } from 'vitest';

// 资金流向热力图引擎
interface FlowData {
  sector: string;
  inflow: number;
  outflow: number;
  netFlow: number;
  volume: number;
  stocks: { symbol: string; netFlow: number }[];
}

interface HeatmapCell {
  sector: string;
  intensity: number; // 0-1
  color: string;
  netFlow: number;
  rank: number;
}

function calcNetFlow(data: FlowData[]): FlowData[] {
  return data.map(d => ({ ...d, netFlow: d.inflow - d.outflow }));
}

function normalizeFlows(data: FlowData[]): HeatmapCell[] {
  if (data.length === 0) return [];
  const nets = data.map(d => d.netFlow);
  const maxAbs = Math.max(...nets.map(Math.abs), 1);
  const sorted = [...data].sort((a, b) => b.netFlow - a.netFlow);
  return sorted.map((d, i) => {
    const normalized = d.netFlow / maxAbs;
    return {
      sector: d.sector,
      intensity: Math.abs(normalized),
      color: normalized >= 0 ? `rgba(220,50,50,${Math.abs(normalized)})` : `rgba(50,180,50,${Math.abs(normalized)})`,
      netFlow: d.netFlow,
      rank: i + 1,
    };
  });
}

function aggregateSectorFlows(stocks: { sector: string; netFlow: number }[]): FlowData[] {
  const map = new Map<string, { inflow: number; outflow: number; volume: number; stocks: { symbol: string; netFlow: number }[] }>();
  stocks.forEach(s => {
    const key = s.sector;
    if (!map.has(key)) map.set(key, { inflow: 0, outflow: 0, volume: 0, stocks: [] });
    const entry = map.get(key)!;
    if (s.netFlow > 0) entry.inflow += s.netFlow;
    else entry.outflow += Math.abs(s.netFlow);
    entry.volume += Math.abs(s.netFlow);
    entry.stocks.push({ symbol: s.sector, netFlow: s.netFlow });
  });
  return Array.from(map.entries()).map(([sector, v]) => ({
    sector,
    inflow: v.inflow,
    outflow: v.outflow,
    netFlow: v.inflow - v.outflow,
    volume: v.volume,
    stocks: v.stocks,
  }));
}

function findTopFlowSectors(data: FlowData[], n: number): FlowData[] {
  return [...data].sort((a, b) => b.netFlow - a.netFlow).slice(0, n);
}

describe('资金流向热力图引擎', () => {
  const flows: FlowData[] = [
    { sector: '科技', inflow: 5000, outflow: 3000, netFlow: 2000, volume: 8000, stocks: [] },
    { sector: '金融', inflow: 4000, outflow: 4500, netFlow: -500, volume: 8500, stocks: [] },
    { sector: '消费', inflow: 3000, outflow: 2000, netFlow: 1000, volume: 5000, stocks: [] },
    { sector: '医药', inflow: 2000, outflow: 3500, netFlow: -1500, volume: 5500, stocks: [] },
  ];

  it('应计算净流入', () => {
    const result = calcNetFlow(flows);
    expect(result[0].netFlow).toBe(2000);
    expect(result[1].netFlow).toBe(-500);
  });

  it('应标准化热力图数据', () => {
    const cells = normalizeFlows(flows);
    expect(cells.length).toBe(flows.length);
    cells.forEach(c => {
      expect(c.intensity).toBeGreaterThanOrEqual(0);
      expect(c.intensity).toBeLessThanOrEqual(1);
      expect(c.rank).toBeGreaterThan(0);
    });
  });

  it('最大净流入应排第一位', () => {
    const cells = normalizeFlows(flows);
    expect(cells[0].sector).toBe('科技');
    expect(cells[0].rank).toBe(1);
  });

  it('空数据应返回空数组', () => {
    expect(normalizeFlows([])).toEqual([]);
  });

  it('应聚合行业资金流', () => {
    const stocks = [
      { sector: '科技', netFlow: 100 },
      { sector: '科技', netFlow: -50 },
      { sector: '金融', netFlow: 200 },
    ];
    const agg = aggregateSectorFlows(stocks);
    expect(agg.length).toBe(2);
    const tech = agg.find(a => a.sector === '科技');
    expect(tech?.inflow).toBe(100);
    expect(tech?.outflow).toBe(50);
  });

  it('应找出前N个行业', () => {
    const top = findTopFlowSectors(flows, 2);
    expect(top.length).toBe(2);
    expect(top[0].sector).toBe('科技');
    expect(top[1].sector).toBe('消费');
  });

  it('请求超过数量应返回全部', () => {
    expect(findTopFlowSectors(flows, 100).length).toBe(flows.length);
  });

  it('热力图颜色应区分流入流出', () => {
    const cells = normalizeFlows(flows);
    const tech = cells.find(c => c.sector === '科技');
    const finance = cells.find(c => c.sector === '金融');
    expect(tech?.color).toContain('220,50,50');
    expect(finance?.color).toContain('50,180,50');
  });

  it('单一行业应正确处理', () => {
    const single: FlowData[] = [{ sector: 'A', inflow: 100, outflow: 0, netFlow: 100, volume: 100, stocks: [] }];
    const cells = normalizeFlows(single);
    expect(cells.length).toBe(1);
    expect(cells[0].intensity).toBe(1);
    expect(cells[0].rank).toBe(1);
  });

  it('等额流入流出净流量应为零', () => {
    const equal: FlowData[] = [{ sector: 'X', inflow: 500, outflow: 500, netFlow: 0, volume: 1000, stocks: [] }];
    const cells = normalizeFlows(equal);
    expect(cells[0].intensity).toBe(0);
  });
});
