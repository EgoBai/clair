#!/usr/bin/env node
/**
 * P0-IDX300-SUFFIX：修正沪深300 在 stocks 表的交易所后缀错位
 *
 * ## 缺陷（2026-10-22 实测）
 * stocks 表存 `000300.SZ`（market=SZ, industry=指数），但沪深300 是**上交所**
 * 指数，上游代码 `sh000300`，而 src 侧三处权威一致用 `000300.SH`：
 *   - backend/src/models/MarketIndex.ts:90
 *   - backend/src/api/stock.ts:362
 *   - backend/src/services/engineOrchestrator.ts:119（analyzeRegime('000300.SH')）
 *
 * 查库链路：analyzeRegime('000300.SH')
 *   → getPriceReturns('000300.SH')
 *   → db.getStockBySymbol('000300.SH')
 *   → symbolCandidates() 生成 ['000300.SH','000300']，**匹配不到库里的 '000300.SZ'**
 *   → 返回 null → getMarketRegime() 返回 null
 *
 * 实测后果：GET /api/ai/daily-briefing 的 marketRegime 恒为 null
 * （市场状态 HMM 识别完全失效），而响应顶层仍标 dataSource:'real'（半诚实）。
 *
 * ## 为什么不改 symbolCandidates 做后缀互换
 * 指数与个股**共用数字代码**：`sh000001`(上证指数) 与 `sz000001`(平安银行)
 * 的裸码都是 000001。若让候选包含互换后缀，就会把指数点位写进个股行
 * ——这正是 P0-IDXBLEED 的教训。后缀只能在数据层修，不能在匹配层猜。
 *
 * ## 为什么只有 000300 需要修
 * 全仓 grep 确认生产代码**零引用** `000300.SZ`；
 * 而 `399001.SZ`(深证成指) / `399006.SZ`(创业板指) 的 .SZ 是**正确的**
 * （深交所指数），被 MarketIndexPanel.tsx、stock.ts、MarketIndex.ts 广泛引用。
 *
 * ## 影响面
 * daily_quotes 通过 stock_id 关联，改 symbol 不影响任何行情行。
 * 修复后 stock_id=329 的 113 行行情完整保留。
 *
 * ## 回滚
 * 改前备份：/tmp/clair-backups/stocks-000300-before-20261022.psv
 *   内容形如 `329|000300.SZ|沪深300|SZ|指数|true`
 * 回滚 SQL：
 *   UPDATE stocks SET symbol='000300.SZ', market='SZ' WHERE id=329;
 */

const { execFileSync } = require('node:child_process');

const PSQL = process.env.PSQL_BIN || '/opt/homebrew/opt/postgresql@15/bin/psql';
const DB = process.env.DB_NAME || 'clair';
const DRY_RUN = process.argv.includes('--dry-run');

/** 执行 SQL 并返回 stdout；失败直接抛（带 stderr） */
function sql(q) {
  return execFileSync(PSQL, ['-h', '/tmp', '-d', DB, '-t', '-A', '-F', '|', '-c', q], {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  });
}

(async () => {
  const before = sql(
    "SELECT id||'|'||symbol||'|'||name||'|'||market||'|'||industry||'|'||is_active FROM stocks WHERE symbol IN ('000300.SZ','000300.SH') ORDER BY symbol"
  ).trim();
  console.log('改前 stocks 行:', before || '(无)');

  const quoteCount = sql('SELECT count(*) FROM daily_quotes WHERE stock_id = 329').trim();
  console.log(`stock_id=329 关联行情行数: ${quoteCount}`);

  if (!before) {
    console.log('未找到 000300 标的，无需修复');
    return;
  }
  if (before.includes('000300.SH')) {
    console.log('已是 000300.SH，无需修复（幂等）');
    return;
  }

  if (DRY_RUN) {
    console.log('[DRY RUN] 将执行: UPDATE stocks SET symbol=\'000300.SH\', market=\'SH\' WHERE symbol=\'000300.SZ\'');
    return;
  }

  const res = sql("UPDATE stocks SET symbol='000300.SH', market='SH' WHERE symbol='000300.SZ'");
  console.log(`UPDATE 结果: ${res.trim()}`);

  const after = sql("SELECT id||'|'||symbol||'|'||name||'|'||market||'|'||industry FROM stocks WHERE id=329").trim();
  console.log('改后 stocks 行:', after);

  const afterQuotes = sql('SELECT count(*) FROM daily_quotes WHERE stock_id = 329').trim();
  console.log(`改后 stock_id=329 关联行情行数: ${afterQuotes}`);

  if (afterQuotes !== quoteCount) {
    throw new Error('行情行数发生变化！数据可能丢失，请立即回滚');
  }
  console.log('✓ 行情行数不变，修复安全');
})().catch((e) => {
  console.error('执行失败:', e.message);
  process.exit(1);
});
