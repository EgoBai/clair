/**
 * 历史日线 K 线数据服务（真实源版）
 *
 * 数据来源（东方财富历史 K 线接口，免 key）：
 *   https://push2his.eastmoney.com/api/qt/stock/kline/get
 *     ?secid={1|0}.{digits}
 *     &fields1=f1,f2,f3,f4,f5,f6
 *     &fields2=f51,f52,f53,f54,f55,f56,f57
 *     &klt=101&fqt=1&beg=0&end=20500101&lmt={days}
 *   - klt=101 日线；fqt=1 前复权
 *   - 返回 data.klines: string[]，每行逗号分隔：
 *     f51=date, f52=open, f53=close, f54=high, f55=low, f56=volume(手), f57=amount(元)
 *
 * 遵守「诚实数据」红线：
 *   - 真实源不可达（超时 / HTTP 非 2xx / 返回结构异常）→ 抛出 KlineUnavailableError；
 *   - 由路由层降级为 dataSource:'unavailable' 的诚实空，绝不回填伪造 / 随机 K 线；
 *   - 不使用任何随机数 / 硬编码假 K 线。
 */

/** 真实 K 线源不可用时抛出，供路由层降级为「诚实空」。 */
export class KlineUnavailableError extends Error {
  constructor(msg = '历史K线真实源暂不可用（后端未接入或网络受限）') {
    super(msg);
    this.name = 'KlineUnavailableError';
  }
}

export interface KlineData {
  /** 6 位数字代码，如 600519 */
  symbol: string;
  /** 交易日期（YYYY-MM-DD，升序） */
  dates: string[];
  /** 开盘价（元） */
  opens: number[];
  /** 最高价（元） */
  highs: number[];
  /** 最低价（元） */
  lows: number[];
  /** 收盘价（元） */
  prices: number[];
  /** 成交量（股；东财返回单位为「手」，已 ×100 换算为股） */
  volumes: number[];
  /** 成交额（元） */
  amounts: number[];
}

const FETCH_TIMEOUT_MS = 8000;
/** days 默认值与上限（契约：默认 250，上限 800） */
export const DEFAULT_KLINE_DAYS = 250;
export const MAX_KLINE_DAYS = 800;

/** 带超时的 JSON 抓取（复用 blockTradesDataService 风格） */
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

/**
 * 将多种符号格式归一化为东财 secid。
 * - 支持 600519 / 600519.SH / SH600519 / sz000001 等；
 * - 6 开头 → 上交所 secid `1.`；0/2/3 开头 → 深交所 secid `0.`。
 */
export function normalizeSecid(symbol: string): { digits: string; secid: string } | null {
  const trimmed = (symbol || '').trim().toUpperCase();
  if (!trimmed) return null;
  const digits = trimmed.replace(/^(SH|SZ|BJ)/, '').replace(/\.(SH|SZ|BJ)$/, '');
  if (!/^\d{6}$/.test(digits)) return null;
  const isSh =
    trimmed.startsWith('SH') || trimmed.endsWith('.SH') || digits.startsWith('6');
  return { digits, secid: `${isSh ? '1' : '0'}.${digits}` };
}

/** 构造东方财富历史 K 线真实接口 URL（日线、前复权） */
function buildKlineUrl(secid: string, days: number): string {
  return (
    `https://push2his.eastmoney.com/api/qt/stock/kline/get` +
    `?secid=${encodeURIComponent(secid)}` +
    `&fields1=f1,f2,f3,f4,f5,f6` +
    `&fields2=f51,f52,f53,f54,f55,f56,f57` +
    `&klt=101&fqt=1&beg=0&end=20500101&lmt=${days}`
  );
}

/** 解析单行 kline（逗号分隔：date,open,close,high,low,volume(手),amount） */
function parseKlineRow(row: string): {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
} {
  const parts = row.split(',');
  if (parts.length < 7) throw new KlineUnavailableError('K线源返回行格式异常');
  const [date, open, close, high, low, volume, amount] = parts;
  return {
    date: date.trim(),
    open: Number(open),
    close: Number(close),
    high: Number(high),
    low: Number(low),
    // 东财成交量单位为「手」，×100 换算为股
    volume: Number(volume) * 100,
    amount: Number(amount),
  };
}

/**
 * 腾讯行情 K 线兜底源（web.ifzq.gtimg.cn，免 key，JSON/UTF-8）
 *
 * 背景：东财 push2his 在本机/生产均存在间歇性不可达（HTTP 000/超时），
 * 2026-10-28 起为 getKline 增加第二真实源。实测样例：
 *   GET https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sz399006,day,,,5,qfq
 *   → { code:0, data:{ sz399006:{ day:[[date,open,close,high,low,volume],...], qt:{...} } } }
 * 注意：
 *   - 行字段顺序是 **O-C-H-L**（开、收、高、低），与东财的 O-C-H-L 一致但与常见习惯不同，别按 H-L 对调；
 *   - 个股（qfq 参数）返回键名为 `qfqday`，指数为 `day`，两者结构相同；
 *   - 腾讯不提供逐日成交额 → 兜底路径 amounts 置空数组（诚实缺省，不伪造 0 值冒充成交额）；
 *   - 无效代码返回 code:0 但 day:[] → 视为不可用。
 */

