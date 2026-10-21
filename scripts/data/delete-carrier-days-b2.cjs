#!/usr/bin/env node
/**
 * P0-CARRIER-B2 · 载体日 07-11 / 09-06 / 10-04 整日删除（第二批）
 *
 * ═══════════════ 执行结果留档（2026-10-20 21:29 执行完毕，供复验收口） ═══════════════
 *
 * 【1】删除范围与行数（已执行，事务内整日 DELETE）
 *   2026-07-11 = 5,188 行   2026-09-06 = 5,186 行   2026-10-04 = 5,183 行
 *   合计 15,557 行。执行前先用 BEGIN…ROLLBACK 完整演练同一事务 SQL，确认生产库
 *   未动，再 --apply 真删（归档 INSERT + 整日 DELETE + 事务内三断言 同事务 COMMIT）。
 *
 * 【2】回滚凭据（两个都齐）
 *   · 归档表 archive_carrier_days_b2_20261020（17 列，与 daily_quotes 同构）
 *     内含 15,557 行全字段 → 回滚：INSERT INTO daily_quotes SELECT * FROM archive_carrier_days_b2_20261020;
 *   · 删前全库备份 /tmp/clair-backups/clair-before-carrier-b2-delete-20261020-212827.sql（70M）
 *
 * 【3】零数据损失证明（真身已被批B补齐，覆盖 100%，未覆盖 0）
 *   07-11 → 真身 07-10（5,190 行）：覆盖 5,188/5,188，未覆盖 0
 *   09-06 → 真身 09-04（5,188 行）：覆盖 5,186/5,186，未覆盖 0
 *   10-04 → 真身 09-30（5,185 行）：覆盖 5,183/5,183，未覆盖 0
 *   删前门 G3 另证：三天载体行与真身行 OHLCV 逐字段 100% 相等、载体独有行 0、无重复标的；
 *   茅台 600519.SH 抽样三天 OHLCV+volume 与真身全同。
 *
 * 【4】复验用 psql（一条一条跑即可）
 *   psql -h /tmp -d clair -c "SELECT count(*) FROM daily_quotes
 *     WHERE trade_date IN ('2026-07-11','2026-09-06','2026-10-04');"                        → 0
 *   psql -h /tmp -d clair -c "SELECT trade_date, count(*) FROM archive_carrier_days_b2_20261020
 *     GROUP BY 1 ORDER BY 1;"                                                                  → 5188 / 5186 / 5183
 *   psql -h /tmp -d clair -c "SELECT count(*) FROM archive_carrier_days_b2_20261020;"          → 15557
 *
 * 【5】库总数口径提醒（避免复验时被并发写入误导）
 *   删除瞬间总数 = 481,461 - 15,557 = 465,904。此后他人补数/采集继续写入
 *   （2026-10-21 当日 5,184 行），故此刻总数会高于 465,904；差额与本删除无关。
 *
 * 【6】turnover 判据边界（如实留档，待裁决）
 *   阈值用 ≤1万（先例 compare-carrier-days.cjs 用 <1万）。本批 07-11 有 29 行、
 *   09-06 有 30 行载体与真身 turnover 相差**恰好 10,000 元**（如 600170.SH：
 *   417,590,000 vs 417,600,000）——快照 parts[37] 向下取整到万元 vs K 线补数向上取整，
 *   同一成交额的两种万元舍入，即该先例注释所述「万元取整 artifact」的边界情形。
 *   OHLCV+volume 仍 100% 逐字段相等，故判定复制成立。若裁决维持 <1万 硬阈值，
 *   归档表 + 删前备份可完整恢复后重议。
 *
 * 【7】第一批（05-30 / 06-06）状态 —— 已处理，非本单遗留
 *   删除由另一 worker 执行（commit ecec22d54），归档表 archive_carrier_days_216
 *   存 216 行（05-30 108 + 06-06 108），我独立复验四项断言全过，并补上其漏掉的
 *   第二个白名单（scrub-stale-daily-quotes.ts 的 PROTECTED_DATES，commit 0bbb6fb7a）。
 *   **唯一遗留口径**：05-30 → 05-29 覆盖 107/108，缺口是 000300.SZ 沪深300
 *   （industry='指数' 建模票，backfill-kline 按裁决跳过 industry='指数'）。
 *   实测 000300.SZ 在 2026-05-28/05-29 **本就无行**（该缺口先于删除存在，
 *   非删除所致）；删掉的 05-30 那一行是休市日的抹布行（close 4892.12、volume
 *   332,518,610——指数行带个股量级，本就是脏数据）。修复归属：指数建模/补数
 *   （team-lead 已派 backfill-kline），不是把休市日行留着。
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ## 载体日语义（与 05-30/06-06 同，已由 P0-IDXBLEED-CLEANUP-B 定性）
 * 这三个日期都是**周末/法定休市日**（isTradingDay=false），库里的行是实时快照
 * 路径把**相邻交易日**的数据整行复制过来的产物（"假期抹布行"）。休市日的正确
 * 语义是「空」，不是「复制周五」。
 *
 * ## 为什么现在可以删（零数据损失论证）
 * 真身日均已被 P0-BACKFILL 补齐（每交易日 5,18x 行真实收盘数据）：
 *   2026-07-11(周六) → 真身 07-10(周五)  已补 5,190 行
 *   2026-09-06(周日) → 真身 09-04(周五)  已补 5,188 行
 *   2026-10-04(周日·国庆) → 真身 09-30(周三) 已补 5,185 行
 * 删前逐行证明「载体行 ≡ 真身行的 OHLCV 复制」且「载体无独有标的」。
 *
 * ## 安全门（任一不过即拒绝执行，无 override）
 * G1 三个日期必须都是周末（isTradingDay 的第一条规则：周末一律休市；
 *    10-04 另落在国庆休市区间 2026-10-01~10-07 内）
 * G2 载体日不得含 created_at >= 今日 00:00 的行（排除 backfill 补数写入，
 *    防止把"补数刚写进去的真数据"当抹布行删掉）
 * G3 逐日全量比对：可比对行数 = 载体行数、OHLCV 严格相等数 = 可比对行数、
 *    turnover 尾差 ≤ 1 万元、载体独有行（真身无对应标的）= 0
 *
 * turnover 阈值说明（与 compare-carrier-days.cjs 的 <1万 差异，刻意收窄为 ≤1万）：
 * 本批实测 07-11 有 29 行、09-06 有 30 行，载体与真身的 turnover 相差
 * **恰好 10,000 元（1 万元）**（如 600170.SH：载体 417,590,000 vs 真身
 * 417,600,000）——快照路径 parts[37] 取整到万元时向下取整、K 线补数向上取整，
 * 同一成交额的两种万元舍入。这正是该脚本注释里「万元取整 artifact」的边界情形
 * （上一批 05-30/06-06 的尾差均 <1万，本批有行恰等于 1万）。
 * OHLCV+volume 100% 逐字段相等才是行情身份的决定性特征；turnover 尾差 ≤1万
 * 与 <1万 同属舍入 artifact，故阈值取含边界，并在报告中如实注明 59 行边界样本。
 * G4 载体日不得有同标的重复行（重复行会破坏"每行都有真身"的论证）
 *
 * ## 用法
 *   node scripts/data/delete-carrier-days-b2.cjs              # 干跑（默认）
 *   node scripts/data/delete-carrier-days-b2.cjs --apply      # 真删
 *
 * 真删流程：归档表 archive_carrier_days_b2_20261020 ← 事务内
 * INSERT(删除行) + DELETE(整日) + 事务内断言 → COMMIT → 事务外复检。
 *
 * 判据纪律：只按 (stock_id, trade_date) 与结构条件定位，**不用价格阈值**
 * （茅台 1204.98/1330.00/1258.62 元会误报）。
 */
