#!/usr/bin/env node
/**
 * P0-INTRADAY 4b：重写「盘中快照落库」污染行
 *
 * ## 缺陷
 * `syncRealtimeQuotes` 每5 分钟抓一次实时快照写进 `daily_quotes`（日线表），
 * 写入前只校验「是不是交易日」，**从不校验「是否已收盘」**（DataSyncService.ts:351）。
 * 若服务在收盘前停摆，收盘前那一笔就永久留下 → close/volume/turnover 全是盘中值。
 *
 * ## 判定口径（经team-lead 裁决 + 实测校正）
 * **不再按 close 阈值分A/B/C** —— 该比例对容差极度敏感（0.1% → B 多数，0.2% → C 多数），
 * 拿来定修复范围不稳健。改用**无阈值铁证**：
 *   `09-14 中 volume >= 上游终值的行数 = 0 / 5182`
 * 全部 5182 行 volume 偏小（中位 4.77%，p90 7.44%，max 22.84%），方向一致无例外。
 * 故**整表重写该日全部可比对行**，不做行级分类。
 *
 * ## 三道硬断言（任一不通过即拒绝执行，绝不"部分成功"）
 * 1. **载体日断言**：本次 trade_date 集合 ∩ 载体日白名单必须为空。
 *    载体日= `05-30/06-06/07-11/09-06/10-04`。曾被载体日咬过（07-10 从 0 变 5188）。
 * 2. **串位排除断言**：指数行(`000300.SZ/399001.SZ/399006.SZ`) 与
 *    个股串位行(`000905.SZ` 且库内 close>1000) 必须在范围内**计数为 0**。
 *    这两类归 P0-IDXBLEED 另案，混进来会把脏数据固化。
 * 3. **只动预收盘行**：仅`created_at::date = trade_date AND created_at::time < '15:00'`
 *    的行。收盘后写的行已是终盘值，不碰。
 *
 * ## 必守：不复权
 * 库存不复权价，上游必须用 `day` 而非 `qfqday`。
 *
 * 用法：
 *   # 干跑（只SELECT +打印计划，不写库）
 *   cd backend && ./node_modules/.bin/tsx ../scripts/data/fix-intraday-rewrite.ts --dry-run
 *   # 实际执行（单日）
 *   cd backend && ./node_modules/.bin/tsx ../scripts/data/fix-intraday-rewrite.ts --apply --date=2026-06-04
 *   # 从既有计划文件补写 turnover/turnover_rate（判据已命中过、OHLCV 已落地的日子）
 *   cd backend && ./node_modules/.bin/tsx ../scripts/data/fix-intraday-rewrite.ts --apply \
 *     --from-plan=/tmp/4b-0604-plan.json
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const opt = (n: string) => {
  const eq = argv.find((a) => a.startsWith(`--${n}=`));
  if (eq) return eq.slice(n.length + 3);
  const at = argv.indexOf(`--${n}`);
  if (at >= 0 && at + 1 < argv.length && !argv[at + 1].startsWith('--')) return argv[at + 1];
  return undefined;
};
const APPLY = argv.includes('--apply');
const DRY = argv.includes('--dry-run') || !APPLY;
const DATE = opt('date');
const DB_URL = opt('db') ?? process.env.DATABASE_URL ?? 'clair';
const PSQL = process.env.PSQL_BIN ?? '/opt/homebrew/opt/postgresql@15/bin/psql';
const CONC = Number(opt('concurrency') ?? '16');
const BACKUP = opt('backup') ?? '/tmp/intraday-4b-backup.json';
/**
 * 是否同时重写 turnover / turnover_rate（默认 false）。
 *
 * ## 为什么默认关、以及什么时候该开
 * 曾以「库内 turnover 单位混用」为由全程不写。**该判断对全库成立、对 4b 目标日不成立**：
 * 混用来自 2026-05-30~06-26 写入的 legacy 万元行（60,466 行），而 4b 的两个目标日
 * 实测 turnover **全部是元口径**（用 close×volume×100 反推，不用阈值）：
 *   2026-06-04: yuan_correct 512 / other 104 / wan_unit **0**
 *   2026-09-14: yuan_correct 4574 / other 608 / wan_unit **0**
 * 且其数值随盘中 volume 同比偏小（000027@06-04: 507,430,000 vs 上游 605,850,000 = 83.7%，
 * 与 volume 比 644,929/771,093 = 83.6% 一致）⟹ **单位对、值是盘中值**。
 *
 * 故对 4b 目标日，`turnover = round(idx8)×10000` 是**修正而非破坏**，
 * 且与 DataSyncService.ts:909（syncKLineData）现行口径逐位一致。
 * team-lead 工单 S1-1 余项④ 亦明确要求该口径。用 `--with-turnover` 开启。
 */
