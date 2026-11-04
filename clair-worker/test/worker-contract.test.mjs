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
// 三、/api/market/kline + top-gainers/losers + index-tech
// （IndexDetailPage.tsx 消费的三组路由，此前未注册 → 线上 404）
// ============================================================

console.log('\n/api/market/kline');

await test('K线：sz399006&days=10 → 200、dataSource=real、并行数组等长', async () => {
  const { status, body } = await callWorker('https://clair-api.pages.dev/api/market/kline?symbol=sz399006&days=10');
  assert.equal(status, 200, `期望 200，实际 ${status}`);
  assert.equal(body.success, true);
  assert.equal(body.dataSource, 'real', '有真实K线时 dataSource 应为 real');
  const d = body.data;
  assert.ok(Array.isArray(d.dates) && d.dates.length > 0, 'dates 应为非空数组');
  assert.ok(d.dates.length <= 10, `days=10 时 dates 不应超过 10 根，实际 ${d.dates.length}`);
  // 前端 IndexDetailPage.tsx:126-151 按并行数组取值，长度必须一致
  for (const key of ['opens', 'prices', 'highs', 'lows', 'volumes']) {
    assert.ok(Array.isArray(d[key]), `data.${key} 应为数组`);
    assert.equal(d[key].length, d.dates.length, `data.${key} 与 dates 长度应一致`);
  }
  // 日期格式与数值合理性（不臆造：close 必须落在 [low, high] 内）
  assert.match(d.dates[0], /^\d{4}-\d{2}-\d{2}$/, '日期应为 YYYY-MM-DD');
  for (let i = 0; i < d.dates.length; i++) {
    assert.ok(d.prices[i] > 0, 'close 应为正数（不返回 0 冒充）');
    assert.ok(d.highs[i] >= d.prices[i] && d.prices[i] >= d.lows[i],
      `close 应在 [low, high] 内，第 ${i} 行：h=${d.highs[i]} c=${d.prices[i]} l=${d.lows[i]}`);
  }
  assert.ok(d.source === 'tencent' || d.source === 'sina' || d.source === 'eastmoney',
    `source 应为真实来源标注，实际 ${d.source}`);
});

await test('K线：缺 symbol 参数 → 显式 400 + 中文 message', async () => {
  const { status, body } = await callWorker('https://clair-api.pages.dev/api/market/kline');
  assert.equal(status, 400, `期望 400，实际 ${status}`);
  assert.equal(body.success, false);
  assert.ok(body.error && body.error.length > 0, '应给出明确 error message');
});

await test('K线：纯 6 位代码（无市场信息）→ 拒绝猜测，显式 400', async () => {
  // 000001 同时是上证指数与平安银行，无市场信息时宁拒不猜（诚实 > 好看）
  const { status, body } = await callWorker('https://clair-api.pages.dev/api/market/kline?symbol=000001');
  assert.equal(status, 400, `期望 400，实际 ${status}`);
  assert.equal(body.success, false);
  assert.ok(/symbol/i.test(body.error || ''), 'error 应说明 symbol 问题');
});

console.log('\n/api/market/top-gainers | top-losers');

for (const kind of ['gainers', 'losers']) {
  await test(`${kind}：→ 200、real、字段齐、symbol 为裸 6 位、change_percent 可转数字`, async () => {
    const { status, body } = await callWorker(`https://clair-api.pages.dev/api/market/top-${kind}?limit=10`);
    assert.equal(status, 200, `期望 200，实际 ${status}`);
    assert.equal(body.success, true, `有真实行情时 success 应为 true：${JSON.stringify(body).slice(0, 200)}`);
    assert.equal(body.dataSource, 'real');
    const list = body.data[kind === 'gainers' ? 'topGainers' : 'topLosers'];
    assert.ok(Array.isArray(list) && list.length > 0, '榜单应为非空数组');
    assert.ok(list.length <= 10, '不应超过 limit=10');
    for (const row of list) {
      assert.match(row.symbol, /^\d{6}$/, `symbol 应为裸 6 位代码，实际 ${row.symbol}`);
      assert.ok(typeof row.name === 'string' && row.name.length > 0, 'name 应为非空字符串');
      assert.ok(typeof row.close_price === 'number' && row.close_price > 0, 'close_price 应为正数');
      const pct = parseFloat(row.change_percent);
      assert.ok(Number.isFinite(pct), `change_percent 应可转数字，实际 ${row.change_percent}`);
      assert.ok(Math.abs(pct) <= 44, `change_percent 超出 A 股涨跌停物理范围，疑似脏数据：${row.change_percent}`);
    }
  });
}

await test('top-gainers：limit=3 只返回 3 条（上限 50 封顶）', async () => {
  const { body } = await callWorker('https://clair-api.pages.dev/api/market/top-gainers?limit=3');
  const list = body.data.topGainers;
  assert.ok(list.length <= 3, `limit=3 时不应超过 3 条，实际 ${list.length}`);
});

console.log('\n/api/market/index-tech');

await test('index-tech：sz399006 → real、rsi14∈[0,100]、compositeScore∈[0,100]、契约字段齐', async () => {
  const { status, body } = await callWorker('https://clair-api.pages.dev/api/market/index-tech/sz399006');
  assert.equal(status, 200, `期望 200，实际 ${status}`);
  assert.equal(body.success, true);
  assert.equal(body.dataSource, 'real');
  const d = body.data;
  assert.equal(d.indexSymbol, 'sz399006');
  assert.ok(d.indexName && d.indexName.length > 0, 'indexName 应为非空字符串');
  assert.match(d.asOf, /^\d{4}-\d{2}-\d{2}$/, 'asOf 应为 YYYY-MM-DD 交易日');
  assert.ok(d.source === 'tencent' || d.source === 'sina' || d.source === 'eastmoney',
    `source 应为真实来源标注，实际 ${d.source}`);
  for (const k of ['ma5', 'ma10', 'ma20', 'ma60']) {
    const v = d.ma[k];
    if (v !== null) assert.ok(typeof v === 'number' && v > 0, `ma.${k} 为数值时应为正数，实际 ${v}`);
  }
  assert.ok(d.rsi14 === null || (d.rsi14 >= 0 && d.rsi14 <= 100), `rsi14 应在 [0,100]，实际 ${d.rsi14}`);
  assert.ok(Number.isInteger(d.compositeScore) && d.compositeScore >= 0 && d.compositeScore <= 100,
    `compositeScore 应为 0-100 整数，实际 ${d.compositeScore}`);
  assert.ok(typeof d.positionAdvice === 'string' && d.positionAdvice.includes('规则'),
    'positionAdvice 应为中文且标注规则计算属性');
});

await test('诚实性：worker.js 全文无 Math.random（禁止任何随机值冒充数据）', async () => {
  const workerSrc = readFileSync(WORKER_PATH, 'utf8');
  assert.ok(!workerSrc.includes('Math.random'), 'worker.js 不得包含 Math.random');
});

// ============================================================
// 三·二、多模块路由可达性（此前线上 18 条 404）
//
// 【为什么必须有这一节】2026-11-01 实测线上 https://clair-api.pages.dev 上
// 下列 18 条端点全部返回 404 `{"success":false,"error":"Not found"}`，前端只能
// 显示「接口请求失败」，用户看到的是「多模块数据不可用」——看起来像产品坏了。
// 而真相分两类：① 能接真实源但没挂路由（P0/P1）；② 无真实源（P2）。
// 两类都必须「HTTP 200 + dataSource」，**绝不允许再用 404 表达任何一类**：
//   · 404 会被 frontend/src/utils/apiStatus.ts 判成 `not-deployed`（环境没挂接口）
//   · 2xx + dataSource:'unavailable' 才被判成 `unavailable`（接口在、该口径没数据）
//   · 2xx + dataSource:'real'/'static' 才是真有内容
// ============================================================

console.log('\n多模块路由可达性（原 18 条 404）');

/**
 * 每条路由的最低可接受形态。
 * real/static 类断言内容非空壳；unavailable 类断言「有中文原因 + 无伪造数值」。
 * 真实源端点允许「上游临时不可达 → unavailable」，但**不允许 404**、不允许空壳。
 */
