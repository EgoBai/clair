/**
 * Worker 自测：/api/search 与 POST /api/backtest/run 的契约与诚实性回归。
 *
 * 【为什么需要这个脚本】clair-worker/worker.js 是 Cloudflare Pages advanced mode
 * 的真实入口（_worker.js 与它逐字节相同），**没有构建步骤、也没有任何测试**，
 * 因此「加错一个字段名 / 漏注册一条路由」这类缺陷只能等部署到线上才暴露
 * （实测：/api/search 未注册 → 线上 404 → 前端「添加自选股」搜索框恒空）。
 *
 * 【怎么跑】node clair-worker/test/worker-contract.test.mjs
 *   - 零依赖，只用 node 内置能力
 *   - 需要能访问腾讯/新浪/东财行情接口（回测用例要真实 K 线）
 *   - 搜索用例只读 Worker 内置的静态股票清单，**完全离线可跑**
 *
 * 【断言的关键点】
 *   1. /api/search 必须路由到 handleSearch（不是 404）
 *   2. /api/search?q=600519 必须命中真实条目（真源 = 内置 5541 只 A 股清单）
 *   3. /api/search?q=<不存在的词> 必须诚实降级：success=false + dataSource='unavailable'
 *   4. 回测响应必须带 requestedRange / actualRange / rangeNote 三个字段，
 *      且字段名与 frontend/src/types/backtest.ts 的 BacktestResult 一致
 *   5. 区间被截断时，warnings 必须非空且含截断说明
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.join(__dirname, '..', 'worker.js');

// Worker 是 ESM（export default { fetch }），可直接 import 后调用其 fetch 处理器
const worker = (await import(WORKER_PATH)).default;

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e });
    console.log(`  ✗ ${name}\n      ${e.message}`);
  }
}

function envStub() {
  return { DEEPSEEK_API_KEY: '', DEEPSEEK_BASE_URL: '' };
}

async function callWorker(url, init) {
  const res = await worker.fetch(new Request(url, init), envStub(), {});
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`响应不是合法 JSON (status=${res.status}): ${text.slice(0, 200)}`);
  }
  return { status: res.status, body };
}

// ============================================================
// 一、/api/search
// ============================================================

console.log('\n/api/search');

await test('路由已注册：GET /api/search?q=600519 返回 200（不再是 404）', async () => {
  const { status, body } = await callWorker('https://clair-api.pages.dev/api/search?q=600519');
  assert.equal(status, 200, `期望 200，实际 ${status}`);
  assert.equal(body.success, true, 'success 应为 true');
});

await test('命中真实股票：600519 → 贵州茅台（symbol/name/market/industry 齐全）', async () => {
  const { body } = await callWorker('https://clair-api.pages.dev/api/search?q=600519');
  assert.equal(body.success, true);
  assert.equal(body.dataSource, 'real', '命中真实数据时 dataSource 应为 real');
  assert.ok(Array.isArray(body.data.results), 'data.results 应为数组');
  assert.ok(body.data.results.length > 0, '不应为空');
  const hit = body.data.results.find((r) => r.symbol === '600519');
  assert.ok(hit, `结果中应含 600519，实际 ${JSON.stringify(body.data.results.slice(0, 3))}`);
  assert.equal(hit.name, '贵州茅台');
  assert.equal(hit.market, 'SH');
  assert.ok(typeof hit.industry === 'string' && hit.industry.length > 0, 'industry 应为非空字符串');
});

await test('按名称命中：平安 → 含中国平安', async () => {
  const { body } = await callWorker('https://clair-api.pages.dev/api/search?q=' + encodeURIComponent('平安'));
  assert.equal(body.success, true);
  assert.equal(body.dataSource, 'real');
  const names = body.data.results.map((r) => r.name);
  assert.ok(names.includes('中国平安'), `结果应含中国平安，实际 ${JSON.stringify(names.slice(0, 5))}`);
});

await test('total 是数字且与 results 长度一致（信封顶层 + data 内两处）', async () => {
  const { body } = await callWorker('https://clair-api.pages.dev/api/search?q=600');
  assert.equal(typeof body.total, 'number', '信封顶层 total 应为数字');
  assert.equal(typeof body.data.total, 'number', 'data.total 应为数字');
  assert.equal(body.total, body.results.length, '顶层 total 应等于返回条数');
  assert.equal(body.data.total, body.results.length, 'data.total 应等于返回条数');
  assert.deepEqual(body.results, body.data.results, '顶层 results 与 data.results 应同源');
});

await test('前端消费路径可用：body.data.results 是数组（WatchlistPage.tsx:335 读的就是它）', async () => {
  const { body } = await callWorker('https://clair-api.pages.dev/api/search?q=600519');
  assert.ok(Array.isArray(body.data?.results),
    `body.data.results 必须是数组（前端按此取值），实际 ${JSON.stringify(body.data)}`);
  assert.ok(body.data.results.length > 0, '不应为空');
});

await test('无匹配时诚实降级：success=false + dataSource=unavailable + 空数组 + message', async () => {
  const { status, body } = await callWorker('https://clair-api.pages.dev/api/search?q=' + encodeURIComponent('zzz不存在的股票xyz'));
  assert.equal(body.success, false, '无匹配时 success 应为 false');
  assert.equal(body.dataSource, 'unavailable', '无匹配时 dataSource 应为 unavailable');
  assert.ok(Array.isArray(body.data.results), 'data.results 应为数组');
  assert.equal(body.data.results.length, 0, '无匹配时 results 应为空数组');
  assert.ok(body.message && body.message.length > 0, '应给出明确 message');
  assert.ok(typeof status === 'number');
});

await test('缺 q 参数时显式 400 + success=false', async () => {
  const { status, body } = await callWorker('https://clair-api.pages.dev/api/search');
  assert.equal(status, 400, `期望 400，实际 ${status}`);
  assert.equal(body.success, false);
  assert.equal(body.dataSource, 'unavailable');
  assert.ok(body.message && body.message.length > 0, '应给出明确 message');
});

await test('搜索真源是内置真实清单：命中结果不含任何 Math.random 生成的代码', async () => {
  const { body } = await callWorker('https://clair-api.pages.dev/api/search?q=60');
  const workerSrc = readFileSync(WORKER_PATH, 'utf8');
  // 搜索结果必须来自 FULL_STOCK_LIST 常量（静态真实清单），不是运行时随机生成
  assert.ok(workerSrc.includes('const FULL_STOCK_LIST'), 'worker 应内置 FULL_STOCK_LIST 真实清单');
  for (const r of body.data.results) {
    assert.match(r.symbol, /^\d{6}$/, `symbol 应为 6 位真实代码，实际 ${r.symbol}`);
  }
});

// ============================================================
// 二、POST /api/backtest/run 的区间披露
// ============================================================

console.log('\nPOST /api/backtest/run');

function assertRangeFields(body) {
  const d = body.data;
  assert.ok(d, '响应应含 data');
  assert.ok(d.requestedRange, '应含 requestedRange');
  assert.ok(d.actualRange, '应含 actualRange');
  assert.ok('rangeNote' in d, '应含 rangeNote');
  // 字段名必须与 frontend/src/types/backtest.ts 的 BacktestResult 一致
  assert.ok(typeof d.requestedRange.start === 'string', 'requestedRange.start 应为字符串');
  assert.ok(typeof d.requestedRange.end === 'string', 'requestedRange.end 应为字符串');
  assert.ok(typeof d.actualRange.start === 'string', 'actualRange.start 应为字符串');
  assert.ok(typeof d.actualRange.end === 'string', 'actualRange.end 应为字符串');
  assert.equal(typeof d.actualRange.klineCount, 'number', 'actualRange.klineCount 应为数字');
  assert.equal(typeof d.actualRange.truncated, 'boolean', 'actualRange.truncated 应为布尔');
  assert.equal(typeof d.rangeNote, 'string', 'rangeNote 应为字符串');
  assert.ok(d.rangeNote.includes('完整覆盖') || d.rangeNote.includes('未被完整覆盖'),
    `rangeNote 应说明覆盖情况，实际：${d.rangeNote}`);
}

await test('截断场景：endDate 落在无K线的日期时，披露 requestedRange/actualRange/rangeNote', async () => {
  const { status, body } = await callWorker('https://clair-api.pages.dev/api/backtest/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol: '600519', strategy: 'ma_cross', startDate: '2026-06-01', endDate: '2026-10-24', initialCapital: 1000000 }),
  });
  assert.equal(status, 200, `期望 200，实际 ${status}`);
  assert.equal(body.success, true);
  assertRangeFields(body);

  const d = body.data;
  assert.equal(d.requestedRange.start, '2026-06-01', 'requestedRange.start 应为请求值');
  assert.equal(d.requestedRange.end, '2026-10-24', 'requestedRange.end 应为请求值');

  // 实际区间不得超出请求区间（Worker 只做「向前裁剪」，不会凭空造数据）
  assert.ok(d.actualRange.start >= d.requestedRange.start, 'actualRange.start 不应早于请求起点');
  assert.ok(d.actualRange.end <= d.requestedRange.end, 'actualRange.end 不应晚于请求终点');

  if (d.actualRange.end !== d.requestedRange.end || d.actualRange.start !== d.requestedRange.start) {
    assert.equal(d.actualRange.truncated, true, '区间不一致时 truncated 应为 true');
    assert.ok(Array.isArray(d.warnings) && d.warnings.length > 0, '截断时 warnings 必须非空');
    assert.ok(d.warnings.some((w) => /不一致|后移|未/.test(w)),
      `warnings 应含截断说明，实际：${JSON.stringify(d.warnings)}`);
    assert.ok(d.rangeNote.includes('未被完整覆盖'), `截断时 rangeNote 应说明未被完整覆盖，实际：${d.rangeNote}`);
  } else {
    assert.equal(d.actualRange.truncated, false);
    assert.ok(d.rangeNote.includes('完整覆盖'), '未截断时 rangeNote 应说明已完整覆盖');
  }
});

await test('未截断场景：可用区间完整时 rangeNote 说明「完整覆盖」', async () => {
  const { body } = await callWorker('https://clair-api.pages.dev/api/backtest/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // 起止日都取上游确实有K线的交易日
    body: JSON.stringify({ symbol: '600519', strategy: 'ma_cross', startDate: '2026-06-02', endDate: '2026-10-23', initialCapital: 1000000 }),
  });
  assert.equal(body.success, true);
  assertRangeFields(body);
  const d = body.data;
  if (d.actualRange.truncated === false) {
    assert.equal(d.actualRange.start, d.requestedRange.start);
    assert.equal(d.actualRange.end, d.requestedRange.end);
    assert.ok(d.rangeNote.includes('完整覆盖'), `未截断时 rangeNote 应说明已完整覆盖，实际：${d.rangeNote}`);
  }
});

// ============================================================
// 三、双入口字节一致性（Cloudflare Pages advanced mode 的硬约束）
// ============================================================

console.log('\n部署入口一致性');

await test('_worker.js 与 worker.js 逐字节相同（否则线上跑的仍是旧代码）', async () => {
  const { createHash } = await import('node:crypto');
  const a = createHash('sha256').update(readFileSync(WORKER_PATH)).digest('hex');
  const b = createHash('sha256').update(readFileSync(path.join(__dirname, '..', '_worker.js'))).digest('hex');
  assert.equal(a, b, `两文件 SHA256 不一致：\n  worker.js  = ${a}\n  _worker.js = ${b}`);
  console.log(`      sha256 = ${a}`);
});

// ============================================================

console.log(`\n结果：${passed} 通过，${failed} 失败`);
if (failed > 0) {
  for (const f of failures) console.log(`\n失败：${f.name}\n${f.error.stack}`);
  process.exit(1);
}
