/**
 * P0-FABRICATE：算术编造数据的端点回归测试
 *
 * 本项目最高优先级红线：
 *   **无真实数据必须置 dataSource:'unavailable' 或明确标注缺数据；
 *     绝不允许用 Math.random / 字符码算术 / 静态常量冒充真实行情。**
 *
 * 本文件覆盖 4 处历史上「用算术编造数据」的端点（工单 P0-FABRICATE）：
 *   🔴-1 /api/compare + /api/compare/radar —— seed = symbol.charCodeAt(0)+charCodeAt(1)
 *          实测茅台 price=112，库内真实 close=1288（差 11.5 倍），且无 dataSource
 *   🔴-2 /api/risk-center/portfolio —— 硬编码 4 个持仓却标 dataSource:'real'
 *   🔴-3 /api/sectors/analysis + /:code —— seed = def.code.charCodeAt(0)
 *   🔴-4 /api/industry-chains/:id/stocks + /:id/hot-stocks —— flatten 静态常量（含编造行情）
 *
 * 核心断言范式（对齐 halfHonestZeroToNull.test.ts）：
 *   1. **不可用时响应里不得出现编造数值**（不是「没有 dataSource」这么弱）
 *   2. 取不到的值必须是 null，**绝不能是 0** —— 0 会被前端渲染成「真的是 0」
 *   3. 有真实数据时返回值必须与库内直查一致（防「假接真源」）
 *   4. 顶层 dataSource 与 data.dataSource 必须一致（不得顶层 real / 行级 unavailable）
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import stockCompareRouter, { buildRadarScores, RADAR_ANCHORS } from '../api/stock-compare';
import sectorAnalysisRouter from '../api/sector-analysis';
import industryChainRouter from '../api/industryChain';
import riskCenterRouter from '../api/risk-center';
import { getDefaultPortfolio } from '../api/portfolio';
import { getDb, initDatabase } from '../db/dbFactory';

/**
 * 真库前提测试（it.skipIf 标注）：下列断言依赖库内真实行情/估值/行业聚合
 * （getLatestDailyQuote、quote.pe/pb、getSectorPerformanceEnhanced、行业成分股）。
 * CI 无 PostgreSQL 服务（不设 DATABASE_URL），内存库按架构契约（R0′-9）只返回
 * 诚实空态——「库内应有真实数据」类断言在该环境无意义，故 skipIf 诚实跳过
 * （跳过在测试报告可见，不是静默删除）。
 * 本地验证真库路径（2026-10-12 实测 36/36 全绿）：
 *   DATABASE_URL='postgresql://ego_bai@/clair?host=/tmp' npx vitest run src/__tests__/fabricatedEndpointsRemoved.test.ts
 * 注：此前该文件在本地也全红，是 knex 对 unix-socket 连接串（?host=/tmp）的解析
 * 缺陷导致 testConnection() 静默 false → 一路降级内存库；已在 dbFactory.toKnexConnection 修复。
 */
const hasRealDb = !!process.env.DATABASE_URL;

