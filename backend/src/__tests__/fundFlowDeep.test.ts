/**
 * 资金流向深层测试
 * 覆盖主力资金计算、板块资金流向、资金分类、历史趋势、资金强度指标
 *
 * 一、原自抄实现的问题
 * 1. 原文件把 7 个资金流函数（categorizeFlowByAmount/getFlowDirection/calculateFlowIntensity/
 *    aggregateIndustryFlows/analyzeFlowTrend/summarizeFundFlows/formatAmount）完整复制进测试，
 *    断言验证的是测试内副本，生产实现变化不会让测试失败。
 * 2. 金额分档阈值漂移：副本用 50 万/10 万/2 万，生产 FLOW_THRESHOLDS 是 1 亿/5000 万/1000 万/100 万
 *    （backend/src/models/FundFlow.ts:104）。生产没有按金额分档的纯函数，只有阈值常量，故
 *    categorizeFlowByAmount 保留内联（见第三节），另加一条测试锁生产阈值常量。
 * 3. 强度口径不同：副本 calculateFlowIntensity(flow) 按 |主力|/Σ|各档| * 100 加正向奖励，返回
 *    score/level/mainForceRatio 五档；生产 calculateFlowIntensity(mainNetFlow, turnover) 只按
 *    |mainNetFlow|/turnover 分 'strong'/'moderate'/'weak' 三档，不区分流入流出，也不看超大单。
 *    旧断言"主力流出应有较低分数（score<=60）"错：生产口径下 -3 亿/5 亿 = 0.6 > 0.1 仍是 'strong'，
 *    已按生产改为"大额流出同样为 strong"。
 * 4. 趋势口径不同：副本按前/后半段均值同号判"流入加速/流出加速"，另有 volatility 字段；生产
 *    sectorFundFlow.ts:79 按尾部连续流入/流出 ≥3 天定 trend，返回 flowAcceleration（最近 3 点差分）
 *    和 avgDailyFlow；sectorFundFlowEngine.ts:101 用 half-split momentum 与 consistency。旧断言
 *    "volatility>=0" 在生产无对应字段（旧断言无依据），改为 momentum/consistency 的确定值断言。
 * 5. 汇总契约不同：副本返回 totalMainNet/各档合计/inflowCount 等；生产 summarizeFundFlows 返回
 *    totalInflow/totalOutflow/netFlow/topInflowSectors/topOutflowSectors/mainNetInflow/retailNetInflow。
 *    生产 topOutflowSectors = sorted.slice(-5).reverse()，流出板块不足 5 个时会混入净流入板块
 *    （本夹具实测第 3 位起是美的 +8000 万、平安 +1.5 亿、茅台 +5 亿）——生产行为只记录不改。
 * 6. formatAmount(0) 副本返回 '0'，生产 formatFlowAmount(0) 返回 '+0.00'；副本"小数保留 2 位"
 *    断言包在 if (parts.includes('.')) 内，条件不成立时零断言（违反禁止零断言守卫），已改为
 *    精确字符串断言。
 * 7. aggregateIndustryFlows 是测试内自抄聚合器，生产无同契约导出（frontend/src/utils/fundFlowEngine.ts
 *    的 rankSectorFlows 等入参是 {code,name,netFlow,totalAmount,stocks[]}，不是 records+industryMap），
 *    保留内联并注明（见第三节）。
 *
 * 二、绑定生产实现（file:line）
 * - FLOW_THRESHOLDS            backend/src/models/FundFlow.ts:104
 * - classifyFlowDirection      backend/src/models/FundFlow.ts:116
 * - calculateFlowIntensity     backend/src/models/FundFlow.ts:122
 * - formatFlowAmount           backend/src/models/FundFlow.ts:133
 * - summarizeFundFlows         frontend/src/utils/sectorFundFlow.ts:51
 * - analyzeFlowTrend（主）     frontend/src/utils/sectorFundFlow.ts:79
 * - analyzeFlowTrend（副）     frontend/src/utils/sectorFundFlowEngine.ts:101（momentum/consistency）
 * D43 跨包依赖核查：FundFlow.ts、sectorFundFlow.ts、sectorFundFlowEngine.ts 顶部均无 import，
 * 无 xlsx/file-saver 等第三方浏览器依赖，backend 测试可直接加载。
 *
 * 三、未迁移清单及原因
 * - categorizeFlowByAmount：生产无金额分档纯函数（只有 FLOW_THRESHOLDS 常量），保留内联；
 *   新增一条测试直接断言生产阈值，避免再次阈值漂移。
 * - aggregateIndustryFlows：生产无同契约聚合导出（fundFlowEngine 入参契约不同），保留内联。
 * - 副本 calculateFlowIntensity(flow) 的 score/level/mainForceRatio 语义：生产
 *   FundFlowService.calculateFlowStrength(symbol) 是有状态类方法，依赖 addStockFlow 内的
 *   运行时时间戳（backend/src/services/fundFlowService.ts:30-31），无法在确定性单测中注入，
 *   未迁移；生产时间戳缺陷只记录不改。
 * - 副本 analyzeFlowTrend 的 volatility：生产两份实现均无该字段，已由 momentum/consistency 覆盖。
 */

