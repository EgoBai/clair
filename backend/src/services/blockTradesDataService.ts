/**
 * 大宗交易数据服务（真实源版）
 *
 * 数据来源（东方财富大宗交易报表，免 key）：
 *   https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_DATA_BLOCKTRADE&...
 *   - 字段：SECURITY_CODE / SECURITY_NAME_ABBR / TRADE_DATE / DEAL_PRICE /
 *           CLOSE_PRICE / DEAL_VOLUME / DEAL_AMT / BUYER_NAME / SELLER_NAME / PREMIUM_RATIO
 *
 * 【历史坑，勿回退】旧实现用的是 /api/data/get?type=RPTA_WEB_DZH_MUTRADE，
 * 该端点已被东财整体废弃，对任意 columns 形态都返回 code:9501
 * 「返回字段参数不能为空」，导致大宗交易长期恒空。现行端点为 /api/data/v1/get。
 *
 * 遵守「诚实数据」红线：
 *   - 真实源不可达（超时 / HTTP 非 2xx / 返回结构异常 / 非 9201 的上游错误）→ 抛
 *     BlockTradesUnavailableError；
 *   - 上游 code=9201「返回数据为空」= **源可达但该条件当日无成交** → 诚实返回 []，
 *     绝不与「源不可用」混淆（否则休市日会被误报成接口故障）；
 *   - 绝不给无结果的日子伪造 / 随机记录。
 */

/** 真实大宗交易源不可用时抛出，供路由层降级为「诚实空」。 */
export class BlockTradesUnavailableError extends Error {
  constructor(msg = '大宗交易真实源暂不可用（后端未接入或网络受限）') {
    super(msg);
    this.name = 'BlockTradesUnavailableError';
  }
}

export interface BlockTrade {
  /** 数字代码，如 600519 */
  symbol: string;
  /** 证券名称 */
  name: string;
  /** 交易日期 YYYY-MM-DD */
  tradeDate: string;
  /** 成交价 */
  price: number;
  /** 收盘价 */
  closePrice: number;
  /** 成交量（股） */
  volume: number;
  /** 成交额（元） */
  amount: number;
  /** 折价率（%，负为折价、正为溢价） */
  discount: number;
  /** 买方营业部 */
  buyer: string;
  /** 卖方营业部 */
  seller: string;
}

const FETCH_TIMEOUT_MS = 8000;
const BLOCK_TRADE_PAGE_SIZE = 1000; // 单日全量

/** 带超时的 JSON 抓取（复用 newsDataService 风格） */
async function fetchJson(url: string, headers?: Record<string, string>): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: ctrl.signal, headers });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

/** 将多种符号格式归一化为东财所需的 digits（600519）。复用 newsDataService 思路。 */
export function normalizeSymbol(symbol: string): { digits: string; secucode: string } | null {
  const trimmed = (symbol || '').trim().toUpperCase();
  if (!trimmed) return null;
  const digits = trimmed.replace(/^(SH|SZ|BJ)/, '').replace(/\.(SH|SZ|BJ)$/, '');
  if (!/^\d{6}$/.test(digits)) return null;
  let market: 'SH' | 'SZ' | 'BJ';
  if (trimmed.startsWith('SH') || trimmed.endsWith('.SH') || digits.startsWith('6')) market = 'SH';
  else if (trimmed.startsWith('SZ') || trimmed.endsWith('.SZ') || digits.startsWith('0') || digits.startsWith('3') || digits.startsWith('2')) market = 'SZ';
  else market = 'BJ';
  return { digits, secucode: `${digits}.${market}` };
}

/** 校验 / 归一化日期，非法则回退到今天（确定性，非随机） */
function normalizeDate(date?: string): string {
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return new Date().toISOString().slice(0, 10);
}

/** v1 端点：报表名 + 需要的列（v1 的列名与旧端点不同，见文件头说明） */
const BLOCK_TRADE_REPORT = 'RPT_DATA_BLOCKTRADE';
const BLOCK_TRADE_COLUMNS = [
  'SECURITY_CODE',
  'SECURITY_NAME_ABBR',
  'TRADE_DATE',
  'DEAL_PRICE',
  'CLOSE_PRICE',
  'DEAL_VOLUME',
  'DEAL_AMT',
  'BUYER_NAME',
  'SELLER_NAME',
  'PREMIUM_RATIO',
].join(',');

/**
 * 构造东方财富大宗交易真实接口 URL（按日期 + 可选个股过滤，倒序取最新）
 *
 * 【9501 的两种成因，勿混淆】上游把下面两种完全不同的问题都报成
 * code=9501「返回字段参数不能为空」，排查时必须区分：
 *   1. 端点废弃：早期实现用的 /api/data/get?type=RPTA_WEB_DZH_MUTRADE 已被东财
 *      整体废弃，**任何** columns 形态都返回 9501（列举 / ALL / 不带均如此），
 *      与字段无关 → 只能靠换端点（迁 v1）解决。
 *   2. filter 引号写错：symbol 必须用**双引号** (SECURITY_CODE="600519")，
 *      日期必须用**单引号** (TRADE_DATE='2026-09-30')。引号写反会被解析成
 *      非法 filter，同样报 9501，但改引号即可修复。
 * 另外 v1 端点必须显式给 columns（columns=ALL 亦可），完全不给会报 9501。
 */
