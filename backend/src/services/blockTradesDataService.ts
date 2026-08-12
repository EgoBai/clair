/**
 * 大宗交易数据服务（真实源版）
 *
 * 数据来源（东方财富大宗交易接口，免 key）：
 *   https://datacenter-web.eastmoney.com/api/data/get?type=RPTA_WEB_DZH_MUTRADE&...
 *   - 字段：SECURITY_CODE / SECURITY_NAME_ABBR / TRADE_DATE / TRADE_PRICE /
 *           TRADE_VOLUME / TRADE_AMOUNT / BUYER_NAME / SELLER_NAME / DISCOUNT / CLOSE_PRICE
 *
 * 遵守「诚实数据」红线：
 *   - 真实源不可达（超时 / HTTP 非 2xx / 返回结构异常）→ 抛出 BlockTradesUnavailableError；
 *   - 由路由层降级为 dataSource:'unavailable' 的诚实空，绝不回填伪造 / 随机数据。
 *   - 某交易日真实源确认无大宗交易记录（result.data 为空数组）时，诚实返回 []（非错误）。
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

const BLOCK_TRADE_COLUMNS = [
  'SECURITY_CODE',
  'SECURITY_NAME_ABBR',
  'TRADE_DATE',
  'TRADE_PRICE',
  'TRADE_VOLUME',
  'TRADE_AMOUNT',
  'BUYER_NAME',
  'SELLER_NAME',
  'DISCOUNT',
  'CLOSE_PRICE',
].join(',');

/** 构造东方财富大宗交易真实接口 URL（按日期 + 可选个股过滤） */
function buildBlockTradeUrl(date: string, symbol?: string): string {
  let filter = `(TRADE_DATE='${date}')`;
  if (symbol) {
    const norm = normalizeSymbol(symbol);
    if (!norm) throw new BlockTradesUnavailableError(`无效的股票代码: ${symbol}`);
    // 东财多条件过滤：括号拼接
    filter = `(TRADE_DATE='${date}')(SECURITY_CODE="${norm.digits}")`;
  }
  const query =
    `type=RPTA_WEB_DZH_MUTRADE` +
    `&columns=${encodeURIComponent(BLOCK_TRADE_COLUMNS)}` +
    `&filter=${encodeURIComponent(filter)}` +
    `&pageSize=${BLOCK_TRADE_PAGE_SIZE}` +
    `&source=WEB&client=WEB`;
  return `https://datacenter-web.eastmoney.com/api/data/get?${query}`;
}

/** 将单行真实源记录映射为标准化 BlockTrade（兼容两种字段命名） */
function mapRow(r: any): BlockTrade {
  const rawSymbol = String(r.SECURITY_CODE ?? r.SECUCODE ?? '').trim();
  // 归一化为纯数字代码（去掉 .SH/.SZ 后缀），与 symbol 过滤保持一致
  const symbol = normalizeSymbol(rawSymbol)?.digits ?? rawSymbol;
  const name = String(r.SECURITY_NAME_ABBR ?? r.SECUNAME ?? '').trim();
  const tradeDate = String(r.TRADE_DATE ?? '').slice(0, 10);
  const price = Number(r.TRADE_PRICE ?? r.PRICE ?? 0);
  const closePrice = Number(r.CLOSE_PRICE ?? r.CLOSEPRICE ?? 0);
  const volume = Number(r.TRADE_VOLUME ?? r.VOLUME ?? 0);
  const amount = Number(r.TRADE_AMOUNT ?? r.AMOUNT ?? 0);
  const discount = Number(r.DISCOUNT ?? 0);
  const buyer = String(r.BUYER_NAME ?? r.BUYER ?? '');
  const seller = String(r.SELLER_NAME ?? r.SELLER ?? '');
  return { symbol, name, tradeDate, price, closePrice, volume, amount, discount, buyer, seller };
}

/**
 * 获取真实大宗交易记录。
 * @param date 交易日期 YYYY-MM-DD（缺省为今天）
 * @param symbol 可选个股代码（600519 / 600519.SH 等），过滤单只股票
 * 源失败 / 结构异常 → 抛 BlockTradesUnavailableError；当日确实无记录 → 返回 []。
 */
export async function getBlockTrades(date?: string, symbol?: string): Promise<BlockTrade[]> {
  const tradeDate = normalizeDate(date);
  const url = buildBlockTradeUrl(tradeDate, symbol);
  try {
    const json = await fetchJson(url, {
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://data.eastmoney.com',
    });

    // 诚实判定：source 明确返回失败、或结构异常（result 缺失）一律视为不可用
    if (json?.success === false || json?.result == null) {
      const msg = typeof json?.message === 'string' ? json.message : '大宗交易源返回异常';
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

    // 若接口未按 symbol 过滤（兜底），在返回层精确过滤
    if (symbol) {
      const digits = normalizeSymbol(symbol)?.digits;
      return digits ? trades.filter((t) => t.symbol === digits) : trades;
    }
    return trades;
  } catch (e) {
    if (e instanceof BlockTradesUnavailableError) throw e;
    throw new BlockTradesUnavailableError(e instanceof Error ? e.message : '大宗交易源不可用');
  }
}
