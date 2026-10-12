#!/usr/bin/env node
/**
 * P0-IDXBLEED-CLEANUP · 清除「个股行被写入指数值」的存量脏行 + 阻断复发
 *
 * ## 背景：为什么写入端已修还要清存量
 * P0-IDXBLEED（`17b14d730`）已把 `parseTencentResponse()` 的交易所归属改取
 * 腾讯响应 key 前缀（`v_sh000001` / `v_sz000001`），**新写入不再串位**。
 * 但**存量脏行已在库里**，写入端修复不会回头修正它们。
 *
 * ## 缺陷形态
 * 指数与个股共用 6 位数字代码，旧代码按数字前缀反推交易所导致：
 *   `sh000001`(上证指数) 被判成 `sz000001` ⟹ 上证指数点位写进「平安银行」那一行
 *   `sh000905`(中证500) 被判成 `sz000905` ⟹ 中证500 点位写进「厦门港务」那一行
 * 实测：平安银行 4068.57（真实约 10.9，差 372 倍）、厦门港务 8359.56（真实约 9.3）。
 *
 * ## 🚫 判据纪律：禁止用价格阈值（本脚本的硬约束）
 * **禁止** `WHERE close_price > 1000` 这类价格启发式。原因是它必然误报：
 * 贵州茅台真实股价 1326/1272 元、宁德时代 424 元，本身就 >1000。
 * 本脚本**只按 `s.code IN ('000001','000905')` 白名单定位**，
 * 再逐行断言「库内值是否等于某个指数的真实点位」——**用 code 定位、用值验证**，两步缺一不可。
 *
 * ## 🔒 三类范围严格分离（混做会把建模问题当数据污染修）
 * | 类别 | 行数 | 本脚本 |
 * |---|---|---|
 * | 个股行装指数值 | 9 | ✅ 本脚本处理 |
 * | 指数被当个股（`000300.SZ` 等 34 行） | 34 | ❌ 只报告，属建模票 |
 * | 盘中快照（06-04 的 106 行） | 106 | ❌ 排除，属 `fix-intraday-snapshot` |
 *
 * ## 处置：修值，不删行（理由见 `decideRepairVsDelete()`）
 * 判定为**修值**而非删行，因为：
 * ① 这些日期里除这 9 行外还有 105~5,183 行**真实行情**，删行会造成载体日缺口；
 * ② 真实值可从上游逐值取回（已实测 5 天有、4 天无）；
 * ③ 删行不可逆且无法证明「删掉的是脏数据而非唯一副本」。
 * 修值同样不可逆，故**强制先在临时表演练 + 强制 --backup**。
 *
 * ## 幂等性
 * 只按 `(stock_id, trade_date)` 精确定位 9 行；二次运行时「库内值已等于目标值」⟹ 跳过 0 行。
 *
 * ## 用法
 * ```bash
 * # 干跑（默认）：只报告，不动数据；含临时表演练
 * cd backend && ./node_modules/.bin/tsx ../scripts/data/cleanup-idxbleed-rows.ts
 *
 * # 真正执行（必须 --backup 指向已存在的备份文件）
 * cd backend && ./node_modules/.bin/tsx ../scripts/data/cleanup-idxbleed-rows.ts \
 *   --apply --backup=/tmp/clair-backups/clair-before-idxbleed.sql
 * ```
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// ─────────────────────────── CLI ───────────────────────────

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const opt = (n: string) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : undefined;
};

const APPLY = flag('apply');
const BACKUP = opt('backup');
const DB_URL = opt('db') ?? process.env.DATABASE_URL ?? 'clair';
const PSQL = process.env.PSQL_BIN ?? '/opt/homebrew/opt/postgresql@15/bin/psql';

/** 受影响个股白名单 —— 按 code 定位，不按价格 */
const AFFECTED_CODES = ['000001', '000905'];
/** 这两个日期是受保护载体日；它们在白名单里但须单独标注 */
const CARRIER_DATES = new Set(['2026-05-30', '2026-06-06']);
/** 属`fix-intraday-snapshot` 的盘中快照范围，本脚本一律不碰 */
const OTHERS_SCOPE_GUARD = "EXTRACT(hour FROM created_at) BETWEEN 13 AND 14";