function buildBlockTradeUrl(date: string, symbol?: string): string {
  const filterParts = [`(TRADE_DATE='${date}')`];
  if (symbol) {
    const norm = normalizeSymbol(symbol);
    if (!norm) throw new BlockTradesUnavailableError(`无效的股票代码: ${symbol}`);
    filterParts.push(`(SECURITY_CODE="${norm.digits}")`);
  }
  const query =
    `reportName=${BLOCK_TRADE_REPORT}` +
    `&columns=${encodeURIComponent(BLOCK_TRADE_COLUMNS)}` +
    `&filter=${encodeURIComponent(filterParts.join(''))}` +
    `&sortColumns=TRADE_DATE&sortTypes=-1` +
    `&pageSize=${BLOCK_TRADE_PAGE_SIZE}` +
    `&source=WEB&client=WEB`;
  return `https://datacenter-web.eastmoney.com/api/data/v1/get?${query}`;
}

/** 将单行真实源记录映射为标准化 BlockTrade（兼容两种字段命名） */
function mapRow(r: any): BlockTrade {
  const rawSymbol = String(r.SECURITY_CODE ?? r.SECUCODE ?? '').trim();
  // 归一化为纯数字代码（去掉 .SH/.SZ 后缀），与 symbol 过滤保持一致
  const symbol = normalizeSymbol(rawSymbol)?.digits ?? rawSymbol;
  const name = String(r.SECURITY_NAME_ABBR ?? r.SECUNAME ?? '').trim();
  const tradeDate = String(r.TRADE_DATE ?? '').slice(0, 10);
  const price = Number(r.DEAL_PRICE ?? r.TRADE_PRICE ?? 0);
  const closePrice = Number(r.CLOSE_PRICE ?? 0);
  const volume = Number(r.DEAL_VOLUME ?? r.TRADE_VOLUME ?? 0);
  const amount = Number(r.DEAL_AMT ?? r.TRADE_AMOUNT ?? 0);
  // PREMIUM_RATIO 是无量纲小数 (成交价-收盘价)/收盘价；本接口契约 discount 为百分数，故 ×100。
  // 保留 2 位小数：前端以 toFixed(2) 展示，直接吐浮点尾数（如 0.13908205839999999）属噪声泄漏。
  const rawDiscount = Number(r.PREMIUM_RATIO ?? r.DISCOUNT ?? 0);
  const discount = Number.isFinite(rawDiscount) ? Math.round(rawDiscount * 10000) / 100 : 0;
  const buyer = String(r.BUYER_NAME ?? r.BUYER ?? '');
  const seller = String(r.SELLER_NAME ?? r.SELLER ?? '');
  return { symbol, name, tradeDate, price, closePrice, volume, amount, discount, buyer, seller };
}

/**
 * 获取真实大宗交易记录。
 * @param date 交易日期 YYYY-MM-DD（缺省为今天）
 * @param symbol 可选个股代码（600519 / 600519.SH 等），过滤单只股票
 * 源失败 / 结构异常 → 抛 BlockTradesUnavailableError；
 * 当日确实无记录（含上游 9201「返回数据为空」）→ 返回 []（非错误）。
 */
export async function getBlockTrades(date?: string, symbol?: string): Promise<BlockTrade[]> {
  const tradeDate = normalizeDate(date);
  const url = buildBlockTradeUrl(tradeDate, symbol);
  let json: any;
  try {
    json = await fetchJson(url, {
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://data.eastmoney.com',
    });
  } catch (e) {
    throw new BlockTradesUnavailableError(e instanceof Error ? e.message : '大宗交易源不可用');
  }

  // 上游 9201 = 源可达但该日无成交（休市/ 无大宗交易），是**正常空**而非故障
  if (json?.code === 9201) return [];

  // 其余 success=false 才是真故障（如已废弃端点会返回 9501）
  if (json?.success === false || json?.result == null) {
    const msg =
      typeof json?.message === 'string' && json.message.trim()
        ? `上游大宗交易报表返回异常（code=${json?.code ?? 'unknown'}）：${json.message}`
        : '上游大宗交易报表返回异常';
    throw new BlockTradesUnavailableError(msg);
  }

  const result = json.result ?? json;
  const rows: any[] | null = Array.isArray(result?.data)
    ? result.data
    : Array.isArray(json?.data)
      ? json.data
      : null;

  if (rows === null) {
    throw new BlockTradesUnavailableError('大宗交易源返回结构异常');
  }

  // 真实源当日无大宗交易 → 诚实空数组（非错误，不回填）
  if (rows.length === 0) return [];

  const trades = rows.map(mapRow);

  // 若接口未按symbol 过滤（兜底），在返回层精确过滤
  if (symbol) {
    const digits = normalizeSymbol(symbol)?.digits;
    return digits ? trades.filter((t) => t.symbol === digits) : trades;
  }
  return trades;
}

