/**
 * 资金流向深层测试
 * 覆盖主力资金计算、板块资金流向、资金分类、历史趋势、资金强度指标
 */

import { describe, it, expect } from 'vitest';

// 核心类型
interface FundFlowRecord {
  symbol: string;
  name: string;
  mainNet: number;        // 主力净额
  superLargeNet: number;  // 超大单净额
  largeNet: number;       // 大单净额
  mediumNet: number;      // 中单净额
  smallNet: number;       // 小单净额
  tradeDate: string;
}

interface IndustryFlow {
  industry: string;
  mainNet: number;
  netInflow: number;
  stockCount: number;
  topStocks: Array<{ symbol: string; name: string; mainNet: number }>;
}

// 资金分类
function categorizeFlowByAmount(amount: number): {
  category: '超大单' | '大单' | '中单' | '小单';
  isMainForce: boolean;
} {
  const abs = Math.abs(amount);
  if (abs >= 500000) return { category: '超大单', isMainForce: true };
  if (abs >= 100000) return { category: '大单', isMainForce: true };
  if (abs >= 20000) return { category: '中单', isMainForce: false };
  return { category: '小单', isMainForce: false };
}

// 资金方向
function getFlowDirection(net: number): 'inflow' | 'outflow' | 'neutral' {
  if (net > 0) return 'inflow';
  if (net < 0) return 'outflow';
  return 'neutral';
}

// 资金强度
function calculateFlowIntensity(flow: FundFlowRecord): {
  score: number;
  level: '弱势' | '中性' | '偏强' | '强势' | '极强';
  mainForceRatio: number;
} {
  const totalNet = Math.abs(flow.superLargeNet) + Math.abs(flow.largeNet) + Math.abs(flow.mediumNet) + Math.abs(flow.smallNet);
  if (totalNet === 0) return { score: 0, level: '中性', mainForceRatio: 0 };

  const mainForce = flow.superLargeNet + flow.largeNet;
  const mainForceRatio = Math.abs(mainForce) / totalNet;

  let score = mainForceRatio * 100;
  if (mainForce > 0) score += 20;
  if (flow.superLargeNet > flow.largeNet) score += 10;
  score = Math.min(100, Math.max(0, score));

  let level: '弱势' | '中性' | '偏强' | '强势' | '极强';
  if (score >= 80) level = '极强';
  else if (score >= 60) level = '强势';
  else if (score >= 40) level = '偏强';
  else if (score >= 20) level = '中性';
  else level = '弱势';

  return { score, level, mainForceRatio };
}

// 板块资金汇总
function aggregateIndustryFlows(records: FundFlowRecord[], industryMap: Map<string, string>): IndustryFlow[] {
  const flows = new Map<string, IndustryFlow>();

  for (const r of records) {
    const industry = industryMap.get(r.symbol) || '其他';
    const existing = flows.get(industry);
    if (existing) {
      existing.mainNet += r.mainNet;
      existing.netInflow += r.mainNet;
      existing.stockCount++;
      existing.topStocks.push({ symbol: r.symbol, name: r.name, mainNet: r.mainNet });
    } else {
      flows.set(industry, {
        industry,
        mainNet: r.mainNet,
        netInflow: r.mainNet,
        stockCount: 1,
        topStocks: [{ symbol: r.symbol, name: r.name, mainNet: r.mainNet }],
      });
    }
  }

  return Array.from(flows.values()).sort((a, b) => b.mainNet - a.mainNet);
}

