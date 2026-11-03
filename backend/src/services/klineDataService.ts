/**
 * 历史日线 K 线数据服务（真实源版）
 *
 * 数据来源（东方财富历史 K 线接口，免 key）：
 *   https://push2his.eastmoney.com/api/qt/stock/kline/get
 *     ?secid={1|0}.{digits}
 *     &fields1=f1,f2,f3,f4,f5,f6
 *     &fields2=f51,f52,f53,f54,f55,f56,f57
 *     &klt=101&fqt=0&beg=0&end=20500101&lmt={days}
 *   - klt=101 日线；fqt=0 **不复权**（fqt=1 前复权 / fqt=2 后复权）
 *   - 返回 data.klines: string[]，每行逗号分隔：
 *     f51=date, f52=open, f53=close, f54=high, f55=low, f56=volume(手), f57=amount(元)
 *
 * ★ 两条腿必须同口径：主源 fqt=0 与兜底腿 bfq 均为**不复权**，理由见下方「口径红线」。
 *   本机 `push2his.eastmoney.com` 自 2026-10 起不可达，fqt=0 无法在线复核；
 *   该参数为东财公开文档定义值，属确定性改动，不依赖网络验证。
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
  /** 成交量（**手**；东财/腾讯返回单位即为手，与 PG daily_quotes.volume、/api/stocks 一致，不换算） */
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

/** 构造东方财富历史 K 线真实接口 URL（日线、**不复权** fqt=0，与库内口径一致） */
function buildKlineUrl(secid: string, days: number): string {
  return (
    `https://push2his.eastmoney.com/api/qt/stock/kline/get` +
    `?secid=${encodeURIComponent(secid)}` +
    `&fields1=f1,f2,f3,f4,f5,f6` +
    `&fields2=f51,f52,f53,f54,f55,f56,f57` +
    `&klt=101&fqt=0&beg=0&end=20500101&lmt=${days}`
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
    // 成交量单位：手（与 PG daily_quotes.volume、/api/stocks latestQuote.volume 一致）。
    // 此前 ×100 换算为「股」，导致同一后端同一标的两端点量能差 100 倍（P0 缺陷 3）。
    volume: Number(volume),
    amount: Number(amount),
  };
}

/**
 * 腾讯行情 K 线兜底源（web.ifzq.gtimg.cn，免 key，JSON/UTF-8）
 *
 * 背景：东财 push2his 在本机/生产均不可达（curl exit 52 / fetch failed），
 * 2026-10-28 起为 getKline 增加第二真实源。实测样例（2026-11-03）：
 *   GET https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh000001,day,,,120,bfq
 *   → { code:0, data:{ sh000001:{ day:[[date,open,close,high,low,volume],...], qt:{...} } } }
 * 注意：
 *   - 行字段顺序是 **O-C-H-L**（开、收、高、低），与东财的 O-C-H-L 一致但与常见习惯不同，别按 H-L 对调；
 *   - 复权参数决定返回键名：`bfq`/`hfq`/省略第 6 段 → 键名 `day`；`qfq` → 键名 `qfqday`；
 *   - 第 6 段**整个省略**（`param=sh000001,day,,,5`）会被上游判为 bad params 返回 code:1，
 *     所以不复权必须显式写 `bfq`，不能留空；
 *   - 腾讯不提供逐日成交额 → 兜底路径 amounts 置空数组（诚实缺省，不伪造 0 值冒充成交额）；
 *   - 无效代码返回 code:0 但 day:[] → 视为不可用。
 *
 * ★★ 口径红线（勿「优化」成 qfq）★★
 *   本库 `daily_quotes` 存的是**不复权**价（2026-11-03 抽样 10 只、对比腾讯 bfq 序列实测：
 *   600028.SH / 000651.SZ / 601088.SH / 600036.SH / 000333.SZ / 601318.SH / 600900.SH
 *   全窗口逐日比值恒为 1.0000）。因此本兜底腿必须取**不复权**，与库内、与
 *   `/api/stocks` 的量价口径保持同一套数。
 *   反例（改前用 qfq 的实测后果）：601398.SH 2026-05-11 不复权 7.470，前复权返回 7.15，
 *   偏差 4.3%，且在每次除权日处整段跳变 —— 等于制造「两套数」。
 *   注：库内仍有少量历史行是旧批次写入的**前复权**（如 601398.SH 2025 全年），
 *   那是库内数据质量问题，由回填工单处理；端点侧不得为此跟着改用 qfq。
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
    // 成交量单位：手（腾讯 fqkline 与东财同为「手」，与 PG /api/stocks 口径一致，不换算）
    volume: num(volume),
  };
}

async function fetchTencentKline(
  tencentSymbol: string,
  days: number,
): Promise<KlineData> {
  // 显式 bfq（不复权）：理由见文件头「口径红线」。留空第 6 段会被上游判 bad params。
  const url =
    `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get` +
    `?param=${encodeURIComponent(`${tencentSymbol},day,,,${days},bfq`)}`;
  const json = await fetchJson(url, { 'User-Agent': 'Mozilla/5.0' });
  // 上游错误码：code!==0（典型 code:1 "bad params"）→ 不可用，附原文便于定位
  if (json?.code !== 0) {
    throw new KlineUnavailableError(
      `腾讯K线源返回错误码 ${json?.code ?? 'unknown'}（${String(json?.msg ?? '').trim() || '无 msg'}）`,
    );
  }
  const node = json?.data?.[tencentSymbol];
  // bfq 走 `day`；兼容万一上游回落到 qfqday 的形态（结构相同）
  const rowsRaw: any = node?.day ?? node?.qfqday;
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
 * 获取真实历史日线 K 线（**不复权**，与库内 daily_quotes 同口径；理由见文件头口径红线）。
 * 数据源：东方财富 push2his（fqt=0）优先，失败（网络/结构异常/空数据）时兜底腾讯 fqkline（bfq）。
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