const WITH_TURNOVER = argv.includes('--with-turnover');
/**
 * `--from-plan=<file>`：从既有计划文件补写 turnover / turnover_rate。
 *
 * ## 为什么必须单独开一条路径
 * 本脚本的**选行**判据是 `dbV < upV`。Step 3 已把 06-04 那 102 行的 volume
 * 写成了终盘值，再跑一次该判据命中数为 0 —— 判据本身是对的，但它只回答
 * 「哪些行需要重写 OHLCV」，**答不了「哪些行还缺终盘 turnover」**。
 * 若不加这条路径，06-04 的 turnover 将永远留着盘中值，形成半成品。
 *
 * ## 三道断言（任一不满足即整体拒绝，不做部分写入）
 * 1. 计划内不得含实例 B 那 3 行（688981/688036/688008，归 fix-turnover-unit）。
 * 2. 上游复拉所得 OHLCV 必须与计划内 `new` 完全一致（上游未变动，口径可信）。
 * 3. 库内当前 OHLCV+volume 必须与计划内 `new` 完全一致（Step 3 已落地且此后无人再动）。
 *
 * 三道都过，才只写 turnover/turnover_rate 两列。`created_at` 全程不碰。
 */
const FROM_PLAN = opt('from-plan');
/** 实例 B：fix-turnover-unit 的自留行，4b 绝不触碰 */
const FOREIGN_ROWS = ['688981', '688036', '688008'];

/** 载体日白名单 —— 碰了就拒 */
const CARRIER_DAYS = ['2026-05-30', '2026-06-06', '2026-07-11', '2026-09-06', '2026-10-04'];
/** 指数行：归 P0-IDXBLEED 建模票，4b 不得触碰 */
const INDEX_SYMBOLS = ['000300.SZ', '399001.SZ', '399006.SZ'];
/**
 * 个股串位行：`000905.SZ`（厦门港务，真实价位 ~9 元）被写入中证500 点位（8000+）。
 *
 * ⚠️ 判据**不用价格阈值**。曾用 `close_price > 1000`，被 scrub-smeared-rows 指出会误报：
 * 高价股（如 600519 茅台 ~1300 元）天然 >1000。虽然本条件有 `symbol='000905.SZ'` 兜底
 * 不会真误伤，但价格启发式本身就是错的思路 —— 一旦 symbol 条件写错就会静默扩大排除面。
 *
 * 改为**显式 (symbol, trade_date) 白名单**，逐行列明，不依赖任何数值推断。
 * 来源：scripts/data/probe-intraday-snapshot.ts 全量 detail 与上游逐值比对。
 */
const BLEED_ROWS: Array<[string, string]> = [
  ['000905.SZ', '2026-05-30'], ['000905.SZ', '2026-06-01'], ['000905.SZ', '2026-06-03'],
  ['000905.SZ', '2026-06-04'], ['000905.SZ', '2026-06-05'], ['000905.SZ', '2026-06-06'],
  ['000905.SZ', '2026-06-08'],
];
const EXCLUDE_BLEED = BLEED_ROWS.map(([s, d]) => `(s.symbol='${s}' AND q.trade_date='${d}')`).join(' OR ');

function sql(q: string): string[][] {
  return execFileSync(PSQL, ['-d', DB_URL, '-t', '-A', '-F', '|', '-c', q], {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  })
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => l.split('|'));
}

const toTx = (s: string): string | null => {
  const c = s.replace(/\.(SZ|SH|BJ)$/i, '');
  if (c.startsWith('6') || c.startsWith('9')) return `sh${c}`;
  if (c.startsWith('0') || c.startsWith('3')) return `sz${c}`;
  if (c.startsWith('4') || c.startsWith('8')) return `bj${c}`;
  return null;
};

