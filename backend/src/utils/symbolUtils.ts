/**
 * 股票代码标准化工具
 * 统一处理 000001 / 000001.SZ / sz.000001 等格式
 */

/** 标准化股票代码为 CODE.SH/SZ/BJ 格式 */
export function normalizeSymbol(symbol: string): string {
  if (!symbol) return symbol;
  // 已经是标准格式
  if (/^\d{6}\.(SH|SZ|BJ)$/i.test(symbol)) return symbol.toUpperCase();
  // sh.600519 → 600519.SH
  const match = symbol.match(/^(sh|sz|bj)\.?(\d{6})$/i);
  if (match) {
    return `${match[2]}.${match[1].toUpperCase()}`;
  }
  // 纯6位数字 → 根据规则推断交易所
  if (/^\d{6}$/.test(symbol)) {
    if (symbol.startsWith('6')) return `${symbol}.SH`;
    if (symbol.startsWith('0') || symbol.startsWith('3')) return `${symbol}.SZ`;
    if (symbol.startsWith('8') || symbol.startsWith('4')) return `${symbol}.BJ`;
    return `${symbol}.SZ`;
  }
  return symbol;
}

/**
 * 归一为裸 6 位代码（东财 fundCode / secid / 内存库清单均基于裸码）
 * 例：600519.SH → 600519；sh.600519 → 600519；600519 → 600519；非法输入原样返回。
 */
export function toBareCode(symbol: string): string {
  return (symbol || '').trim().toUpperCase().replace(/^(SH|SZ|BJ)\.?/, '').replace(/\.(SH|SZ|BJ)$/, '');
}

/**
 * 列出「某个用户输入 symbol 在库里可能对应的全部写法」，按**优先级**排列。
 *
 * 存在的理由：库里 symbol 的写法并不唯一，且两种数据源方向相反 ——
 *   - PostgreSQL `stocks.symbol` 全量带后缀（5544/5544，如 `600519.SH`）
 *   - 内存库清单 `clair-worker/all_stocks_compact.json` 全量裸码（5541/5541，如 `600519`）
 * 因此**任何**按 symbol 查库的地方都必须同时接受裸码、带后缀与 `sh.600519`。
 *
 * 顺序即优先级：规范化形式（`CODE.SH`）优先，其次用户原样输入，最后裸码兜底。
 * 去重后由调用方一次 `whereIn` 命中，避免逐个回退查询。
 *
 * 本函数**不新建任何规范化规则**，只复用本文件既有的 normalizeSymbol / toBareCode。
 */
export function symbolCandidates(symbol: string): string[] {
  const raw = (symbol ?? '').trim();
  if (!raw) return [];
  const candidates = [normalizeSymbol(raw), raw, toBareCode(raw)];
  return candidates.filter((s, i) => s && candidates.indexOf(s) === i);
}

/**
 * 从数据库查找股票，自动尝试标准化和原始格式
 * 适用于所有需要按symbol查找的API端点
 */
export async function findStock(db: any, rawSymbol: string) {
  const normalized = normalizeSymbol(rawSymbol);
  let stock = await db.getStockBySymbol(normalized);
  if (!stock && normalized !== rawSymbol) {
    stock = await db.getStockBySymbol(rawSymbol);
  }
  return stock;
}