/**
 * 按日期区间 + 个股查询真实大宗交易记录（单次请求，避免逐日 N 次往返）。
 * @param symbol 个股代码（必填）
 * @param startDate 起始日 YYYY-MM-DD（含）
 * @param endDate 结束日 YYYY-MM-DD（含）
 */
export async function getBlockTradesInRange(
  symbol: string,
  startDate: string,
  endDate: string
): Promise<BlockTrade[]> {
  const norm = normalizeSymbol(symbol);
  if (!norm) throw new BlockTradesUnavailableError(`无效的股票代码: ${symbol}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new BlockTradesUnavailableError('无效的日期区间');
  }

  // 注意引号规范：日期单引号、代码双引号（写反会得到 9501，详见 buildBlockTradeUrl 注释）
  const filter =
    `(TRADE_DATE>='${startDate}')(TRADE_DATE<='${endDate}')` +
    `(SECURITY_CODE="${norm.digits}")`;
  const query =
    `reportName=${BLOCK_TRADE_REPORT}` +
    `&columns=${encodeURIComponent(BLOCK_TRADE_COLUMNS)}` +
    `&filter=${encodeURIComponent(filter)}` +
    `&sortColumns=TRADE_DATE&sortTypes=-1` +
    `&pageSize=${BLOCK_TRADE_PAGE_SIZE}` +
    `&source=WEB&client=WEB`;
  const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?${query}`;

  let json: any;
  try {
    json = await fetchJson(url, {
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://data.eastmoney.com',
    });
  } catch (e) {
    throw new BlockTradesUnavailableError(e instanceof Error ? e.message : '大宗交易源不可用');
  }

  // 区间内无成交是正常事实（源可达），不是故障
  if (json?.code === 9201) return [];

  if (json?.success === false || json?.result == null) {
    const msg =
      typeof json?.message === 'string' && json.message.trim()
        ? `上游大宗交易报表返回异常（code=${json?.code ?? 'unknown'}）：${json.message}`
        : '上游大宗交易报表返回异常';
    throw new BlockTradesUnavailableError(msg);
  }

  const rows: any[] | null = Array.isArray(json?.result?.data)
    ? json.result.data
    : Array.isArray(json?.data)
      ? json.data
      : null;
  if (rows === null) {
    throw new BlockTradesUnavailableError('大宗交易源返回结构异常');
  }
  if (rows.length === 0) return [];

  const digits = norm.digits;
  return rows
    .map(mapRow)
    .filter((t) => t.symbol === digits || t.symbol === symbol);
}

/**
 * 取真实源中「最近一个有大宗交易记录的交易日」的记录。
 *
 * 用于 overview / 未指定 date 的列表：休市日（如国庆长假）直接按今天查必然为空，
 * 会被误读成「当天零成交」。这里改为倒序取真实存在的最新交易日，并如实上报该日期。
 */
export async function getLatestBlockTrades(symbol?: string): Promise<{
  tradeDate: string;
  trades: BlockTrade[];
}> {
  const filterParts: string[] = [];
  if (symbol) {
    const norm = normalizeSymbol(symbol);
    if (!norm) throw new BlockTradesUnavailableError(`无效的股票代码: ${symbol}`);
    filterParts.push(`(SECURITY_CODE="${norm.digits}")`);
  }
  const query =
    `reportName=${BLOCK_TRADE_REPORT}` +
    `&columns=${encodeURIComponent(BLOCK_TRADE_COLUMNS)}` +
    (filterParts.length ? `&filter=${encodeURIComponent(filterParts.join(''))}` : '') +
    `&sortColumns=TRADE_DATE&sortTypes=-1` +
    `&pageSize=${BLOCK_TRADE_PAGE_SIZE}` +
    `&source=WEB&client=WEB`;
  const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?${query}`;

  let json: any;
  try {
    json = await fetchJson(url, {
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://data.eastmoney.com',
    });
  } catch (e) {
    throw new BlockTradesUnavailableError(e instanceof Error ? e.message : '大宗交易源不可用');
  }

  if (json?.success === false || json?.result == null) {
    const msg =
      typeof json?.message === 'string' && json.message.trim()
        ? `上游大宗交易报表返回异常（code=${json?.code ?? 'unknown'}）：${json.message}`
        : '上游大宗交易报表返回异常';
    throw new BlockTradesUnavailableError(msg);
  }

  const rows: any[] = Array.isArray(json?.result?.data)
    ? json.result.data
    : Array.isArray(json?.data)
      ? json.data
      : null;
  if (rows === null) {
    throw new BlockTradesUnavailableError('大宗交易源返回结构异常');
  }
  // 全历史无任何大宗交易记录（极端情况）
  if (rows.length === 0) return { tradeDate: '', trades: [] };

  // 倒序返回 → 首条即最新交易日；只取该日记录，避免混入历史日期
  const tradeDate = String(rows[0]?.TRADE_DATE ?? '').slice(0, 10);
  const trades = rows
    .map(mapRow)
    .filter((t) => t.tradeDate === tradeDate);
  return { tradeDate, trades };
}