// 趋势分析
function analyzeFlowTrend(records: FundFlowRecord[]): {
  trend: '流入加速' | '流入减速' | '流出加速' | '流出减速' | '震荡';
  avgDailyFlow: number;
  volatility: number;
  consecutiveDays: number;
} {
  if (records.length < 2) {
    return { trend: '震荡', avgDailyFlow: 0, volatility: 0, consecutiveDays: 0 };
  }

  const sorted = [...records].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  const flows = sorted.map(r => r.mainNet);
  const avgDailyFlow = flows.reduce((s, f) => s + f, 0) / flows.length;

  // 波动率
  const mean = avgDailyFlow;
  const variance = flows.reduce((s, f) => s + (f - mean) ** 2, 0) / flows.length;
  const volatility = Math.sqrt(variance);

  // 趋势: 前半段 vs 后半段
  const mid = Math.floor(flows.length / 2);
  const firstHalfAvg = flows.slice(0, mid).reduce((s, f) => s + f, 0) / mid;
  const secondHalfAvg = flows.slice(mid).reduce((s, f) => s + f, 0) / (flows.length - mid);

  let trend: '流入加速' | '流入减速' | '流出加速' | '流出减速' | '震荡';
  if (firstHalfAvg > 0 && secondHalfAvg > 0) {
    trend = secondHalfAvg > firstHalfAvg ? '流入加速' : '流入减速';
  } else if (firstHalfAvg < 0 && secondHalfAvg < 0) {
    trend = secondHalfAvg < firstHalfAvg ? '流出加速' : '流出减速';
  } else {
    trend = '震荡';
  }

  // 连续天数
  let consecutiveDays = 1;
  const lastDirection = flows[flows.length - 1] >= 0;
  for (let i = flows.length - 2; i >= 0; i--) {
    if ((flows[i] >= 0) === lastDirection) consecutiveDays++;
    else break;
  }

  return { trend, avgDailyFlow, volatility, consecutiveDays };
}

// 资金净额汇总
function summarizeFundFlows(records: FundFlowRecord[]): {
  totalMainNet: number;
  totalSuperLargeNet: number;
  totalLargeNet: number;
  totalMediumNet: number;
  totalSmallNet: number;
  inflowCount: number;
  outflowCount: number;
  mainInflowCount: number;
} {
  let totalMainNet = 0, totalSuperLargeNet = 0, totalLargeNet = 0, totalMediumNet = 0, totalSmallNet = 0;
  let inflowCount = 0, outflowCount = 0, mainInflowCount = 0;

  for (const r of records) {
    totalMainNet += r.mainNet;
    totalSuperLargeNet += r.superLargeNet;
    totalLargeNet += r.largeNet;
    totalMediumNet += r.mediumNet;
    totalSmallNet += r.smallNet;
    if (r.mainNet > 0) { inflowCount++; mainInflowCount++; }
    else if (r.mainNet < 0) outflowCount++;
  }

  return { totalMainNet, totalSuperLargeNet, totalLargeNet, totalMediumNet, totalSmallNet, inflowCount, outflowCount, mainInflowCount };
}

// 格式化金额
function formatAmount(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 100000000) return `${sign}${(abs / 100000000).toFixed(2)}亿`;
  if (abs >= 10000) return `${sign}${(abs / 10000).toFixed(2)}万`;
  return `${sign}${abs.toFixed(0)}`;
}

// 测试数据
const sampleFlows: FundFlowRecord[] = [
  { symbol: '600519', name: '贵州茅台', mainNet: 500000000, superLargeNet: 300000000, largeNet: 200000000, mediumNet: -100000000, smallNet: -50000000, tradeDate: '2026-03-20' },
  { symbol: '000858', name: '五粮液', mainNet: -200000000, superLargeNet: -100000000, largeNet: -100000000, mediumNet: 50000000, smallNet: 100000000, tradeDate: '2026-03-20' },
  { symbol: '601318', name: '中国平安', mainNet: 150000000, superLargeNet: 100000000, largeNet: 50000000, mediumNet: -30000000, smallNet: -20000000, tradeDate: '2026-03-20' },
  { symbol: '000333', name: '美的集团', mainNet: 80000000, superLargeNet: 50000000, largeNet: 30000000, mediumNet: -10000000, smallNet: -5000000, tradeDate: '2026-03-20' },
  { symbol: '002594', name: '比亚迪', mainNet: -300000000, superLargeNet: -200000000, largeNet: -100000000, mediumNet: 80000000, smallNet: 120000000, tradeDate: '2026-03-20' },
];

