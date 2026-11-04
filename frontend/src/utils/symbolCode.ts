/**
 * 前端请求符号归一（market-qualified symbol）
 *
 * 背景（2026-11-04 线上巡检实测）：
 *   Worker 的 GET /api/market/kline 用 toTencentKey(rawSymbol) 解析，裸 6 位码一律 400 ——
 *   000001 既是上证指数又是平安银行，Worker 明确「拒绝猜测」并返回可读错误。
 *   而调用方本身知道标的是指数还是股票（路由参数 / 股票池常量），因此由前端补全市场前缀，
 *   不把猜测塞给 Worker，也不放宽 Worker 的校验。
 *
 * 输出统一为小写前缀形式 sh600519 / sz000001 / bj920047（Worker 接受的写法之一）；
 * 已带前缀或后缀（600519.SH、sh.600519、SH600519）先归一，不重复加。
 * 无法识别的输入原样返回，交给 Worker 拒绝 —— 前端不编造市场。
 */

export type Market = 'sh' | 'sz' | 'bj';

const PREFIX_RE = /^(sh|sz|bj)(\d{6})$/i;      // sh600519
const SUFFIX_RE = /^(\d{6})\.(sh|sz|bj)$/i;    // 600519.SH
const DOTTED_RE = /^(sh|sz|bj)\.(\d{6})$/i;    // sh.600519

/** 解析已有的市场限定写法；不是限定写法时返回 null */
export function qualifiedMarket(input: string): { market: Market; code: string } | null {
  const s = (input || '').trim();
  const p = s.match(PREFIX_RE);
  if (p) return { market: p[1].toLowerCase() as Market, code: p[2] };
  const q = s.match(SUFFIX_RE);
  if (q) return { market: q[2].toLowerCase() as Market, code: q[1] };
  const r = s.match(DOTTED_RE);
  if (r) return { market: r[1].toLowerCase() as Market, code: r[2] };
  return null;
}

const fmt = (market: Market, code: string): string => market + code;

/**
 * 股票域市场推断（与 backend/src/utils/symbolUtils.ts:6 normalizeSymbol 同口径）：
 *   6/9 开头 → sh（9 开头为沪市 B 股 900xxx）；0/3 开头 → sz；43/83/87/88/92 开头 → bj（北交所新段 920xxx）。
 * 其它（如 200xxx 深 B）不在 A 股主线内，返回 null 表示「不猜」。
 */
function stockMarket(code: string): Market | null {
  if (/^(43|83|87|88|92)/.test(code)) return 'bj';
  if (code.startsWith('6') || code.startsWith('9')) return 'sh';
  if (code.startsWith('0') || code.startsWith('3')) return 'sz';
  return null;
}

/**
 * 股票请求符号：'600519' → 'sh600519'；'000001' → 'sz000001'（平安银行）。
 * 已在限定写法内原样归一返回；无法识别原样返回。
 */
export function toStockSymbol(input: string): string {
  const q = qualifiedMarket(input);
  if (q) return fmt(q.market, q.code);
  const s = (input || '').trim();
  if (!/^\d{6}$/.test(s)) return s;
  const m = stockMarket(s);
  return m ? fmt(m, s) : s;
}

/**
 * 指数请求符号：'000001' → 'sh000001'（上证指数）；'399006' → 'sz399006'；'899050' → 'bj899050'。
 * 与 toStockSymbol 的差别只在裸码歧义段：000001 在股票域是 sz、指数域是 sh —— 这正是 Worker 拒绝裸码的原因。
 */
export function toIndexSymbol(input: string): string {
  const q = qualifiedMarket(input);
  if (q) return fmt(q.market, q.code);
  const s = (input || '').trim();
  if (!/^\d{6}$/.test(s)) return s;
  if (s.startsWith('000')) return fmt('sh', s);
  if (s.startsWith('399')) return fmt('sz', s);
  if (s.startsWith('899')) return fmt('bj', s);
  const m = stockMarket(s);
  return m ? fmt(m, s) : s;
}