import { describe, it, expect } from 'vitest';
import {
  FLOW_THRESHOLDS,
  classifyFlowDirection,
  calculateFlowIntensity,
  formatFlowAmount,
} from '../models/FundFlow';
import {
  summarizeFundFlows,
  analyzeFlowTrend,
  type SectorFundFlow,
} from '../../../frontend/src/utils/sectorFundFlow';
import { analyzeFlowTrend as analyzeFlowTrendMomentum } from '../../../frontend/src/utils/sectorFundFlowEngine';

// 测试夹具的输入形态（生产 FundFlow 模型字段更全，夹具只保留本文件需要的列）
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

// 本地保留的金额分档（生产无同契约导出，见头部第三节；仅用于锁定阈值漂移的事实）
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

// 本地保留的行业聚合（生产无同契约导出，见头部第三节）
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

const outflowData: FundFlowRecord[] = [
  { symbol: 'A', name: '', mainNet: -100, superLargeNet: -50, largeNet: -50, mediumNet: 0, smallNet: 0, tradeDate: '2026-03-01' },
  { symbol: 'A', name: '', mainNet: -200, superLargeNet: -120, largeNet: -80, mediumNet: 0, smallNet: 0, tradeDate: '2026-03-02' },
  { symbol: 'A', name: '', mainNet: -300, superLargeNet: -180, largeNet: -120, mediumNet: 0, smallNet: 0, tradeDate: '2026-03-03' },
];

const toHistorical = (records: FundFlowRecord[]) =>
  records.map(r => ({ date: r.tradeDate, netInflow: r.mainNet }));

const toPeriods = (records: FundFlowRecord[]) =>
  records.map(r => ({ time: r.tradeDate, netFlow: r.mainNet }));

const toSectorFlows = (records: FundFlowRecord[]): SectorFundFlow[] =>
  records.map(r => ({
    sector: r.name,
    netInflow: r.mainNet,
    mainInflow: r.superLargeNet + r.largeNet,
    retailInflow: r.mediumNet + r.smallNet,
    volume: 0,
    changePercent: 0,
    turnoverRate: 0,
  }));

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

  it('生产分档阈值应为 1亿/5000万/1000万/100万（副本 50万/10万/2万 已漂移）', () => {
    expect(FLOW_THRESHOLDS.superLarge).toBe(100000000);
    expect(FLOW_THRESHOLDS.large).toBe(50000000);
    expect(FLOW_THRESHOLDS.medium).toBe(10000000);
    expect(FLOW_THRESHOLDS.small).toBe(1000000);
  });
});

// ==================== 资金方向 ====================

describe('getFlowDirection 资金方向', () => {
  it('正数应为流入', () => {
    expect(classifyFlowDirection(100)).toBe('inflow');
  });

  it('负数应为流出', () => {
    expect(classifyFlowDirection(-100)).toBe('outflow');
  });

  it('零应为中性', () => {
    expect(classifyFlowDirection(0)).toBe('neutral');
  });
});

// ==================== 资金强度 ====================