const MULTI_MODULE_ROUTES = [
  { path: '/api/market/realtime', allow: ['real'] },
  { path: '/api/breadth/current', allow: ['tencent'] },
  { path: '/api/etf/list', allow: ['real'] },
  { path: '/api/macro/overview', allow: ['real', 'partial'] },
  { path: '/api/block-trades', allow: ['realtime', 'unavailable'] },
  { path: '/api/top-traders/overview', allow: ['eastmoney', 'unavailable'] },
  { path: '/api/top-traders/seat/rank', allow: ['eastmoney', 'unavailable'] },
  { path: '/api/lockup/calendar', allow: ['real', 'unavailable'] },
  { path: '/api/north-bound/overview', allow: ['real', 'unavailable'] },
  { path: '/api/hk-connect/summary', allow: ['real', 'unavailable'] },
  { path: '/api/margin/overview', allow: ['unavailable'] },
  { path: '/api/event-calendar/events', allow: ['unavailable'] },
  { path: '/api/financials/summary', allow: ['real', 'unavailable'] },
  { path: '/api/news/research/reports', allow: ['unavailable'] },
  { path: '/api/risk-center/portfolio', allow: ['unavailable'] },
  { path: '/api/strategy-templates', allow: ['static'] },
  { path: '/api/backtest/presets', allow: ['static'] },
];

for (const { path: p, allow } of MULTI_MODULE_ROUTES) {
  await test(`${p} → 200（不再 404）+ dataSource ∈ {${allow.join('|')}}`, async () => {
    const { status, body } = await callWorker('https://clair-api.pages.dev' + p);
    assert.equal(status, 200, `期望 200，实际 ${status}（404 会让前端显示「接口请求失败」）`);
    assert.notEqual(body.error, 'Not found', '不得再返回路由未命中的 404 体');
    assert.ok(typeof body.dataSource === 'string' && body.dataSource.length > 0,
      `顶层必须有 dataSource，实际 ${JSON.stringify(body).slice(0, 200)}`);
    assert.ok(allow.includes(body.dataSource),
      `dataSource 应为 ${allow.join('/')}，实际 ${body.dataSource}`);
    assert.ok(body.data && typeof body.data === 'object', '应含 data 对象（空态也要给形状）');
    // 顶层与 data 内两处 dataSource 必须同源，杜绝「两级 dataSource 互相矛盾」。
    // 例外：data 为数组的端点（etf/list）没有 data 内层，dataSource 只在顶层。
    if (!Array.isArray(body.data)) {
      assert.equal(body.data.dataSource, body.dataSource,
        `顶层 ${body.dataSource} 与 data.dataSource ${body.data.dataSource} 必须一致`);
    }
    if (body.dataSource === 'unavailable') {
      assert.equal(body.success, false, '诚实不可用时 success 必须为 false');
      assert.ok(typeof body.message === 'string' && body.message.length > 10, '必须给出中文原因');
      assert.ok(body.message.length > 0 && /[\u4e00-\u9fa5]/.test(body.message), 'message 必须是中文');
    } else {
      assert.equal(body.success, true, `${body.dataSource} 态下 success 应为 true`);
    }
  });
}

// ============================================================
// 三·三、真实源的「内容证」：断言不是空壳
// ============================================================

console.log('\n多模块真实内容（非空壳）');

await test('market/realtime：三大指数均为真实点位（价格>0、涨跌幅有限、名称含汉字）', async () => {
  const { body } = await callWorker('https://clair-api.pages.dev/api/market/realtime');
  assert.equal(body.dataSource, 'real');
  for (const key of ['shanghai', 'shenzhen', 'chinext']) {
    const q = body.data[key];
    assert.ok(q, `缺少 ${key}`);
    assert.ok(typeof q.price === 'number' && q.price > 0, `${key}.price 应为正数，实际 ${q.price}`);
    assert.ok(Number.isFinite(q.changePct) && Math.abs(q.changePct) < 20,
      `${key}.changePct 应为有限且合理的百分数，实际 ${q.changePct}`);
    assert.ok(/[\u4e00-\u9fa5]/.test(q.name || ''),
      `${key}.name 必须含汉字（GBK 解码失配会变乱码，禁止乱码冒充 real），实际 ${JSON.stringify(q.name)}`);
  }
  // breadth 允许为 null（行情不可得），但绝不允许是「全 0 假分布」
  if (body.data.breadth) {
    const b = body.data.breadth;
    assert.ok(b.up + b.down > 1000, `breadth 涨跌家数合计应 >1000，实际 ${b.up}+${b.down}`);
  }
});

await test('breadth/current：涨跌家数自洽（adv+dec+flat===total）、newHighs 诚实为 null', async () => {
  const { body } = await callWorker('https://clair-api.pages.dev/api/breadth/current');
  assert.equal(body.dataSource, 'tencent');
  const d = body.data;
  assert.equal(d.advancing + d.declining + d.unchanged, d.totalStocks,
    '涨/跌/平之和应等于 totalStocks');
  assert.ok(d.totalStocks > 4000, `全市场标的应 >4000，实际 ${d.totalStocks}`);
  assert.ok(d.turnover > 1e11, `全市场成交额应 >1000 亿（1e11 元），实际 ${d.turnover}`);
  // 新高/新低腾讯源不提供 → 必须 null，绝不能是 0（0 会被读成「今日无新高」）
  assert.equal(d.newHighs, null, 'newHighs 应为 null（不可用 ≠ 0）');
  assert.equal(d.newLows, null, 'newLows 应为 null（不可用 ≠ 0）');
  assert.ok(d.unavailableFields.includes('newHighs') && d.unavailableFields.includes('newLows'));
  assert.ok(d.quotedSymbols <= d.requestedSymbols,
    `报价数(${d.quotedSymbols})不应超过清单数(${d.requestedSymbols})——超过说明指数行串进了个股`);
  assert.ok(['bullish', 'bearish', 'neutral'].includes(d.marketSentiment));
  assert.ok(d.sentimentScore >= -100 && d.sentimentScore <= 100);
});

await test('etf/list：扁平契约 json.data 为数组、覆盖率自洽、premiumRate 只在行情+净值都有时才给数', async () => {
  const { body } = await callWorker('https://clair-api.pages.dev/api/etf/list');
  assert.equal(body.dataSource, 'real');
  // 2026-11-04 契约变更：data 由 {data:[...]} 拍平为直接数组（与 Express 侧 #107-C8 同形），
  // 元信息提到顶层。这条断言防止任何人把它改回双层嵌套。
  const d = body.data;
  assert.ok(Array.isArray(d) && d.length > 0, 'data 应为非空数组（ETFPage 读的就是它）');
  assert.equal(body.count, d.length, 'count 必须等于数组长度');
  for (const e of d) {
    assert.match(e.symbol, /^\d{6}$/, `ETF 代码应为 6 位，实际 ${e.symbol}`);
    assert.ok(e.name.length > 0);
    if (e.premiumRate !== null) {
      assert.ok(typeof e.price === 'number' && e.price > 0 && e.nav > 0,
        `premiumRate 有数时必须同时有真实 price 与 nav：${JSON.stringify(e)}`);
      const expected = +(((e.price - e.nav) / e.nav) * 100).toFixed(2);
      // 用容差比较而非严格相等：±0.00 的 -0/0 与两位小数舍入会让 Object.is 判失败
      assert.ok(Math.abs(e.premiumRate - expected) <= 0.011,
        `premiumRate(${e.premiumRate}) 必须由真实 price(${e.price})/nav(${e.nav}) 算出，期望≈${expected}`);
    }
    // 无真实源的四个字段必须 null（P0-LEAK C-3）
    for (const k of ['trackingError', 'dividendYield', 'expenseRatio', 'holdings']) {
      assert.equal(e[k], null, `${k} 无真实源，必须为 null`);
      assert.equal(e.fieldSources[k], 'unavailable');
    }
  }
  assert.match(body.quoteCoverage, /^\d+\/\d+$/, 'quoteCoverage 应在顶层');
});

await test('macro/overview：core 六张卡齐全、不可用卡 valueText=不可用（不是 0）、无编造序列', async () => {
  const { body } = await callWorker('https://clair-api.pages.dev/api/macro/overview');
  assert.ok(['real', 'partial'].includes(body.dataSource));
  const core = body.data.core;
  assert.equal(core.length, 6, `core 应为 6 张卡，实际 ${core.length}`);
  const labels = core.map((c) => c.label);
  for (const want of ['上涨家数', '下跌家数', '涨停家数', '上涨板块占比', '板块平均涨幅', '全市场成交额']) {
    assert.ok(labels.includes(want), `缺少卡片「${want}」，实际 ${labels.join('/')}`);
  }
  for (const c of core) {
    assert.equal(typeof c.available, 'boolean');
    assert.ok(['up', 'down', 'flat'].includes(c.direction));
    assert.ok(Array.isArray(c.series));
    if (c.available === false) {
      assert.equal(c.valueText, '不可用', `不可用卡不得给数值，实际 ${c.valueText}`);
      assert.equal(c.series.length, 0, '不可用卡不得有序列');
    }
    // series 只允许空数组：Worker 无盘中快照落库，凭空造序列即造假
    assert.equal(c.series.length, 0, `series 必须为空（无历史快照落库），实际 ${c.series.length}`);
  }
  // 无真实源的三块必须空数组 + 字段级标注
  for (const k of ['trend24', 'rates', 'calendar']) {
    assert.deepEqual(body.data[k], [], `${k} 无真实源，应为空数组而不是编造内容`);
    assert.equal(body.data.fields[k], 'unavailable');
  }
});