const trendData: FundFlowRecord[] = [
  { symbol: '600519', name: '', mainNet: 100, superLargeNet: 50, largeNet: 50, mediumNet: -20, smallNet: -10, tradeDate: '2026-03-01' },
  { symbol: '600519', name: '', mainNet: 150, superLargeNet: 80, largeNet: 70, mediumNet: -30, smallNet: -20, tradeDate: '2026-03-02' },
  { symbol: '600519', name: '', mainNet: 200, superLargeNet: 120, largeNet: 80, mediumNet: -40, smallNet: -30, tradeDate: '2026-03-03' },
  { symbol: '600519', name: '', mainNet: 300, superLargeNet: 180, largeNet: 120, mediumNet: -50, smallNet: -40, tradeDate: '2026-03-04' },
  { symbol: '600519', name: '', mainNet: 400, superLargeNet: 250, largeNet: 150, mediumNet: -60, smallNet: -50, tradeDate: '2026-03-05' },
];

// ==================== 资金分类 ====================

describe('categorizeFlowByAmount 资金分类', () => {
  it('大额资金应为超大单', () => {
    const result = categorizeFlowByAmount(1000000);
    expect(result.category).toBe('超大单');
    expect(result.isMainForce).toBe(true);
  });

  it('负大额资金应为超大单', () => {
    expect(categorizeFlowByAmount(-800000).category).toBe('超大单');
  });

  it('中等资金应为大单', () => {
    const result = categorizeFlowByAmount(200000);
    expect(result.category).toBe('大单');
    expect(result.isMainForce).toBe(true);
  });

  it('小资金应为中单', () => {
    const result = categorizeFlowByAmount(50000);
    expect(result.category).toBe('中单');
    expect(result.isMainForce).toBe(false);
  });

  it('小额资金应为小单', () => {
    const result = categorizeFlowByAmount(5000);
    expect(result.category).toBe('小单');
    expect(result.isMainForce).toBe(false);
  });

  it('边界值应正确分类', () => {
    expect(categorizeFlowByAmount(500000).category).toBe('超大单');
    expect(categorizeFlowByAmount(100000).category).toBe('大单');
    expect(categorizeFlowByAmount(20000).category).toBe('中单');
  });
});

// ==================== 资金方向 ====================

describe('getFlowDirection 资金方向', () => {
  it('正数应为流入', () => {
    expect(getFlowDirection(100)).toBe('inflow');
  });

  it('负数应为流出', () => {
    expect(getFlowDirection(-100)).toBe('outflow');
  });

  it('零应为中性', () => {
    expect(getFlowDirection(0)).toBe('neutral');
  });
});

// ==================== 资金强度 ====================

describe('calculateFlowIntensity 资金强度', () => {
  it('主力大幅流入应为极强', () => {
    const flow = sampleFlows[0]; // 茅台主力净额5亿
    const result = calculateFlowIntensity(flow);
    expect(result.level).toBe('极强');
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it('主力流出应有较低分数', () => {
    const flow = sampleFlows[4]; // 比亚迪主力净额-3亿
    const result = calculateFlowIntensity(flow);
    expect(result.score).toBeLessThanOrEqual(60);
  });

  it('全零数据应为中性', () => {
    const flow: FundFlowRecord = { symbol: '', name: '', mainNet: 0, superLargeNet: 0, largeNet: 0, mediumNet: 0, smallNet: 0, tradeDate: '' };
    const result = calculateFlowIntensity(flow);
    expect(result.level).toBe('中性');
    expect(result.score).toBe(0);
  });

  it('score应在0-100之间', () => {
    for (const flow of sampleFlows) {
      const result = calculateFlowIntensity(flow);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    }
  });

  it('mainForceRatio应在0-1之间', () => {
    for (const flow of sampleFlows) {
      const result = calculateFlowIntensity(flow);
      expect(result.mainForceRatio).toBeGreaterThanOrEqual(0);
      expect(result.mainForceRatio).toBeLessThanOrEqual(1);
    }
  });
});

// ==================== 板块汇总 ====================

describe('aggregateIndustryFlows 板块资金汇总', () => {
  it('应按行业聚合', () => {
    const industryMap = new Map([
      ['600519', '白酒'], ['000858', '白酒'], ['601318', '金融'], ['000333', '家电'], ['002594', '汽车'],
    ]);
    const result = aggregateIndustryFlows(sampleFlows, industryMap);
    const baijiu = result.find(r => r.industry === '白酒');
    expect(baijiu?.stockCount).toBe(2);
  });

  it('应按主力净额降序排列', () => {
    const industryMap = new Map([
      ['600519', '白酒'], ['000858', '白酒'], ['601318', '金融'], ['000333', '家电'], ['002594', '汽车'],
    ]);
    const result = aggregateIndustryFlows(sampleFlows, industryMap);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].mainNet).toBeLessThanOrEqual(result[i - 1].mainNet);
    }
  });

  it('空数组应返回空', () => {
    expect(aggregateIndustryFlows([], new Map())).toEqual([]);
  });

  it('未知行业应归入其他', () => {
    const result = aggregateIndustryFlows([sampleFlows[0]], new Map());
    expect(result[0].industry).toBe('其他');
  });
});