describe('calculateFlowIntensity 资金强度', () => {
  it('主力大幅流入应为强势', () => {
    // 旧断言"极强 score>=80"是副本五档口径，生产只有 strong/moderate/weak
    expect(calculateFlowIntensity(500000000, 650000000)).toBe('strong');
  });

  it('主力大幅流出同样为强势（生产按绝对强度，旧断言 score<=60 错误）', () => {
    expect(calculateFlowIntensity(-300000000, 500000000)).toBe('strong');
  });

  it('全部为零应为弱势', () => {
    // 旧断言"中性 score 0"是副本口径；生产 turnover=0 直接 weak，且无 score
    expect(calculateFlowIntensity(0, 0)).toBe('weak');
    expect(calculateFlowIntensity(0, 1000000000)).toBe('weak');
  });

  it('强度阈值边界应正确', () => {
    expect(calculateFlowIntensity(10000000, 100000000)).toBe('moderate');   // ratio=0.1
    expect(calculateFlowIntensity(10000001, 100000000)).toBe('strong');     // ratio>0.1
    expect(calculateFlowIntensity(5000000, 100000000)).toBe('weak');        // ratio=0.05
    expect(calculateFlowIntensity(5000001, 100000000)).toBe('moderate');    // ratio>0.05
    expect(calculateFlowIntensity(4999999, 100000000)).toBe('weak');        // ratio<0.05
    expect(calculateFlowIntensity(9999999, 100000000)).toBe('moderate');    // 0.05<ratio<0.1
  });

  it('强度按比率归一，与绝对量级无关', () => {
    expect(calculateFlowIntensity(30000000, 200000000)).toBe('strong');     // 0.15
    expect(calculateFlowIntensity(30000000, 1000000000)).toBe('weak');      // 0.03
    expect(calculateFlowIntensity(15000000, 100000000)).toBe('strong');     // 0.15，绝对量更小
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
    expect(baijiu?.mainNet).toBe(300000000);
  });

  it('应按主力净额降序排列', () => {
    const industryMap = new Map([
      ['600519', '白酒'], ['000858', '白酒'], ['601318', '金融'], ['000333', '家电'], ['002594', '汽车'],
    ]);
    const result = aggregateIndustryFlows(sampleFlows, industryMap);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].mainNet).toBeLessThanOrEqual(result[i - 1].mainNet);
    }
    expect(result.map(r => r.industry)).toEqual(['白酒', '金融', '家电', '汽车']);
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
  it('连续流入趋势应被识别（主绑定 sectorFundFlow）', () => {
    const result = analyzeFlowTrend('600519', toHistorical(trendData));
    expect(result.trend).toBe('inflow');
    expect(result.consecutiveInflowDays).toBe(5);
    expect(result.consecutiveOutflowDays).toBe(0);
  });

  it('单条数据应为中性（市场趋势与动量分别断言）', () => {
    const single = [{ ...sampleFlows[0], mainNet: 5 }];
    expect(analyzeFlowTrend('600519', toHistorical(single)).trend).toBe('neutral');
    expect(analyzeFlowTrend('600519', toHistorical(single)).consecutiveInflowDays).toBe(1);
    // 单元素时 half=0，production momentum 退化为该元素本身（缺陷只记录不改）
    expect(analyzeFlowTrendMomentum('600519', toPeriods(single)).momentum).toBe(5);
    expect(analyzeFlowTrendMomentum('600519', toPeriods(single)).direction).toBe('inflow');
  });

  it('空数组应为中性', () => {
    const result = analyzeFlowTrend('600519', []);
    expect(result.trend).toBe('neutral');
    expect(result.avgDailyFlow).toBe(0);
    const momentum = analyzeFlowTrendMomentum('600519', []);
    expect(momentum.direction).toBe('neutral');
    expect(momentum.momentum).toBe(0);
    expect(momentum.consistency).toBe(0);
  });

  it('avgDailyFlow 应精确等于均值', () => {
    expect(analyzeFlowTrend('600519', toHistorical(trendData)).avgDailyFlow).toBe(230);
  });

  it('趋势动量应按前后半段均值计算（替代无生产字段的 volatility 断言）', () => {
    const sector = analyzeFlowTrend('600519', toHistorical(trendData));
    expect(sector.flowAcceleration).toBe(0);
    const momentum = analyzeFlowTrendMomentum('600519', toPeriods(trendData));
    expect(momentum.direction).toBe('inflow');
    expect(momentum.momentum).toBe(225);   // 后半 [300,400] 均值 350 - 前半 [100,150] 均值 125
    expect(momentum.consistency).toBe(1);
  });

  it('连续天数应精确统计，不被中途反向打断', () => {
    const mixed: FundFlowRecord[] = [
      { symbol: 'A', name: '', mainNet: 100, superLargeNet: 0, largeNet: 0, mediumNet: 0, smallNet: 0, tradeDate: '2026-03-01' },
      { symbol: 'A', name: '', mainNet: -50, superLargeNet: 0, largeNet: 0, mediumNet: 0, smallNet: 0, tradeDate: '2026-03-02' },
      { symbol: 'A', name: '', mainNet: -20, superLargeNet: 0, largeNet: 0, mediumNet: 0, smallNet: 0, tradeDate: '2026-03-03' },
      { symbol: 'A', name: '', mainNet: -30, superLargeNet: 0, largeNet: 0, mediumNet: 0, smallNet: 0, tradeDate: '2026-03-04' },
    ];
    const result = analyzeFlowTrend('A', toHistorical(mixed));
    expect(result.consecutiveOutflowDays).toBe(3);
    // 生产从尾部数到反向日后先 +1 再 break，因此 inflow 计数为 1
    expect(result.consecutiveInflowDays).toBe(1);
    expect(result.trend).toBe('outflow');
  });

  it('流出趋势应被识别（主绑定 trend + 副绑定 momentum）', () => {
    const result = analyzeFlowTrend('A', toHistorical(outflowData));
    expect(result.trend).toBe('outflow');
    expect(result.consecutiveOutflowDays).toBe(3);
    expect(result.avgDailyFlow).toBe(-200);
    const momentum = analyzeFlowTrendMomentum('A', toPeriods(outflowData));
    expect(momentum.direction).toBe('outflow');
    expect(momentum.momentum).toBe(-200);
    expect(momentum.consistency).toBe(1);
  });
});