async function fetchUnadjusted(tx: string, days: number): Promise<any[] | null> {
  for (const h of [
    'https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get',
    'https://web.ifzq.gtimg.cn/appstock/app/newfqkline/get',
  ]) {
    try {
      const r = await fetch(`${h}?param=${tx},day,,,${days},`, {
        signal: AbortSignal.timeout(25000),
        headers: { Referer: 'https://finance.qq.com' },
      });
      if (!r.ok) continue;
      const j: any = await r.json();
      const day = j?.data?.[tx]?.day; // 只取 day
      if (Array.isArray(day) && day.length) return day;
    } catch { /* 下一个host */ }
  }
  return null;
}

/**
 * 该日全量指纹：行数 + 各字段聚合 + 内容 md5。
 * 用于证明「不该改的行确实一格没动」——只比行数不够，
 * 必须比对内容哈希才能排除「行数不变但值被悄悄改了」。
 */
function fingerprint(date: string): string {
  const r = sql(`
    SELECT count(*),
           coalesce(sum(open_price),0), coalesce(sum(close_price),0),
           coalesce(sum(high_price),0),  coalesce(sum(low_price),0),
           coalesce(sum(volume),0),    coalesce(sum(turnover),0),
           md5(string_agg(stock_id||'|'||coalesce(open_price::text,'')||'|'||
               coalesce(close_price::text,'')||'|'||coalesce(high_price::text,'')||'|'||
               coalesce(low_price::text,'')||'|'||coalesce(volume::text,'')||'|'||
               coalesce(turnover::text,''), ',' ORDER BY stock_id))
    FROM daily_quotes WHERE trade_date='${date}'`)[0];
  return `rows=${r[0]} sumO=${r[1]} sumC=${r[2]} sumH=${r[3]} sumL=${r[4]} sumV=${r[5]} sumT=${r[6]} md5=${r[7]}`;
}

/** 取整口径：先四舍五入到整数万元，再 ×10000。与 DataSyncService.ts:909 逐位一致。 */
const turnoverYuan = (wan: number) => Math.round(wan) * 10000;

