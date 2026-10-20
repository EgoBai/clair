#!/usr/bin/env npx tsx
/**
 * turnover 单位一致性校验（可接 CI）
 *
 * ## 权威口径
 * `daily_quotes.turnover`（numeric(20,2)）= **元**。上游腾讯（实时 parts[37] / K线 idx8）单位是万元，
 * 换算系数为 `WAN_TO_YUAN = 10000`（backend/src/utils/turnoverUnit.ts，单一真源）。
 *
 * ## 判据分层（r = turnover / (close_price × volume)，volume 单位决定基准）
 * | 层 | volume 单位 | 元（正确） | 万元（违规） |
 * |---|---|---|---|
 * | 主板个股 | 手（1手=100股） | r ≈ 100 | r ≈ 0.01 |
 * | 科创板 688/689 | 股 | r ≈ 1 | r ≈ 0.0001 |
 * | 指数行（industry='指数'） | — | **显式排除**（被除数是点位，比值无意义） |
 * | turnover = 0 | — | **单列统计，不算单位违规**（属"零值顶替空态"另一问题） |
 *
 * ## ⚠️ 盲区（本脚本兜不住的缺陷，务必知悉）
 * **比值分层发现不了"半残态"跨标的串位** —— 同一行的 O/C/H/L/V 属于标的 A、T/TR 属于标的 B 时，
 * 分子分母来自不同标的，比值算术上无意义，却可能落进"正常区间"。
 * 实证（000905.SZ 厦门港务被写入中证500 值）：
 *   - 06-03 那行 r=88.93 **落在主板的正常区间内**，本脚本完全区分不出；
 *   - 06-01/06-05/06-08 三行 r=70.01/73.70/56.07 偏离但不落入万元簇，同样不命中；
 *   - volume 判据（V 已是真值）与价格串位检测（C 是正常股价 9.34 非点位）也都是 0 命中。
 * **结论：只有与上游逐值比对（且对全部候选真身各比一遍、检查 C/V/T/TR 是否同源同日）才能暴露此类缺陷。**
 * 本脚本的比值分层只用于粗筛，**不得被当作"单位已校验通过"的证据**。
 *
 * ## 另注（派单前必看）
 * 别用单一阈值一把扫：实测 `r < 1e-4` 命中 1,258 行，其中 1,257 行其实是 `turnover=0`、
 * 真缺陷只有 1 行 —— 差三个数量级。先做量级分布分层再下结论。
 *
 * ## 用法
 *   npx tsx scripts/data/check-turnover-unit.ts          # 报告模式
 *   npx tsx scripts/data/check-turnover-unit.ts --strict # 有违规则 exit 1（CI 用）
 */
import { execFileSync } from 'node:child_process';

const PSQL = process.env.PSQL_BIN ?? '/opt/homebrew/opt/postgresql@15/bin/psql';
const DB = process.env.DB_URL ?? 'clair';
const STRICT = process.argv.includes('--strict');

function sql(q: string): string[][] {
  return execFileSync(PSQL, ['-d', DB, '-t', '-A', '-F', '|', '-c', q], {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  })
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => l.split('|'));
}

/** 各层的元/万元判据区间 */
const LAYERS = [
  {
    name: '主板个股(volume=手)',
    where: `s.symbol NOT LIKE '688%' AND s.symbol NOT LIKE '689%'`,
    yuan: [50, 200] as const,
    wan: [0.0075, 0.0125] as const,
  },
  {
    name: '科创板688/689(volume=股)',
    where: `(s.symbol LIKE '688%' OR s.symbol LIKE '689%')`,
    yuan: [0.5, 2.5] as const,
    wan: [7e-5, 1.2e-4] as const,
  },
];

export interface CheckResult {
  layer: string;
  total: number;
  yuan: number;
  wan: number;
  other: number;
  samples: string[][];
}

export function checkTurnoverUnit(): { layers: CheckResult[]; zeroTurnover: number; indexRows: number } {
  // 指数行（点位作除数，比值无意义）与 turnover=0 均不计入单位违规
  const indexRows = Number(
    sql(`SELECT count(*) FROM daily_quotes q JOIN stocks s ON s.id=q.stock_id
         WHERE s.industry = '指数'`)[0]?.[0] ?? '0',
  );
  const zeroTurnover = Number(sql(`SELECT count(*) FROM daily_quotes WHERE turnover = 0`)[0]?.[0] ?? '0');

  const layers: CheckResult[] = LAYERS.map((L) => {
    const base = `FROM daily_quotes q JOIN stocks s ON s.id=q.stock_id
      WHERE q.close_price > 0 AND q.volume > 0 AND q.turnover > 0
        AND s.industry <> '指数' AND ${L.where}`;
    const total = Number(sql(`SELECT count(*) ${base}`)[0]?.[0] ?? '0');
    const yuan = Number(
      sql(`SELECT count(*) ${base}
        AND q.turnover/(q.close_price*q.volume) BETWEEN ${L.yuan[0]} AND ${L.yuan[1]}`)[0]?.[0] ?? '0',
    );
    const wan = Number(
      sql(`SELECT count(*) ${base}
        AND q.turnover/(q.close_price*q.volume) BETWEEN ${L.wan[0]} AND ${L.wan[1]}`)[0]?.[0] ?? '0',
    );
    const samples = sql(`SELECT s.symbol, q.trade_date::text, q.turnover::text,
        round((q.turnover/(q.close_price*q.volume))::numeric, 6) ${base}
        AND q.turnover/(q.close_price*q.volume) BETWEEN ${L.wan[0]} AND ${L.wan[1]}
      ORDER BY q.trade_date LIMIT 10`);
    return { layer: L.name, total, yuan, wan, other: total - yuan - wan, samples };
  });

  return { layers, zeroTurnover, indexRows };
}

if (require.main === module) {
  const { layers, zeroTurnover, indexRows } = checkTurnoverUnit();
  console.log('=== turnover 单位一致性校验 ===');
  console.log(`权威口径: 元（上游万元 × WAN_TO_YUAN=10000）\n`);
  let violations = 0;
  for (const l of layers) {
    console.log(`${l.layer}`);
    console.log(`  有值行 ${l.total}   元簇(正确) ${l.yuan}   万元簇(违规) ${l.wan}   未归类 ${l.other}`);
    violations += l.wan;
    if (l.wan > 0) {
      console.log(`  违规样例:`);
      for (const s of l.samples) console.log(`    ${s[0]} ${s[1]}  T=${s[2]}  r=${s[3]}`);
    }
  }
  console.log(`\n指数行(industry='指数', 显式排除): ${indexRows}`);
  console.log(`turnover=0(单列统计, 不算单位违规): ${zeroTurnover}`);
  console.log(`\n⚠️ 盲区提醒: 比值分层兜不住「半残态」跨标的串位（000905 实证：r=88.93 落在正常区间），`);
  console.log(`   此类缺陷只有与上游逐值比对才能发现，本脚本通过 ≠ 单位无缺陷。`);

  const unclassified = layers.reduce((a, l) => a + l.other, 0);
  console.log(`\n结论: 万元簇违规 ${violations} 行，未归类 ${unclassified} 行`);
  if (STRICT && (violations > 0 || unclassified > 0)) {
    console.error('\n✗ --strict: 存在违规或未归类行');
    process.exit(1);
  }
  console.log('✓ 校验结束');
}
