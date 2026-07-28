/**
 * knowledgeRetrieval.ts 单元测试（RAG 一期检索引擎，独立可复现）
 * 运行方式（在 frontend/ 目录）：
 *   npx --yes tsx src/utils/__tests__/knowledgeRetrieval.test.mts
 *
 * 说明：与 demoData.regression.test.mts 同模式——tsx 直跑 + 极简断言，不经 vitest。
 * knowledgeStore 基于 localStorage，Node 环境无此全局对象，
 * 因此在 import 前注入内存版 localStorage shim（Map 实现）。
 *
 * 覆盖面：
 *   1. 分词/命中：中文 bigram、英文 token、大小写不敏感
 *   2. 字段加权：tags(×3) > question(×2) > answer(×1)
 *   3. symbol 精确命中 +5（query 内 token / opts.symbol 两条路径）
 *   4. 时间衰减：新笔记 > 旧笔记（同等词面命中时）
 *   5. limit 截断与降序排序
 *   6. 空态：空 query / 无命中(score<=0) / 空库
 *   7. buildRagContext：前缀/截断/空输入
 *
 * 退出码：存在失败项则 exit 1，否则 exit 0。
 */

// ---------- localStorage shim（必须在业务模块 import 之前生效） ----------
const mem = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => void mem.clear(),
  key: (i: number) => Array.from(mem.keys())[i] ?? null,
  get length() {
    return mem.size;
  },
};

const { retrieveRelevantNotes, buildRagContext } = await import('../knowledgeRetrieval');
type RetrievedNote = import('../knowledgeRetrieval').RetrievedNote;

const STORAGE_KEY = 'clair_knowledge_base';

interface SeedEntry {
  id: string;
  question: string;
  answer: string;
  category: string;
  tags: string[];
  page: string;
  symbol?: string;
  createdAt: string;
}

