/**
 * 一次性核查脚本：F03 评分语义 + F01 meta 契约 真机验证
 *
 * 直接调用 service 层（不起 HTTP 服务、不 curl 轮询）：
 *  1) 真实拉腾讯概念板块 → 检查 meta.source / 评分区间 / 大跌板块不进高景气
 *  2) 落盘 concepts 表 → 检查 persistConcepts 返回值
 *  3) 断网模拟：把 fetch 打挂 → 检查是否回退 DB 缓存 (source='stale')
 *
 * 运行：cd backend && npx tsx scripts/verify-concept-meta.ts
 */

import 'dotenv/config';
import knex from 'knex';
import {
  fetchConceptBoardsWithMeta,
  scoreConceptBoards,
  persistConcepts,
  getConceptServiceCounters,
  __resetConceptCache,
} from '../src/services/conceptBoardService';

const HIGH_PROSPERITY_THRESHOLD = 70; // 前端 DiscoverPage scoreLabel 的「高景气」阈值

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  const db = url ? knex({ client: 'pg', connection: url, pool: { min: 0, max: 4 } }) : null;
  const knexLike = db ? { raw: (sql: string, b?: unknown[]) => db.raw(sql, b ?? []) } : null;

  console.log('========== [1] 实时拉取 + 评分 ==========');
  const { boards, meta } = await fetchConceptBoardsWithMeta(knexLike);
  console.log('meta =', JSON.stringify(meta));
  console.log('boards =', boards.length);

  if (boards.length === 0) {
    console.log('⚠️ 上游未返回数据，跳过评分核查（不编数字）');
  } else {
    const scores = scoreConceptBoards(boards);
    const min = Math.min(...scores.map((s) => s.score));
    const max = Math.max(...scores.map((s) => s.score));
    console.log(`score 区间: [${min}, ${max}]  (期望落在 0~100)`);

    const high = scores.filter((s) => s.score >= HIGH_PROSPERITY_THRESHOLD);
    const highButDown = high.filter((s) => s.avg_change_percent < 0);
    console.log(`「高景气」(score>=${HIGH_PROSPERITY_THRESHOLD}) 板块数: ${high.length}`);
    console.log(`其中 avg_change_percent < 0 的（不该存在）: ${highButDown.length}`);
    if (highButDown.length > 0) {
      console.log('❌ F03 未修复干净:', highButDown.slice(0, 5).map((s) => `${s.industry}(${s.avg_change_percent}%, ${s.score}分)`));
    } else {
      console.log('✅ F03: 无下跌板块被标为高景气');
    }

    console.log('\nTop5 (评分降序):');
    scores.slice(0, 5).forEach((s) =>
      console.log(`  ${s.industry.padEnd(12)} score=${String(s.score).padStart(3)} change=${s.changeScore} vol=${s.volumeScore} breadth=${s.breadthScore} volatility=${s.volatilityScore} 涨跌=${s.avg_change_percent}%`)
    );
    console.log('\nBottom5 (评分升序):');
    [...scores].reverse().slice(0, 5).forEach((s) =>
      console.log(`  ${s.industry.padEnd(12)} score=${String(s.score).padStart(3)} change=${s.changeScore} vol=${s.volumeScore} breadth=${s.breadthScore} volatility=${s.volatilityScore} 涨跌=${s.avg_change_percent}%`)
    );

    // 最跌的板块检查
    const worst = [...scores].sort((a, b) => a.avg_change_percent - b.avg_change_percent)[0];
    console.log(`\n跌幅最大板块: ${worst.industry} ${worst.avg_change_percent}% → score=${worst.score} (changeScore=${worst.changeScore}, volatilityScore=${worst.volatilityScore})`);
  }

  if (knexLike && boards.length > 0) {
    console.log('\n========== [2] 落盘 concepts 表 ==========');
    const r = await persistConcepts(knexLike, boards);
    console.log('persistConcepts =', JSON.stringify(r));
    const cnt = await db!.raw('SELECT count(*) AS n, max(updated_at) AS latest FROM concepts');
    console.log('concepts 表现状 =', JSON.stringify(cnt.rows[0]));
  }

  console.log('\n========== [3] 断网模拟 → stale 回退 ==========');
  __resetConceptCache();
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error('SIMULATED upstream outage');
  }) as typeof fetch;
  try {
    const r = await fetchConceptBoardsWithMeta(knexLike);
    console.log('meta =', JSON.stringify(r.meta));
    console.log('boards =', r.boards.length);
    if (r.meta.source === 'stale' && r.boards.length > 0) {
      console.log('✅ F01: 上游挂掉时成功回退 DB 历史缓存');
      const s = scoreConceptBoards(r.boards);
      console.log(`   回退数据可正常评分, Top1 = ${s[0].industry} ${s[0].score}分`);
    } else if (r.meta.source === 'unavailable') {
      console.log('⚠️ 回退失败（DB 无缓存或不可用），meta 已诚实标记 unavailable');
    }
  } finally {
    globalThis.fetch = realFetch;
  }

  console.log('\n========== 计数器 ==========');
  console.log(JSON.stringify(getConceptServiceCounters(), null, 2));

  if (db) await db.destroy();
}

main().catch((e) => {
  console.error('[verify] 未捕获异常:', e);
  process.exit(1);
});
