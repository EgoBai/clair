/**
 * 股票API接口
 * 提供股票查询、行情获取、市场指数等功能
 */

import { Router, Response } from 'express';
import { db } from '../db/dbFactory';
import { StockSearchParams } from '../models/Stock';
import { validateQuery, validateBody, validateParams, schemas } from '../middleware/validation';
import {
  asyncHandler, sendPaginated, sendNotFound,
} from '../utils/apiResponse';
import { queryCache } from '../utils/queryCache';
import { normalizeSymbol } from '../utils/symbolUtils';
import { dataSyncService } from '../data-sync/DataSyncService';
import { AppError } from '../middleware/errorHandler';
import { resolveMarketQueryDate, localDayKey, type MarketQueryDate } from '../utils/tradingCalendar';
import { WAN_TO_YUAN } from '../utils/turnoverUnit';

/**
 * P0-CALWIRE：把交易日历解析结果展开为响应字段（7 个日频端点共用）。
 *
 * - `asOf`：实际使用的交易日——「你看的数据是哪一天的」唯一真源；
 * - `isFallback`：是否发生了回退；前端据此可提示「当前展示的是 X 日数据」；
 * - `note`：回退原因/精度来源的中文说明，仅在需要告知时存在。
 *
 * 注意 `date` 字段不在本函数内：各端点既有的 `date` 形态不同（Date 对象或字符串），
 * 保持原形态以免破坏前端兼容，由各 handler 用解析结果赋值。
 */
function calendarFields(q: MarketQueryDate): Record<string, unknown> {
  return {
    asOf: q.asOf,
    dateRequested: q.dateRequested,
    isFallback: q.isFallback,
    ...(q.note ? { note: q.note } : {}),
  };
}

const router = Router();

/**
 * 诚实数据契约发送器（本文件统一出口）
 *
 * 与 api/market.ts 同构：顶层 dataSource 与 data 内 dataSource 由**同一个入参**派生，
 * 结构上杜绝 IP-20 那类「两级互相矛盾」。不用 sendSuccess 是因为它只输出
 * { success, data, timestamp }，dataSource 会被埋在 data 里，前端无法统一判定。
 */
function sendHonest(
  res: Response,
  dataSource: 'real' | 'unavailable',
  data: Record<string, unknown>,
): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({
    success: true,
    dataSource,
    data: { ...data, dataSource },
    timestamp: new Date().toISOString(),
  });
}

// ==================== /api/stocks 的 items[] 契约 ====================
/**
 * `items[]` 与 Cloudflare Worker（clair-worker/worker.js `handleStocks`）**逐字段同构**：
 * `{ symbol, name, market, industry, latestQuote: {closePrice, changePercent, turnoverRate, peRatio, volume, turnover} | null }`
 *
 * 为什么不能直接把 `stocks` 行当 items 塞过去：`stocks` 行是 PG 原样 snake_case
 * （`current_price` / `change_percent` …），而前端 store 的 `mapStockApiItem` 只读
 * `item.latestQuote.closePrice` 这类 camelCase 嵌套字段 —— 直接别名会让整张表
 * 价格/涨跌幅/成交量全渲染成「—」（页面不报错但等于没数据）。
 * 故此处按 Worker 契约**显式改名**，不做任何推算：
 *   - 六个行情字段全部来自同一行真实列，缺失即 null；
 *   - 六个字段全缺失时 `latestQuote` 整体为 null（与 Worker「查不到该标的」同语义）；
 *   - 不返回 change / 昨收 / marketCap —— Worker 也不返回，前端已按「算不出来」处理。
 */
function toWorkerStockItem(row: Record<string, unknown>): Record<string, unknown> {
  const n = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const x = Number(v);
    return Number.isNaN(x) ? null : x;
  };
  const quote = {
    closePrice: n(row.current_price ?? row.closePrice ?? row.close_price),
    changePercent: n(row.change_percent ?? row.changePercent),
    turnoverRate: n(row.turnover_rate ?? row.turnoverRate),
    peRatio: n(row.pe_ratio ?? row.peRatio),
    volume: n(row.volume),
    turnover: n(row.turnover),
  };
  const hasQuote = Object.values(quote).some((v) => v !== null);
  return {
    symbol: row.symbol,
    name: row.name,
    market: row.market,
    industry: typeof row.industry === 'string' ? row.industry : null,
    latestQuote: hasQuote ? quote : null,
  };
}