await test('block-trades：真实记录 + 分页与汇总自洽（count 与 trades 长度一致）', async () => {
  const { body } = await callWorker('https://clair-api.pages.dev/api/block-trades?pageSize=5');
  assert.equal(body.dataSource, 'realtime');
  const d = body.data;
  assert.match(d.date, /^\d{4}-\d{2}-\d{2}$/, `应回填真实数据日期，实际 ${d.date}`);
  assert.ok(Array.isArray(d.trades) && d.trades.length > 0, '默认视图应有真实记录');
  assert.ok(d.trades.length <= 5, 'pageSize=5 时不应超过 5 条');
  for (const t of d.trades) {
    assert.match(t.symbol, /^\d{6}$/);
    assert.ok(t.amount > 0 && t.price > 0 && t.volume > 0, `金额/价格/量应为正数：${JSON.stringify(t)}`);
    assert.ok(Number.isFinite(t.discount) && Math.abs(t.discount) < 100, `折溢价应为百分数：${t.discount}`);
    assert.ok(typeof t.id === 'string' && t.id.includes(t.symbol), 'id 应为稳定字符串');
  }
  assert.ok(d.summary.tradeCount === d.pagination.total,
    `summary.tradeCount(${d.summary.tradeCount}) 应等于分页总数(${d.pagination.total})`);
  assert.ok(d.summary.premiumCount + d.summary.discountCount <= d.summary.tradeCount);
});

await test('top-traders/overview：tradeDate 为真实交易日、净买入榜有真实金额', async () => {
  const { body } = await callWorker('https://clair-api.pages.dev/api/top-traders/overview');
  assert.equal(body.dataSource, 'eastmoney');
  const d = body.data;
  assert.match(d.tradeDate, /^\d{4}-\d{2}-\d{2}$/, '应为真实数据日期（拿不到时为空串，不是今天）');
  assert.ok(d.totalStocks > 0, `上榜家数应 >0，实际 ${d.totalStocks}`);
  assert.equal(d.buyDominantCount + d.sellDominantCount <= d.totalStocks, true);
  assert.ok(d.topBuyStocks.length > 0 && d.topSellStocks.length > 0, '买卖榜均应有条目');
  for (const s of [...d.topBuyStocks, ...d.topSellStocks]) {
    assert.match(s.symbol, /^\d{6}$/);
    assert.ok(Number.isFinite(s.netAmount) && s.netAmount !== 0, '净买入额应为非零数值');
  }
  // 上游不含行业字段 → 诚实空对象，绝不编造行业分布
  assert.deepEqual(d.industryDistribution, {});
});