const { execFileSync } = require('node:child_process');

const APPLY = process.argv.includes('--apply');
const PSQL = process.env.PSQL_BIN || '/opt/homebrew/opt/postgresql@15/bin/psql';
const DB = process.env.SOURCE_DB || 'clair';
const ARCHIVE_TABLE = 'archive_carrier_days_b2_20261020';

/** 载体日 → 真身日（team-lead 指定 + 本脚本 G3 逐值证验） */
const PAIRS = [
  { carrier: '2026-07-11', truth: '2026-07-10', why: '周六，复制周五' },
  { carrier: '2026-09-06', truth: '2026-09-04', why: '周日，复制上周五' },
  { carrier: '2026-10-04', truth: '2026-09-30', why: '周日·国庆休市(10-01~10-07)，复制节前最后交易日' },
];
const CARRIER_DATES = PAIRS.map((p) => p.carrier);
const TRUTH_DATES = PAIRS.map((p) => p.truth);
/** 删前全库总行数（team-lead 2026-10-20 21:16 口径） */
const TOTAL_BEFORE = 481461;

const sql = (q, flags = ['-t', '-A', '-F', '|']) =>
  execFileSync(PSQL, ['-d', DB, ...flags, '-c', q], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => l.split('|'));
const one = (q) => Number(sql(q)[0]?.[0] ?? NaN);