// ==================== 市值单位换算（P0，2026-11-03） ====================
/**
 * 库内市值是**万元**，对外必须是**元**——两处口径 10000 倍错位的止损点。
 *
 * ## 事实（2026-11-03 实测，非推测）
 * `daily_quotes.market_cap` / `stocks.market_cap` 落库单位是**万元**：
 *   - 浦发银行 600000：库值 33,605,600 → 3360.56 亿（真值）；若当元读则只有 3360.56 万（错 10000 倍）
 *   - 工商银行 601398：库值 306,153,000 → 库值/1e4 股数 ≈ 3564 亿股，与其真实总股本 3564 亿股吻合
 * 而前端 `StockDetailPage.tsx` 用 `formatLargeNumber(marketCap)` 按**元**格式化，
 * 于是页面把 3360.56 亿渲染成「3360.56万」——商用硬伤。
 *
 * ## 为什么换算只做在**路由出口**而不是 db 层 `mapDailyQuoteRow`
 * db 层还被 `industryChain.ts`（`marketCap / 1e4` 万元→亿）、`advanced-screener.ts`、
 * `stock-compare.ts`、`alerts.ts`、`multiSignalEngine.ts` 等按「万元」消费；
 * 在映射层改量纲会把它们一起打挂，而那些文件不在本工单的改动范围内。
 * 故：**本文件对外一律按元输出，并在响应里带 `marketCapUnit:'yuan'`**；
 * 其余消费方维持万元语义，待各自工单收口（已在交付报告里列明）。
 *
 * ## 诚实约束
 * 原值为 null/undefined 时**保持缺失**（继承键不写入换算值），绝不 `|| 0` 把
 * 「口径不可算」谎报成「市值恰为 0」。
 */
function toYuanMarketCap<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const key of ['marketCap', 'circulatingMarketCap', 'market_cap', 'circulating_market_cap']) {
    if (!(key in row)) continue;
    const raw = row[key];
    if (raw === null || raw === undefined || raw === '') {
      out[key] = null;
      continue;
    }
    const n = Number(raw);
    out[key] = Number.isFinite(n) ? n * WAN_TO_YUAN : null;
  }
  return out;
}

/** 对「股票档案 + latestQuote」形态的响应整体换算市值单位 */
function withYuanMarketCap(payload: Record<string, unknown>): Record<string, unknown> {
  const out = toYuanMarketCap(payload);
  const quote = payload.latestQuote;
  if (quote && typeof quote === 'object') {
    out.latestQuote = toYuanMarketCap(quote as Record<string, unknown>);
  }
  out.marketCapUnit = 'yuan';
  return out;
}

// P0-SYMBOL：本文件此前的 normalizeSymbol 副本已删除，改为复用 utils/symbolUtils。
// 符号规范化的**唯一真源**是 symbolUtils —— 规范化逻辑不允许出现第三份。

// ==================== 股票查询 ====================

router.get('/stocks', validateQuery(schemas.stockSearch), asyncHandler(async (req, res) => {
  const params: StockSearchParams = {
    symbol: req.query.symbol as string,
    name: req.query.name as string,
    market: req.query.market as string,
    industry: req.query.industry as string,
    isActive: req.query.isActive !== 'false',
    page: parseInt(req.query.page as string) || 1,
    pageSize: parseInt(req.query.pageSize as string) || 20,
    sortBy: (req.query.sortBy as string) || 'symbol',
    sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'asc',
  };

  const cacheKey = `stocks:${JSON.stringify(params)}`;
  const result = await queryCache.query(cacheKey, async () => {
    const [stocks, totalCount] = await Promise.all([
      db.getStocks(params),
      db.getStockCount(params),
    ]);

    // ⚠️ 列表契约**双写**（历史契约分叉的止损，短中期不可删任一侧）：
    //   · 旧侧：`stocks` + `pagination.totalCount` —— 后端自建站起就在用，多个既有调用方依赖；
    //   · 新侧：`items` + `total` —— Cloudflare Worker 侧（clair-worker/worker.js）用的就是这套，
    //     前端 store（frontend/src/store/useStockStore.ts）**只认** items/total。
    // 分叉后果（2026-11-03 实测）：/stocks 整页显示「行情接口响应缺少 data.items 数组（契约不符）」，
    // 数据是真的（200 / 2.78MB / 5546 条）却整页不可用。在**后端**补齐 items/total 是唯一
    // 不需要同时改动 Worker 与前端的选择：两侧覆盖**同一批行、同一个总数**（items 只是按
    // Worker 契约改名成 latestQuote 嵌套形态），不构成第二真源。
    return {
      // 旧侧（保持字节级不变，不删任何字段）
      stocks,
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / (params.pageSize ?? 20)),
      },
      // 新侧（与 Worker 同构，前端 store 只认这一侧）
      items: (stocks as unknown as Record<string, unknown>[]).map(toWorkerStockItem),
      total: totalCount,
    };
  }, 30000); // 30秒缓存

  // 诚实红线：DB 直读无「历史缓存」层，查不到行即如实置 unavailable，
  // 绝不让前端把「空列表」误当成「真实但今天没有股票」。
  const rowCount = Array.isArray(result.stocks) ? result.stocks.length : 0;
  if (rowCount === 0) {
    sendHonest(res, 'unavailable', {
      ...result,
      message: '本地真实股票库无匹配记录（数据库为空或筛选条件无命中），未返回任何股票数据',
    });
    return;
  }
  sendHonest(res, 'real', result);
}));

