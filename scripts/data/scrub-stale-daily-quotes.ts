/**
 * P0-STALEPX · 清洗 daily_quotes 里「退市/长期停牌标的的陈旧价被盖到当前日期」的伪数据行
 *
 * ## 判据（已全量证伪，476 只标的 / 21558 行，零反例）
 *   open_price = 0 AND volume = 0
 *
 * 两条判据在本库内**完全共线**（open=0 ⟺ volume=0，21558 ↔ 21558，无混合情况），
 * 因此单用任一条都能命中全量；但仍保留组合条件，因为这才是语义上正确的表述：
 * 「当日无任何成交（volume=0）且连开盘价都不存在（open=0）」。
 *
 * ## 为什么这不是复权（qfq）问题
 * 库内 close 是**不复权**口径（fix-qfq-caliber）。抽样中少数行的 close 与上游
 * *前复权* 序列吻合（如 001331: 48.08 ≈ qfq 48.083），那是历史遗留的复权口径产物，
 * 与本工单的判据无关 —— 判据只看 open/volume 两个字段。
 *
 * ## 根因
 * backend/src/data-sync/DataSyncService.ts 的实时快照路径（parseTencentResponse）
 * 对退市/停牌标的仍会返回一行数据，且 `parts[30]` 给出的是**当天**的 session 时间戳，
 * 于是 P0-SMEARED 的「交易日守卫」放行，把陈旧价写成了当天行情：
 *   parts[3]=陈旧收盘价  parts[5]=0(开盘价)  parts[6]=0(成交量)
 * 正确做法是：当日无成交就不写这一行（缺行=数据缺失，是诚实的）。
 *
 * ## 用法
 *   node scripts/data/scrub-stale-daily-quotes.ts            # 干跑（默认，只报告）
 *   node scripts/data/scrub-stale-daily-quotes.ts --apply    # 真删
 *
 * 绝不按价格值删：只按 open_price=0 AND volume=0 的结构条件删。
 */
import { execFileSync } from 'node:child_process';

/**
 * 🔒 主理人裁决保护的「载体日」—— **本脚本一律不碰**。
 *
 * 为什么不因为「它们也是伪行」就顺带删掉：载体日的保护理由与本工单**无关**。
 * 载体日受保护是因为「其载荷对应的真实交易日在库中残缺，载体日是那几天行情的
 * 唯一完整记录」（完整语义见 scripts/data/protected-dates.ts）。
 * 哪怕这些行同时命中本工单的判据，删除载体日数据仍是**另一个裁决**的事，
 * 不该由一个陈旧价清洗工单顺手带走。需要处理请由主理人单独裁决。
 *
 * ⚠️ 名单的**唯一真源**在 `scripts/data/protected-dates.ts`，本文件只做 import。
 * 历史上本文件与 `scrub-smeared-daily-quotes.ts` 各抄了一份 `PROTECTED_DATES`，
 * 于是「改一处必须记得同步另一处」——该漏洞已真实发生过一次（`05-30`/`06-06`
 * 移出时本文件漏改，后由 commit `0bbb6fb7a` 补上）。
 * ⟹ 现改为单一真源：改一处必然同时改两个脚本，无需再靠同步纪律。
 */
import {
  PROTECTED_DATES,
  CARRIER_DAY_LEDGER,
  assertLedgerConsistency,
} from './protected-dates.ts';

const PSQL = process.env.PSQL_BIN || '/opt/homebrew/opt/postgresql@15/bin/psql';
const DB = process.env.SOURCE_DB || 'clair';
const APPLY = process.argv.includes('--apply');

/** 唯一允许的删除条件 —— 结构条件，不含任何价格值 */
const SCRUB_CONDITION = 'open_price = 0 AND volume = 0';

/** 实际删除条件 = 判据 AND 不在载体日上 */
const DELETE_CONDITION = `(${SCRUB_CONDITION}) AND trade_date NOT IN (${PROTECTED_DATES.map(
  (d) => `'${d}'`,
).join(',')})`;