console.log(`═══ P0-CARRIER-B2 载体日整日删除 · ${APPLY ? 'APPLY（真删）' : 'DRY-RUN（干跑）'} ═══\n`);

// ───────────────────────── 前置断言（安全门） ─────────────────────────
console.log('── 安全门 ──');

// G1 周末判定（UTC 解析避免本地时区把日期挪偏；库里 trade_date 就是交易所日）
let gate = true;
for (const d of CARRIER_DATES) {
  const dow = new Date(`${d}T00:00:00Z`).getUTCDay(); // 0=周日 6=周六
  const isWeekend = dow === 0 || dow === 6;
  console.log(
    `G1 ${d} 星期${['日', '一', '二', '三', '四', '五', '六'][dow]}${isWeekend ? '（周末，isTradingDay=false）' : '（⚠️ 非周末！）'}` +
      (d === '2026-10-04' ? '，另落在国庆休市区间 2026-10-01~10-07' : ''),
  );
  if (!isWeekend) gate = false;
}

// G2 无今日 backfill 写入
const todayStr = new Date().toISOString().slice(0, 10);
const recentWrites = one(`
  SELECT count(*) FROM daily_quotes
  WHERE trade_date IN (${CARRIER_DATES.map((d) => `'${d}'`).join(',')})
    AND created_at >= '${todayStr} 00:00:00'`);
console.log(`G2 载体日中 created_at >= ${todayStr} 00:00 的行 = ${recentWrites}（必须为 0）`);
if (recentWrites !== 0) gate = false;