// 注意：特定路径必须在通配符路径之前定义，否则 /stocks/:symbol 会匹配 /stocks/xxx/quotes
router.get('/stocks/:symbol/quotes', validateParams(schemas.stockSymbol), validateQuery(schemas.quoteQuery), asyncHandler(async (req, res) => {
  const rawSymbol = req.params.symbol;
  const symbol = normalizeSymbol(rawSymbol);
  // P0-SYMBOL：规范化已收口到 db 层（getStockBySymbol 自行接受裸码/带后缀/sh.600519），
  // 路由不再需要「查不到再回退原始写法」的补丁式二次查询。
  const stock = await db.getStockBySymbol(symbol);
  if (!stock) return sendNotFound(res, '股票');
  const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
  const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 120;
  const quotes = await db.getDailyQuotes(stock.id, startDate, endDate, limit);
  if (!quotes || quotes.length === 0) {
    sendHonest(res, 'unavailable', {
      stock: { symbol: stock.symbol, name: stock.name },
      quotes: [],
      message: '本地真实行情库无该股票的日线记录，未返回任何行情数据',
    });
    return;
  }
  sendHonest(res, 'real', { stock: { symbol: stock.symbol, name: stock.name }, quotes });
}));

router.get('/stocks/:symbol/latest', validateParams(schemas.stockSymbol), asyncHandler(async (req, res) => {
  const rawSymbol = req.params.symbol;
  const symbol = normalizeSymbol(rawSymbol);
  const stockWithQuote = await db.getStockWithLatestQuote(symbol);
  if (!stockWithQuote) return sendNotFound(res, '股票');
  // 无最新行情时只回股票档案 + 显式空态，不用 0 冒充现价
  if (!stockWithQuote.latestQuote) {
    sendHonest(res, 'unavailable', {
      ...stockWithQuote,
      latestQuote: null,
      message: '本地真实行情库无该股票的最新行情记录，latestQuote 置 null（未用 0 顶替）',
    });
    return;
  }
  sendHonest(res, 'real', withYuanMarketCap(stockWithQuote as unknown as Record<string, unknown>));
}));

router.get('/stocks/:symbol', validateParams(schemas.stockSymbol), asyncHandler(async (req, res) => {
  const rawSymbol = req.params.symbol;
  const symbol = normalizeSymbol(rawSymbol);
  // P0-SYMBOL：符号规范化由 db 层负责，路由不再做补丁式回退查询
  const stock = await db.getStockBySymbol(symbol);
  if (!stock) return sendNotFound(res, '股票');
  const latestQuote = await db.getLatestDailyQuote(stock.id);
  if (!latestQuote) {
    sendHonest(res, 'unavailable', {
      ...stock,
      latestQuote: null,
      message: '本地真实行情库无该股票的最新行情记录，latestQuote 置 null（未用 0 顶替）',
    });
    return;
  }
  sendHonest(res, 'real', withYuanMarketCap({ ...stock, latestQuote }));
}));