/** 归一化出腾讯行情符号（sh000001 / sz399006 / sh600519），与 normalizeSecid 的沪深判定完全一致 */
function tencentSymbolOf(norm: { digits: string; secid: string }): string {
  const isSh = norm.secid.startsWith('1.');
  return `${isSh ? 'sh' : 'sz'}${norm.digits}`;
}

/** 腾讯 fqkline 响应行：[date, open, close, high, low, volume(手), ...]（O-C-H-L） */
function parseTencentRow(row: unknown[]): {
  date: string; open: number; close: number; high: number; low: number; volume: number;
} {
  const [date, open, close, high, low, volume] = row as string[];
  const num = (v: unknown) => {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new KlineUnavailableError('腾讯K线源返回行含非数值字段');
    return n;
  };
  return {
    date: String(date).trim(),
    open: num(open),
    close: num(close),
    high: num(high),
    low: num(low),
    // 腾讯成交量单位为「手」，与东财一致，×100 换算为股
    volume: num(volume) * 100,
  };
}

async function fetchTencentKline(
  tencentSymbol: string,
  days: number,
): Promise<KlineData> {
  const url =
    `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get` +
    `?param=${encodeURIComponent(`${tencentSymbol},day,,,${days},qfq`)}`;
  const json = await fetchJson(url, { 'User-Agent': 'Mozilla/5.0' });
  const node = json?.data?.[tencentSymbol];
  // 个股（qfq 参数）键名 qfqday，指数键名 day，结构相同
  const rowsRaw: any = node?.qfqday ?? node?.day;
  if (!Array.isArray(rowsRaw) || rowsRaw.length === 0) {
    throw new KlineUnavailableError('腾讯K线源返回空数据');
  }
  const rows = rowsRaw
    .filter((r: unknown): r is unknown[] => Array.isArray(r) && r.length >= 6)
    .map(parseTencentRow)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (rows.length === 0) {
    throw new KlineUnavailableError('腾讯K线源返回无可解析数据');
  }
  return {
    symbol: tencentSymbol.replace(/^(sh|sz)/, ''),
    dates: rows.map((r) => r.date),
    opens: rows.map((r) => r.open),
    highs: rows.map((r) => r.high),
    lows: rows.map((r) => r.low),
    prices: rows.map((r) => r.close),
    volumes: rows.map((r) => r.volume),
    // 诚实缺省：腾讯源无逐日成交额，置空数组而非伪造 0 值（消费方需按空值处理）
    amounts: [],
  };
}

/**
 * 获取真实历史日线 K 线（前复权）。
 * 数据源：东方财富 push2his 优先，失败（网络/结构异常/空数据）时兜底腾讯 fqkline。
 * @param symbol 个股/指数代码（600519 / 600519.SH / SH600519 / sz399006 等）
 * @param days 返回的交易日数量（默认 250，上限 800，超出截断）
 * 两源均失败 / 结构异常 / 参数非法 → 抛 KlineUnavailableError。
 */
export async function getKline(symbol: string, days: number = DEFAULT_KLINE_DAYS): Promise<KlineData> {
  const norm = normalizeSecid(symbol);
  if (!norm) throw new KlineUnavailableError(`无效的股票代码: ${symbol}`);

  const effectiveDays = Number.isFinite(days) && days > 0
    ? Math.min(Math.floor(days), MAX_KLINE_DAYS)
    : DEFAULT_KLINE_DAYS;

  const url = buildKlineUrl(norm.secid, effectiveDays);
  let emError: unknown;
  try {
    const json = await fetchJson(url, {
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://quote.eastmoney.com',
    });

    // 诚实判定：data 或 klines 缺失 / 非数组一律视为不可用
    const klines: any = json?.data?.klines;
    if (!Array.isArray(klines)) {
      throw new KlineUnavailableError('K线源返回结构异常（data.klines 缺失）');
    }
    if (klines.length === 0) {
      // 真实源确无 K 线（如无效标的）→ 视为不可用，路由层诚实空
      throw new KlineUnavailableError('K线源返回空数据');
    }

    const rows = klines
      .filter((r): r is string => typeof r === 'string')
      .map(parseKlineRow)
      .sort((a, b) => a.date.localeCompare(b.date)); // 升序

    if (rows.length === 0) {
      throw new KlineUnavailableError('K线源返回无可解析数据');
    }

    return {
      symbol: norm.digits,
      dates: rows.map((r) => r.date),
      opens: rows.map((r) => r.open),
      highs: rows.map((r) => r.high),
      lows: rows.map((r) => r.low),
      prices: rows.map((r) => r.close),
      volumes: rows.map((r) => r.volume),
      amounts: rows.map((r) => r.amount),
    };
  } catch (e) {
    if (e instanceof KlineUnavailableError) {
      emError = e;
    } else {
      emError = new KlineUnavailableError(e instanceof Error ? e.message : 'K线源不可用');
    }
  }
  // 东财失败 → 腾讯兜底（同为真实源；两源都失败才诚实降级）
  try {
    return await fetchTencentKline(tencentSymbolOf(norm), effectiveDays);
  } catch (tx) {
    const emMsg = emError instanceof Error ? emError.message : String(emError);
    const txMsg = tx instanceof Error ? tx.message : String(tx);
    throw new KlineUnavailableError(`K线真实源均不可用（东财: ${emMsg}；腾讯: ${txMsg}）`);
  }
}