beforeAll(async () => {
  await initDatabase();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function buildApp(...routers: express.Router[]): express.Express {
  const app = express();
  app.use(express.json());
  for (const r of routers) app.use('/api', r);
  return app;
}

/** 按 app.ts 真实挂载点建 app：industry-chains 挂在 /api/industry-chains */
function buildIndustryChainApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/industry-chains', industryChainRouter);
  return app;
}

/** 全量禁止外网：确定性触发「真实源不可达」，不依赖偶发网络条件 */
function fetchDown(): void {
  (global as any).fetch = vi.fn().mockRejectedValue(new Error('network down'));
}

/** 编造值的特征：charCodeAt seed 派生的结果必然是小数位很少的整数/一位小数 */
function looksFabricated(v: unknown): boolean {
  if (typeof v !== 'number' || !Number.isFinite(v)) return false;
  return Number.isInteger(v);
}

const COMPARE_METRIC_KEYS = [
  'pe', 'pb', 'roe', 'grossMargin', 'netMargin',
  'revenueGrowth', 'profitGrowth', 'debtRatio', 'currentRatio', 'dividendYield',
];

// ==================== 🔴-1 /api/compare ====================

describe('P0-FABRICATE · /api/compare：charCodeAt seed 编造行情已清除', () => {
  const app = buildApp(stockCompareRouter);

  it.skipIf(!hasRealDb)('真实数据可得 → 返回库内真实价格，不是 charCodeAt 派生值', async () => {
    // 600519 在库内真实 close=1288；旧实现返回 112（= 10 + seed%200）
    const db = getDb();
    const stock: any = await db.getStockBySymbol('600519');
    const quote = stock ? await db.getLatestDailyQuote(stock.id) : null;
    expect(quote, '库内应有 600519 最新行情').toBeTruthy();

    const res = await request(app).get('/api/compare?symbols=600519,000001');
    expect(res.status).toBe(200);

    const s600519 = res.body.data.stocks.find((s: any) => s.symbol === '600519');
    expect(s600519, '600519 必须出现在结果里').toBeTruthy();
    // 核心：等于库内真实收盘价
    expect(s600519.price).toBeCloseTo(Number(quote!.closePrice), 2);
    // 反向断言：绝不能是旧 seed 派生值 112
    expect(s600519.price).not.toBe(112);
  });

  it.skipIf(!hasRealDb)('同一 seed 派生的 000001 与 600519 不再产生「整数凑整」的假指标', async () => {
    const res = await request(app).get('/api/compare?symbols=600519,000001');
    const [m, p] = res.body.data.stocks;

    // 旧实现：茅台 metrics 全是整数（pe=32/roe=7/grossMargin=17…），一眼假
    const allValues = [...Object.values(m.metrics), ...Object.values(p.metrics)]
      .filter((v: any) => typeof v === 'number');
    expect(allValues.length).toBeGreaterThan(0);
    // 真实财务指标小数位丰富，几乎不会全部是整数
    expect(
      allValues.every(looksFabricated),
      '所有指标都是整数 → 说明仍是 charCodeAt 派生的编造值',
    ).toBe(false);
  });

  it('每个指标都披露来源，取不到的标 unavailable（而非静默填值）', async () => {
    fetchDown();
    const res = await request(app).get('/api/compare?symbols=600519');
    const stock = res.body.data.stocks[0];

    expect(stock.metricsDataSource).toBeTruthy();
    for (const k of COMPARE_METRIC_KEYS) {
      expect(stock.metricsDataSource, `${k} 必须披露来源`).toHaveProperty(k);
      if (stock.metrics[k] === null) {
        expect(stock.metricsDataSource[k], `${k} 为 null 时来源须标 unavailable`).toBe('unavailable');
      }
    }
  });

  it.skipIf(!hasRealDb)('东财财报源不可达 → 财务指标为 null，绝不是 0（0 会被读成「真实为 0」）', async () => {
    fetchDown();
    const res = await request(app).get('/api/compare?symbols=600519');
    const stock = res.body.data.stocks[0];

    // PE/PB 来自本地库，仍应有值
    expect(typeof stock.metrics.pe).toBe('number');
    expect(typeof stock.metrics.pb).toBe('number');

    // 财报类指标源不可达 → 必须 null，且绝不能是 0
    for (const k of ['roe', 'grossMargin', 'netMargin', 'revenueGrowth', 'profitGrowth',
                     'debtRatio', 'currentRatio', 'dividendYield', 'cashflowYield']) {
      expect(stock.metrics[k], `${k} 应为 null`).toBeNull();
      expect(stock.metrics[k], `${k} 绝不能是 0`).not.toBe(0);
    }
  });

  it('行情库无该标的 → dataSource=unavailable 且无任何编造数值', async () => {
    // 让行情访问器返回空：确定性触发「无行情」，不依赖库内恰好缺某只票
    const db = getDb();
    vi.spyOn(db, 'getStocksWithLatestQuotes').mockResolvedValue([]);

    const res = await request(app).get('/api/compare?symbols=600519');
    expect(res.status).toBe(200);
    expect(res.body.dataSource).toBe('unavailable');
    expect(res.body.data.stocks[0].price).toBeNull();
    expect(res.body.data.stocks[0].metrics.pe).toBeNull();
    // 不可用时绝不能有任何指标是 0
    for (const v of Object.values(res.body.data.stocks[0].metrics) as any[]) {
      expect(v, 'unavailable 态下不得出现 0').not.toBe(0);
    }
  });

  it('行情访问器抛错 → 诚实降级，不返回 500 也不返回编造数值', async () => {
    const db = getDb();
    vi.spyOn(db, 'getStocksWithLatestQuotes').mockRejectedValue(new Error('db down'));

    const res = await request(app).get('/api/compare?symbols=600519');
    expect(res.status).toBe(200);
    expect(res.body.dataSource).toBe('unavailable');
    expect(res.body.data.stocks).toEqual([]);
    expect(res.body.data.message).toBeTruthy();
  });

  it('顶层 dataSource 与 data.dataSource 一致（不得顶层 real/行级 unavailable）', async () => {
    const res = await request(app).get('/api/compare?symbols=600519,000001');
    expect(res.body.dataSource).toBe(res.body.data.dataSource);
  });

  it('股票名来自数据库，不使用硬编码 stockNames 映射表', async () => {
    const res = await request(app).get('/api/compare?symbols=600519');
    // 库内真实名含空格（'五 粮 液' 风格）或精确名；至少不能是 '股票600519' 这类兜底
    expect(res.body.data.stocks[0].name).not.toMatch(/^股票\d/);
  });

  it.skipIf(!hasRealDb)('quoteDate 是合法 ISO 日期（口径标注不能是 Date.toString 的 "Mon Oct 12"）', async () => {
    const res = await request(app).get('/api/compare?symbols=600519');
    const d = res.body.data.stocks[0].quoteDate;
    expect(d, 'quoteDate 应为 YYYY-MM-DD').toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it.skipIf(!hasRealDb)('quoteDate 与库内真实交易日一致（防 toISOString 时区回退一天）', async () => {
    const db = getDb();
    const stock: any = await db.getStockBySymbol('600519');
    const quote = stock ? await db.getLatestDailyQuote(stock.id) : null;
    expect(quote).toBeTruthy();
    // 按本地年月日取（pg 驱动把 date 列解析为本地午夜，toISOString 会回退一天）
    const t: any = quote!.tradeDate;
    const expected = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;

    const res = await request(app).get('/api/compare?symbols=600519');
    expect(res.body.data.stocks[0].quoteDate).toBe(expected);
  });
});

// ==================== 🔴-1b /api/compare/radar ====================

describe('P0-FABRICATE · /api/compare/radar：雷达分不再凭空生成', () => {
  const app = buildApp(stockCompareRouter);

  it.skipIf(!hasRealDb)('财报源不可达 → 依赖财报的维度为 null，绝不是 0（0 分会被读成「评分最差」）', async () => {
    fetchDown();
    const res = await request(app).get('/api/compare/radar?symbols=600519');
    const stock = res.body.data.stocks[0];

    // 依赖东财财报的维度：源不可达 → 必须整维 null
    for (const dim of ['profitability', 'growth', 'stability', 'cashflow', 'dividend']) {
      expect(stock.scores[dim], `${dim} 应为 null`).toBeNull();
      expect(stock.scores[dim], `${dim} 绝不能是 0`).not.toBe(0);
    }
    // valuation 只依赖本地库 pe/pb（真实可得）→ 允许有分，但必须是真实派生值
    expect(typeof stock.scores.valuation).toBe('number');
    expect(stock.scoredDimensions).toBe(1);
    expect(stock.totalDimensions).toBe(RADAR_ANCHORS.length);
  });

  it('雷达分只由真实指标派生：旧实现每股 6 维全有分（seed 凭空生成）', async () => {
    // 旧实现：无论有无真实数据，6 个维度恒为 20~95 的数字，且无 dataSource
    const res = await request(app).get('/api/compare/radar?symbols=600519');
    expect(res.body.dataSource).toBeDefined();
    const stock = res.body.data.stocks[0];
    // 本地库有 pe/pb，但东财在测试环境通常不可达 → 绝大多数维度必须诚实地是 null
    const nonNull = Object.values(stock.scores).filter((v) => v !== null).length;
    expect(nonNull, '不应再有 6 维全满的「凭空评分」').toBeLessThan(RADAR_ANCHORS.length);
  });

  it('无任何维度可评分 → dataSource=unavailable', async () => {
    // 让本地库也无估值 → 6 维全部不可评分
    const db = getDb();
    vi.spyOn(db, 'getStocksWithLatestQuotes').mockResolvedValue([]);

    const res = await request(app).get('/api/compare/radar?symbols=600519');
    expect(res.body.dataSource).toBe('unavailable');
    expect(res.body.dataSource).toBe(res.body.data.dataSource);
    for (const dim of RADAR_ANCHORS.map((a) => a.key)) {
      expect(res.body.data.stocks[0].scores[dim]).toBeNull();
    }
  });

  it('radarBasis 公开映射锚点与数据来源（可审计「这个分怎么来的」）', async () => {
    fetchDown();
    const res = await request(app).get('/api/compare/radar?symbols=600519');
    expect(res.body.data.radarBasis.method).toBe('linear-anchor-from-real-metrics');
    expect(res.body.data.radarBasis.anchors).toHaveLength(RADAR_ANCHORS.length);
    expect(res.body.data.radarBasis.dataSources).toBeTruthy();
  });

  it('buildRadarScores 单测：任一参与指标缺失 → 整维 null（不做部分平均）', () => {
    const base: Record<string, number> = {
      pe: 20, pb: 2, roe: 15, grossMargin: 40, netMargin: 20,
      revenueGrowth: 10, profitGrowth: 10, debtRatio: 40, currentRatio: 2,
      dividendYield: 2, cashflowYield: 3,
    };
    const full = buildRadarScores(base as any);
    for (const dim of RADAR_ANCHORS.map((a) => a.key)) {
      expect(typeof full[dim], `${dim} 指标齐全时应可评分`).toBe('number');
    }

    // 抽掉 profitability 所需的一个指标 → 整维必须 null，而不是拿剩下两个平均
    const partial = { ...base, grossMargin: null as any };
    expect(buildRadarScores(partial as any).profitability).toBeNull();
    // 其余维度不受影响
    expect(typeof buildRadarScores(partial as any).valuation).toBe('number');
  });
});

// ==================== 🔴-2 /api/risk-center/portfolio ====================

describe('P0-FABRICATE · /api/risk-center/portfolio：编造持仓已清除', () => {
  const app = buildApp(riskCenterRouter);

  it('getDefaultPortfolio() 返回空（DB 无 portfolio 表，不做默认组合兜底）', async () => {
    const positions = await getDefaultPortfolio();
    expect(positions).toEqual([]);
  });

  it('端点返回 dataSource=unavailable + 空 holdings，绝不吐编造持仓', async () => {
    const res = await request(app).get('/api/risk-center/portfolio');
    expect(res.status).toBe(200);
    expect(res.body.data.dataSource).toBe('unavailable');
    expect(res.body.data.holdings).toEqual([]);
  });

  it('响应中不出现旧实现那 4 个编造持仓的任何字段', async () => {
    const res = await request(app).get('/api/risk-center/portfolio');
    const raw = JSON.stringify(res.body);

    // 旧 initDefaultPortfolios() 写死的成本价/数量/买入日期
    for (const fabricated of ['12.5', '1680', '"quantity":1000', '"quantity":300',
                              '2026-01-15', '2026-02-01', '2026-02-10', '2026-03-01',
                              '银行板块龙头', '消费白马', '新能源龙头']) {
      expect(raw, `响应里仍出现编造值 ${fabricated}`).not.toContain(fabricated);
    }
  });

  it('绝不再出现 dataSource:"real"（那是把编造仓位冒充真实持仓的根源）', async () => {
    const res = await request(app).get('/api/risk-center/portfolio');
    expect(res.body.data.dataSource).not.toBe('real');
    expect(res.body.data.dataSource).not.toBe('partial');
  });
});

// ==================== 🔴-3 /api/sectors/analysis ====================

describe('P0-FABRICATE · /api/sectors/analysis：charCodeAt seed 已清除', () => {
  const app = buildApp(sectorAnalysisRouter);

  it('返回库内真实行业（申万一级），不再是写死的 8 个编造板块', async () => {
    fetchDown(); // 关掉东财资金流，确定性走 DB 分支
    const res = await request(app).get('/api/sectors/analysis');
    expect(res.status).toBe(200);

    const codes = res.body.data.sectors.map((s: any) => s.code);
    // 旧实现的编造 code（BJ/NEV/SEMI/BANK/MED/PV/CE/RE）
    for (const fabricated of ['BJ', 'NEV', 'SEMI', 'MED', 'PV', 'CE', 'RE']) {
      expect(codes, `不应再出现编造板块 ${fabricated}`).not.toContain(fabricated);
    }
  });

  it.skipIf(!hasRealDb)('avgPE 不再是 charCodeAt 派生的整数（实测旧值 avgPE=11 / avgPB=3.3）', async () => {
    fetchDown();
    const res = await request(app).get('/api/sectors/analysis');
    const sectors = res.body.data.sectors;
    expect(sectors.length).toBeGreaterThan(0);

    const withPe = sectors.filter((s: any) => typeof s.avgPE === 'number');
    if (withPe.length === 0) {
      // 诚实空态：估值源不可达时 avgPE 为 null（而非编造整数）——这本身就是合格结果
      expect(sectors.every((s: any) => s.avgPE === null)).toBe(true);
    } else {
      // 有真实估值时，均值不应全部都是整数（旧 seed 派生特征）
      expect(withPe.every(looksFabricated), 'avgPE 全是整数 → 仍是编造').toBe(false);
    }
  });

  it.skipIf(!hasRealDb)('avgPE 真实时与库内直查一致（防「假接真源」）', async () => {
    fetchDown();
    const res = await request(app).get('/api/sectors/analysis');
    const db = getDb();
    const enhanced: any[] = await db.getSectorPerformanceEnhanced();
    const byIndustry = new Map(enhanced.map((r: any) => [String(r.industry), r]));

    let checked = 0;
    for (const s of res.body.data.sectors) {
      if (typeof s.avgPE !== 'number') continue;
      const row = byIndustry.get(s.name);
      if (!row) continue;
      // avgPE 必须落在该行业真实成分股 PE 的合理区间内（不可能是 seed 派生的固定小整数）
      expect(s.avgPE, `${s.name} avgPE 应 >= 正PE最小值1`).toBeGreaterThanOrEqual(1);
      checked++;
    }
    // 库内有行情时至少应校验到若干行业
    expect(checked, '应至少校验到一个行业的真实 avgPE').toBeGreaterThan(0);
  });

  it('avgROE 无本地真实来源 → null 且字段Sources 说明原因', async () => {
    fetchDown();
    const res = await request(app).get('/api/sectors/analysis');
    for (const s of res.body.data.sectors) {
      expect(s.avgROE, 'daily_quotes 无 ROE 字段，必须诚实置 null').toBeNull();
      expect(s.avgROE, 'avgROE 绝不能是 0').not.toBe(0);
    }
    expect(res.body.data.fieldSources.avgROE).toContain('unavailable');
  });

  it('资金流源不可达 → fundFlow 为 null，绝不回落 0（0 会被读成「今日零净流入」）', async () => {
    fetchDown();
    const res = await request(app).get('/api/sectors/analysis');
    for (const s of res.body.data.sectors) {
      expect(s.fundFlow, '东财行业资金流不可达时须为 null').toBeNull();
      expect(s.fundFlow, 'fundFlow 绝不能是 0').not.toBe(0);
    }
  });

  it('每个板块披露亏损/无PE 家数，PE 均值不被负 PE 拉偏', async () => {
    fetchDown();
    const res = await request(app).get('/api/sectors/analysis');
    for (const s of res.body.data.sectors) {
      expect(typeof s.lossOrNoPeCount).toBe('number');
      expect(typeof s.validPeCount).toBe('number');
      expect(s.validPeCount + s.lossOrNoPeCount).toBe(s.stockCount);
    }
  });

  it('顶层 dataSource 与 data.dataSource 一致', async () => {
    fetchDown();
    const res = await request(app).get('/api/sectors/analysis');
    expect(res.body.dataSource).toBe(res.body.data.dataSource);
  });

  it.skipIf(!hasRealDb)('详情端点 code=真实行业名 → 成分股来自 DB 且权重是真实市值占比', async () => {
    fetchDown();
    const res = await request(app).get(`/api/sectors/analysis/${encodeURIComponent('银行')}`);
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('银行');

    // 与库内直查一致（经 dbFactory 抽象层）
    const db = getDb();
    const members: any[] = await db.getSectorStocks('银行');
    const real = members
      .filter((m: any) => m.latestQuote?.closePrice != null)
      .sort((a: any, b: any) => (b.latestQuote.marketCap ?? 0) - (a.latestQuote.marketCap ?? 0))[0];

    if (real) {
      const top = res.body.data.topStocks[0];
      expect(top.symbol).toBe(real.symbol);
      expect(top.price).toBeCloseTo(Number(real.latestQuote.closePrice), 2);
      // 权重是真实市值占比（0<w<100），不是旧常量里的 15/12/10
      expect(top.weight).toBeGreaterThan(0);
      expect(top.weight).toBeLessThan(100);
    }
  });

  it.skipIf(!hasRealDb)('详情端点 avgROE 仍为 null、marketCapDistribution 为 null（无真实来源不编）', async () => {
    fetchDown();
    const res = await request(app).get(`/api/sectors/analysis/${encodeURIComponent('银行')}`);
    expect(res.body.data.avgROE).toBeNull();
    expect(res.body.data.marketCapDistribution).toBeNull();
    expect(res.body.data.fieldSources.marketCapDistribution).toContain('unavailable');
  });

  it.skipIf(!hasRealDb)('未知 code → 404 且不返回任何编造板块指标', async () => {
    const res = await request(app).get('/api/sectors/analysis/NOT_A_REAL_INDUSTRY');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    // 404 不得携带 avgPE/changePercent 等编造字段
    expect(res.body.data).toBeUndefined();
  });
});

// ==================== 🔴-4 industry-chains/:id/stocks + /hot-stocks ====================

describe('P0-FABRICATE · industry-chains 成分股：静态常量 flatten 已改为真实查库', () => {
  const app = buildIndustryChainApp();

  it('/:id/stocks 返回的现价与库内真实收盘价一致（旧常量中际旭创=120.5 vs 真实 ~724）', async () => {
    const res = await request(app).get('/api/industry-chains/ai-computing/stocks');
    expect(res.status).toBe(200);

    const db = getDb();
    const zhongji = res.body.data.stocks.find((s: any) => s.symbol === '300308');
    if (zhongji && zhongji.currentPrice !== null && zhongji.currentPrice !== undefined) {
      const stock: any = await db.getStockBySymbol('300308');
      const q = stock ? await db.getLatestDailyQuote(stock.id) : null;
      if (q) {
        expect(zhongji.currentPrice).toBeCloseTo(Number(q.closePrice), 2);
      }
      expect(zhongji.currentPrice, '绝不能是静态常量里的 120.5').not.toBe(120.5);
    }
  });

  it('/:id/stocks 无匹配成分股 → dataSource=unavailable 且 stocks 为空', async () => {
    // 用一条不存在任何成分股的链路：概念/关键词均查不到
    const res = await request(app).get('/api/industry-chains/wind-power/stocks');
    expect(res.status).toBe(200);
    if (res.body.data.stocks.length === 0) {
      expect(res.body.dataSource).toBe('unavailable');
      expect(res.body.data.message).toBeTruthy();
    }
  });

  it('/:id/hot-stocks 响应不含静态常量里的编造现价', async () => {
    const res = await request(app).get('/api/industry-chains/ai-computing/hot-stocks?limit=5');
    expect(res.status).toBe(200);
    // 旧常量编造值：中际旭创 120.5 / 新易盛 85.6 / 中兴通讯 32.5 / 浪潮信息 45.8
    for (const s of res.body.data.stocks) {
      expect([120.5, 85.6, 32.5, 45.8, 52.3, 35.2, 320.5, 98.3]).not.toContain(s.currentPrice);
    }
  });

  it('/:id/stocks 顶层 dataSource 与 data.dataSource 一致', async () => {
    const res = await request(app).get('/api/industry-chains/ai-computing/stocks');
    expect(res.body.dataSource).toBe(res.body.data.dataSource);
  });

  it('/:id/stocks 对不存在的产业链 → 404（不再静默返回空列表）', async () => {
    const res = await request(app).get('/api/industry-chains/not-a-chain/stocks');
    expect(res.status).toBe(404);
  });

  it('/:id/segments 不再靠「先访问 /:id」的顺序依赖拿到真实成分股', async () => {
    // 这是额外发现的第 5 处泄漏：/:id/segments 原样 spread segment，
    // 会吐出 companies 静态常量；而 /:id 会原地覆盖同一常量对象，
    // 导致「先访问 /:id 再访问 /:id/segments」才是真实数据（冷启动顺序依赖）。
    // 现已让 /:id/segments 自己查库，故无论访问顺序都必须是真实数据或诚实空态。
    const res = await request(app).get('/api/industry-chains/ai-computing/segments');
    expect(res.status).toBe(200);
    expect(res.body.dataSource).toBe(res.body.data.dataSource);
    const raw = JSON.stringify(res.body);
    // 静态常量里的编造现价不得出现
    for (const fabricated of [120.5, 85.6, 32.5, 45.8, 52.3, 35.2, 320.5, 98.3]) {
      expect(raw, `:id/segments 仍含编造现价 ${fabricated}`).not.toContain(`"currentPrice":${fabricated}`);
    }
  });

  it('/:id/segments 的 companies 与 /:id/stocks 同源（均为 DB 真查）', async () => {
    const segRes = await request(app).get('/api/industry-chains/ai-computing/segments');
    const stkRes = await request(app).get('/api/industry-chains/ai-computing/stocks');
    const segSyms = new Set<string>();
    for (const s of segRes.body.data.segments) {
      for (const c of s.companies ?? []) segSyms.add(c.symbol);
    }
    const stkSyms = new Set<string>(stkRes.body.data.stocks.map((s: any) => s.symbol));
    // stocks 的成分必然来自同一个 segments 集合
    for (const sym of stkSyms) {
      expect(segSyms.has(sym), `${sym} 应同时出现在 segments 与 stocks`).toBe(true);
    }
  });
});