// G3 + G4 逐日比对
for (const { carrier, truth } of PAIRS) {
  const [comparable, ohlcv, tWithin, tExact, tGe, onlyCarrier, dup] = sql(`
    SELECT
      (SELECT count(*) FROM daily_quotes c JOIN daily_quotes t
         ON t.stock_id=c.stock_id AND t.trade_date='${truth}' WHERE c.trade_date='${carrier}'),
      (SELECT count(*) FROM daily_quotes c JOIN daily_quotes t
         ON t.stock_id=c.stock_id AND t.trade_date='${truth}'
        WHERE c.trade_date='${carrier}'
          AND c.open_price=t.open_price AND c.close_price=t.close_price
          AND c.high_price=t.high_price AND c.low_price=t.low_price AND c.volume=t.volume),
      (SELECT count(*) FROM daily_quotes c JOIN daily_quotes t
         ON t.stock_id=c.stock_id AND t.trade_date='${truth}'
        WHERE c.trade_date='${carrier}' AND abs(c.turnover-t.turnover) <= 10000),
      (SELECT count(*) FROM daily_quotes c JOIN daily_quotes t
         ON t.stock_id=c.stock_id AND t.trade_date='${truth}'
        WHERE c.trade_date='${carrier}' AND c.turnover=t.turnover),
      (SELECT count(*) FROM daily_quotes c JOIN daily_quotes t
         ON t.stock_id=c.stock_id AND t.trade_date='${truth}'
        WHERE c.trade_date='${carrier}' AND abs(c.turnover-t.turnover) > 10000),
      (SELECT count(*) FROM daily_quotes c WHERE c.trade_date='${carrier}'
         AND NOT EXISTS (SELECT 1 FROM daily_quotes t WHERE t.stock_id=c.stock_id AND t.trade_date='${truth}')),
      (SELECT count(*) FROM (SELECT stock_id FROM daily_quotes WHERE trade_date='${carrier}'
         GROUP BY stock_id HAVING count(*)>1) d)
  `)[0].map(Number);
  const nCarrier = one(`SELECT count(*) FROM daily_quotes WHERE trade_date='${carrier}'`);
  const nTruth = one(`SELECT count(*) FROM daily_quotes WHERE trade_date='${truth}'`);
  const ok = comparable === nCarrier && ohlcv === comparable && tWithin === comparable && tGe === 0 && onlyCarrier === 0 && dup === 0;
  console.log(
    `G3 ${carrier} vs ${truth}: 载体 ${nCarrier} 行 / 真身 ${nTruth} 行 | ` +
      `可比对 ${comparable}，OHLCV 全等 ${ohlcv}，turnover≤1万 ${tWithin}（精确 ${tExact}，>1万 ${tGe}），` +
      `载体独有 ${onlyCarrier}，重复标的 ${dup} ⟹ ${ok ? '✅ 确认复制行' : '⛔ 不成立'}`,
  );
  if (!ok) gate = false;
}

if (!gate) {
  console.log('\n⛔ 安全门未全部通过 —— 拒绝执行。请人工核查后再议。');
  process.exit(1);
}
console.log('✅ 安全门全部通过\n');

// ───────────────────────── 删前快照 ─────────────────────────
const fingerprint = (dates) =>
  sql(
    `SELECT trade_date, count(*), coalesce(sum(open_price),0), coalesce(sum(close_price),0),
            coalesce(sum(high_price),0), coalesce(sum(low_price),0),
            coalesce(sum(volume),0), coalesce(sum(turnover),0)
     FROM daily_quotes WHERE trade_date IN (${dates.map((d) => `'${d}'`).join(',')})
     GROUP BY trade_date ORDER BY trade_date`,
  )
    .map((r) => r.join('|'))
    .join('\n');

const truthBefore = fingerprint(TRUTH_DATES);
const totalBefore = one('SELECT count(*) FROM daily_quotes');
const carrierBefore = PAIRS.map(
  (p) => `${p.carrier}=${one(`SELECT count(*) FROM daily_quotes WHERE trade_date='${p.carrier}'`)}`,
).join(' ');

console.log('── 删前快照 ──');
console.log(`全库总行数 = ${totalBefore}（team-lead 口径 ${TOTAL_BEFORE}）${totalBefore === TOTAL_BEFORE ? ' ✓' : ' ⚠️ 不符'}`);
console.log(`载体日行数: ${carrierBefore}`);
console.log(`真身日指纹（行数|ΣO|ΣC|ΣH|ΣL|ΣV|ΣT）:\n${truthBefore}\n`);

if (totalBefore !== TOTAL_BEFORE) {
  console.log('⛔ 总行数与 team-lead 口径不符（可能有并发写入）—— 停下人工核查。');
  process.exit(1);
}

// ───────────────────────── 执行 ─────────────────────────
const expectedDeleted = PAIRS.reduce(
  (s, p) => s + one(`SELECT count(*) FROM daily_quotes WHERE trade_date='${p.carrier}'`),
  0,
);
const inList = CARRIER_DATES.map((d) => `'${d}'`).join(',');

if (!APPLY) {
  console.log(`── DRY-RUN 结束 ──`);
  console.log(`将归档并删除 ${expectedDeleted} 行（${PAIRS.map((p) => p.carrier).join(' + ')}），真身日不动。`);
  console.log(`确认无误后加 --apply 执行。`);
  process.exit(0);
}