function psql(sql: string, flags: string[] = ['-tAF', '|']): string {
  return execFileSync(PSQL, ['-d', DB, ...flags, '-c', sql], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  }).trim();
}

function num(sql: string): number {
  return Number(psql(sql));
}

const label = APPLY ? 'APPLY（真删）' : 'DRY-RUN（干跑，不改数据）';
console.log(`═══ P0-STALEPX 清洗 · ${label} ═══\n`);

// ── 台账自校验：名单与台账不一致 ⟹ 立刻停，不带着矛盾继续跑 ──
// 存在理由：名单与台账是同一语义的两个投影，两者若不一致，说明有人只改了一处
// —— 这正是单一真源要消灭的那类「靠记得」的漏洞。把它变成会阻断的检查。
// 分级：errors（可能删错数据 ⟹ 必须停）/ warnings（该清理了 ⟹ 提示但不拦）。
const { errors: ledgerErrors, warnings: ledgerWarnings } = assertLedgerConsistency();
if (ledgerErrors.length > 0) {
  console.error('✗ 白名单台账自校验失败，已中止（不执行任何删除）：\n');
  for (const p of ledgerErrors) console.error(`   • ${p}`);
  console.error(
    '\n   请修 scripts/data/protected-dates.ts（唯一真源，两处脚本共用，无需改两处）。',
  );
  process.exit(2);
}
if (ledgerWarnings.length > 0) {
  console.log('ℹ️ 白名单台账提示（不影响本次执行）：');
  for (const w of ledgerWarnings) console.log(`   • ${w}`);
  console.log('');
}

const before = {
  total: num('SELECT count(*) FROM daily_quotes;'),
  bad: num(`SELECT count(*) FROM daily_quotes WHERE ${SCRUB_CONDITION};`),
  badOnProtected: num(
    `SELECT count(*) FROM daily_quotes WHERE ${SCRUB_CONDITION} AND trade_date IN (${PROTECTED_DATES.map(
      (d) => `'${d}'`,
    ).join(',')});`,
  ),
  clean: num(`SELECT count(*) FROM daily_quotes WHERE NOT (${SCRUB_CONDITION});`),
  symbols: num(`SELECT count(DISTINCT stock_id) FROM daily_quotes WHERE ${SCRUB_CONDITION};`),
  days: num(`SELECT count(DISTINCT trade_date) FROM daily_quotes WHERE ${SCRUB_CONDITION};`),
};
const daysSpan = psql(
  `SELECT min(trade_date)::text || ' ~ ' || max(trade_date)::text FROM daily_quotes WHERE ${SCRUB_CONDITION};`,
);
const toDelete = num(`SELECT count(*) FROM daily_quotes WHERE ${DELETE_CONDITION};`);

console.log('清洗前：');
console.log(`  daily_quotes 总行数 : ${before.total}`);
console.log(`  命中判据行数        : ${before.bad}  (${before.symbols} 只标的 / ${before.days} 个交易日)`);
console.log(`  覆盖日期区间        : ${daysSpan}`);
console.log(`  非命中行数          : ${before.clean}`);
console.log(`  🔒 载体日上的命中行 : ${before.badOnProtected}（受裁决保护，本次不删）`);
console.log(`  → 本次将删除        : ${toDelete}`);

/**
 * 载体日台账 —— 打印在操作现场。
 *
 * 存在理由：白名单一旦被清空（当前三个日期已退役，库内 0 行），
 * 下一个维护者会误以为「载体日从来不存在过」，从而"顺手清理"或误判数据完整性。
 * 护栏必须出现在操作现场，而不是只存在于某个 commit 的说明里。
 */