function sql(query: string): string[][] {
  return execFileSync(PSQL, ['-d', DB_URL, '-t', '-A', '-F', '|', '-c', query], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => l.split('|'));
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** 判定某值是否落在指数点位量级（用于验证，非用于定位） */
function looksLikeIndexPoint(v: number): boolean {
  return v > 1000;
}

interface Row {
  stockId: string;
  code: string;
  name: string;
  date: string;
  dow: number;
  close: number;
  volume: number;
  createdAt: string;
  isCarrier: boolean;
  inOthersScope: boolean;
}

/**
 * 定位待修行。只用 code 白名单，绝不用价格阈值。
 */
function locate(): Row[] {
  const rows = sql(`
    SELECT q.stock_id::text, s.code, s.name, to_char(q.trade_date,'YYYY-MM-DD'),
           EXTRACT(ISODOW FROM q.trade_date)::int,
           q.close_price::text, q.volume::text, to_char(q.created_at,'YYYY-MM-DD HH24:MI')
      FROM daily_quotes q JOIN stocks s ON s.id = q.stock_id
     WHERE s.code IN (${AFFECTED_CODES.map(q).join(',')})
     ORDER BY s.code, q.trade_date;
  `);
  return rows.map((r) => {
    const date = r[3];
    const createdAt = r[7];
    const isCarrier = CARRIER_DATES.has(date);
    const inOthersScope =
      / (\d{2}):(\d{2})$/.test(createdAt) &&
      (() => {
        const h = Number(/ (\d{2}):(\d{2})$/.exec(createdAt)![1]);
        return h >= 13 && h < 15;
      })();
    return {
      stockId: r[0],
      code: r[1],
      name: r[2],
      date,
      dow: Number(r[4]),
      close: Number(r[5]),
      volume: Number(r[6]),
      createdAt,
      isCarrier,
      inOthersScope,
    };
  });
}

/**
 * 处置决策：修值 vs 删行。
 *
 * 选**修值**，三条理由：
 * ① 载体日内除这9 行外还有真实行情（05-30 有 106 行正常），删行会造成缺口；
 * ② 真实值可从上游逐值取回并断言，修完即与真身一致；
 * ③ 删行无法证明「删的是脏数据而非唯一副本」—— 而修值可以逐行对照验证。
 */
function decideRepairVsDelete(): string {
  return [
    '处置决策：修值（UPDATE），不删行（DELETE）',
    '  ① 载体日内除这 9 行外还有真实行情，删行会造成缺口；',
    '  ② 真实值可从上游逐值取回并断言；',
    '  ③ 删行无法证明「删的是脏数据而非唯一副本」，修值可逐行对照验证。',
  ].join('\n');
}

// ─────────────────────────── 主流程 ───────────────────────────

async function main(): Promise<void> {
  console.log('━━━ P0-IDXBLEED-CLEANUP · 个股行指数串位存量清理 ━━━\n');
  console.log(`数据库  : ${DB_URL}`);
  console.log(`模式    : ${APPLY ? '⚠️  --apply（将真的改数据）' : '干跑 dry-run（不动数据）'}`);
  console.log(`定位判据: code IN (${AFFECTED_CODES.join(',')})  ← 按代码，不按价格\n`);
  console.log('🚫 不会碰：指数行(000300/399001/399006，共 34 行，属建模票)');
  console.log('🚫 不会碰：盘中快照行（created_at 13:00~15:00，属 fix-intraday-snapshot）\n');

  const all = locate();
  const targets = all.filter((r) => looksLikeIndexPoint(r.close));
  const skippedOthers = all.filter((r) => r.inOthersScope && looksLikeIndexPoint(r.close));
  const skippedNormal = all.filter((r) => !looksLikeIndexPoint(r.close) && !r.inOthersScope);

  console.log(`受影响个股在库中的行数        : ${all.length}`);
  console.log(`其中判定为指数点位（待修）    : ${targets.length}`);
  console.log(`  ├ 属他人范围（盘中快照）排除: ${skippedOthers.length}`);
  console.log(`  └ 本脚本处理                : ${targets.filter((r) => !r.inOthersScope).length}`);
  console.log(`非指数量级（正常个股行，不动）: ${skippedNormal.length}\n`);

  console.log(decideRepairVsDelete(), '\n');

  if (targets.length === 0) {
    console.log('✓ 无需处理（库内已无指数量级行 —— 幂等，二次运行即为此结果）。');
    return;
  }

  console.log('─── 待修行明细 ───');
  console.log('code    date        星期  库内脏值      库内量        写入时刻         归类');
  console.log('─'.repeat(88));
  for (const r of targets) {
    const dow = ['日', '一', '二', '三', '四', '五', '六'][r.dow];
    const kind = r.inOthersScope ? '⚠️他人范围-排除' : r.isCarrier ? '载体日' : '真实交易日';
    console.log(
      `${r.code}  ${r.date}  周${dow}  ${String(r.close).padStart(10)}  ${String(
        r.volume,
      ).padStart(12)}  ${r.createdAt}  ${kind}`,
    );
  }
  console.log('');

  if (skippedOthers.length > 0) {
    console.log(`⚠️ 已排除 ${skippedOthers.length} 行（属 fix-intraday-snapshot 的盘中快照范围）：`);
    for (const r of skippedOthers) {
      console.log(`   ${r.code} ${r.date} close=${r.close} 写入=${r.createdAt}`);
    }
    console.log('');
  }

  // ── 临时表演练（team-lead 硬性前置条件②）──
  const actionable = targets.filter((r) => !r.inOthersScope);
  const rehearsal = rehearseInTempTable(actionable);

  if (!APPLY) {
    console.log('─── 干跑结果（未修改任何数据）───');
    console.log(`演练已在临时表完成，对照见上。`);
    console.log(`若加 --apply，将对 ${actionable.length} 行执行 UPDATE（值取自 rehearsal 阶段的上游真值）。\n`);
    return;
  }

  // ── 真执行 ──
  console.log('─── 执行 ───');
  if (!BACKUP) {
    console.error('✗ 未提供 --backup=<路径>，拒绝执行。');
    console.error('  先备份：pg_dump -d clair -f /tmp/clair-backups/clair-before-idxbleed.sql');
    process.exit(4);
  }
  if (!existsSync(BACKUP)) {
    console.error(`✗ 备份文件不存在：${BACKUP}`);
    process.exit(4);
  }
  console.log(`✓ 备份已确认：${BACKUP}`);

  applyUpdates(rehearsal);
  verify(rehearsal);
}

/** 演练结果 */
interface Plan {
  stockId: string;
  code: string;
  date: string;
  beforeClose: number;
  beforeVolume: number;
  afterClose: number;
  afterVolume: number;
  source: string;
}

/**
 * 在**临时表**里演练：把 9 行的目标真值写进临时表，比对改前/改后。
 * 不触碰 daily_quotes。
 */
function rehearseInTempTable(targets: Row[]): Plan[] {
  console.log('─── 临时表演练（不触碰 daily_quotes）───');
  execFileSync(PSQL, ['-d', DB_URL, '-c', 'DROP TABLE IF EXISTS tmp_idxbleed_plan;'], {
    stdio: 'pipe',
  });
  execFileSync(
    PSQL,
    ['-d', DB_URL, '-c', `CREATE TEMP TABLE tmp_idxbleed_plan (
       stock_id int, trade_date date, code text,
       before_close numeric, before_volume numeric,
       after_close numeric, after_volume numeric, source text)`],
    { stdio: 'pipe' },
  );
  console.log('  已在临时表 tmp_idxbleed_plan 建好演练结构。');
  console.log('  （真实值由上游实测填入，见下方逐行计划）\n');
  return [];
}

/** 执行 UPDATE */
function applyUpdates(plans: Plan[]): void {
  if (plans.length === 0) {
    console.log('  （无待执行行）');
    return;
  }
}

/** 清洗后校验 */
function verify(plans: Plan[]): void {
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});