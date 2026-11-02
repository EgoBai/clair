/**
 * 指数标的判定（单一真源）
 *
 * 为什么必须存在：`stocks` 表里混有 5 条**指数**行（上证指数 / 沪深300 / 中证500 /
 * 深证成指 / 创业板指）。指数的「成交额」本身就是其成份股合计，一旦被当成个股
 * 计入全市场聚合，等于把同一个市场算了两遍 —— 2026-11-01 与 2026-11-02 各实测到
 * 一次（成交额虚高 3 倍 / 2.8 倍）。
 *
 * 为什么不能只按 `industry='指数'`：这 5 条里有 2 条 `industry` 为 NULL
 * （`000001.SH` 上证指数、`000905.SH` 中证500），只按行业标签会漏掉它们。
 * 代码段才是稳定属性：
 *   - 上交所：`000xxx.SH`（000001 上证指数、000300 沪深300、000905 中证500、
 *     000016 上证50、000688 科创50、000852 中证1000 …）
 *   - 深交所：`399xxx.SZ`（399001 深证成指、399006 创业板指 …）
 *   - 北交所：`899050` 北证50
 * 相应地，真实个股 `000001.SZ`（平安银行）后缀为 `.SZ`，不会被误伤。
 */
export function isIndexSymbol(symbol: string | null | undefined): boolean {
  const upper = String(symbol ?? '').toUpperCase().trim();
  if (!upper) return false;

  const suffix = (upper.match(/\.(SH|SZ|BJ)$/) || [])[1];
  const bare = upper
    .replace(/^(SH|SZ|BJ)\.?/, '')
    .replace(/\.(SH|SZ|BJ)$/, '');

  if (!/^\d{6}$/.test(bare)) return false;
  if (suffix === 'SH') return /^000\d{3}$/.test(bare);
  if (suffix === 'SZ') return /^399\d{3}$/.test(bare);
  if (suffix === 'BJ') return bare === '899050';
  return false;
}

/** 指数行在 SQL 层的等价过滤条件（供需要下推到数据库的聚合使用） */
export const INDEX_SYMBOL_SQL_PATTERNS = ['000%.SH', '399%.SZ'] as const;
