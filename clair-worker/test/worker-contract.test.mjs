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
  { path: '/api/financials/summary', allow: ['unavailable'] },
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
    // 顶层与 data 内两处 dataSource 必须同源，杜绝「两级 dataSource 互相矛盾」
    assert.equal(body.data.dataSource, body.dataSource,
      `顶层 ${body.dataSource} 与 data.dataSource ${body.data.dataSource} 必须一致`);
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

await test('etf/list：嵌套契约 json.data.data、覆盖率自洽、premiumRate 只在行情+净值都有时才给数', async () => {
  const { body } = await callWorker('https://clair-api.pages.dev/api/etf/list');
  assert.equal(body.dataSource, 'real');
  const d = body.data;
  assert.ok(Array.isArray(d.data) && d.data.length > 0, 'data.data 应为非空数组（ETFPage 读的就是它）');
  assert.equal(d.count, d.data.length);
  for (const e of d.data) {
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
  assert.match(d.quoteCoverage, /^\d+\/\d+$/);
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

await test('P2 诚实空态：5 条无真实源端点全部 200 + unavailable + 中文原因（不是 404、不是 0 值假数据）', async () => {
  const paths = [
    '/api/margin/overview',
    '/api/event-calendar/events',
    '/api/financials/summary?symbol=600519',
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
    if ('summary' in body.data) assert.equal(body.data.summary, null, 'financials summary 必须 null');
    if ('metrics' in body.data) assert.equal(body.data.metrics, null, 'risk-center 指标必须 null');
  }
});

// ============================================================
// 四、双入口字节一致性（Cloudflare Pages advanced mode 的硬约束）
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