console.log('\n🔒 载体日台账（scripts/data/protected-dates.ts · 唯一真源）:');
console.log('日期          载荷真为     状态     行数     归档表 / 覆盖证据');
console.log('─'.repeat(96));
for (const e of [...CARRIER_DAY_LEDGER].sort((a, b) => a.date.localeCompare(b.date))) {
  const evidence =
    e.status === 'retired'
      ? `${e.archiveTable} · 覆盖 ${e.coverage}`
      : `真身 ${e.realDay} 未补齐 ⟹ 受保护`;
  console.log(
    `${e.date}  ${e.realDay}    ${e.status.padEnd(8)}  ${String(e.deletedRows ?? '—').padStart(6)}   ${evidence}`,
  );
}
console.log(
  `当前受保护日期：${PROTECTED_DATES.length > 0 ? PROTECTED_DATES.join(', ') : '（无）'}` +
    `（硬约束：任何分支都不得删；--force-unique 也删不到）`,
);

// 真实数据指纹：清洗后必须一模一样
const fingerprint = () =>
  psql(`
    SELECT md5(string_agg(t.row_hash, '' ORDER BY t.row_hash)) || ' / ' || count(*)
    FROM (
      SELECT md5(concat_ws('|',id,stock_id,trade_date,open_price,close_price,high_price,
             low_price,volume,turnover,change_amount,change_percent,amplitude,
             turnover_rate,coalesce(market_cap::text,''),created_at,
             coalesce(pe_ratio::text,''),coalesce(pb_ratio::text,''))) AS row_hash
      FROM daily_quotes WHERE NOT (${SCRUB_CONDITION})
    ) t;
  `);

const fpBefore = fingerprint();
console.log(`  真实数据指纹        : ${fpBefore}`);

if (!APPLY) {
  const perDay = psql(`
    SELECT trade_date::text || ' → ' || count(*) || ' 行'
    FROM daily_quotes WHERE ${DELETE_CONDITION}
    GROUP BY trade_date ORDER BY trade_date DESC LIMIT 5;
  `);
  console.log(`\n最近几个交易日命中（已排除载体日）：\n  ${perDay.split('\n').join('\n  ')}`);
  console.log('\n干跑结束，未改动任何数据。加 --apply 执行删除。');
  process.exit(0);
}

// ── 真删：单事务，条件即上方 DELETE_CONDITION ──
console.log('\n执行删除（单事务）…');
const deleted = psql(
  `WITH d AS (DELETE FROM daily_quotes WHERE ${DELETE_CONDITION} RETURNING 1)
   SELECT count(*) FROM d;`,
);
console.log(`  已删除 ${deleted} 行`);

const after = {
  total: num('SELECT count(*) FROM daily_quotes;'),
  bad: num(`SELECT count(*) FROM daily_quotes WHERE ${SCRUB_CONDITION};`),
  badOnProtected: num(
    `SELECT count(*) FROM daily_quotes WHERE ${SCRUB_CONDITION} AND trade_date IN (${PROTECTED_DATES.map(
      (d) => `'${d}'`,
    ).join(',')});`,
  ),
  clean: num(`SELECT count(*) FROM daily_quotes WHERE NOT (${SCRUB_CONDITION});`),
};
const fpAfter = fingerprint();

console.log('\n清洗后：');
console.log(`  daily_quotes 总行数 : ${after.total}`);
console.log(`  残留命中判据行数    : ${after.bad}（应全部为载体日受保护行）`);
console.log(`  其中载体日受保护行  : ${after.badOnProtected}`);
console.log(`  非命中行数          : ${after.clean}`);
console.log(`  真实数据指纹        : ${fpAfter}`);

const ok =
  after.bad === after.badOnProtected &&
  after.clean === before.clean &&
  after.total === before.total - deleted &&
  fpAfter === fpBefore;

console.log('');
if (!ok) {
  console.error('❌ 校验失败 —— 真实数据可能受损，请用备份恢复：');
  console.error('   /tmp/p0stalepx/clair-dump-before-stalepx.sql');
  process.exit(1);
}
console.log('✅ 校验通过：非载体日的伪行已清除，真实数据指纹逐行一致（非命中行数与内容完全未变）');
console.log(`   备份：/tmp/p0stalepx/clair-dump-before-stalepx.sql`);