async function applyFromPlan(file: string) {
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  let entries: any[] = doc.plan ?? [];
  const planDate: string = doc.date;
  if (!planDate || !entries.length) {
    console.error(`✗ 计划文件不可用：date=${planDate} rows=${entries.length}`);
    process.exit(1);
  }
  const mode = APPLY ? 'APPLY（会写库）' : 'DRY-RUN（只读）';
  console.log(`P0-INTRADAY 4b 补写周转  mode=${mode}  date=${planDate}  plan=${file}`);
  console.log(`计划行数 ${entries.length}\n`);

  // ── 断言 1：载体日 ──
  if (CARRIER_DAYS.includes(planDate)) {
    console.error(`✗ 拒绝执行：${planDate} 是载体日白名单成员`);
    process.exit(2);
  }
  console.log(`✓ 断言1 载体日：${planDate} 不在白名单内`);

  /**
   * ── 断言 2：实例 B 那 3 行的隔离 ──
   * 这 3 行（688981/688036/688008）归 fix-turnover-unit，team-lead 明令「你不要碰」。
   * 但它们当初和我的 99 行同批进了计划文件（同一根因的两个实例）。
   *
   * ⚠️ 不能简单「整体拒绝」也不能「静默跳过」：
   *  - 整体拒绝 ⟹ 99 行周转永远补不上，半成品；
   *  - 静默跳过 ⟹ 若那 3 行其实还没修好，就被本脚本悄悄丢下且无人知晓。
   * 取第三条路：**排除 + 反向断言** —— 只有确认它们当前已是终盘值才允许排除，
   * 否则停手并上报（排除一个尚未修好的行 = 制造遗漏）。
   */
  const foreign = entries.filter((e) => FOREIGN_ROWS.some((c) => String(e.symbol).startsWith(c)));
  const entriesMine = entries.filter((e) => !FOREIGN_ROWS.some((c) => String(e.symbol).startsWith(c)));
  console.log(`计划行拆分：本方 ${entriesMine.length} 行 / 实例B ${foreign.length} 行（${foreign.map((f) => f.symbol).join(',') || '无'}）`);
  if (foreign.length) {
    const bad = sql(`
      SELECT s.symbol, q.turnover, q.turnover_rate FROM daily_quotes q JOIN stocks s ON s.id=q.stock_id
      WHERE q.trade_date='${planDate}'
        AND s.symbol IN (${foreign.map((f) => `'${f.symbol}'`).join(',')})`);
    for (const f of foreign) {
      const cur = bad.find((b) => b[0] === f.symbol);
      const wantT = turnoverYuan(Number(f.new.turnover_upstream_wan ?? f.new.turnover / 10000));
      const wantTR = Number(f.new.turnover_rate_upstream_pct ?? f.new.turnover_rate);
      const good = cur && Number(cur[1]) === wantT && Number(cur[2]) === wantTR;
      console.log(`  ${f.symbol} 现状 T=${cur?.[1]}/期望 ${wantT}  TR=${cur?.[2]}/期望 ${wantTR}  → ${good ? '已终盘，排除' : '未终盘'}`);
      if (!good) {
        console.error(`✗ 拒绝执行：${f.symbol} 归 fix-turnover-unit 但当前还不是终盘值，本脚本无权处理，请其先行修复`);
        process.exit(3);
      }
    }
    console.log(`✓ 断言2 实例B 隔离：${foreign.length} 行已由 fix-turnover-unit 修至终盘，本脚本排除不触碰`);
  } else {
    console.log('✓ 断言2 实例B 隔离：计划内不含实例B 标的');
  }
  entries = entriesMine;

  // ── 取当前库值 ──
  const ids = entries.map((e) => e.stock_id).join(',');
  const cur = new Map<string, string[]>();
  for (const r of sql(`
    SELECT q.stock_id::text, q.open_price, q.close_price, q.high_price, q.low_price,
           q.volume, q.turnover, q.turnover_rate
    FROM daily_quotes q
    WHERE q.trade_date='${planDate}' AND q.stock_id IN (${ids})`)) {
    cur.set(r[0], r);
  }
  console.log(`库内取回 ${cur.size} / ${entries.length} 行`);

  // ── 复拉上游（独立二次取数，不信计划文件里的快照） ──
  const needDays = Math.ceil(((Date.now() - new Date(`${planDate}T00:00:00Z`).getTime()) / 86_400_000 / 0.6645) * 1.35) + 10;
  const ups = new Map<string, any>();
  let cursor = 0;
  await Promise.all(
    Array.from({ length: CONC }, async () => {
      while (cursor < entries.length) {
        const e = entries[cursor++];
        const tx = toTx(e.symbol);
        if (!tx) continue;
        const day = await fetchUnadjusted(tx, needDays);
        if (!day) continue;
        const up = day.find((d: any) => String(d[0]).slice(0, 10) === planDate);
        if (up) ups.set(e.symbol, up);
      }
    }),
  );
  console.log(`上游复拉命中 ${ups.size} / ${entries.length} 只标的\n`);

  // ── 断言 3/4：上游与计划一致、库内与计划一致 ──
  const upMismatch: string[] = [];
  const dbMismatch: string[] = [];
  const noUp: string[] = [];
  const todo: any[] = [];
  for (const e of entries) {
    const up = ups.get(e.symbol);
    if (!up) { noUp.push(e.symbol); continue; }
    // 计划文件里存的是「万元/百分比」两种原始量纲，各自独立不可互换
    const wantT = turnoverYuan(Number(e.new.turnover_upstream_wan ?? e.new.turnover / 10000));
    const wantTR = Number(e.new.turnover_rate_upstream_pct ?? e.new.turnover_rate);
    // 3a 上游 OHLCV 必须仍等于计划目标值
    const sameUp =
      Number(up[1]) === Number(e.new.open_price) &&
      Number(up[2]) === Number(e.new.close_price) &&
      Number(up[3]) === Number(e.new.high_price) &&
      Number(up[4]) === Number(e.new.low_price) &&
      Number(up[5]) === Number(e.new.volume);
    if (!sameUp) upMismatch.push(`${e.symbol} 上 ${up[1]}/${up[2]}/${up[3]}/${up[4]}/${up[5]} 计 ${e.new.open_price}/${e.new.close_price}/${e.new.high_price}/${e.new.low_price}/${e.new.volume}`);
    // 3b 复拉到的 idx7/idx8 与计划一致（上游未回溯修订）
    const trUp = Number(up[7]);
    const tUp = turnoverYuan(Number(up[8]));
    if (trUp !== wantTR || tUp !== wantT) {
      upMismatch.push(`${e.symbol} 上游周转已变：T ${tUp}≠${wantT} TR ${trUp}≠${wantTR}`);
    }
    // 4 库内 OHLCV+volume 必须已是终盘值（Step 3 已落地且此后无人改动）
    const c = cur.get(String(e.stock_id));
    if (!c) { dbMismatch.push(`${e.symbol} 库内无此行`); continue; }
    const sameDb =
      Number(c[1]) === Number(e.new.open_price) &&
      Number(c[2]) === Number(e.new.close_price) &&
      Number(c[3]) === Number(e.new.high_price) &&
      Number(c[4]) === Number(e.new.low_price) &&
      Number(c[5]) === Number(e.new.volume);
    if (!sameDb) {
      dbMismatch.push(`${e.symbol} 库 ${c[1]}/${c[2]}/${c[3]}/${c[4]}/${c[5]} 期望 ${e.new.open_price}/${e.new.close_price}/${e.new.high_price}/${e.new.low_price}/${e.new.volume}`);
      continue;
    }
    todo.push({ ...e, curT: c[6], curTR: c[7], wantT, wantTR });
  }

  if (noUp.length) {
    console.error(`✗ 拒绝执行：${noUp.length} 只标的本次未拉到上游日K：${noUp.join(',')}`);
    process.exit(4);
  }
  if (upMismatch.length) {
    console.error(`✗ 拒绝执行：上游与计划不一致 ${upMismatch.length} 行，前10：`);
    upMismatch.slice(0, 10).forEach((m) => console.error('  ' + m));
    process.exit(5);
  }
  console.log(`✓ 断言3 上游一致：${entries.length} 只标的 OHLCV 与周转口径逐值相符`);
  if (dbMismatch.length) {
    console.error(`✗ 拒绝执行：库内值与计划目标不符 ${dbMismatch.length} 行，前10：`);
    dbMismatch.slice(0, 10).forEach((m) => console.error('  ' + m));
    process.exit(6);
  }
  console.log(`✓ 断言4 库内已终盘：${todo.length} 行 OHLCV+volume 已等于终盘值`);

  console.log(`\n===== 待补写周转 ${todo.length} 行（样例10）=====`);
  for (const t of todo.slice(0, 10)) {
    console.log(`  ${t.symbol} T:${t.curT}→${t.wantT}  TR:${t.curTR}→${t.wantTR}`);
  }

  writeFileSync(BACKUP, JSON.stringify({ date: planDate, mode, kind: 'turnover-backfill', plan: todo }, null, 2));
  console.log(`\n备份已导出: ${BACKUP}`);

  if (DRY) {
    console.log('\nDRY-RUN 结束：未写库。');
    return;
  }

  // ── 只写 turnover 两列，带旧值条件防并发覆盖；created_at 不进 SET ──
  const before = fingerprint(planDate);
  console.log(`\n执行前指纹: ${before}`);
  let ok = 0; const fails: string[] = [];
  for (const t of todo) {
    try {
      const res = sql(`
        UPDATE daily_quotes SET turnover=${t.wantT}, turnover_rate=${t.wantTR}
        WHERE stock_id=${t.stock_id} AND trade_date='${planDate}'
          AND open_price=${t.new.open_price} AND close_price=${t.new.close_price}
          AND high_price=${t.new.high_price} AND low_price=${t.new.low_price}
          AND volume=${t.new.volume}
          AND turnover=${t.curT} AND turnover_rate=${t.curTR}`);
      if (res.length === 0 || res[0][0] === '0') fails.push(`${t.symbol}(并发变化,跳过)`);
      else ok++;
    } catch (e) {
      fails.push(`${t.symbol}:${(e as Error).message}`);
    }
  }
  console.log(`\n写入完成：成功 ${ok} / ${todo.length}，失败 ${fails.length}`);
  if (fails.length) fails.slice(0, 20).forEach((f) => console.log('  ' + f));
  const after = fingerprint(planDate);
  console.log(`\n执行后指纹: ${after}`);
  console.log(before === after ? '\n⚠ 指纹未变（异常：预期 turnover 应有变化）' : '\n✓ 指纹已变化');
}

