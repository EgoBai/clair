/**
 * demoData.ts 数据层回归测试（独立可复现）
 * 运行方式（在 frontend/ 目录）：
 *   npx --yes tsx src/utils/__tests__/demoData.regression.test.mts
 *
 * 说明：本脚本用 tsx 直接执行（不经 vitest），自带极简断言框架。
 * 用于验证本轮修复后 demoData.ts 的数据完整性：
 *   - DEMO_CONCEPTS / DEMO_L2_INDUSTRIES 形状
 *   - buildDemoMultidim 维度键完整性 / score 量程 / 确定性
 *   - buildDemoScores 是否如本轮修复说明那样从 demoData.ts 导出
 *
 * 退出码：存在失败项则 exit 1，否则 exit 0。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  DEMO_CONCEPTS,
  DEMO_L2_INDUSTRIES,
  DEMO_INDUSTRIES,
  buildDemoMultidim,
} from '../demoData';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++;
    console.log(`  \u2705 ${name}`);
  } else {
    failed++;
    const msg = `${name}${detail ? ' — ' + detail : ''}`;
    failures.push(msg);
    console.log(`  \u274c ${msg}`);
  }
}

// 期望的全部 14 个维度键（来自 DemoMultidimData.dimensions 类型 & 本轮修复说明）
const EXPECTED_DIM_KEYS = [
  'crowding', 'diffusion', 'concentration', 'retail', 'recovery', 'panic',
  'volatility', 'momIndex', 'searchHeat', 'spreadDegree', 'momentumPosition',
  'zScore', 'leverage', 'fundFlow',
];

async function main(): Promise<void> {
  console.log('\n=== [1] DEMO_CONCEPTS 形状完整性 ===');
  check('DEMO_CONCEPTS 长度 >= 8', DEMO_CONCEPTS.length >= 8, `len=${DEMO_CONCEPTS.length}`);
  for (const c of DEMO_CONCEPTS) {
    const ok =
      typeof c.industry === 'string' && c.industry.length > 0 &&
      typeof c.score === 'number' && c.score >= 0 && c.score <= 100 &&
      typeof c.stock_count === 'number' && c.stock_count >= 0 &&
      typeof c.avg_change_percent === 'number';
    check(
      `concept[${c.industry}] 关键字段有效(score 0-100)`,
      ok,
      JSON.stringify({ industry: c.industry, score: c.score, stock_count: c.stock_count, avg_change_percent: c.avg_change_percent }),
    );
  }

  console.log('\n=== [2] DEMO_L2_INDUSTRIES 形状完整性 ===');
  check('DEMO_L2_INDUSTRIES 长度 >= 15', DEMO_L2_INDUSTRIES.length >= 15, `len=${DEMO_L2_INDUSTRIES.length}`);
  const parentSet = new Set(DEMO_INDUSTRIES.map((i) => i.industry));
  for (const l2 of DEMO_L2_INDUSTRIES) {
    check(
      `L2[${l2.name}] parent 命中 DEMO_INDUSTRIES`,
      parentSet.has(l2.parent),
      `parent=${l2.parent}`,
    );
    check(
      `L2[${l2.name}] 含 parent/name/stock_count/avg_change`,
      typeof l2.name === 'string' && typeof l2.stock_count === 'number' && typeof l2.avg_change === 'string',
      JSON.stringify(l2),
    );
  }

  console.log('\n=== [3] buildDemoMultidim 维度键 / 量程 / 确定性 ===');
  const input = [{ industry: '银行' }, { industry: '白酒' }, { industry: 'AI算力' }];
  const map = buildDemoMultidim(input);
  check('buildDemoMultidim 返回 map 含全部输入板块', input.every((s) => map[s.industry]), JSON.stringify(Object.keys(map)));
  for (const ind of input.map((s) => s.industry)) {
    const d = map[ind];
    const keys = Object.keys(d?.dimensions ?? {});
    const missing = EXPECTED_DIM_KEYS.filter((k) => !keys.includes(k));
    check(`[${ind}] 含全部 14 维度键`, missing.length === 0, missing.length ? `缺失: ${missing.join(', ')}` : '');
    for (const k of EXPECTED_DIM_KEYS) {
      const dim = (d?.dimensions as any)?.[k];
      if (!dim) continue; // 缺失键已由上方 check 记录
      check(`  [${ind}] ${k} 含 {score,label}`, typeof dim.score === 'number' && typeof dim.label === 'string', JSON.stringify(dim));
      check(`  [${ind}] ${k} score ∈ [0,20]`, dim.score >= 0 && dim.score <= 20, `score=${dim.score}`);
    }
  }
  // 确定性：同输入两次调用应完全一致（无随机数）
  const a = buildDemoMultidim(input);
  const b = buildDemoMultidim(input);
  check('buildDemoMultidim 确定性(同输入两次结果相同)', JSON.stringify(a) === JSON.stringify(b));

  console.log('\n=== [4] buildDemoScores 是否从 demoData.ts 导出 ===');
  // 本轮修复说明：demoData.ts 新增导出 buildDemoScores。实际代码仅在 DiscoverPage.tsx 局部定义。
  // 用动态 import 容忍其缺失，避免整脚本崩溃，但缺失本身即为源码缺陷。
  let demoModule: Record<string, any> = {};
  try {
    demoModule = await import('../demoData');
  } catch (e) {
    check('demoData 模块可加载', false, String(e));
  }
  const buildDemoScores = demoModule.buildDemoScores;
  check(
    'demoData 导出 buildDemoScores',
    typeof buildDemoScores === 'function',
    'buildDemoScores 未从 demoData.ts 导出（仅在 DiscoverPage.tsx 局部定义，与本轮修复说明矛盾）',
  );
  if (typeof buildDemoScores === 'function') {
    const conceptScores = buildDemoScores('concept');
    check(
      "buildDemoScores('concept') 长度 = DEMO_CONCEPTS",
      Array.isArray(conceptScores) && conceptScores.length === DEMO_CONCEPTS.length,
      `${conceptScores?.length} vs ${DEMO_CONCEPTS.length}`,
    );
    const industryScores = buildDemoScores('industry');
    check(
      "buildDemoScores('industry') 长度 = DEMO_INDUSTRIES",
      Array.isArray(industryScores) && industryScores.length === DEMO_INDUSTRIES.length,
      `${industryScores?.length} vs ${DEMO_INDUSTRIES.length}`,
    );
  }

  console.log('\n=== [5] DEMO_L2_INDUSTRIES.avg_change 数据契约（符号源真相） ===');
  // 本轮修复点（二级板块涨幅 ++2.95%）：avg_change 字符串"本身已带符号"是既定契约，
  // 1144 行「涨幅 {s.avg_change}%」依赖该格式。故此处锁定"带符号"为正确形态，而非 bug。
  const SIGNED_RE = /^[+-]\d+(\.\d+)?$/;
  for (const l2 of DEMO_L2_INDUSTRIES) {
    const ac = l2.avg_change;
    check(
      `L2[${l2.name}] avg_change 为带符号字符串(如 +2.95 / -1.35)`,
      typeof ac === 'string' && SIGNED_RE.test(ac),
      JSON.stringify({ name: l2.name, avg_change: ac }),
    );
    // 数据层本身不得出现"双重符号/脏值"——这正是 symbol-dup 静态扫描针对的源真相判据。
    check(
      `L2[${l2.name}] avg_change 无 ++/NaN/undefined 脏值`,
      !ac.includes('++') && !/NaN|undefined/.test(ac),
      JSON.stringify({ name: l2.name, avg_change: ac }),
    );
  }

  console.log('\n=== [6] 二级板块涨幅"双重符号"渲染基线（防 ++ 复发） ===');
  // 复现本轮 bug 类（symbol-dup）：源码手动加 '+' 且数据本身已带 '+'，拼接成 ++2.95%。
  // 基线分两路，对应 guard 对"源码字面量 vs 渲染文本"的区分扫描：
  //   (a) 源码层面：DiscoverPage.tsx 不得再含"手动加号 + 数据拼接"的 bug 模式；
  //   (b) 渲染层面：用修复后逻辑拼接每个 L2 项，断言渲染文本永不出现 ++。
  const discoverPath = fileURLToPath(new URL('../../pages/DiscoverPage.tsx', import.meta.url));
  let discoverSrc = '';
  try {
    discoverSrc = readFileSync(discoverPath, 'utf8');
  } catch (e) {
    check('可读 DiscoverPage.tsx 源码', false, String(e));
  }
  check('可读 DiscoverPage.tsx 源码', discoverSrc.length > 0);

  // (a) 禁止的 bug 模式：Number(x) >= 0 ? '+' : '' 紧接 {x} 拼接
  const BUG_PATTERN = /Number\(\s*s\.avg_change\s*\)\s*>=\s*0\s*\?\s*'\+'\s*:\s*''\s*\}\{s\.avg_change\}/;
  check(
    'DiscoverPage.tsx 不含"手动加号+数据"双重符号 bug 模式',
    !BUG_PATTERN.test(discoverSrc),
    '源码仍存在 {Number(s.avg_change) >= 0 ? "+" : ""}{s.avg_change} 拼接',
  );
  //     固定渲染语法 {s.avg_change}% 必须存在（修复后的正确形态）
  check(
    'DiscoverPage.tsx 存在修复后渲染语法 {s.avg_change}%',
    /\{\s*s\.avg_change\s*\}%/g.test(discoverSrc),
  );

  // (b) 渲染层面：用修复后逻辑（直接拼接带符号字符串）模拟每项输出，断言无 ++
  let renderHasDouble = false;
  const badRenders: string[] = [];
  for (const l2 of DEMO_L2_INDUSTRIES) {
    const rendered = `${l2.avg_change}%`; // 修复后组件渲染形态
    if (rendered.includes('++')) {
      renderHasDouble = true;
      badRenders.push(`L2[${l2.name}]=${rendered}`);
    }
  }
  check(
    '修复后渲染文本永不出现 ++（双重符号）',
    !renderHasDouble,
    badRenders.length ? badRenders.join('; ') : '',
  );

  console.log('\n========================================');
  console.log(`通过: ${passed} | 失败: ${failed}`);
  if (failed > 0) {
    console.log('失败项:');
    failures.forEach((f) => console.log('  - ' + f));
    console.log('========================================\n');
    process.exit(1);
  }
  console.log('全部通过 \u2705');
  console.log('========================================\n');
  process.exit(0);
}

main().catch((e) => {
  console.error('回归脚本执行异常:', e);
  process.exit(2);
});