// K线数据接口 - 支持日K/周K/月K
router.get('/stocks/:symbol/kline', validateParams(schemas.stockSymbol), asyncHandler(async (req, res) => {
  const rawSymbol = req.params.symbol;
  const symbol = normalizeSymbol(rawSymbol);
  const period = (req.query.period as string) || 'daily'; // daily/weekly/monthly
  const limit = Math.min(parseInt(req.query.limit as string) || 250, 1000);

  // P0-SYMBOL：符号规范化由 db 层负责
  const stock = await db.getStockBySymbol(symbol);
  if (!stock) return sendNotFound(res, '股票');

  // 查询日K数据
  const klineRows = await db.connection('daily_quotes')
    .where('stock_id', stock.id)
    .select(
      'trade_date as tradeDate',
      'open_price as open',
      'close_price as close',
      'high_price as high',
      'low_price as low',
      'volume',
      'turnover'
    )
    .orderBy('trade_date', 'asc')
    .limit(limit);

  if (klineRows.length === 0) {
    // 诚实空态：真实库无 K 线时置 unavailable，绝不返回 count:0 冒充「真实但无行情」
    return sendHonest(res, 'unavailable', {
      data: [], symbol, period, count: 0,
      message: '本地真实行情库无该股票的 K 线记录，未返回任何行情数据',
    });
  }

  // 转换为数值类型 + 日期格式化
  const fmtDate = (d: unknown): string => {
    if (!d) return '';
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    const dt = new Date(d as string | number | Date);
    return isNaN(dt.getTime()) ? String(d) : dt.toISOString().slice(0, 10);
  };
  let data = klineRows.map((r: Record<string, string | number>) => ({
    tradeDate: fmtDate(r.tradeDate),
    open: Number(r.open),
    close: Number(r.close),
    high: Number(r.high),
    low: Number(r.low),
    volume: Number(r.volume),
    turnover: Number(r.turnover),
  }));

  // 周K/月K聚合
  if (period === 'weekly' || period === 'monthly') {
    const grouped = new Map<string, typeof data>();
    for (const bar of data) {
      const d = new Date(bar.tradeDate);
      let key: string;
      if (period === 'weekly') {
        // ISO周: YYYY-Www
        const jan1 = new Date(d.getFullYear(), 0, 1);
        const weekNum = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
        key = `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
      } else {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(bar);
    }
    data = Array.from(grouped.entries()).map(([, bars]) => ({
      tradeDate: bars[bars.length - 1].tradeDate,
      open: bars[0].open,
      close: bars[bars.length - 1].close,
      high: Math.max(...bars.map(b => b.high)),
      low: Math.min(...bars.map(b => b.low)),
      volume: bars.reduce((s, b) => s + b.volume, 0),
      turnover: bars.reduce((s, b) => s + b.turnover, 0),
    }));
  }

  sendHonest(res, 'real', { quotes: data, symbol, period, count: data.length });
}));

router.post('/stocks/batch/quotes', validateBody(schemas.batchQuotes), asyncHandler(async (req, res) => {
  const { symbols } = req.body;
  const stocks = await db.getStocksWithLatestQuotes(symbols);
  if (!stocks || stocks.length === 0) {
    sendHonest(res, 'unavailable', {
      stocks: [], count: 0,
      message: '本地真实行情库无匹配标的的行情记录，未返回任何行情数据',
    });
    return;
  }
  // 批量行情同口径：latestQuote.marketCap 一并换算到元（与单只详情一致）
  sendHonest(res, 'real', {
    stocks: stocks.map((s) => withYuanMarketCap(s as unknown as Record<string, unknown>)),
    count: stocks.length,
    marketCapUnit: 'yuan',
  });
}));

// ==================== 市场数据 ====================

/**
 * 口径披露（缺陷B，2026-11-03）。
 *
 * 同一时刻的两个「股票数」都真，但口径不同：
 *   - 本端点 `totalStocks`：**当日有行情记录**的标的数（线上 2026-11-02 实测 5184）；
 *   - `/api/stocks` 的 `pagination.totalCount`：`stocks` 表**全部活跃标的**
 *     （同期实测 5546，含 5 条指数行与停牌标的）。
 * 此前没有任何标注，用户看到两个数字只会认为其中一个错了。
 *
 * 约束（诚实红线）：
 *   1. 两个数字都只来自真实查询，**不做任何估算/外推**；
 *   2. 文案由**实际查到的数字**动态拼装，不写死 5184/5546 之类的常量；
 *   3. 清单计数查不到时如实说「对比暂不可得」，绝不拿 totalStocks 顶替，
 *      也不退化成 0/-1。
 */
/**
 * 口径说明的**纯函数**部分：只做文案拼装，不碰数据库（便于单测）。
 *
 * @param quoteCoveredStocks 本端点 totalStocks（当日有行情记录的标的数）
 * @param listedStockCount   stocks 表活跃标的总数；null = 本次查不到
 * @param excludedIndexRows  聚合时剔除的指数行条数；null = 该库未提供此字段
 * @param asOf               实际使用的交易日
 */
export function composeCoverageNote(input: {
  quoteCoveredStocks: number;
  listedStockCount: number | null;
  excludedIndexRows: number | null;
  asOf: string;
}): string {
  const { quoteCoveredStocks, listedStockCount, excludedIndexRows, asOf } = input;

  const quotedPart =
    `本口径 totalStocks=${quoteCoveredStocks} 表示「${asOf} 当日有行情记录的标的数」` +
    (excludedIndexRows !== null
      ? `（成交额/涨跌家数聚合时已剔除 ${excludedIndexRows} 条指数行，指数成交额为成份股合计）`
      : '');

  if (listedStockCount === null) {
    return `${quotedPart}；股票清单总数本次查询不可得（数据库计数失败或超时），` +
      '两者的口径差异无法量化，此处不作估计。';
  }

  const diff = listedStockCount - quoteCoveredStocks;
  const diffPart = diff >= 0
    ? `多出的 ${diff} 只属于「库里有档案但当日无行情记录」（停牌、退市整理、指数行等）`
    : `本口径反而比清单多 ${-diff} 只，说明清单与当日行情表的标的集合不一致，需数据侧核查`;

  return `${quotedPart}；股票清单总数 ${listedStockCount}` +
    '（GET /api/stocks 的 pagination.totalCount）表示 stocks 表全部活跃标的，' +
    `含指数行与停牌标的。两者口径不同、不可直接比较，不表示其中一个有误：${diffPart}。`;
}

/**
 * 组装 /api/market/summary 的口径披露字段。
 * 唯一的副作用是**一次真实计数查询**——数字不来自估算。
 */
async function buildCoverageNote(
  summary: Record<string, unknown>,
  asOf: string,
): Promise<{ coverageNote: string; listedStockCount: number | null }> {
  // 与 /api/stocks 的 totalCount 走**同一函数同一参数**（isActive 默认 true），
  // 保证披露的「清单总数」与用户在股票列表页看到的 totalCount 逐字一致。
  let listedStockCount: number | null = null;
  try {
    const n = Number(await db.getStockCount({ isActive: true }));
    if (Number.isFinite(n) && n >= 0) listedStockCount = n;
  } catch {
    // 计数失败 → 保持 null，如实「不可得」；绝不估算、绝不用 0 顶替
  }

  const coverageNote = composeCoverageNote({
    quoteCoveredStocks: Number(summary.totalStocks),
    listedStockCount,
    excludedIndexRows: typeof summary.excludedIndexRows === 'number'
      ? summary.excludedIndexRows
      : null,
    asOf,
  });
  return { coverageNote, listedStockCount };
}

router.get('/market/summary', validateQuery(schemas.marketQuery), asyncHandler(async (req, res) => {
  // P0-CALWIRE：未指定日期→回退最近有数据的交易日；指定日无数据→同样回退（asOf 如实标注）
  const q = await resolveMarketQueryDate(req.query.date as Date | string | undefined);
  const summary = await db.getMarketSummary(localDayKey(q.asOf));
  if (!summary) {
    sendHonest(res, 'unavailable', {
      date: q.asOf,
      ...calendarFields(q),
      message: '本地真实行情库无最近交易日的市场聚合数据（未同步），未返回任何涨跌家数',
    });
    return;
  }
  let indicesAvailable = true;
  try {
    const indices = await fetchMarketIndices();
    (summary as Record<string, unknown>).indices = indices;
    indicesAvailable = indices.length > 0;
  } catch (e) { /* 指数获取失败不影响主流程 */ }
  // 口径披露（缺陷B，2026-11-03）：本端点的 totalStocks 是「当日有行情记录的标的数」，
  // 与 /api/stocks 的 totalCount「stocks 表全部活跃标的（含指数行与停牌）」是两个口径。
  // 两个数字都真，但此前**没有任何标注**，用户会认为其中一个错了（线上实测 5184 vs 5546）。
  // 这里补 coverageNote：文案由**实际查到的两个数字**动态拼装，不写死任何常量；
  // 清单计数查不到时如实说明「对比暂不可得」，不退化成估计值。
  const coverage = await buildCoverageNote(summary as Record<string, unknown>, q.asOf);
  // indices 来自腾讯实时源，失败时主数据仍为真实 → 整体仍是 real，但显式告知 indices 缺失
  sendHonest(res, 'real', {
    ...summary,
    // 查询键已改为「本地零点」（见 localDayKey），但对外 `date` 形态必须与修复前逐字节
    // 一致（UTC 零点 ISO），否则负偏移时区会输出 ...T04:00:00.000Z，前端/调用方会看到
    // 同一交易日两种不同时刻。故作显式覆盖：查询键与响应字段解耦。
    date: q.date,
    ...calendarFields(q),
    ...coverage,
    ...(indicesAvailable ? {} : { message: '市场聚合数据为真实值；实时指数源不可达，indices 为空' }),
  });
}));

router.get('/market/indices', asyncHandler(async (_req, res) => {
  const indices = await fetchMarketIndices();
  if (!indices || indices.length === 0) {
    sendHonest(res, 'unavailable', {
      indices: [],
      message: '腾讯实时指数源不可达或未返回数据，未返回任何指数数值',
    });
    return;
  }
  sendHonest(res, 'real', { indices });
}));

router.get('/market/industries', validateQuery(schemas.marketQuery), asyncHandler(async (req, res) => {
  const q = await resolveMarketQueryDate(req.query.date as Date | string | undefined);
  const industries = await db.getIndustryPerformance(localDayKey(q.asOf));
  sendHonest(res, industries.length > 0 ? 'real' : 'unavailable', {
    date: q.date,
    ...calendarFields(q),
    industries,
    ...(industries.length > 0
      ? {}
      : { message: '本地真实行情库无最近交易日的行业聚合数据（未同步）' }),
  });
}));

router.get('/market/top-gainers', validateQuery(schemas.marketQuery), asyncHandler(async (req, res) => {
  const q = await resolveMarketQueryDate(req.query.date as Date | string | undefined);
  const limit = parseInt(req.query.limit as string) || 10;
  const topGainers = await db.getTopGainers(localDayKey(q.asOf), limit);
  sendHonest(res, topGainers.length > 0 ? 'real' : 'unavailable', {
    date: q.date,
    ...calendarFields(q),
    topGainers,
    ...(topGainers.length > 0 ? {} : { message: '本地真实行情库无最近交易日的涨幅榜数据' }),
  });
}));

router.get('/market/top-losers', validateQuery(schemas.marketQuery), asyncHandler(async (req, res) => {
  const q = await resolveMarketQueryDate(req.query.date as Date | string | undefined);
  const limit = parseInt(req.query.limit as string) || 10;
  const topLosers = await db.getTopLosers(localDayKey(q.asOf), limit);
  sendHonest(res, topLosers.length > 0 ? 'real' : 'unavailable', {
    date: q.date,
    ...calendarFields(q),
    topLosers,
    ...(topLosers.length > 0 ? {} : { message: '本地真实行情库无最近交易日的跌幅榜数据' }),
  });
}));

router.get('/market/top-turnover', validateQuery(schemas.marketQuery), asyncHandler(async (req, res) => {
  const q = await resolveMarketQueryDate(req.query.date as Date | string | undefined);
  const limit = parseInt(req.query.limit as string) || 10;
  const topTurnover = await db.getTopTurnover(localDayKey(q.asOf), limit);
  sendHonest(res, topTurnover.length > 0 ? 'real' : 'unavailable', {
    date: q.date,
    ...calendarFields(q),
    topTurnover,
    ...(topTurnover.length > 0 ? {} : { message: '本地真实行情库无最近交易日的换手率榜数据' }),
  });
}));

// ==================== 三大指数实时行情 ====================

async function fetchMarketIndices() {
  // 腾讯API符号格式
  const indexConfig: { tencentSymbol: string; name: string; displaySymbol: string; category: string }[] = [
    { tencentSymbol: 'sh000001', name: '上证指数', displaySymbol: '000001.SH', category: '综合' },
    { tencentSymbol: 'sz399001', name: '深证成指', displaySymbol: '399001.SZ', category: '综合' },
    { tencentSymbol: 'sz399006', name: '创业板指', displaySymbol: '399006.SZ', category: '综合' },
    { tencentSymbol: 'sh000016', name: '上证50', displaySymbol: '000016.SH', category: '大盘' },
    { tencentSymbol: 'sh000300', name: '沪深300', displaySymbol: '000300.SH', category: '大盘' },
    { tencentSymbol: 'sh000905', name: '中证500', displaySymbol: '000905.SH', category: '中盘' },
    { tencentSymbol: 'sh000852', name: '中证1000', displaySymbol: '000852.SH', category: '小盘' },
    { tencentSymbol: 'sh000688', name: '科创50', displaySymbol: '000688.SH', category: '科创' },
    { tencentSymbol: 'sz399005', name: '中小100', displaySymbol: '399005.SZ', category: '中盘' },
  ];
  const symbols = indexConfig.map(c => c.tencentSymbol).join(',');
  const resp = await fetch(`https://qt.gtimg.cn/q=${symbols}`, {
    headers: { 'Referer': 'https://finance.qq.com' },
  });
  const text = await resp.text();
  const indices: Record<string, unknown>[] = [];
  for (const cfg of indexConfig) {
    const pattern = new RegExp(`v_${cfg.tencentSymbol}="([^"]+)"`);
    const match = text.match(pattern);
    if (!match) continue;
    const parts = match[1].split('~');
    if (parts.length < 40) continue;
    indices.push({
      name: cfg.name,
      symbol: cfg.displaySymbol,
      closePrice: parseFloat(parts[3]) || 0,
      openPrice: parseFloat(parts[5]) || 0,
      highPrice: parseFloat(parts[33]) || 0,
      lowPrice: parseFloat(parts[34]) || 0,
      changePercent: parseFloat(parts[32]) || 0,
      volume: parseInt(parts[6]) || 0,
      turnover: (parseInt(parts[37]) || 0) * WAN_TO_YUAN,
      category: cfg.category,
    });
  }
  return indices;
}

// ==================== 技术指标批量查询 ====================

router.post('/tech/batch', asyncHandler(async (req, res) => {
  const { symbols, days: rawDays } = req.body;
  const days = Math.min(rawDays || 30, 120);
  const symbolList = ((symbols as string[]) || []).slice(0, 40);
  
  if (!symbolList.length) {
    throw new AppError(400, 'VALIDATION_ERROR', '未提供 symbols：无法查询任何技术指标', 'symbols 不能为空数组');
  }

  const results: Record<string, any> = {};

  // Parallel: resolve all symbols to stock_ids
  const stockInfos = await Promise.all(
    symbolList.map(async (sym) => {
      const stock = await db.getStockBySymbol(sym);
      return { symbol: sym, stockId: stock?.id ?? null };
    })
  );

  // Fetch quotes and compute in parallel batches of 10
  const batchSize = 10;
  for (let i = 0; i < stockInfos.length; i += batchSize) {
    const batch = stockInfos.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async ({ symbol, stockId }) => {
        if (!stockId) return { symbol };
        try {
          const quotes = await db.getDailyQuotes(stockId, undefined, undefined, days + 20);
          if (!quotes || quotes.length < 5) return { symbol };

          // Sort ascending by trade_date (oldest first)
          quotes.sort((a, b) => new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime());
          const closes = quotes.map(q => Number(q.closePrice)).filter(c => c > 0);
          if (closes.length < 5) return { symbol };

          const latest = closes[closes.length - 1];

          const change5d = closes.length >= 6
            ? Math.round(((latest - closes[closes.length - 6]) / closes[closes.length - 6] * 100) * 100) / 100
            : null;
          const change20d = closes.length >= 21
            ? Math.round(((latest - closes[closes.length - 21]) / closes[closes.length - 21] * 100) * 100) / 100
            : null;
          const changeRange = closes.length >= days + 1
            ? Math.round(((latest - closes[closes.length - 1 - days]) / closes[closes.length - 1 - days] * 100) * 100) / 100
            : null;

          const lookback20 = closes.slice(-20);
          const ma20 = Math.round((lookback20.reduce((a, b) => a + b, 0) / lookback20.length) * 100) / 100;
          const maDeviation = Math.round(((latest - ma20) / ma20 * 100) * 100) / 100;

          let rsi14: number | null = null;
          if (closes.length >= 15) {
            const rsiCloses = closes.slice(-15);
            let gains = 0, losses = 0;
            for (let j = 1; j < rsiCloses.length; j++) {
              const diff = rsiCloses[j] - rsiCloses[j - 1];
              if (diff > 0) gains += diff;
              else losses += Math.abs(diff);
            }
            if (gains + losses === 0) {
              rsi14 = 50;
            } else {
              rsi14 = Math.round(100 - (100 / (1 + (gains / 14) / (losses / 14))));
            }
          }

          // Volatility 20d
          let vol20d: number | null = null;
          if (lookback20.length >= 2) {
            const rets: number[] = [];
            for (let j = 1; j < lookback20.length; j++) {
              rets.push(Math.log(lookback20[j] / lookback20[j - 1]));
            }
            const m = rets.reduce((a, b) => a + b, 0) / rets.length;
            const v = rets.reduce((a, b) => a + (b - m) ** 2, 0) / rets.length;
            vol20d = Math.round(Math.sqrt(v) * Math.sqrt(250) * 100 * 100) / 100;
          }

          return {
            symbol,
            change5d,
            change20d,
            changeRange,
            ma20,
            maDeviation,
            rsi14,
            volatility20d: vol20d,
          };
        } catch (e) {
          if (e instanceof AppError) throw e;
          return { symbol };
        }
      })
    );

    for (const r of batchResults) {
      if (r.change5d != null) {
        results[r.symbol] = r;
      }
    }
  }

  if (Object.keys(results).length === 0) {
    // 顶层与 data 内共用同一 dataSource 变量（诚实红线：绝不返回 0 值或空对象冒充真实）
    return sendHonest(res, 'unavailable', {
      message: '未获得任何标的的技术指标：数据源不可用或历史行情样本不足',
      data: {},
    });
  }

  sendHonest(res, 'real', { data: results });
}));


// ==================== 数据新鲜度 ====================

router.get('/data/freshness', asyncHandler(async (_req, res) => {
  const cacheKey = 'data:freshness';
  const result = await queryCache.query(cacheKey, async () => {
    // 查询最新交易日
    const latestDateRow = await db.connection('daily_quotes')
      .max('trade_date as latest_date')
      .first();
    const latestTradeDate: string | null = latestDateRow?.latest_date
      ? new Date(latestDateRow.latest_date).toISOString().slice(0, 10)
      : null;

    // 查询今日行情数量
    const today = new Date().toISOString().slice(0, 10);
    const todayRow = await db.connection('daily_quotes')
      .where('trade_date', '>=', today)
      .count('* as cnt')
      .first();
    const quotesToday = Number(todayRow?.cnt || 0);

    // 查询活跃股票数量
    const stockRow = await db.connection('stocks')
      .where('is_active', true)
      .count('* as cnt')
      .first();
    const stockCount = Number(stockRow?.cnt || 0);

    // 同步状态
    const syncState = dataSyncService.getSyncState();

    return {
      latestTradeDate,
      stockCount,
      quotesToday,
      syncInterval: syncState.intervalSeconds,
      lastSyncAt: syncState.lastSyncAt,
      totalSyncs: syncState.totalSyncs,
      isSyncing: syncState.running,
      degraded: syncState.degraded || false,
    };
  }, 60000); // 60秒缓存

  // 数据新鲜度本身即「真实库有无数据」的如实反映：无任何真实行时置 unavailable
  // 注意：latestTradeDate / stockCount 声明在 queryCache.query() 闭包**内部**，
  // 闭包外不可见（此前直接引用致请求命中即 ReferenceError → HTTP 500）。
  // 正确做法：取闭包返回值 result 上的同名字段。
  const hasRealRows = result.latestTradeDate !== null || result.stockCount > 0;
  sendHonest(res, hasRealRows ? 'real' : 'unavailable', {
    ...result,
    ...(hasRealRows
      ? {}
      : { message: '本地真实行情库为空（无最新交易日、无活跃股票），以下计数均为 0 而非行情数据' }),
  });
}));

export default router;
