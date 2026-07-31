/**
 * 一次性核查脚本：二级行业（申万2021 L2）真实覆盖率
 *
 * 用途：回答 F08 —— 「二级行业依赖 classifyStock 运行时反推，真实覆盖率未知」
 *
 * 统计口径（重要，别混淆）：
 *   A. total            = stocks 表 is_active=true 的行数
 *   B. l2ColNonEmpty    = industry_level2 列非 NULL 且非空串的行数（落库口径）
 *   C. l2ColMeaningful  = industry_level2 列既非空、又不是 '综合'/'未分类' 的行数
 *   D. runtimeKeyword   = classifyStock 走「关键词真命中」的股票数
 *                         判定：L1 有效 且 SUB_INDUSTRY_KEYWORDS[sub] 里有关键词命中 name
 *   E. runtimeFallback  = classifyStock 返回了 subs[0] 兜底（L1 有效但名称无任何关键词命中）
 *                         —— 这类**语义上是错的**，只是碰巧非空，不能算覆盖
 *   F. runtimeUnknown   = L1 反推失败 → industry='未分类'，subIndustry 也是 '未分类'
 *
 * 真实覆盖率 = D / A（只认关键词真命中；E 属于"看起来有值其实是猜的"）
 *
 * 运行：cd backend && npx tsx scripts/audit-industry-level2.ts
 * 数据源优先级：PostgreSQL（DATABASE_URL）→ 不可用则报错退出（不编数字）
 */

import 'dotenv/config';
import knex from 'knex';
import {
  classifyStock,
  SW_INDUSTRY_MAP,
  SUB_INDUSTRY_KEYWORDS,
} from '../../shared/industryClassification';

interface StockRow {
  symbol: string;
  name: string;
  industry: string | null;
  industry_level2: string | null;
}

/** 复刻 classifySubIndustry 的判定路径，区分「关键词真命中」与「subs[0] 兜底」 */
function diagnose(
  industry: string | null,
  name: string
): { l1: string; l2: string; kind: 'keyword' | 'fallback' | 'unknown' } {
  const { industry: l1, subIndustry: l2 } = classifyStock(industry ?? undefined, name);
  const subs = SW_INDUSTRY_MAP[l1];
  if (!subs || subs.length === 0) return { l1, l2, kind: 'unknown' };
  for (const sub of subs) {
    const kws = SUB_INDUSTRY_KEYWORDS[sub];
    if (kws?.some((kw) => name.includes(kw))) return { l1, l2, kind: 'keyword' };
  }
  return { l1, l2, kind: 'fallback' };
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[audit] 缺少 DATABASE_URL，无法取真实数据。拒绝输出估算数字，退出。');
    process.exit(1);
  }

  const db = knex({ client: 'pg', connection: url, pool: { min: 0, max: 4 } });
  let rows: StockRow[];
  try {
    const r = await db.raw(
      `SELECT symbol, name, industry, industry_level2
         FROM stocks WHERE is_active = true ORDER BY symbol`
    );
    rows = r.rows as StockRow[];
  } catch (err) {
    console.error('[audit] PostgreSQL 读取失败:', (err as Error).message);
    console.error('[audit] 不做估算、不编数字，退出。');
    await db.destroy();
    process.exit(1);
    return;
  }

  const total = rows.length;
  const UNKNOWN = new Set(['未分类', '综合', '']);

  let l2ColNonEmpty = 0;
  let l2ColMeaningful = 0;
  let keyword = 0;
  let fallback = 0;
  let unknown = 0;
  let colEqRuntime = 0;

  const fallbackSamples: StockRow[] = [];
  const unknownSamples: StockRow[] = [];
  const l1Dist = new Map<string, number>();
  const l2Dist = new Map<string, number>();

  for (const s of rows) {
    const col = (s.industry_level2 ?? '').trim();
    if (col !== '') l2ColNonEmpty++;
    if (col !== '' && !UNKNOWN.has(col)) l2ColMeaningful++;

    const d = diagnose(s.industry, s.name);
    if (d.kind === 'keyword') keyword++;
    else if (d.kind === 'fallback') {
      fallback++;
      if (fallbackSamples.length < 20) fallbackSamples.push(s);
    } else {
      unknown++;
      if (unknownSamples.length < 20) unknownSamples.push(s);
    }
    if (col === d.l2) colEqRuntime++;

    l1Dist.set(d.l1, (l1Dist.get(d.l1) ?? 0) + 1);
    l2Dist.set(d.l2, (l2Dist.get(d.l2) ?? 0) + 1);
  }

  const pct = (n: number): string => `${((n / total) * 100).toFixed(2)}%`;

  console.log('================ 二级行业覆盖率核查 ================');
  console.log(`数据源      : PostgreSQL ${url.replace(/:\/\/.*@/, '://***@')}`);
  console.log(`采样时间    : ${new Date().toISOString()}`);
  console.log('');
  console.log(`A 活跃股票总数            : ${total}`);
  console.log(`B industry_level2 非空行数 : ${l2ColNonEmpty} (${pct(l2ColNonEmpty)})`);
  console.log(`C 其中非'综合'/'未分类'    : ${l2ColMeaningful} (${pct(l2ColMeaningful)})`);
  console.log('');
  console.log('--- classifyStock 运行时反推 ---');
  console.log(`D 关键词真命中            : ${keyword} (${pct(keyword)})   ← 真实覆盖率`);
  console.log(`E subs[0] 兜底(语义存疑)  : ${fallback} (${pct(fallback)})`);
  console.log(`F 完全未分类              : ${unknown} (${pct(unknown)})`);
  console.log(`   D+E+F = ${keyword + fallback + unknown}（应等于 A=${total}）`);
  console.log('');
  console.log(`列值 == 运行时反推值的行数 : ${colEqRuntime} (${pct(colEqRuntime)})`);
  console.log(`唯一 L1 数 / 唯一 L2 数    : ${l1Dist.size} / ${l2Dist.size}`);
  console.log('');

  console.log('--- L1 分布 Top10 ---');
  [...l1Dist.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([k, v]) => console.log(`  ${k.padEnd(10)} ${v}`));
  console.log('');

  console.log('--- L2 分布 Top15 ---');
  [...l2Dist.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([k, v]) => console.log(`  ${k.padEnd(12)} ${v}`));
  console.log('');

  console.log(`--- 完全未分类 抽样 ${unknownSamples.length} 只 ---`);
  unknownSamples.forEach((s) =>
    console.log(`  ${s.symbol} ${s.name}  L1列=${s.industry ?? 'NULL'}  L2列=${s.industry_level2 ?? 'NULL'}`)
  );
  console.log('');

  console.log(`--- subs[0] 兜底 抽样 ${fallbackSamples.length} 只 ---`);
  fallbackSamples.forEach((s) => {
    const d = diagnose(s.industry, s.name);
    console.log(`  ${s.symbol} ${s.name}  L1列=${s.industry ?? 'NULL'} → 反推 ${d.l1}/${d.l2}`);
  });
  console.log('');

  console.log('================ 结论输入 ================');
  console.log(`真实覆盖率(关键词命中) = ${keyword}/${total} = ${pct(keyword)}`);
  console.log(`需人工兜底/补规则的量  = ${fallback + unknown} (${pct(fallback + unknown)})`);
  console.log('==========================================');

  await db.destroy();
}

main().catch((e) => {
  console.error('[audit] 未捕获异常:', e);
  process.exit(1);
});