async function main() {
  if (FROM_PLAN) {
    await applyFromPlan(FROM_PLAN);
    return;
  }
  if (!DATE) {
    console.error('必须指定 --date=YYYY-MM-DD（一次只跑一天，便于逐步复验）');
    process.exit(1);
  }
  const mode = APPLY ? 'APPLY（会写库）' : 'DRY-RUN（只读）';
  console.log(`P0-INTRADAY 4b  mode=${mode}  date=${DATE}`);
  console.log(`DB: ${DB_URL.replace(/:[^:@]*@/, ':***@')}\n`);

  // ── 断言 1：载体日 ──
  if (CARRIER_DAYS.includes(DATE)) {
    console.error(`✗ 拒绝执行：${DATE} 是载体日白名单成员（${CARRIER_DAYS.join(',')}）`);
    process.exit(2);
  }
  console.log(`✓ 断言1 载体日：${DATE} 不在白名单内`);

  // ── 断言 2：串位行排除后必须为 0 ──
  // ⚠️ 顺序至关重要：**先排除，再断言**。
  // 反过来（先断言范围内无串位行）会在 06-04 直接拒绝执行——因为那 4 行
  // 串位行的 created_at 恰好也落在预收盘口径内，与盘中污染行混在同一批。
  // team-lead 的裁决是「排除这41 行，其余照方案执行」，故排除是前置步骤。
  const EXCLUDE_IDX = `s.symbol NOT IN ('${INDEX_SYMBOLS.join("','")}')`;
  // EXCLUDE_BLEED 已是显式白名单（见文件头 BLEED_ROWS），此处直接用

  const bleedRows = sql(`
    SELECT s.symbol, q.close_price FROM daily_quotes q JOIN stocks s ON s.id=q.stock_id
    WHERE q.trade_date='${DATE}'
      AND NOT (${EXCLUDE_IDX}) AND (${EXCLUDE_BLEED})`);
  if (bleedRows.length > 0) {
    console.error(`✗ 拒绝执行：排除后仍残留 ${bleedRows.length} 行指数/串位行：`);
    bleedRows.forEach((r) => console.error(`    ${r[0]} close=${r[1]}`));
    process.exit(3);
  }
  const excludedCount = Number(
    sql(`
      SELECT count(*) FROM daily_quotes q JOIN stocks s ON s.id=q.stock_id
      WHERE q.trade_date='${DATE}' AND (NOT (${EXCLUDE_IDX}) OR (${EXCLUDE_BLEED}))`)[0][0],
  );
  console.log(`✓ 断言2 串位行：排除后0 行（已排除 ${excludedCount} 行，归P0-IDXBLEED）`);

  // ── 取候选行 ──
  // ⚠️ 判据以 **volume < 上游终值** 为准（team-lead 裁决，2026-10-12），
  // 这是唯一无阈值争议的铁证。`created_at < 15:00` 只是**缩小候选范围**的代理条件，
  // 不再作为「是否需重写」的判据—— 否则 08-10 这类收盘后写的行会被漏掉，
  // 而它们的 volume 若偏小同样说明数据有问题。
  const rows = sql(`
    SELECT s.symbol, q.stock_id, q.trade_date, q.open_price, q.close_price,
           q.high_price, q.low_price, q.volume, q.turnover, q.turnover_rate, q.created_at
    FROM daily_quotes q JOIN stocks s ON s.id=q.stock_id
    WHERE q.trade_date='${DATE}'
      AND ${EXCLUDE_IDX} AND NOT (${EXCLUDE_BLEED})
    ORDER BY s.symbol`);
  console.log(`候选行：${rows.length}（已排除指数行与串位行）`);

  const bySym = new Map<string, string[][]>();
  for (const r of rows) {
    if (!bySym.has(r[0])) bySym.set(r[0], []);
    bySym.get(r[0])!.push(r);
  }
  const needDays = Math.ceil(((Date.now() - new Date(`${DATE}T00:00:00Z`).getTime()) / 86_400_000 / 0.6645) * 1.35) + 10;
  console.log(`涉及标的 ${bySym.size} 只，拉取 ${needDays} 根日K\n`);

  // ── 拉上游，按 volume 判据筛选 ──
  const plan: any[] = [];
  const scanned: any[] = [];
  let cursor = 0;
  const syms = [...bySym.keys()];
  await Promise.all(
    Array.from({ length: CONC }, async () => {
      while (cursor < syms.length) {
        const sym = syms[cursor++];
        const tx = toTx(sym);
        if (!tx) continue;
        const day = await fetchUnadjusted(tx, needDays);
        if (!day) continue;
        const upMap = new Map<string, any>();
        for (const d of day) upMap.set(String(d[0]).slice(0, 10), d);
        const up = upMap.get(DATE);
        if (!up) continue;
        const r = bySym.get(sym)![0];
        const [, stockId, , , , , , , , , , created] = r;
        const dbV = Number(r[7]);
        const upV = Number(up[5]);
        // **唯一判据**：库内 volume 小于上游终值 ⟹ 该行是未走完的盘中快照
        const volShort = upV > 0 && dbV < upV;
        scanned.push({ symbol: sym, dbV, upV, volShort, created });
        if (!volShort) continue; // volume 一致 ⟹ 终盘值，不动
        plan.push({
          stock_id: stockId, symbol: sym, trade_date: DATE, created_at: created,
          old: { o: r[3], c: r[4], h: r[5], l: r[6], v: r[7], t: r[8], tr: r[9] },
          new: {
            open_price: Number(up[1]), close_price: Number(up[2]),
            high_price: Number(up[3]), low_price: Number(up[4]),
            volume: upV,
            /**
             * turnover 口径：`round(idx8) × 10000`，与 DataSyncService.ts:909 逐位一致
             * （先把万元四舍五入到整数万元再×10000；直接 idx8×10000 最多差 3800 元）。
             * idx7 是换手率(%)，**不是成交额** —— 曾误用 idx7 导致 3 个数量级事故。
             */
            turnover: Math.round(Number(up[8])) * 10000,
            turnover_rate: Number(up[7]),
          },
        });
      }
    })
  );

  // ── 断言 4：判据是否生效 ──
  const volShortCount = scanned.filter((s) => s.volShort).length;
  console.log(`\nvolume 判据扫描 ${scanned.length} 行，命中(需重写) ${volShortCount} 行`);
  if (volShortCount === 0) {
    console.log('该日无 volume 偏小行 → 判据未命中，无需重写（正常退出，不写库）。');
    return;
  }
  console.log(`\n===== 计划：${plan.length} 行待重写 =====`);
  const sample = plan.slice(0, 10);
  for (const p of sample) {
    console.log(
      `  ${p.symbol} O:${p.old.o}→${p.new.open_price} C:${p.old.c}→${p.new.close_price} ` +
      `H:${p.old.h}→${p.new.high_price} L:${p.old.l}→${p.new.low_price} V:${p.old.v}→${p.new.volume}`,
    );
  }
  if (plan.length > sample.length) console.log(`  ... 其余 ${plan.length - sample.length} 行`);

  // 备份（执行前必做）
  writeFileSync(BACKUP, JSON.stringify({ date: DATE, mode, plan }, null, 2));
  console.log(`\n备份已导出: ${BACKUP}（${plan.length} 行全字段）`);

  if (DRY) {
    console.log('\nDRY-RUN 结束：未写库。确认无误后加 --apply 执行。');
    return;
  }

  // ── 实际写入（逐行，带旧值条件防并发覆盖） ──
  const before = fingerprint(DATE);
  console.log(`\n执行前指纹: ${before}`);
  let ok = 0; const fails: string[] = [];
  for (const p of plan) {
    try {
      const res = sql(`
        UPDATE daily_quotes SET
          open_price=${p.new.open_price}, close_price=${p.new.close_price},
          high_price=${p.new.high_price}, low_price=${p.new.low_price},
          volume=${p.new.volume}${WITH_TURNOVER ? `,
          turnover=${p.new.turnover}, turnover_rate=${p.new.turnover_rate}` : ''}
        WHERE stock_id=${p.stock_id} AND trade_date='${DATE}'
          AND close_price=${p.old.c} AND volume=${p.old.v}`);
      if (res.length === 0 || res[0][0] === '0') fails.push(`${p.symbol}(并发变化,跳过)`);
      else ok++;
    } catch (e) {
      fails.push(`${p.symbol}:${(e as Error).message}`);
    }
  }
  console.log(`\n写入完成：成功 ${ok} / ${plan.length}，失败 ${fails.length}`);
  if (fails.length) {
    console.log('失败明细:');
    fails.slice(0, 20).forEach((f) => console.log('  ' + f));
  }
  const after = fingerprint(DATE);
  console.log(`\n执行后指纹: ${after}`);
  console.log(before === after ? '\n✓ 指纹一致（本步未改动任何数据）' : '\n⚠ 指纹已变化（符合预期：本步确有重写）');
}

main().catch((e) => { console.error('执行失败:', e); process.exit(1); });