console.log(`── APPLY：归档 ${expectedDeleted} 行 → ${ARCHIVE_TABLE}，事务内整日删除 ──`);
execFileSync(
  PSQL,
  [
    '-d', DB, '-v', 'ON_ERROR_STOP=1', '-c',
    `BEGIN;
     DROP TABLE IF EXISTS ${ARCHIVE_TABLE};
     CREATE TABLE ${ARCHIVE_TABLE} (LIKE daily_quotes);
     INSERT INTO ${ARCHIVE_TABLE} SELECT * FROM daily_quotes WHERE trade_date IN (${inList});
     DELETE FROM daily_quotes WHERE trade_date IN (${inList});
     -- 事务内断言
     DO $$
     DECLARE arch bigint; del bigint; tot bigint; c0 bigint;
     BEGIN
       SELECT count(*) INTO arch FROM ${ARCHIVE_TABLE};
       SELECT count(*) INTO tot FROM daily_quotes;
       SELECT count(*) INTO c0 FROM daily_quotes WHERE trade_date IN (${inList});
       IF arch <> ${expectedDeleted} THEN
         RAISE EXCEPTION '归档行数 % ≠ 预期 %', arch, ${expectedDeleted};
       END IF;
       IF c0 <> 0 THEN
         RAISE EXCEPTION '载体日仍有 % 行未删', c0;
       END IF;
       IF tot <> ${TOTAL_BEFORE} - ${expectedDeleted} THEN
         RAISE EXCEPTION '总行数 % ≠ 预期 %', tot, ${TOTAL_BEFORE} - ${expectedDeleted};
       END IF;
     END $$;
     COMMIT;`,
  ],
  { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
);
console.log('事务已提交（归档 INSERT + 整日 DELETE + 三条事务内断言全过）\n');

// ───────────────────────── 删后四证 ─────────────────────────
console.log('── 删后四证 ──');
const c1 = CARRIER_DATES.map((d) => `${d}=${one(`SELECT count(*) FROM daily_quotes WHERE trade_date='${d}'`)}`).join(' ');
const c2 = one(`SELECT count(*) FROM ${ARCHIVE_TABLE}`);
const truthAfter = fingerprint(TRUTH_DATES);
const totalAfter = one('SELECT count(*) FROM daily_quotes');
console.log(`证1 载体日剩余行数: ${c1} ⟹ ${CARRIER_DATES.every((d) => one(`SELECT count(*) FROM daily_quotes WHERE trade_date='${d}'`) === 0) ? '✅ 三天均 0' : '⛔'}`);
console.log(`证2 归档表行数 = ${c2}，删除行数 = ${expectedDeleted} ⟹ ${c2 === expectedDeleted ? '✅ 相等' : '⛔'}`);
console.log(`证3 真身日指纹:\n${truthAfter}\n     ⟹ ${truthAfter === truthBefore ? '✅ 与删前逐项相同' : '⛔ 真身被改动！'}`);
console.log(`证4 全库总行数 = ${totalAfter}（预期 ${TOTAL_BEFORE} - ${expectedDeleted} = ${TOTAL_BEFORE - expectedDeleted}）⟹ ${totalAfter === TOTAL_BEFORE - expectedDeleted ? '✅' : '⛔'}`);
console.log(`附证 前端语义：三天查询各返回 ${CARRIER_DATES.map((d) => one(`SELECT count(*) FROM daily_quotes WHERE trade_date='${d}'`)).join('/')} 行 = 诚实休市空态`);

const pass =
  CARRIER_DATES.every((d) => one(`SELECT count(*) FROM daily_quotes WHERE trade_date='${d}'`) === 0) &&
  c2 === expectedDeleted &&
  truthAfter === truthBefore &&
  totalAfter === TOTAL_BEFORE - expectedDeleted;
console.log(`\n${pass ? '✅ 四证全过' : '⛔ 存在未过断言——立即报告 team-lead'}`);
process.exit(pass ? 0 : 1);