await test('lockup/calendar：expiries/byDate/summary 三者自洽', async () => {
  const { body } = await callWorker('https://clair-api.pages.dev/api/lockup/calendar');
  assert.equal(body.dataSource, 'real');
  const d = body.data;
  assert.ok(Array.isArray(d.expiries) && d.expiries.length > 0, '当月应有解禁记录');
  assert.equal(d.summary.totalEvents, d.expiries.length, 'summary.totalEvents 应等于明细条数');
  assert.equal(d.summary.totalStocks, new Set(d.expiries.map((e) => e.symbol)).size);
  const inByDate = Object.values(d.byDate).reduce((s, arr) => s + arr.length, 0);
  assert.equal(inByDate, d.expiries.length, 'byDate 汇总条数应等于明细条数');
  for (const e of d.expiries) {
    assert.match(e.expiryDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(e.marketValue >= 0 && e.totalShares >= 0);
    assert.ok(!('shareholder' in e) || typeof e.shareholder === 'string');
  }
});

await test('north-bound/overview：净买额恒 null（停披露）、成交额真实、flows 刻意置空', async () => {
  const { body } = await callWorker('https://clair-api.pages.dev/api/north-bound/overview?days=5');
  assert.equal(body.dataSource, 'real');
  const d = body.data;
  assert.ok(Array.isArray(d.dealFlows) && d.dealFlows.length > 0, '应有真实成交额记录');
  for (const r of d.dealFlows) {
    assert.equal(r.netDealAmount, null, '净买额自 2024-08-19 起停披露，必须 null（严禁倒算）');
    assert.ok(r.dealAmount > 0, `成交额应为正数，实际 ${r.dealAmount}`);
    assert.ok(['沪股通', '深股通'].includes(r.channel));
    assert.equal(r.dataSource, 'real');
  }
  for (const r of d.byDate) {
    assert.equal(r.shNetInflow, null);
    assert.equal(r.szNetInflow, null);
    assert.equal(r.totalNetInflow, null);
    if (r.shDealAmount !== null && r.szDealAmount !== null) {
      assert.equal(r.totalDealAmount, r.shDealAmount + r.szDealAmount, '合计应等于两通道之和');
    }
  }
  assert.deepEqual(d.flows, [], 'flows 语义为净流入，必须置空（填 0 = 0 值顶替空态）');
  assert.deepEqual(d.sectors, []);
  assert.equal(body.netInflowDisclosure.disclosed, false);
  // 单位换算证：成交额应与同日港股通 kamt 的 dealAmount 同量级（亿元），不得少报 100 倍
  const hk = await callWorker('https://clair-api.pages.dev/api/hk-connect/summary');
  if (hk.body.dataSource === 'real') {
    const nbYi = d.byDate[d.byDate.length - 1].totalDealAmount / 10000;
    const hkYi = hk.body.data.data.northbound.dealAmount;
    assert.ok(Math.abs(nbYi - hkYi) / hkYi < 0.1,
      `北向成交额 ${nbYi.toFixed(1)} 亿应与港股通源 ${hkYi} 亿同量级（差 100 倍即单位换算错误）`);
  }
});

await test('hk-connect/summary：北向拆分口径停披露 → buyIn/sellOut/dayNetIn 全 null、remain 恒 null', async () => {
  const { body } = await callWorker('https://clair-api.pages.dev/api/hk-connect/summary');
  assert.equal(body.dataSource, 'real');
  const s = body.data.data;
  assert.match(s.date, /^\d{4}-\d{2}-\d{2}$/);
  // 北向：受"停止披露"规则约束
  assert.equal(s.northbound.netFlowDisclosed, false, '北向买卖拆分口径已停披露');
  assert.equal(s.northbound.buyIn, null);
  assert.equal(s.northbound.sellOut, null);
  assert.equal(s.northbound.dayNetIn, null);
  assert.ok(s.northbound.dealAmount > 0, '成交额是真实可得的');
  assert.equal(s.northbound.threshold, 1040, '沪+深股通每日额度合计 1040 亿');
  // 南北向额度余额均不可得
  assert.equal(s.northbound.remain, null);
  assert.equal(s.southbound.remain, null);
  // 南向若仍披露，则净买额必须等于买-卖的自洽值
  if (s.southbound.netFlowDisclosed) {
    const implied = +(s.southbound.buyIn - s.southbound.sellOut).toFixed(2);
    assert.ok(Math.abs(s.southbound.dayNetIn - implied) <= Math.max(0.05, Math.abs(implied) * 0.01),
      `南向净买额 ${s.southbound.dayNetIn} 应≈买(${s.southbound.buyIn})-卖(${s.southbound.sellOut})=${implied}`);
  }
});

await test('market/summary：与 breadth/current 共用同一份聚合（只数/成交额/涨跌家数三者必须相等）', async () => {
  const s = (await callWorker('https://clair-api.pages.dev/api/market/summary')).body;
  const b = (await callWorker('https://clair-api.pages.dev/api/breadth/current')).body;
  assert.equal(s.dataSource, 'real', '有真实行情时顶层 dataSource 应为 real');
  assert.equal(s.data.dataSource, s.dataSource, '顶层与 data 内两处 dataSource 必须同源');
  assert.equal(s.data.totalStocks, b.data.totalStocks,
    `两个端点的全市场只数必须相等（同一批行情只聚合一次），summary=${s.data.totalStocks} breadth=${b.data.totalStocks}`);
  assert.equal(s.data.totalTurnover, b.data.turnover,
    `两个端点的全市场成交额必须相等，summary=${s.data.totalTurnover} breadth=${b.data.turnover}`);
  assert.equal(s.data.risingStocks, b.data.advancing);
  assert.equal(s.data.fallingStocks, b.data.declining);
  assert.equal(s.data.unchangedStocks, b.data.unchanged);
  assert.equal(s.data.limitUpCount, b.data.limitUp);
  assert.equal(s.data.limitDownCount, b.data.limitDown);
  // 成交额单位＝元（若是万元量级会小 1e4，若是亿元会大 1e8）：A 股日成交 1000 亿~5 万亿
  assert.ok(s.data.totalTurnover > 1e11 && s.data.totalTurnover < 5e12,
    `成交额应为「元」量级（1e11~5e12），实际 ${s.data.totalTurnover}`);
});

await test('market/summary：不再把指数快照行算进家数（totalStocks 不得超过清单标的数）', async () => {
  const s = (await callWorker('https://clair-api.pages.dev/api/market/summary')).body;
  const b = (await callWorker('https://clair-api.pages.dev/api/breadth/current')).body;
  // 指数污染时 totalStocks 会变成 清单数+9（实测 5550 vs 5541）→ 这条能精确抓住回归
  assert.ok(s.data.totalStocks <= b.data.requestedSymbols,
    `summary.totalStocks(${s.data.totalStocks}) 不应超过清单标的数(${b.data.requestedSymbols})——超过说明指数行又串进来了`);
  // 成交额若混入 9 条指数行（其成交额本身是成份股合计）会放大约 3 倍
  assert.ok(s.data.totalTurnover < 4e12,
    `成交额 ${s.data.totalTurnover} 明显超出 A 股单日可解释范围，疑似指数行重复计入`);
});

await test('market/summary：date 为真实数据交易日（YYYY-MM-DD）而不是请求时刻', async () => {
  const s = (await callWorker('https://clair-api.pages.dev/api/market/summary')).body;
  assert.match(s.data.date, /^\d{4}-\d{2}-\d{2}$/, `date 应为交易日日期，实际 ${s.data.date}`);
  assert.equal(s.data.date, s.data.asOf, 'date 与 asOf 应同源（同一交易日）');
  assert.equal(typeof s.data.asOfIsFallback, 'boolean');
  assert.ok(!/T\d{2}:\d{2}:\d{2}/.test(s.data.date), 'date 不得是 ISO 时刻（那是请求时刻，不是数据日期）');
});

await test('north-bound/overview：有真实成交额 → dataSource 至少 partial，且净买额仍恒 null', async () => {
  const { body } = await callWorker('https://clair-api.pages.dev/api/north-bound/overview?days=10');
  assert.ok(['real', 'partial'].includes(body.dataSource),
    `有成交额却整体标 unavailable 会让前端整页判不可用，实际 ${body.dataSource}`);
  const flows = body.data.dealFlows;
  assert.ok(flows.length > 0, '应有真实成交额行');
  const withAmount = flows.filter((r) => r.dealAmount !== null).length;
  assert.equal(body.data.dealAmountCoverage, `${withAmount}/${flows.length}`,
    'dealAmountCoverage 应如实披露有值行数');
  if (withAmount > 0) assert.equal(body.dataSource, 'real');
  for (const r of flows) assert.equal(r.netDealAmount, null, '净买额恒 null（停披露，严禁倒算）');
  assert.equal(body.netInflowDisclosed, false);
});

await test('静态配置：strategy-templates 15 条与 presets 5 条，且绝不标 real', async () => {
  const t = await callWorker('https://clair-api.pages.dev/api/strategy-templates');
  assert.equal(t.body.dataSource, 'static');
  assert.notEqual(t.body.dataSource, 'real', '静态配置不得冒充真实行情');
  assert.equal(t.body.data.templates.length, 15, '应为 strategy_templates 表的 15 条 system 预置');
  for (const tpl of t.body.data.templates) {
    assert.ok(typeof tpl.name === 'string' && tpl.name.length > 0);
    assert.ok(Array.isArray(tpl.conditions) && tpl.conditions.length > 0, '每条模板都要有筛选条件');
    assert.equal(tpl.is_system, true);
  }
  const p = await callWorker('https://clair-api.pages.dev/api/backtest/presets');
  assert.equal(p.body.dataSource, 'static');
  assert.equal(p.body.data.presets.length, 5);
  for (const pre of p.body.data.presets) {
    assert.ok(['ma_cross', 'rsi', 'macd', 'boll'].includes(pre.type), `未知策略类型 ${pre.type}`);
    assert.ok(pre.params && typeof pre.params === 'object');
  }
});

await test('P2 诚实空态：4 条无真实源端点全部 200 + unavailable + 中文原因（不是 404、不是 0 值假数据）', async () => {
  // 注：/api/financials/summary 已于 2026-11-01 接入东财 emweb F10 真实源，
  // 不再是「无真实源」，已移出本清单（其契约见「三·四」小节）。
  const paths = [
    '/api/margin/overview',
    '/api/event-calendar/events',
    '/api/news/research/reports?limit=10',
    '/api/risk-center/portfolio',
  ];
  for (const p of paths) {
    const { status, body } = await callWorker('https://clair-api.pages.dev' + p);
    assert.equal(status, 200, `${p} 必须是 200（404 会被判成「端点未挂载」）`);
    assert.equal(body.success, false, `${p} 无真实源时 success 必须为 false`);
    assert.equal(body.dataSource, 'unavailable', `${p} dataSource 应为 unavailable`);
    assert.ok(body.message.length > 10 && /[\u4e00-\u9fa5]/.test(body.message), `${p} 必须给出中文原因`);
    assert.equal(body.code, 'DATA_UNAVAILABLE');
    // 数值型缺失必须是 null（不是 0）——逐字段断言，避免把「0 顶替空态」放过去
    if ('overview' in body.data) assert.equal(body.data.overview, null, 'margin overview 必须 null 而不是 0 值对象');
    if ('metrics' in body.data) assert.equal(body.data.metrics, null, 'risk-center 指标必须 null');
  }
});

// ============================================================
// 三·四、/api/fund-flow/market 的累计口径（缺失 null ≠ 真实 0）
//
// 【缺陷背景】旧实现 `all.reduce((s, q) => s + (q.turnover || 0), 0)` 把「上游没给
// 成交额」改写成「成交额 0 元」→ 前端渲染「全市场零成交」这种假事实（后端同款缺陷
// 已在 3e4b785c2 修掉）。修好后契约是：
//   · 某字段在所有参与聚合的行里无一有值 → 该字段 null
//   · 真实 0 仍为 0（0 是合法事实，判成 null 是同一个错误的反面）
//   · market 下 7 字段真值域 number|null，另有 asOf/asOfIsFallback/asOfNote
//
// 【怎么注入】不新增测试专用代码：临时替换 globalThis.fetch 伪造腾讯/东财上游，
// 并用 Date.now 偏移把 getAllQuotes 的 30s 行情缓存顶掉，从而精确控制「哪些行有值」。
// ============================================================

console.log('\n/api/fund-flow/market 累计口径');

/** 构造一行腾讯行情文本（数组下标与 worker 的 fetchTencentQuotes 解析口径一致） */
function tencentRow(key, turnoverField) {
  const f = new Array(50).fill('');
  f[0] = '1';
  f[1] = `测${key}`;
  f[2] = key.slice(2);
  f[3] = '10.00';   // price
  f[4] = '9.80';    // prevClose
  f[30] = '20261030150000'; // 行情快照时间戳
  f[32] = '0.20';   // changePercent
  f[33] = '10.10';
  f[34] = '9.70';
  f[37] = turnoverField; // 成交额（万元），'' 表示上游未提供
  return `v_${key}="${f.join('~')}";`;
}

/**
 * 在「受控上游」下跑一次 fund-flow/market。
 * @param turnoverField 三行统一的成交额字段值（'' = 全缺失，'0' = 真实 0，'12.5' = 真实值）
 * @param push2Body     东财 5 档聚合响应体（null = 不可达，模拟 tiers 降级）
 */
/**
 * 行情缓存（30s TTL）是模块级状态，连续两次调用会命中上一次的行情。
 * 故每次调用都把「假时钟」再往前推 60s（跨调用累加），保证本轮一定重新拉取。
 */
let stubClockSkew = 0;

async function callFundFlowMarketWithStub({ turnoverField, push2Body }) {
  const realFetch = globalThis.fetch;
  const realNow = Date.now;
  stubClockSkew += 60_000;
  const skew = stubClockSkew;
  Date.now = () => realNow() + skew;
  const CODES = ['sh600519', 'sz000001', 'sh601398'];
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('qt.gtimg.cn')) {
      const requested = new Set(decodeURIComponent(url.split('/q=')[1] || '').split(','));
      const body = CODES.filter((c) => requested.has(c)).map((c) => tencentRow(c, turnoverField)).join('\n');
      return new Response(body, { status: 200 });
    }
    if (url.includes('push2')) {
      if (push2Body === null) return new Response('<html>blocked</html>', { status: 200 });
      return new Response(push2Body, { status: 200 });
    }
    throw new Error(`stubbed test 不应请求该 URL: ${url}`);
  };
  try {
    const res = await worker.fetch(new Request('https://clair-api.pages.dev/api/fund-flow/market'), envStub(), {});
    return { status: res.status, body: await res.json() };
  } finally {
    globalThis.fetch = realFetch;
    Date.now = realNow;
  }
}