// ==================== 趋势分析 ====================

describe('analyzeFlowTrend 资金趋势分析', () => {
  it('应检测流入加速趋势', () => {
    const result = analyzeFlowTrend(trendData);
    expect(result.trend).toBe('流入加速');
  });

  it('单条数据应返回震荡', () => {
    const result = analyzeFlowTrend([sampleFlows[0]]);
    expect(result.trend).toBe('震荡');
  });

  it('空数组应返回震荡', () => {
    const result = analyzeFlowTrend([]);
    expect(result.trend).toBe('震荡');
  });

  it('avgDailyFlow应正确计算', () => {
    const result = analyzeFlowTrend(trendData);
    const expected = trendData.reduce((s, r) => s + r.mainNet, 0) / trendData.length;
    expect(result.avgDailyFlow).toBeCloseTo(expected);
  });

  it('volatility应为非负值', () => {
    const result = analyzeFlowTrend(trendData);
    expect(result.volatility).toBeGreaterThanOrEqual(0);
  });

  it('consecutiveDays应至少为1', () => {
    const result = analyzeFlowTrend(trendData);
    expect(result.consecutiveDays).toBeGreaterThanOrEqual(1);
  });

  it('流出趋势应被检测', () => {
    const outflowData: FundFlowRecord[] = [
      { symbol: 'A', name: '', mainNet: -100, superLargeNet: -50, largeNet: -50, mediumNet: 0, smallNet: 0, tradeDate: '2026-03-01' },
      { symbol: 'A', name: '', mainNet: -200, superLargeNet: -120, largeNet: -80, mediumNet: 0, smallNet: 0, tradeDate: '2026-03-02' },
      { symbol: 'A', name: '', mainNet: -300, superLargeNet: -180, largeNet: -120, mediumNet: 0, smallNet: 0, tradeDate: '2026-03-03' },
    ];
    const result = analyzeFlowTrend(outflowData);
    expect(result.trend).toBe('流出加速');
  });
});

// ==================== 资金汇总 ====================

describe('summarizeFundFlows 资金汇总', () => {
  it('应正确汇总主力净额', () => {
    const result = summarizeFundFlows(sampleFlows);
    const expectedMainNet = sampleFlows.reduce((s, r) => s + r.mainNet, 0);
    expect(result.totalMainNet).toBe(expectedMainNet);
  });

  it('应正确统计流入/流出数量', () => {
    const result = summarizeFundFlows(sampleFlows);
    expect(result.inflowCount + result.outflowCount).toBeLessThanOrEqual(sampleFlows.length);
    expect(result.inflowCount).toBe(3); // 茅台、平安、美的
    expect(result.outflowCount).toBe(2); // 五粮液、比亚迪
  });

  it('空数组应返回零值', () => {
    const result = summarizeFundFlows([]);
    expect(result.totalMainNet).toBe(0);
    expect(result.inflowCount).toBe(0);
    expect(result.outflowCount).toBe(0);
  });
});

// ==================== 金额格式化 ====================

describe('formatAmount 金额格式化', () => {
  it('亿级应显示亿', () => {
    expect(formatAmount(500000000)).toContain('亿');
  });

  it('万级应显示万', () => {
    expect(formatAmount(500000)).toContain('万');
  });

  it('负数应带负号', () => {
    expect(formatAmount(-500000000)).toContain('-');
  });

  it('零应显示0', () => {
    expect(formatAmount(0)).toBe('0');
  });

  it('小数应保留2位', () => {
    const result = formatAmount(123456789);
    const parts = result.replace(/[^\d.]/g, '');
    if (parts.includes('.')) {
      const decimal = parts.split('.')[1];
      expect(decimal.length).toBeLessThanOrEqual(2);
    }
  });
});