function seed(entries: SeedEntry[]): void {
  mem.set(STORAGE_KEY, JSON.stringify(entries));
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

// ---------- 极简断言框架 ----------
let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++;
    console.log(`  \u2705 ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`  \u274c ${name}${detail ? ' — ' + detail : ''}`);
  }
}

// ============================================================
console.log('\n[1] 分词与基础命中');
// ============================================================
seed([
  {
    id: 'n1',
    question: '贵州茅台的护城河是什么',
    answer: '品牌与渠道壁垒，高端白酒定价权',
    category: '产业知识',
    tags: ['白酒'],
    page: 't',
    symbol: '600519',
    createdAt: daysAgo(1),
  },
  {
    id: 'n2',
    question: 'ETF premium discount arbitrage',
    answer: 'IOPV deviation over threshold',
    category: '投资方法',
    tags: ['ETF'],
    page: 't',
    createdAt: daysAgo(1),
  },
]);

{
  const r = retrieveRelevantNotes('茅台的护城河');
  check('中文 bigram 命中：查询"茅台的护城河"命中 n1', r.length === 1 && r[0].id === 'n1', JSON.stringify(r.map(x => x.id)));
}
{
  const r = retrieveRelevantNotes('ETF arbitrage strategy');
  check('英文 token 命中：命中 n2', r.some(x => x.id === 'n2'), JSON.stringify(r.map(x => x.id)));
}
{
  const r = retrieveRelevantNotes('etf ARBITRAGE');
  check('大小写不敏感', r.some(x => x.id === 'n2'));
}
{
  const r = retrieveRelevantNotes('半导体设备国产化');
  check('无关查询不返回（score<=0 过滤）', r.length === 0, JSON.stringify(r.map(x => x.id)));
}

// ============================================================
console.log('\n[2] 字段加权 tags(3) > question(2) > answer(1)');
// ============================================================
seed([
  { id: 'tag', question: 'x', answer: 'y', category: '学习笔记', tags: ['新能源'], page: 't', createdAt: daysAgo(10) },
  { id: 'que', question: '新能源', answer: 'y', category: '学习笔记', tags: [], page: 't', createdAt: daysAgo(10) },
  { id: 'ans', question: 'x', answer: '新能源', category: '学习笔记', tags: [], page: 't', createdAt: daysAgo(10) },
]);
{
  const r = retrieveRelevantNotes('新能源');
  const order = r.map(x => x.id).join(',');
  check('加权排序 tag > question > answer', order === 'tag,que,ans', order);
  const s = Object.fromEntries(r.map(x => [x.id, x.score]));
  check('分数关系 tag>que>ans 且均>0', s.tag > s.que && s.que > s.ans && s.ans > 0, JSON.stringify(s));
}

// ============================================================
console.log('\n[3] symbol 精确命中 +5');
// ============================================================
seed([
  { id: 'sym', question: '茅台估值', answer: 'a', category: '产业知识', tags: [], page: 't', symbol: '600519', createdAt: daysAgo(10) },
  { id: 'nosym', question: '茅台估值', answer: 'a', category: '产业知识', tags: [], page: 't', createdAt: daysAgo(10) },
]);
{
  const r = retrieveRelevantNotes('600519 茅台估值怎么看');
  const s = Object.fromEntries(r.map(x => [x.id, x.score]));
  check('query 含 symbol token：sym 比 nosym 高约 +5', r[0]?.id === 'sym' && s.sym - s.nosym >= 4.9, JSON.stringify(s));
}
{
  const r = retrieveRelevantNotes('茅台估值', { symbol: '600519' });
  const s = Object.fromEntries(r.map(x => [x.id, x.score]));
  check('opts.symbol 命中：sym 排首且 +5', r[0]?.id === 'sym' && s.sym - s.nosym >= 4.9, JSON.stringify(s));
}

// ============================================================
console.log('\n[4] 时间衰减（180 天线性，≤+0.5）');
// ============================================================
seed([
  { id: 'fresh', question: '光伏景气度', answer: 'a', category: '学习笔记', tags: [], page: 't', createdAt: daysAgo(0) },
  { id: 'stale', question: '光伏景气度', answer: 'a', category: '学习笔记', tags: [], page: 't', createdAt: daysAgo(365) },
]);
{
  const r = retrieveRelevantNotes('光伏景气度');
  const s = Object.fromEntries(r.map(x => [x.id, x.score]));
  check('同词面命中时新笔记排前', r[0]?.id === 'fresh', JSON.stringify(r.map(x => x.id)));
  const diff = s.fresh - s.stale;
  check('衰减差值在 (0, 0.5] 区间', diff > 0 && diff <= 0.5 + 1e-9, `diff=${diff}`);
}

// ============================================================
console.log('\n[5] limit 与排序');
// ============================================================
seed(
  Array.from({ length: 8 }, (_, i) => ({
    id: `m${i}`,
    question: '医药集采影响',
    answer: 'a',
    category: '产业知识',
    tags: i < 4 ? ['医药'] : [],
    page: 't',
    createdAt: daysAgo(i),
  })),
);
{
  const r = retrieveRelevantNotes('医药集采影响');
  check('默认 limit=3', r.length === 3, `len=${r.length}`);
  const sorted = r.every((x, i) => i === 0 || r[i - 1].score >= x.score);
  check('结果按 score 降序', sorted, JSON.stringify(r.map(x => x.score)));
}
{
  const r = retrieveRelevantNotes('医药集采影响', { limit: 5 });
  check('limit=5 生效', r.length === 5, `len=${r.length}`);
}

// ============================================================
console.log('\n[6] 空态');
// ============================================================
{
  check('空 query 返回 []', retrieveRelevantNotes('').length === 0);
  check('纯符号 query 返回 []', retrieveRelevantNotes('！！！???').length === 0);
}
seed([]);
{
  check('空知识库返回 []', retrieveRelevantNotes('茅台').length === 0);
}

// ============================================================
console.log('\n[7] buildRagContext');
// ============================================================
{
  check('空输入返回空串', buildRagContext([]) === '');
}
{
  const notes: RetrievedNote[] = [
    { id: 'c1', category: '产业知识', question: '茅台护城河', answer: '品牌壁垒', tags: ['白酒'], symbol: '600519', score: 9 },
  ];
  const ctx = buildRagContext(notes);
  check('含引导前缀', ctx.startsWith('以下是用户个人投资笔记'));
  check('含 [分类] 问题 → 答案 #标签 结构', ctx.includes('[产业知识] 茅台护城河 → 品牌壁垒 #白酒'), ctx);
}
{
  const long: RetrievedNote[] = Array.from({ length: 3 }, (_, i) => ({
    id: `l${i}`,
    category: '学习笔记',
    question: 'Q'.repeat(100),
    answer: 'A'.repeat(500),
    tags: [],
    score: 5,
  }));
  const ctx = buildRagContext(long);
  check('单条 answer 截断至 ≤200+省略号', ctx.includes('A'.repeat(200) + '…') && !ctx.includes('A'.repeat(201)));
  check('整体 ≤1200+1（末尾省略号）', ctx.length <= 1201, `len=${ctx.length}`);
}

// ============================================================
console.log(`\n结果：${passed} passed / ${failed} failed`);
if (failed > 0) {
  console.log('失败项：\n - ' + failures.join('\n - '));
  process.exit(1);
}
process.exit(0);