const PUSH2_ALL_MISSING_LOW_TIER = JSON.stringify({ data: { diff: [{ f62: 100, f66: 20, f72: 5 }, { f62: -40, f66: -10, f72: -2 }] } });

await test('成交额字段全缺失 → totalTurnover 为 null（不是 0），其余字段仍为真实计数', async () => {
  const { status, body } = await callFundFlowMarketWithStub({ turnoverField: '', push2Body: null });
  assert.equal(status, 200);
  const m = body.data.market;
  assert.ok(m && typeof m === 'object', 'market 应有其它可得字段（不能整块 null）');
  assert.equal(m.totalTurnover, null,
    `上游三行都未给成交额时必须为 null，实际 ${m.totalTurnover}（0 会被读成「全市场零成交」）`);
  assert.equal(m.risingStocks, 3, '涨跌家数是可判定的真实计数');
  assert.equal(m.fallingStocks, 0);
  assert.equal(m.unchangedStocks, 0);
  assert.equal(m.totalStocks, 3);
  // 5 档资金流不可达 → 各档 null（不是 0 元净流入）
  for (const k of ['main', 'superLarge', 'large', 'medium', 'small']) {
    assert.equal(body.data.tiers[k], null, `tiers.${k} 应为 null，实际 ${body.data.tiers[k]}`);
  }
  assert.equal(body.data.source, 'unavailable');
  assert.equal(body.dataSource, 'partial', '广度可用 + 5 档不可用 → partial');
});

await test('成交额真实为 0 → 仍是 0（不得判成 null），且 7 字段类型均在 number|null 域内', async () => {
  const { body } = await callFundFlowMarketWithStub({ turnoverField: '0', push2Body: null });
  const m = body.data.market;
  assert.equal(m.totalTurnover, 0, `真实 0 必须保留为 0，实际 ${m.totalTurnover}`);
  for (const k of ['totalTurnover', 'risingStocks', 'fallingStocks', 'unchangedStocks',
    'limitUpCount', 'limitDownCount', 'totalStocks']) {
    assert.ok(m[k] === null || typeof m[k] === 'number', `market.${k} 必须在 number|null 域内，实际 ${typeof m[k]}`);
  }
  // 数据所属交易日必须来自行情时间戳，且如实标注是否回退
  assert.equal(body.data.asOf, '2026-10-30', 'asOf 应取自行情快照时间戳所在日');
  assert.equal(typeof body.data.asOfIsFallback, 'boolean');
  assert.equal(body.data.asOfIsFallback, true, '2026-10-30 ≠ 今天，应标注为回退');
  assert.ok(typeof body.data.asOfNote === 'string' && body.data.asOfNote.includes('2026-10-30'),
    'asOfNote 应说明 asOf 的来源日期');
});

await test('成交额真实值按「万元→元」累计（3 行 × 12.5 万元 = 375000 元）', async () => {
  const { body } = await callFundFlowMarketWithStub({ turnoverField: '12.5', push2Body: null });
  assert.equal(body.data.market.totalTurnover, 375000,
    `三行各 12.5 万元应累计为 375000 元，实际 ${body.data.market.totalTurnover}`);
});

await test('5 档资金流：某档全缺失 → 该档 null，有值的档正常累计（不写成 0 净流入）', async () => {
  // f62: 100,-40 → 60；f66: 20,-10 → 10；f72: 5,-2 → 3；f78 / f84 两档全部缺失 → null
  const { body } = await callFundFlowMarketWithStub({ turnoverField: '1', push2Body: PUSH2_ALL_MISSING_LOW_TIER });
  assert.equal(body.data.tiers.main, 60);
  assert.equal(body.data.tiers.superLarge, 10);
  assert.equal(body.data.tiers.large, 3);
  assert.equal(body.data.tiers.medium, null, 'f78 全缺失 → medium 必须为 null（不是 0 元）');
  assert.equal(body.data.tiers.small, null, 'f84 全缺失 → small 必须为 null（不是 0 元）');
  assert.equal(body.data.source, 'eastmoney');
  assert.equal(body.dataSource, 'eastmoney');
});

// ============================================================
// 三·五、/api/fund-flow/industry 行业资金流（兜 0 与空壳收口）
//
// 【缺陷背景】修复前该端点：
//   ① `isFinite(Number(it.f62)) ? Number(it.f62) : 0` → 缺失被写成「净流入 0 元」；
//   ② mainNet 与 netInflow 取同一个 f62（两列同值）、stockCount 取 f22（涨速，非成分股数）；
//   ③ 空态只有 `industries: []` + `data.source`，**顶层无 dataSource、无 message**
//      → 线上实测 `{"industries":[],"count":0,"source":"unavailable","note":"..."}`
//        读 dataSource 的消费端拿到 undefined，读到的是一个「既没数据也没解释」的空列表。
//
// 【修好后的契约】
//   · 缺失 → null（真实 0 仍是 0）；netInflow 两源都不可得 → 恒 null（不拿主力净额冒充全单）
//   · 顶层与 data 内 dataSource 同源；空数组必带中文 message/note
//   · 源链：东财 push2 行业板块 → 腾讯板块排行 → 诚实 unavailable
// ============================================================

console.log('\n/api/fund-flow/industry 行业资金流');

async function callFundFlowIndustryWithStub({ push2Body, tencentBody, boardQuoteBody = TENCENT_BOARD_QUOTE, limit = 20 }) {
  const realFetch = globalThis.fetch;
  const requestedUrls = [];
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;
    requestedUrls.push(url);
    if (url.includes('push2')) {
      if (push2Body === null) throw new Error('push2 unreachable (stubbed)');
      return new Response(push2Body, { status: 200 });
    }
    if (url.includes('proxy.finance.qq.com')) {
      if (tencentBody === null) throw new Error('tencent unreachable (stubbed)');
      return new Response(tencentBody, { status: 200 });
    }
    if (url.includes('qt.gtimg.cn')) {
      if (boardQuoteBody === null) throw new Error('qt board quote unreachable (stubbed)');
      return new Response(boardQuoteBody, { status: 200 });
    }
    throw new Error(`stubbed test 不应请求该 URL: ${url}`);
  };
  try {
    const res = await worker.fetch(
      new Request(`https://clair-api.pages.dev/api/fund-flow/industry?limit=${limit}`), envStub(), {},
    );
    return { status: res.status, body: await res.json(), requestedUrls };
  } finally {
    globalThis.fetch = realFetch;
  }
}

// 腾讯板块行情快照（GBK 原文形态；字段 30 = 快照时间戳 20261030150004 → 2026-10-30）
const TENCENT_BOARD_QUOTE = 'v_pt01801080="2~X~01801080~14341.39~13945.21~~20261030150004~396.18~2.84";';

// 东财 clist 行业板块：第二个行业的 f62 是 '-'（上游未给该行业资金流）
const PUSH2_INDUSTRY_PARTIAL = JSON.stringify({
  data: {
    diff: [
      { f12: 'BK0475', f14: '行业甲', f62: 120000000, f184: 3.2, f124: 1730332800 },
      { f12: 'BK0476', f14: '行业乙', f62: '-', f184: 1.1, f124: 1730332800 },
    ],
  },
});

// 腾讯板块排行：万元口径；第三条缺 zljlr（上游没给）
const TENCENT_INDUSTRY_RANK = JSON.stringify({
  code: 0,
  msg: 'ok',
  data: {
    rank_list: [
      { name: '电子', code: 'pt01801080', stock_type: 'BK-HY-1', zljlr: '-1115657.21', zgb: '35/497', zdf: '-5.11' },
      { name: '食品饮料', code: 'pt01801120', stock_type: 'BK-HY-1', zljlr: '289753.05', zgb: '71/122', zdf: '2.84' },
      { name: '无资金流行业', code: 'pt01801999', stock_type: 'BK-HY-1', zgb: '0/8', zdf: '0.00' },
    ],
  },
});

await test('industry：东财 f62 缺失 → mainNet 为 null（不是 0 元），真实值原样保留', async () => {
  const { status, body } = await callFundFlowIndustryWithStub({ push2Body: PUSH2_INDUSTRY_PARTIAL, tencentBody: null });
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.dataSource, 'eastmoney', '顶层 dataSource 必须如实标注真实源');
  assert.equal(body.data.dataSource, 'eastmoney', 'data 内 dataSource 必须与顶层同源');
  assert.equal(body.data.industries.length, 2);
  assert.equal(body.data.industries[0].mainNet, 120000000);
  assert.equal(body.data.industries[1].mainNet, null,
    '上游 f62 为 "-" 时必须 null（0 会被读成「该行业主力净流入 0 元」）');
  assert.equal(body.data.industries[1].netInflow, null, '全单净额两源皆不可得 → null');
  assert.equal(body.data.asOf, '2024-10-31', 'asOf 应取东财 f124 时间戳所在交易日');
});

