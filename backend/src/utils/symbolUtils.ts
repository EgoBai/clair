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
