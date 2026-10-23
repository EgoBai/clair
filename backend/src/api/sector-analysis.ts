/**
 * 行业板块深度分析 API
 * 成分股、权重、估值、资金流向
 *
 * 诚实红线（P0-FABRICATE）：
 *   本文件此前用 `seed = def.code.charCodeAt(0)` 派生 avgPE/avgPB/avgROE/changePercent/
 *   turnover/fundFlow/peDistribution/marketCapDistribution 全部指标 —— 实测返回值
 *   （avgPE:11 / avgPB:3.3 / avgROE:30）全为整数，明显是算出来的，且**无 dataSource 标注**。
 *   现已整体删除 charCodeAt 生成逻辑：
 *     - 板块划分改为数据库真实申万一级行业（stocks.industry）
 *     - 估值/涨跌/市值/换手来自本地真实行情库 daily_quotes（PE 仅对 pe_ratio>0 求均值，
 *       亏损股不参与；亏损家数单独返回，避免均值被负 PE 拉偏）
 *     - 成分股权重按真实总市值占比计算（原先的 35/20/10 为编造权重）
 *     - 资金流向接东方财富行业板块资金流真实源；源不可达则 fundFlow 为 null
 *     - avgROE 无本地真实来源（daily_quotes 无 ROE 字段）→ null + 明确说明
 */

import { Request, Response, Router } from 'express';
import { getDb } from '../db/dbFactory';
import type { StockWithQuotes } from '../models/Stock';
import { asyncHandler } from '../utils/apiResponse';

const router = Router();

interface SectorStock {
  symbol: string;
  name: string;
  weight: number | null;
  price: number | null;
  changePercent: number | null;
  marketCap: number | null;
  pe: number | null;
  pb: number | null;
  turnover: number | null;
}

interface SectorPeBucket {
  range: string;
  count: number;
}

/** DB 直读行的 meta：有数据=live，无数据=unavailable */
function dbMeta(rowCount: number, emptyReason: string) {
  return rowCount > 0
    ? { meta: { source: 'live' as const, updatedAt: new Date().toISOString() }, dataSource: 'real' as const }
    : { meta: { source: 'unavailable' as const, updatedAt: null, error: emptyReason }, dataSource: 'unavailable' as const };
}