await test('industry：东财不可达 → 腾讯板块排行真实数据（万元→元、成分股数取 zgb 分母、降序）', async () => {
  const { status, body, requestedUrls } = await callFundFlowIndustryWithStub({ push2Body: null, tencentBody: TENCENT_INDUSTRY_RANK });
  assert.equal(status, 200);
  assert.equal(body.dataSource, 'tencent');
  assert.equal(body.data.dataSource, 'tencent');
  const rows = body.data.industries;
  assert.equal(rows.length, 3);
  assert.equal(rows[0].industry, '食品饮料', '应按主力净额降序排第一');
  assert.equal(rows[0].mainNet, 2897530500, '289753.05 万元 = 2,897,530,500 元');
  assert.equal(rows[0].stockCount, 122, 'zgb "71/122" 的分母是成分股数');
  assert.equal(rows[0].netInflow, null, '腾讯只给主力口径，全单净额必须 null');
  assert.equal(rows[1].mainNet, -11156572100, '负值（净流出 -1,115,657.21 万元）换算为 -11,156,572,100 元并排在正值之后');
  assert.equal(rows[2].mainNet, null, '缺 zljlr 的行业必须 null（不是 0）');
  assert.equal(rows[2].stockCount, 8);
  assert.ok(typeof body.message === 'string' && /[\u4e00-\u9fa5]/.test(body.message),
    '降级到腾讯源必须给出中文说明（口径与单位）');
  // 快照日期只请求一次（不是每个行业各一次）
  const quoteCalls = requestedUrls.filter((u) => u.includes('qt.gtimg.cn'));
  assert.equal(quoteCalls.length, 1, `板块快照只应请求 1 次，实际 ${quoteCalls.length} 次`);
});

await test('industry：asOf 取腾讯板块快照时间戳（一次请求），并写进响应', async () => {
  const { body } = await callFundFlowIndustryWithStub({ push2Body: null, tencentBody: TENCENT_INDUSTRY_RANK });
  assert.equal(body.data.asOf, '2026-10-30',
    'asOf 应来自 qt.gtimg.cn 板块快照时间戳 20261030150004 → 2026-10-30');
});

await test('industry：快照日期取不到 → asOf 为 null 且 note 说明「上游未提供」（不拿自然日冒充）', async () => {
  const { body } = await callFundFlowIndustryWithStub({
    push2Body: null, tencentBody: TENCENT_INDUSTRY_RANK, boardQuoteBody: null,
  });
  assert.equal(body.data.asOf, null);
  assert.ok(body.data.note.includes('asOf 不可得'), `note 必须说明日期不可得，实际：${body.data.note}`);
  // 关键：不得悄悄填成今天
  const today = new Date().toISOString().slice(0, 10);
  assert.ok(!body.data.note.includes(today), 'note 不得出现"今天"当作数据日期');
});

await test('industry：两源皆不可达 → 200 + dataSource:unavailable + 中文明原因（不留裸空数组）', async () => {
  const { status, body } = await callFundFlowIndustryWithStub({ push2Body: null, tencentBody: null });
  assert.equal(status, 200, '数据不可得不是 404（404 会被判成端点未挂载）');
  assert.equal(body.dataSource, 'unavailable');
  assert.equal(body.data.dataSource, 'unavailable', '顶层与 data 内 dataSource 必须一致');
  assert.deepEqual(body.data.industries, []);
  assert.equal(body.data.count, 0);
  assert.equal(body.data.total, 0, '空态 total 必须为 0（不是 omit / 不是 20）');
  assert.ok(typeof body.message === 'string' && body.message.length > 10 && /[\u4e00-\u9fa5]/.test(body.message),
    `空列表必须自带中文原因，实际 message=${JSON.stringify(body.message)}`);
  assert.equal(body.data.message, body.message, 'data.message 与顶层 message 应一致（消费端两处都可能读）');
});

await test('industry：limit 截断时 count=返回条数、total=上游可取总数，且 note 写明「前 N 条」', async () => {
  const { body } = await callFundFlowIndustryWithStub({ push2Body: null, tencentBody: TENCENT_INDUSTRY_RANK, limit: 2 });
  assert.equal(body.data.industries.length, 2);
  assert.equal(body.data.count, 2, 'count 必须与 industries 长度一致（不能报总数却只给 2 条）');
  assert.equal(body.data.total, 3, 'total 必须是上游本次可取总数（3 条），否则 count:2 会被误读成全市场只有 2 个行业');
  assert.ok(body.data.note.includes('前 2 条'), `note 必须写明被截断，实际：${body.data.note}`);
  assert.ok(body.data.note.includes('不是全市场行业总数'), `note 必须排除误读，实际：${body.data.note}`);
});

// ============================================================
// 三·四、财务三表三条路由（此前从未挂载 → 线上 404）
//
// 【为什么单开一节】线上 https://egobai.github.io/clair/financials/600519.SH 实测：
//   200 /api/financials/summary
//   404 /api/financials/income-statement
//   404 /api/financials/cash-flow
//   404 /api/financials/balance-sheet
// 财务页只能显示「无法加载财务数据」。本节锁死三件事：
//   1. 三条路由必须存在且是 200（不是 404 —— 404 会被判成「端点未挂载」）
//   2. 契约字段与 backend/src/api/financials.ts 逐字段一致
//      （symbol/type/periods/updatedAt/dataSource）
//   3. 上游不可达时 dataSource:'unavailable' + periods:[] + 中文原因，
//      **绝不允许返回 0 值周期**（0 是合法真实值，用它顶替缺失即造假）
// ============================================================

console.log('\n/api/financials/{balance-sheet,income-statement,cash-flow}');

const FIN_STATEMENTS = [
  {
    path: '/api/financials/balance-sheet',
    type: 'balance_sheet',
    // 必备字段取自 backend/src/services/financialsDataService.ts mapBalanceSheet
    required: ['totalAssets', 'totalLiabilities', 'currentAssets', 'currentLiabilities',
      'totalEquity', 'inventory', 'cash', 'debtToAssetRatio'],
    positive: ['totalAssets', 'totalLiabilities', 'totalEquity'],
  },
  {
    path: '/api/financials/income-statement',
    type: 'income_statement',
    required: ['totalRevenue', 'operatingRevenue', 'operatingCost', 'grossProfit',
      'operatingProfit', 'netProfit', 'parentNetProfit', 'eps'],
    positive: ['totalRevenue', 'netProfit'],
  },
  {
    path: '/api/financials/cash-flow',
    type: 'cash_flow',
    required: ['netOperatingCashFlow', 'netInvestingCashFlow', 'netFinancingCashFlow',
      'netCashFlow', 'beginningCash', 'endingCash', 'freeCashFlow'],
    positive: ['beginningCash', 'endingCash'],
  },
];

for (const s of FIN_STATEMENTS) {
  await test(`${s.path} → 200（不再是 404）+ dataSource 存在且两级一致`, async () => {
    const { status, body } = await callWorker(
      'https://clair-api.pages.dev' + s.path + '?symbol=600519&periods=2');
    assert.equal(status, 200, `期望 200，实际 ${status}（404 会让财务页显示「无法加载」）`);
    assert.notEqual(body.error, 'Not found', '不得再返回路由未命中的 404 体');
    assert.ok(['real', 'unavailable'].includes(body.dataSource),
      `dataSource 应为 real/unavailable，实际 ${body.dataSource}`);
    assert.equal(body.data.dataSource, body.dataSource, '顶层与 data 内 dataSource 必须一致');
    // 契约字段：与 backend/src/api/financials.ts:37/52/67 同名字段
    for (const k of ['symbol', 'type', 'periods', 'updatedAt']) {
      assert.ok(k in body.data, `data 缺契约字段 ${k}`);
    }
    assert.equal(body.data.type, s.type, `type 应为 ${s.type}`);
    assert.ok(Array.isArray(body.data.periods), 'data.periods 必须是数组');
    assert.match(body.data.updatedAt, /^\d{4}-\d{2}-\d{2}T/, 'updatedAt 应为 ISO 时间');
  });

  await test(`${s.path} → 真实期数与字段（real 时 periods 非空、字段齐、无 0 值周期）`, async () => {
    const { body } = await callWorker(
      'https://clair-api.pages.dev' + s.path + '?symbol=600519&periods=2');
    if (body.dataSource !== 'real') {
      // 上游在测试环境不可达时允许诚实降级，但必须说清原因且不给任何数值
      assert.deepEqual(body.data.periods, [], '不可用时 periods 必须为空数组');
      assert.ok(typeof body.message === 'string' && /[\u4e00-\u9fa5]/.test(body.message),
        '不可用时必须给中文原因');
      return;
    }
    const periods = body.data.periods;
    assert.ok(periods.length > 0, 'real 态 periods 不应为空');
    assert.ok(periods.length <= 2, `periods=2 时应最多 2 期，实际 ${periods.length}`);
    for (const p of periods) {
      assert.match(p.period, /^\d{4}-12-31$/, `报告期应为年报 YYYY-12-31，实际 ${p.period}`);
      for (const k of s.required) {
        assert.ok(k in p, `第 ${p.period} 期缺字段 ${k}`);
        assert.equal(typeof p[k], 'number', `${k} 应为数字（后端契约），实际 ${typeof p[k]}`);
      }
      for (const k of s.positive) {
        assert.ok(p[k] > 0, `${k} 应大于 0（若为 0 说明该期是空壳周期），实际 ${p[k]}`);
      }
    }
    // 报告期倒序（与后端 sortTypes=-1 一致）
    if (periods.length > 1) {
      assert.ok(periods[0].period > periods[1].period, '多期应按报告期倒序');
    }
  });
}