// ==================== 资金汇总 ====================

describe('summarizeFundFlows 资金汇总', () => {
  it('应正确汇总主力净额', () => {
    const result = summarizeFundFlows(toSectorFlows(sampleFlows));
    expect(result.netFlow).toBe(230000000);
    expect(result.mainNetInflow).toBe(230000000);
    expect(result.retailNetInflow).toBe(135000000);
    expect(result.totalInflow).toBe(730000000);
    expect(result.totalOutflow).toBe(500000000);
  });

  it('应正确统计流入/流出数量（计数由绑定分类器计算）', () => {
    const directions = sampleFlows.map(r => classifyFlowDirection(r.mainNet));
    expect(directions.filter(d => d === 'inflow').length).toBe(3);
    expect(directions.filter(d => d === 'outflow').length).toBe(2);
    expect(directions.filter(d => d === 'neutral').length).toBe(0);
    const result = summarizeFundFlows(toSectorFlows(sampleFlows));
    expect(result.topInflowSectors).toHaveLength(5);
    expect(result.topInflowSectors[0].sector).toBe('贵州茅台');
    expect(result.topOutflowSectors[0].sector).toBe('比亚迪');
  });

  it('空数组应返回零值', () => {
    const result = summarizeFundFlows([]);
    expect(result.totalInflow).toBe(0);
    expect(result.totalOutflow).toBe(0);
    expect(result.netFlow).toBe(0);
    expect(result.mainNetInflow).toBe(0);
    expect(result.retailNetInflow).toBe(0);
    expect(result.topInflowSectors).toEqual([]);
    expect(result.topOutflowSectors).toEqual([]);
  });

  it('流出板块不足 5 个时 topOutflow 会混入净流入板块（生产行为仅记录）', () => {
    const result = summarizeFundFlows(toSectorFlows(sampleFlows));
    expect(result.topOutflowSectors.map(s => s.sector)).toEqual([
      '比亚迪', '五粮液', '美的集团', '中国平安', '贵州茅台',
    ]);
    expect(result.topOutflowSectors[2].netInflow).toBeGreaterThan(0);
  });
});

// ==================== 金额格式化 ====================

describe('formatAmount 金额格式化', () => {
  it('亿级应显示亿', () => {
    expect(formatFlowAmount(500000000)).toBe('+5.00亿');
  });

  it('万级应显示万', () => {
    expect(formatFlowAmount(500000)).toBe('+50.00万');
  });

  it('负数应带负号', () => {
    expect(formatFlowAmount(-500000000)).toBe('-5.00亿');
  });

  it('零应显示 +0.00（旧断言 "0" 是副本行为，错误）', () => {
    expect(formatFlowAmount(0)).toBe('+0.00');
  });

  it('小数应保留2位（删除 if 守卫，改确定字符串）', () => {
    expect(formatFlowAmount(123456789)).toBe('+1.23亿');
    expect(formatFlowAmount(9999)).toBe('+9999.00');
    expect(formatFlowAmount(-9999)).toBe('-9999.00');
  });
});