/** 诚实发送器：顶层 dataSource 与 data.dataSource 由同一入参派生，结构上不可能矛盾 */
function sendHonest(res: Response, dataSource: 'real' | 'unavailable', data: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({
    success: true,
    dataSource,
    data: { ...data, dataSource },
    timestamp: new Date().toISOString(),
  });
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round(v: number | null, digits = 2): number | null {
  return v === null ? null : +v.toFixed(digits);
}

/** PE 分桶（对真实 pe_ratio 分桶；亏损/无 PE 的个股不计入任何桶） */
function bucketPe(pe: number): SectorPeBucket['range'] {
  if (pe <= 0) return '亏损/无有效PE';
  if (pe < 10) return '<10';
  if (pe < 20) return '10-20';
  if (pe < 30) return '20-30';
  if (pe < 50) return '30-50';
  return '>50';
}

const PE_BUCKET_ORDER = ['<10', '10-20', '20-30', '30-50', '>50', '亏损/无有效PE'];

/**
 * 行业资金流（东方财富行业板块，真实源）。
 * 源不可达 → 返回 null，绝不返回 0 冒充「零净流入」。
 */
async function fetchIndustryFundFlow(): Promise<Map<string, number> | null> {
  try {
    const url = 'https://push2.eastmoney.com/api/qt/clist/get';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const resp = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://data.eastmoney.com' },
      });
      if (!resp.ok) return null;
      const json: any = await resp.json();
      const diff = json?.data?.diff;
      if (!Array.isArray(diff) || diff.length === 0) return null;
      const map = new Map<string, number>();
      for (const it of diff) {
        const name = String(it?.f14 ?? '').trim();
        const inflow = num(it?.f62);
        if (name && inflow !== null) map.set(name, inflow);
      }
      return map.size > 0 ? map : null;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

/**
 * 行业估值聚合（真实库直查，一次查询覆盖全部行业）。
 *
 * 为何不用 db.getSectorStocks() 的 latestQuote：
 *   该访问器的 latestQuote 字段映射里**没有 peRatio/pbRatio**（见 Database.getSectorStocks），
 *   而 stocks 表的 pe_ratio/pb_ratio 列在库内整体为 NULL，
 *   故估值只能直接从 daily_quotes 取。
 *
 * 源不可达 / 内存库诚实空态（拒绝供行情）→ 返回空 Map，路由层据此把
 * avgPE/avgPB 置 null 并在 fieldSources 标注，绝不用 0 或编造值顶替。
 */
async function loadIndustryValuation(): Promise<Map<string, { avgPE: number | null; avgPB: number | null; stockCount: number; validPeCount: number; lossOrNoPeCount: number }>> {
  const out = new Map<string, { avgPE: number | null; avgPB: number | null; stockCount: number; validPeCount: number; lossOrNoPeCount: number }>();
  try {
    const knex = getDb().connection;
    const rows: any[] = await (knex('daily_quotes as dq') as any)
      .join('stocks as s', 's.id', '=', 'dq.stock_id')
      .where('s.is_active', true)
      .whereNotNull('s.industry')
      .whereRaw('dq.trade_date = (SELECT MAX(trade_date) FROM daily_quotes)')
      .select(
        's.industry',
        knex.raw('COUNT(*) as stock_count'),
        knex.raw('ROUND(AVG(dq.pe_ratio) FILTER (WHERE dq.pe_ratio > 0)::numeric, 2) as avg_pe'),
        knex.raw('ROUND(AVG(dq.pb_ratio) FILTER (WHERE dq.pb_ratio > 0)::numeric, 2) as avg_pb'),
        knex.raw('COUNT(*) FILTER (WHERE dq.pe_ratio > 0) as valid_pe_count'),
        knex.raw('COUNT(*) FILTER (WHERE dq.pe_ratio IS NULL OR dq.pe_ratio <= 0) as loss_or_no_pe_count'),
      )
      .groupBy('s.industry');
    for (const r of rows) {
      out.set(String(r.industry), {
        avgPE: num(r.avg_pe),
        avgPB: num(r.avg_pb),
        stockCount: Number(r.stock_count ?? 0),
        validPeCount: Number(r.valid_pe_count ?? 0),
        lossOrNoPeCount: Number(r.loss_or_no_pe_count ?? 0),
      });
    }
  } catch (e) {
    console.warn('[sectors/analysis] 估值聚合查询失败（估值将诚实置 null）:', e instanceof Error ? e.message : e);
  }
  return out;
}

/**
 * 单个行业成分股的真实 PE/PB（来自 daily_quotes 最新交易日）。
 * 源不可达 → 返回空 Map，调用方据此把 pe/pb 置 null。
 */
async function loadMemberValuation(
  industry: string,
): Promise<Map<string, { peRatio: number | null; pbRatio: number | null }>> {
  const out = new Map<string, { peRatio: number | null; pbRatio: number | null }>();
  try {
    const knex = getDb().connection;
    const rows: any[] = await (knex('daily_quotes as dq') as any)
      .join('stocks as s', 's.id', '=', 'dq.stock_id')
      .where('s.industry', industry)
      .where('s.is_active', true)
      .whereRaw('dq.trade_date = (SELECT MAX(trade_date) FROM daily_quotes)')
      .select('s.symbol', 'dq.pe_ratio', 'dq.pb_ratio');
    for (const r of rows) {
      out.set(String(r.symbol), { peRatio: num(r.pe_ratio), pbRatio: num(r.pb_ratio) });
    }
  } catch (e) {
    console.warn(`[sectors/analysis] ${industry} 成分股估值查询失败（pe/pb 将置 null）:`, e instanceof Error ? e.message : e);
  }
  return out;
}

/**
 * 行业成分股（真实）—— 走 dbFactory 抽象访问器：
 *   - Database：PostgreSQL DISTINCT ON 取每只股票最新行情
 *   - InMemoryDatabase：诚实空态（无行情 → 空数组）
 * 返回已按市值降序排列。
 */
async function loadSectorMembers(industry: string): Promise<StockWithQuotes[]> {
  const rows = await getDb().getSectorStocks(industry);
  // 成员行自身无 marketCap 列（见 aggregateSectors 注释），`?? r.marketCap` 恒为 undefined，
  // 属同类恒不可达回退，去除后结果完全一致（仍按 latestQuote.marketCap 降序，无行情者记 0）。
  const cap = (r: any) => num(r.latestQuote?.marketCap) ?? 0;
  return [...rows].sort((a, b) => cap(b) - cap(a));
}

/** 从真实成分股聚合行业指标（不引入任何编造） */
async function aggregateSectors() {
  const db = getDb();

  // 行业层面的涨跌幅/市值/换手/家数：已有聚合访问器，直接复用（口径与 /api/sectors 一致）
  const enhanced = await db.getSectorPerformanceEnhanced();
  // 估值：单独一次真实库查询（getSectorStocks 的 latestQuote 不含 peRatio/pbRatio）
  const valuation = await loadIndustryValuation();

  const sectors = [];
  for (const row of enhanced) {
    const industry = String(row.industry);
    let members: StockWithQuotes[] = [];
    try {
      members = await loadSectorMembers(industry);
    } catch (e) {
      console.warn(`[sectors/analysis] ${industry} 成分股查询失败:`, e instanceof Error ? e.message : e);
    }

    let changeSum = 0;
    let changeCount = 0;
    let turnoverSum = 0;
    let turnoverCount = 0;
    let totalMarketCap = 0;
    for (const m of members) {
      // 成分股行自身**不携带** changePercent/turnoverRate/marketCap：
      // getSectorStocks 返回的是 `{...stocks 表行, latestQuote}`，PostgreSQL 的 stocks 表
      // 无这三列（schema.sql / migrations 均未加列）；InMemoryDatabase 的成员是 Stock 形状，
      // 同样没有 —— 实测成员顶层键仅 id/symbol/name/market/industry/subIndustry/isActive/...。
      // 故原先的 `?? m.changePercent` 等回退恒不可达（死代码），此处删除而非用 as any 掩盖。
      // 行情缺席时下面计数保持 0，由 :254/:256 的 row 级聚合诚实兜底。
      const q: any = m.latestQuote ?? null;
      const chg = num(q?.changePercent);
      if (chg !== null) { changeSum += chg; changeCount++; }
      const tr = num(q?.turnoverRate);
      if (tr !== null) { turnoverSum += tr; turnoverCount++; }
      const cap = num(q?.marketCap);
      if (cap !== null) totalMarketCap += cap;
    }

    const val = valuation.get(industry);
    // stockCount 以「最新交易日有行情」为口径（与 validPeCount/lossOrNoPeCount 同源，
    // 三者必须自洽：stockCount === validPeCount + lossOrNoPeCount）。
    // members.length 是「库内有任意历史行情」的股票数，可能含非最新交易日的，
    // 故单列为 quotedStockCount，不与估值口径混用。
    const stockCount = val?.stockCount ?? members.length ?? 0;

    sectors.push({
      name: industry,
      code: industry,
      stockCount,
      quotedStockCount: members.length,
      avgPE: val?.avgPE ?? null,
      avgPB: val?.avgPB ?? null,
      // 本地行情库无 ROE 字段，无真实来源 → 诚实置 null
      avgROE: null as number | null,
      changePercent: changeCount > 0 ? round(changeSum / changeCount) : num(row.avg_change_percent),
      turnover: turnoverCount > 0 ? round(turnoverSum / turnoverCount) : null,
      totalMarketCap: totalMarketCap > 0 ? totalMarketCap : num(row.total_market_cap),
      validPeCount: val?.validPeCount ?? 0,
      lossOrNoPeCount: val?.lossOrNoPeCount ?? 0,
      limitUpCount: Number(row.limit_up_count ?? 0),
      members,
    });
  }
  return sectors;
}

/**
 * 获取行业板块列表
 * GET /api/sectors/analysis
 */
router.get('/sectors/analysis', asyncHandler(async (_req: Request, res: Response) => {
  let sectors: Awaited<ReturnType<typeof aggregateSectors>> = [];
  try {
    sectors = await aggregateSectors();
  } catch (e) {
    console.error('[sectors/analysis] 行业聚合查询失败:', e instanceof Error ? e.message : e);
  }

  const { meta, dataSource } = dbMeta(
    sectors.length,
    '本地真实行情库无可用行业聚合数据（daily_quotes 为空或未同步）',
  );

  const fundFlowMap = await fetchIndustryFundFlow();

  const list = sectors.map((s) => ({
    name: s.name,
    code: s.code,
    stockCount: s.stockCount,
    quotedStockCount: s.quotedStockCount,
    avgPE: s.avgPE,
    avgPB: s.avgPB,
    avgROE: s.avgROE,
    changePercent: s.changePercent,
    totalMarketCap: s.totalMarketCap,
    turnover: s.turnover,
    // 真实源不可达 → null（不回落 0，否则会被读成「今日零净流入」）
    fundFlow: fundFlowMap ? (fundFlowMap.get(s.name) ?? null) : null,
    lossOrNoPeCount: s.lossOrNoPeCount,
    validPeCount: s.validPeCount,
    limitUpCount: s.limitUpCount,
  }));

  const changes = list.map((s) => s.changePercent).filter((v): v is number => v !== null);

  sendHonest(res, dataSource, {
    sectors: list,
    count: list.length,
    summary: {
      totalSectors: list.length,
      upCount: changes.filter((c) => c > 0).length,
      downCount: changes.filter((c) => c < 0).length,
      avgChange: changes.length > 0 ? round(changes.reduce((a, b) => a + b, 0) / changes.length) : null,
      topGainer: list[0]?.name ?? null,
      topLoser: list[list.length - 1]?.name ?? null,
    },
    fieldSources: {
      stockCount: 'db:stocks+daily_quotes',
      avgPE: 'db:daily_quotes.pe_ratio（仅 pe_ratio>0 的个股参与均值）',
      avgPB: 'db:daily_quotes.pb_ratio（仅 pb_ratio>0 的个股参与均值）',
      avgROE: 'unavailable（本地行情库无 ROE 字段，未接入真实财报聚合）',
      changePercent: 'db:daily_quotes.change_percent',
      totalMarketCap: 'db:daily_quotes.market_cap',
      turnover: 'db:daily_quotes.turnover_rate',
      fundFlow: fundFlowMap ? 'eastmoney:行业板块资金流' : 'unavailable（东财行业资金流源不可达）',
    },
    meta,
  });
}));

/**
 * 获取行业板块详情
 * GET /api/sectors/analysis/:code
 *
 * :code 为数据库真实行业名（申万一级，支持 URL 编码，如 %E9%93%B6%E8%A1%8C）
 */
router.get('/sectors/analysis/:code', asyncHandler(async (req: Request, res: Response) => {
  const code = decodeURIComponent(req.params.code);

  let sectors: Awaited<ReturnType<typeof aggregateSectors>> = [];
  try {
    sectors = await aggregateSectors();
  } catch (e) {
    console.error('[sectors/analysis/:code] 行业聚合查询失败:', e instanceof Error ? e.message : e);
  }

  if (sectors.length === 0) {
    sendHonest(res, 'unavailable', {
      message: '本地真实行情库无可用行业聚合数据，未返回任何编造板块指标',
      code,
    });
    return;
  }

  const sector = sectors.find((s) => s.name === code || s.code === code);
  if (!sector) {
    // 注意：不能 `return res.status(404).json(...)` —— asyncHandler 要求回调返回
    // void | Promise<void>，返回 Response 会让 TS 报 TS2345。写成语句形式，响应行为完全一致。
    res.status(404).json({
      success: false,
      message: '行业板块不存在（code 须为数据库真实行业名，如 银行 / 电子）',
      available: sectors.slice(0, 30).map((s) => s.name),
    });
    return;
  }

  const totalCap = sector.totalMarketCap ?? 0;
  const members = sector.members;

  // 成分股估值：getSectorStocks 的 latestQuote 不含 peRatio/pbRatio，
  // 故逐只从 daily_quotes 取真实 PE/PB（取不到则为 null，不编造）。
  const valBySymbol = await loadMemberValuation(sector.name);

  // 成分股：真实行情 + 权重按真实总市值占比
  // 同 aggregateSectors：成员行不携带 marketCap/changePercent/turnoverRate/currentPrice，
  // `?? m.xxx` 回退恒不可达，已去除（行为不变）。行情缺席时这些字段为 null，不用 0 顶替。
  const topStocks: SectorStock[] = members.slice(0, 20).map((m: any) => {
    const q: any = m.latestQuote ?? null;
    const cap = num(q?.marketCap);
    const v = valBySymbol.get(m.symbol);
    const pe = num(v?.peRatio);
    return {
      symbol: m.symbol,
      name: (m.name || '').trim(),
      weight: cap !== null && totalCap > 0 ? round((cap / totalCap) * 100, 4) : null,
      price: round(num(q?.closePrice)),
      changePercent: round(num(q?.changePercent)),
      marketCap: round(cap, 0),
      pe: pe !== null && pe > 0 ? round(pe) : null,
      pb: round(num(v?.pbRatio)),
      turnover: round(num(q?.turnoverRate)),
    };
  });

  // PE 分桶：只对有正 PE 的成分股分桶（亏损股单列，不混入估值区间）
  const peBuckets = new Map<string, number>();
  for (const m of members) {
    const pe = num(valBySymbol.get(m.symbol)?.peRatio);
    const key = pe !== null && pe > 0 ? bucketPe(pe) : '亏损/无有效PE';
    peBuckets.set(key, (peBuckets.get(key) ?? 0) + 1);
  }

  const fundFlowMap = await fetchIndustryFundFlow();

  // 只有真正取到成分股行情才标 real；否则诚实降级（不返回 0 值假成分股）
  sendHonest(res, topStocks.length > 0 ? 'real' : 'unavailable', {
    name: sector.name,
    code: sector.code,
    stockCount: sector.stockCount,
    quotedStockCount: sector.quotedStockCount,
    totalMarketCap: sector.totalMarketCap,
    avgPE: sector.avgPE,
    avgPB: sector.avgPB,
    avgROE: sector.avgROE,
    changePercent: sector.changePercent,
    turnover: sector.turnover,
    fundFlow: fundFlowMap ? (fundFlowMap.get(sector.name) ?? null) : null,
    lossOrNoPeCount: sector.lossOrNoPeCount,
    validPeCount: sector.validPeCount,
    limitUpCount: sector.limitUpCount,
    topStocks,
    peDistribution: PE_BUCKET_ORDER
      .filter((r) => (peBuckets.get(r) ?? 0) > 0)
      .map((range) => ({ range, count: peBuckets.get(range)! })),
    // 市值分布需要全量成分股口径，topStocks 仅取前 20，未取到的部分不做假分布
    marketCapDistribution: null,
    fieldSources: {
      avgROE: 'unavailable（本地行情库无 ROE 字段）',
      fundFlow: fundFlowMap ? 'eastmoney:行业板块资金流' : 'unavailable（东财行业资金流源不可达）',
      marketCapDistribution: 'unavailable（需全量成分股市值分档，当前仅返回市值前 20 成分股）',
      topStocks: 'db:daily_quotes（权重=该股市值/行业总市值）',
    },
    meta: { source: 'live' as const, updatedAt: new Date().toISOString() },
  });
}));

export default router;