await test('三表如实披露来源：真实值可回溯到上游（茅台 2025 年总资产 = 303,834,844,021.44 元）', async () => {
  const { body } = await callWorker('https://clair-api.pages.dev/api/financials/balance-sheet?symbol=600519&periods=1');
  if (body.dataSource !== 'real') return; // 上游不可达时不判失败
  const first = body.data.periods[0];
  assert.equal(first.period, '2025-12-31');
  // 该值来自 emweb zcfzbAjaxNew 的 TOTAL_ASSETS 字段，非任何估算/随机
  assert.equal(first.totalAssets, 303834844021.44,
    '总资产必须等于上游披露原文，出现差异说明映射被改动过');
});

await test('缺参数取后端同一默认值：symbol=600519、periods=4', async () => {
  const { body } = await callWorker('https://clair-api.pages.dev/api/financials/balance-sheet');
  assert.equal(body.data.symbol, '600519', '默认标的应与后端一致为 600519');
  if (body.dataSource === 'real') {
    assert.ok(body.data.periods.length <= 4, `默认 periods=4，实际 ${body.data.periods.length}`);
  }
});

await test('periods 上限 10：传 99 最多返回 10 期（与后端 Math.min(periods,10) 一致）', async () => {
  const { body } = await callWorker('https://clair-api.pages.dev/api/financials/balance-sheet?symbol=600519&periods=99');
  if (body.dataSource !== 'real') return;
  assert.ok(body.data.periods.length <= 10, `不应超过 10 期，实际 ${body.data.periods.length}`);
});

await test('上游无该标的 → 200 + unavailable + periods:[] + 中文原因（不 404、不给 0 周期）', async () => {
  const { status, body } = await callWorker('https://clair-api.pages.dev/api/financials/income-statement?symbol=999999');
  assert.equal(status, 200, '标的取不到数据不是 404');
  assert.equal(body.dataSource, 'unavailable');
  assert.equal(body.success, false, '诚实不可用时 success 必须为 false');
  assert.deepEqual(body.data.periods, [], '不可用时 periods 必须是空数组（不能塞 0 值周期）');
  assert.ok(typeof body.message === 'string' && /[\u4e00-\u9fa5]/.test(body.message),
    `必须给中文原因，实际 ${JSON.stringify(body.message)}`);
  assert.ok(!/^\s*0/.test(JSON.stringify(body.data.periods)), '不得出现 0 值周期');
});

await test('summary 与三表自洽：summary.balanceSheet.totalAssets 与 balance-sheet 首页一致', async () => {
  const [summary, bs] = await Promise.all([
    callWorker('https://clair-api.pages.dev/api/financials/summary?symbol=600519'),
    callWorker('https://clair-api.pages.dev/api/financials/balance-sheet?symbol=600519&periods=1'),
  ]);
  if (summary.body.dataSource !== 'real' || bs.body.dataSource !== 'real') return;
  assert.equal(summary.body.data.balanceSheet.totalAssets, bs.body.data.periods[0].totalAssets,
    '同一标的同一报告期，摘要与报表端点必须给出同一数值（两处取值源应同为 emweb F10）');
  for (const k of ['balanceSheet', 'incomeStatement', 'cashFlow', 'indicators']) {
    assert.ok(summary.body.data[k], `summary 缺 ${k}（前端 FinancialsPage.tsx:136 据此判定是否渲染）`);
  }
  for (const k of ['grossMargin', 'netMargin', 'roe', 'roa', 'currentRatio',
    'debtToAssetRatio', 'revenueGrowth', 'profitGrowth']) {
    assert.ok(k in summary.body.data.indicators, `indicators 缺 ${k}`);
  }
});

// ============================================================
// 四、生产 Worker 缺失路由回归：/api/version、/api/industries、/api/ai/market-pulse、/api/ai/diagnose/:symbol
// ============================================================

console.log('\n补齐路由（version / industries / market-pulse / diagnose）');

async function callWorkerWithEnv(url, init, env) {
  const res = await worker.fetch(new Request(url, init), { ...envStub(), ...(env || {}) }, {});
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error('响应不是合法 JSON: ' + text.slice(0, 200));
  }
  return { status: res.status, body };
}

// 确定性腾讯行情桩：每只票价格 100 / 昨收 99 / 涨幅 +1.01% / PE 20 / PB 2.00。
function fakeQuoteLine(sym) {
  const digits = sym.slice(2);
  const p = new Array(50).fill('0');
  p[0] = '1';
  p[1] = '测试' + digits;
  p[2] = digits;
  p[3] = '100.00';
  p[4] = '99.00';
  p[5] = '99.50';
  p[6] = '123456';
  p[30] = '20261104150000';
  p[32] = '1.01';
  p[33] = '101.00';
  p[34] = '98.00';
  p[37] = '12345.6';
  p[38] = '2.50';
  p[39] = '20.00';
  p[44] = '300';
  p[45] = '500';
  p[46] = '2.00';
  p[47] = '108.90';
  p[48] = '89.10';
  return 'v_' + sym + '="' + p.join('~') + '";';
}

// 只替换本次用例内的 globalThis.fetch（结束后 finally 还原），与文件内既有伪时钟/行情桩同一做法。
async function withStubbedMarketFetch(fn) {
  const original = globalThis.fetch;
  globalThis.fetch = async function (input, init) {
    const u = String(input);
    if (u.startsWith('https://qt.gtimg.cn/q=')) {
      const syms = u.slice('https://qt.gtimg.cn/q='.length).split(',');
      const text = syms.map(fakeQuoteLine).join('\n');
      return new Response(Buffer.from(text, 'latin1'), { status: 200 });
    }
    if (u.startsWith('https://web.ifzq.gtimg.cn/')) {
      const m = u.match(/param=([a-z]{2}\d{6})/);
      const key = m ? m[1] : 'sh600519';
      const rows = [];
      for (let i = 0; i < 60; i++) {
        const c = 90 + i * 0.2;
        rows.push([
          '2026-07-' + String((i % 28) + 1).padStart(2, '0'),
          (c - 0.1).toFixed(2), c.toFixed(2), (c + 0.2).toFixed(2), (c - 0.2).toFixed(2), '1000',
        ]);
      }
      const payload = { code: 0, data: {} };
      payload.data[key] = { day: rows };
      return new Response(JSON.stringify(payload), { status: 200 });
    }
    if (u.startsWith('https://api.deepseek.com/')) {
      const content = JSON.stringify({
        totalScore: 66,
        rating: '中性偏强',
        dimensions: [{ name: '估值', score: 64 }, { name: '技术面', score: 68 }],
        strengths: ['估值处于合理区间'],
        risks: ['注意短期波动'],
        suggestions: ['控制仓位'],
        diagnosis: '该股当前综合评分中性偏强，估值与技术面均无极端信号；请注意短期波动风险。以上不构成投资建议。',
      });
      return new Response(JSON.stringify({ choices: [{ message: { content: content } }] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    return original(input, init);
  };
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

await test('/api/version：未注入 commit 时诚实返回 null + commitKnown=false', async () => {
  const { status, body } = await callWorkerWithEnv('https://clair-api.pages.dev/api/version', undefined, {});
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.commit, null);
  assert.equal(body.commitKnown, false);
  assert.equal(body.commitSource, null);
  assert.ok(typeof body.note === 'string' && /[\u4e00-\u9fa5]/.test(body.note), '读不到 commit 时必须给中文说明');
});

await test('/api/version：env.CF_PAGES_COMMIT_SHA 注入后返回真实 commit', async () => {
  const sha = '0123456789abcdef0123456789abcdef01234567';
  const { status, body } = await callWorkerWithEnv('https://clair-api.pages.dev/api/version', undefined, { CF_PAGES_COMMIT_SHA: sha });
  assert.equal(status, 200);
  assert.equal(body.commit, sha);
  assert.equal(body.commitKnown, true);
  assert.equal(body.commitSource, 'CF_PAGES_COMMIT_SHA');
});

await test('/api/industries?level=2：200 且不 404；无数据时 unavailable + 空数组 + 中文原因', async () => {
  const { status, body } = await callWorker('https://clair-api.pages.dev/api/industries?level=2');
  assert.equal(status, 200, '缺路由会是 404；本端点必须 200');
  assert.equal(body.success, true);
  const rows = body.data && body.data.industries;
  assert.ok(Array.isArray(rows), 'data.industries 必须是数组');
  assert.equal(body.data.dataSource, body.dataSource, '顶层与 data 内 dataSource 必须同源');
  if (body.dataSource === 'unavailable') {
    assert.equal(rows.length, 0, '不可用时必须是空数组，不能塞 0 值行业');
    assert.equal(body.data.count, 0);
    assert.ok(typeof body.message === 'string' && /[\u4e00-\u9fa5]/.test(body.message), '必须给中文不可用原因');
  } else {
    assert.ok(rows.length > 0);
    assert.equal(body.data.count, rows.length);
    for (const r of rows.slice(0, 10)) {
      assert.ok(typeof r.name === 'string' && r.name.length > 0, 'name 缺失');
      assert.ok(typeof r.stock_count === 'number' && r.stock_count > 0, 'stock_count 必须为正数');
      assert.ok(r.avg_change === null || /^[+-]\d+\.\d{2}$/.test(r.avg_change), 'avg_change 必须是带符号两位小数字符串');
      assert.notEqual(r.avg_change, '-0.00', '不得出现 -0.00 假下跌符号');
      assert.ok(r.total_cap === null || typeof r.total_cap === 'string', 'total_cap 缺失时必须是 null');
    }
  }
});

await test('/api/ai/market-pulse：200 且不 404；降级态 temperature.score/breadth/limitUp 显式为 null', async () => {
  const { status, body } = await callWorker('https://clair-api.pages.dev/api/ai/market-pulse');
  assert.equal(status, 200, '缺路由会是 404；本端点必须 200');
  const d = body.data || {};
  if (body.dataSource === 'unavailable') {
    assert.equal(body.success, false);
    assert.equal(d.temperature.score, null, '不可用时温度分必须是 null，不能用 0 冒充');
    assert.equal(d.temperature.label, '未知');
    assert.equal(d.breadth, null);
    assert.equal(d.limitUp, null);
    assert.deepEqual(d.themes, []);
  } else {
    assert.equal(body.success, true);
    assert.ok(d.temperature && (d.temperature.score === null || typeof d.temperature.score === 'number'));
    assert.ok(Array.isArray(d.themes), 'themes 必须是数组');
    assert.ok(Array.isArray(d.risks) && d.risks.length > 0, 'risks 必须至少给出可用性判断');
    assert.ok(typeof d.narrative === 'string' && d.narrative.length > 0, 'narrative 不能为空');
    if (d.temperature.score === null) {
      assert.equal(d.temperature.label, '未知', 'score=null 时 label 必须为「未知」');
    }
  }
});

await test('/api/ai/diagnose/600519（无 key）：200 + UPSTREAM_UNAVAILABLE + 中文 message，不 404 不伪造', async () => {
  const { status, body } = await callWorkerWithEnv('https://clair-api.pages.dev/api/ai/diagnose/600519', undefined, {});
  assert.equal(status, 200, '缺路由/缺 key 都不能 404');
  assert.equal(body.success, false);
  assert.equal(body.dataSource, 'unavailable');
  assert.equal(body.code, 'UPSTREAM_UNAVAILABLE');
  assert.ok(typeof body.message === 'string' && /[\u4e00-\u9fa5]/.test(body.message), '必须给面向用户的中文文案');
  assert.ok(!/DEEPSEEK_API_KEY/.test(body.message), 'message 不得直接暴露运维配置指令');
});

await test('/api/ai/diagnose/600519（有 key，桩行情/K线/LLM）：结构化评分 + diagnosis 文本', async () => {
  await withStubbedMarketFetch(async () => {
    const { status, body } = await callWorkerWithEnv(
      'https://clair-api.pages.dev/api/ai/diagnose/600519',
      undefined,
      { DEEPSEEK_API_KEY: 'test-key' },
    );
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(body.dataSource, 'real');
    const d = body.data;
    assert.ok(typeof d.totalScore === 'number' && d.totalScore >= 0 && d.totalScore <= 100, 'totalScore 必须是 0-100 数值');
    assert.ok(typeof d.rating === 'string' && d.rating.length > 0);
    assert.ok(Array.isArray(d.dimensions) && d.dimensions.length > 0, 'dimensions 不能为空');
    assert.ok(Array.isArray(d.strengths) && Array.isArray(d.risks) && Array.isArray(d.suggestions));
    assert.ok(typeof d.diagnosis === 'string' && d.diagnosis.length > 10, 'aiClient 读 data.diagnosis 文本');
    assert.equal(d.llmUsed, true);
    assert.equal(d.dataSource, body.dataSource);
  });
});

// ============================================================
// 四、双入口字节一致性（Cloudflare Pages advanced mode 的硬约束）
// ============================================================

// ── E5 数据及时性生产可观测（两层：realtime / kv-snapshot）──
// 背景：本地门禁 data-freshness.ts 依赖 PG，Worker 无驱动；故拆两层，
// 每层只说自己能证明的事。未知一律 null，绝不用 0 冒充。
console.log('\nE5 数据及时性端点（/api/health/data-freshness）');

await test('无 KV 快照时诚实降级：dataSource=unavailable，lagTradingDays 为 null（不是 0）', async () => {
  await withStubbedMarketFetch(async () => {
    const { status, body } = await callWorkerWithEnv(
      'https://clair-api.pages.dev/api/health/data-freshness', undefined, {});
    assert.equal(status, 200, '缺快照也必须 200，不能 404/500');
    assert.equal(body.success, true);
    assert.equal(body.evaluator, 'E5');
    assert.equal(body.dataSource, 'unavailable');
    assert.equal(body.database, null, '无快照时 database 必须为 null，不能编造');
    assert.equal(body.realtime.lagTradingDays, null, 'Worker 不复刻日历，lag 必须为 null 而非 0');
    assert.equal(body.realtime.latestTradeDate, '2026-11-04', '实时层应取行情快照时间戳的日期');
    assert.ok(typeof body.databaseNote === 'string' && body.databaseNote.length > 0, '必须说明为什么没有');
  });
});

await test('有 KV 快照时透出真实值，且 48 小时内判定 stale=false', async () => {
  const rec = {
    maxTradeDate: '2026-11-04', expectedTradeDate: '2026-11-03', lagTradingDays: 0,
    maxLag: 1, calendarPrecision: 'official', rows: 545013, verdict: 'PASS',
    checkedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  };
  const kvStub = { STOCK_DATA: { get: async (key) => (key === 'meta:freshness' ? rec : null) } };
  await withStubbedMarketFetch(async () => {
    const { status, body } = await callWorkerWithEnv(
      'https://clair-api.pages.dev/api/health/data-freshness', undefined, kvStub);
    assert.equal(status, 200);
    assert.equal(body.dataSource, 'kv-snapshot');
    assert.equal(body.database.maxTradeDate, '2026-11-04');
    assert.equal(body.database.lagTradingDays, 0);
    assert.equal(body.database.rowCount, 545013);
    assert.equal(body.database.stale, false);
    assert.equal(body.databaseNote, null, '新鲜时不该有任何降级说明');
  });
});

await test('快照超过 48 小时标 stale=true 并说明，不冒充新鲜', async () => {
  const rec = {
    maxTradeDate: '2026-10-30', expectedTradeDate: '2026-11-03', lagTradingDays: 2,
    maxLag: 1, calendarPrecision: 'official', rows: 540000, verdict: 'FAIL',
    checkedAt: new Date(Date.now() - 49 * 3600 * 1000).toISOString(),
  };
  const kvStub = { STOCK_DATA: { get: async () => rec } };
  await withStubbedMarketFetch(async () => {
    const { body } = await callWorkerWithEnv(
      'https://clair-api.pages.dev/api/health/data-freshness', undefined, kvStub);
    assert.equal(body.database.stale, true);
    assert.ok(body.databaseNote.includes('48'), '必须说明过期原因');
    assert.equal(body.database.lagTradingDays, 2, '过期也要如实透出快照里的落后天数');
  });
});

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
