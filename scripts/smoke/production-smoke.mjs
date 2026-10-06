#!/usr/bin/env node
/**
 * production-smoke —— 部署后自动烟测 + 版本一致性校验
 * ============================================================================
 * 存在的理由（P0-VER）：本仓库的部署工作流触发条件**不对称**——
 *   .github/workflows/deploy.yml        每次 push main 都触发，但只构建 frontend/ 部署到 GitHub Pages
 *   .github/workflows/deploy-worker.yml 仅 clair-worker/** 变更时才触发，部署 Cloudflare Worker
 * 后果：backend/src/ 里的 Express 端点**没有任何部署路径**，线上 /health 实测返回
 *   {"service":"clair-worker"}，而 /api/industries、/api/factors/overview 等一律 404。
 *   也就是「前端每次 push 自动上线、后端永不上线」，两端版本必然错配，
 *   而用户在页面上**没有任何办法**判断自己看到的是不是最新版本。
 *
 * 本脚本就是那个「办法」：部署完自动打一批关键端点，并核对目标实例自报的 commit。
 *
 * 用法：
 *   node scripts/smoke/production-smoke.mjs --base http://127.0.0.1:3001
 *   node scripts/smoke/production-smoke.mjs --base https://clair-api.pages.dev --strict
 *   node scripts/smoke/production-smoke.mjs --base <url> --expect-commit a1b2c3d
 *   node scripts/smoke/production-smoke.mjs --base <url> --json     # 机器可读，stdout 只有 JSON
 *
 * 参数：
 *   --base <url>          目标实例基地址（必填，也可用环境变量 SMOKE_BASE_URL）
 *   --expect-commit <sha> 期望的 commit（可用环境变量 EXPECTED_COMMIT_SHA）。
 *                         支持 7 位短 sha 前缀匹配。给了才会做版本比对。
 *   --strict              任一 NOT_FOUND / ERROR / MALFORMED / UNREACHABLE / VERSION_MISMATCH
 *                         即 exit 1（默认只对 UNREACHABLE 与 VERSION_MISMATCH 退出非零）
 *   --timeout <ms>        单请求超时，默认 8000
 *   --json                stdout 只输出 JSON（CI 消费）；默认输出人读表格
 *   --allow-degraded      不把 DEGRADED 计入 strict 失败（默认已不计入，显式保留以示意图）
 *
 * 退出码：0 = 通过；1 = 有阻断级问题（见上）；2 = 参数错误
 *
 * 判定分级（**看响应体，不只看状态码**）：
 *   本项目吃过这个亏：响应体已诚实标 dataSource:'unavailable' 但 HTTP 是 500，
 *   前端走 catch 根本不解析 dataSource —— 于是「诚实降级」在链路上等价于「无差别报错」。
 *   因此 200 + 诚实标 unavailable 记为 DEGRADED（可用但无数据），与 ERROR 区分开。
 *
 *   OK          200 且响应体含关键字段、dataSource 非 unavailable
 *   DEGRADED    200 且 dataSource 诚实标为 unavailable/degraded（服务活着，数据不可得）
 *   NOT_FOUND   404 —— 典型即「该端点从未被部署」
 *   ERROR       4xx（非 404）/ 5xx
 *   MALFORMED   200 但缺关键字段，或 dataSource 取值非法/缺失
 *   UNREACHABLE 连接失败/超时 —— 实例根本没起来
 *
 * 约束：纯 Node ESM 零依赖（只用内置 node:* ），刻意不引 axios/supertest 等，
 *       以便 CI 与本地环境都能直接 `node` 执行。
 * ============================================================================
 */

import { setTimeout as delay } from 'node:timers/promises';

// ---------------------------------------------------------------------------
// 0. 参数解析
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {
    base: process.env.SMOKE_BASE_URL || '',
    expectCommit: process.env.EXPECTED_COMMIT_SHA || '',
    strict: false,
    timeout: 8000,
    json: false,
    allowDegraded: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base') args.base = argv[++i] || '';
    else if (a === '--expect-commit') args.expectCommit = argv[++i] || '';
    else if (a === '--timeout') args.timeout = Number(argv[++i]) || args.timeout;
    else if (a === '--strict') args.strict = true;
    else if (a === '--json') args.json = true;
    else if (a === '--allow-degraded') args.allowDegraded = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  process.stdout.write(
    'production-smoke —— 部署后自动烟测\n\n' +
    '  node scripts/smoke/production-smoke.mjs --base <url> [--strict] [--expect-commit <sha>] [--json]\n',
  );
  process.exit(0);
}

if (!args.base) {
  process.stderr.write('参数错误：缺少 --base <url>（或设置 SMOKE_BASE_URL）\n');
  process.exit(2);
}

const BASE = args.base.replace(/\/+$/, '');

// ---------------------------------------------------------------------------
// 1. 端点清单
//    key      仅用于输出，可读标识
//    path     相对 BASE 的路径
//    required 判定 OK 所必需的关键字段路径（点号分隔，支持 a.b 与 a[].b 省略数组下标）
//    说明：required 只取「这个端点存在」就必然有的结构性字段（不含任何可能因数据
//          源变化而消失的字段），否则正常降级会被误判成 MALFORMED。
// ---------------------------------------------------------------------------
//    requireDataSource 该端点是否为「供数端点」。
//      true  → 响应体必须带 dataSource，否则判 MALFORMED（前端要靠它区分真实/不可得）
//      false → 元信息端点（/health、/api/version），它们不供数，不该要求 dataSource
const ENDPOINTS = [
  { key: 'health', path: '/health', required: ['status'], requireDataSource: false },
  { key: 'version', path: '/api/version', required: ['appVersion'], requireDataSource: false },
  { key: 'marketSummary', path: '/api/market/summary', required: ['data'], requireDataSource: true },
  { key: 'stocks', path: '/api/stocks?page=1&pageSize=3', required: ['data'], requireDataSource: true },
  { key: 'sectorsMomentum', path: '/api/sectors/momentum', required: ['data'], requireDataSource: true },
  { key: 'marketRealtime', path: '/api/market/realtime', required: ['data'], requireDataSource: true },
  { key: 'factorsOverview', path: '/api/factors/overview', required: ['data'], requireDataSource: true },
  { key: 'screenerTemplates', path: '/api/screener/templates', required: ['data'], requireDataSource: true },
  { key: 'etfList', path: '/api/etf/list', required: ['data'], requireDataSource: true },
  { key: 'industries', path: '/api/industries', required: ['data'], requireDataSource: true },
  { key: 'fundFlow600519', path: '/api/fund-flow/600519', required: ['data'], requireDataSource: true },
];

/** dataSource 的「诚实不可得」取值。命中即 DEGRADED。 */
const UNAVAILABLE_SOURCES = new Set(['unavailable', 'degraded', 'refused', 'fabricated-refused']);
/** dataSource 的合法「有数据」取值。命中即 OK（前提是其余关键字段齐备）。 */
const REAL_SOURCES = new Set([
  'eastmoney', 'tencent', 'sina', 'em', 'tx', 'akshare', 'tushare',
  'real', 'live', 'cache', 'db', 'memory', 'local',
]);

// ---------------------------------------------------------------------------
// 2. 工具：字段路径探测 / dataSource 提取
// ---------------------------------------------------------------------------
function hasPath(obj, path) {
  const parts = path.split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined) return false;
    // 支持 a[]  —— 数组只探测「第一个元素」，避免把空数组误判为缺字段
    if (part.endsWith('[]')) {
      const key = part.slice(0, -2);
      const arr = cur[key];
      if (!Array.isArray(arr) || arr.length === 0) return false;
      cur = arr[0];
      continue;
    }
    cur = cur[part];
  }
  return true;
}

/**
 * 从响应体里递归找出 dataSource（最深 4 层）。
 * 之所以要递归：项目里 dataSource 既在顶层、也在 data/ 内、也在 data.items[] 内，
 * 位置不统一，只查顶层会漏判（漏判的后果是把诚实降级误报成 OK）。
 */
function extractDataSource(body) {
  if (!body || typeof body !== 'object') return undefined;
  const seen = new Set();
  const walk = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 4 || seen.has(node)) return undefined;
    seen.add(node);
    if (typeof node.dataSource === 'string') return node.dataSource;
    for (const v of Object.values(node)) {
      if (v && typeof v === 'object') {
        const got = walk(v, depth + 1);
        if (got !== undefined) return got;
      }
    }
    return undefined;
  };
  return walk(body, 0);
}

// ---------------------------------------------------------------------------
// 3. 单端点探测
// ---------------------------------------------------------------------------
async function probe(endpoint) {
  const url = `${BASE}${endpoint.path}`;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeout);
  let verdict = 'ERROR';
  let reason = '';
  let httpStatus = null;
  let dataSource;
  let commit;

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    httpStatus = res.status;
    const text = await res.text();

    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = undefined;
    }

    // 版本信息：无论本次判定如何，只要响应体里带 build/commit 就记下来（版本校验独立于健康判定）
    if (body && typeof body === 'object') {
      const c = body.commit ?? body.build?.commit;
      if (typeof c === 'string' && /^[0-9a-f]{7,40}$/i.test(c.trim())) commit = c.trim().toLowerCase();
    }

    if (res.status === 404) {
      verdict = 'NOT_FOUND';
      reason = '404 —— 该端点在目标实例上不存在（典型成因：这份代码从未被部署）';
    } else if (res.status >= 500) {
      verdict = 'ERROR';
      reason = `HTTP ${res.status}`;
      // 5xx 但响应体诚实标了 unavailable —— 仍记 ERROR（前端走 catch 拿不到 dataSource），
      // 但把这一点写进 reason，避免误判成「后端崩了」而误伤排查方向。
      const ds = extractDataSource(body);
      if (ds && UNAVAILABLE_SOURCES.has(ds)) {
        reason += `（响应体诚实标 dataSource='${ds}'，但状态码语义仍是错误 —— 前端 catch 分支拿不到 dataSource）`;
      }
    } else if (res.status >= 400) {
      verdict = 'ERROR';
      reason = `HTTP ${res.status}`;
    } else if (body === undefined) {
      verdict = 'MALFORMED';
      reason = `HTTP ${res.status} 但响应体不是合法 JSON`;
    } else {
      dataSource = extractDataSource(body);
      const missing = endpoint.required.filter((p) => !hasPath(body, p));
      if (missing.length > 0) {
        verdict = 'MALFORMED';
        reason = `HTTP ${res.status} 但缺关键字段: ${missing.join(', ')}`;
      } else if (dataSource && UNAVAILABLE_SOURCES.has(dataSource)) {
        verdict = 'DEGRADED';
        reason = `HTTP ${res.status}，dataSource='${dataSource}'（服务可达，数据诚实不可得）`;
      } else if (dataSource && !REAL_SOURCES.has(dataSource)) {
        verdict = 'MALFORMED';
        reason = `HTTP ${res.status} 但 dataSource 取值非法: '${dataSource}'`;
      } else if (!dataSource && endpoint.requireDataSource) {
        // 供数端点的响应体里根本没有 dataSource —— 不判OK。
        // 理由：本项目吃过「前端走 catch 分支，压根不解析 dataSource」的亏，
        // 而没有 dataSource 的 200 响应在前端看来与「有真实数据」完全无法区分。
        // 判 OK 等于替这条端点背书「数据可追溯」，那是不实的。
        verdict = 'MALFORMED';
        reason = `HTTP ${res.status} 但响应体无 dataSource —— 前端无法区分「真实数据」与「不可得」，诚实契约缺失`;
      } else {
        verdict = 'OK';
        reason = dataSource ? `HTTP ${res.status}，dataSource='${dataSource}'` : `HTTP ${res.status}`;
      }
    }
  } catch (err) {
    const msg = err && err.name === 'AbortError' ? `请求超时（>${args.timeout}ms）` : String(err && err.message || err);
    verdict = 'UNREACHABLE';
    reason = msg;
  } finally {
    clearTimeout(timer);
  }

  return {
    key: endpoint.key,
    path: endpoint.path,
    verdict,
    reason,
    httpStatus,
    dataSource: dataSource ?? null,
    commit: commit ?? null,
    durationMs: Date.now() - started,
  };
}

/** 读取 /health 的 service 字段，用于判定「到底是谁在应答」 */
async function probeService(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), args.timeout);
    const res = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    clearTimeout(timer);
    if (!res.ok) return null;
    const body = await res.json();
    // backend 的 /health 把 service 放在 build 对象里（与 /api/version 同源）；
    // clair-worker 的 /health 把它放在顶层。两处都读，兼容两种形态。
    const svc = body?.service ?? body?.build?.service;
    return typeof svc === 'string' ? svc : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 4. 主流程
// ---------------------------------------------------------------------------
async function main() {
  // 目标实例的 commit：优先 /api/version，退守 /health.build.commit
  const versionProbe = await probe(ENDPOINTS[1]);
  const healthProbe = await probe(ENDPOINTS[0]);
  const targetCommit = versionProbe.commit || healthProbe.commit || null;

  // ---- 目标实例自报身份 ----
  // 这一步不是装饰。实测 https://clair-api.pages.dev 上 /api/market/summary 等端点
  // 返回 200 且带完整业务数据，但 /health 自报 {"service":"clair-worker"}——也就是说
  // **回答请求的根本不是 backend/ 这份代码，而是 clair-worker**（另一套实现）。
  // 若只看状态码，烟测会全绿，从而给出「后端已上线且健康」的错误结论。
  // 故显式记录服务身份，不一致时明确报出来。
  const targetService = await probeService(`${BASE}/health`);
  const serviceNote = targetService === null
    ? '未能读取 /health 的 service 字段，无法确认应答方是谁'
    : targetService === 'clair-backend'
      ? '应答方为 clair-backend（backend/ 这份代码）'
      : `应答方为 **${targetService}**，不是 backend/ 这份代码 —— `
        + '本仓库的 backend 端点在该实例上并不存在，部分 200 来自另一套实现';

  const results = [];
  for (const ep of ENDPOINTS) {
    if (ep.key === 'version' || ep.key === 'health') continue; // 上面已探测过
    results.push(await probe(ep));
    await delay(50); // 轻微限速，避免瞬时打满
  }

  // ---- 版本一致性判定（本单的核心落点）----
  const expected = (args.expectCommit || '').trim().toLowerCase();
  let versionStatus = 'UNKNOWN';
  let versionNote;
  if (!expected) {
    versionNote = '未提供 --expect-commit，跳过版本比对（目标实例 commit 仅记录）';
  } else if (!targetCommit) {
    versionStatus = 'VERSION_MISMATCH';
    versionNote = `期望 commit ${expected.slice(0, 7)}，但目标实例未自报任何 commit`
      + '（后端未部署 /api/version，或该实例未注入 GIT_COMMIT_SHA）';
  } else if (targetCommit.startsWith(expected) || expected.startsWith(targetCommit)) {
    versionStatus = 'MATCH';
    versionNote = `目标实例 commit ${targetCommit.slice(0, 7)} 与期望 ${expected.slice(0, 7)} 一致`;
  } else {
    versionStatus = 'VERSION_MISMATCH';
    versionNote = `期望 commit ${expected.slice(0, 7)}，目标实例实际为 ${targetCommit.slice(0, 7)} —— 目标实例跑的是旧代码`;
  }

  const all = [versionProbe, healthProbe, ...results];
  const counts = all.reduce((acc, r) => { acc[r.verdict] = (acc[r.verdict] || 0) + 1; return acc; }, {});
  const blocking = all.filter((r) =>
    r.verdict === 'NOT_FOUND' || r.verdict === 'ERROR' || r.verdict === 'MALFORMED' || r.verdict === 'UNREACHABLE');
  const degraded = all.filter((r) => r.verdict === 'DEGRADED');

  const versionBlocking = versionStatus === 'VERSION_MISMATCH';
  const fail = args.strict ? blocking.length > 0 || versionBlocking
    : all.some((r) => r.verdict === 'UNREACHABLE') || versionBlocking;

  const report = {
    base: BASE,
    checkedAt: new Date().toISOString(),
    mode: { strict: args.strict, expectCommit: expected || null, timeoutMs: args.timeout },
    version: {
      status: versionStatus,
      expectedCommit: expected || null,
      targetCommit,
      targetCommitShort: targetCommit ? targetCommit.slice(0, 7) : null,
      note: versionNote,
    },
    target: {
      service: targetService,
      serviceNote,
      // 应答方不是 backend/ 时明确标出来：否则「部分端点 200」会被误读成「后端已上线」
      answeringBackendCode: targetService === 'clair-backend',
    },
    summary: {
      total: all.length,
      ok: counts.OK || 0,
      degraded: counts.DEGRADED || 0,
      notFound: counts.NOT_FOUND || 0,
      error: counts.ERROR || 0,
      malformed: counts.MALFORMED || 0,
      unreachable: counts.UNREACHABLE || 0,
    },
    results: all,
    pass: !fail,
  };

  if (args.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    const pad = (s, n) => String(s).padEnd(n);
    const lines = [];
    lines.push('');
    lines.push(`生产烟测 · ${BASE}`);
    lines.push(`时间 ${report.checkedAt}   模式 ${args.strict ? 'STRICT' : 'DEFAULT'}${expected ? `   期望commit ${expected.slice(0, 7)}` : '   期望commit(未提供)'}`);
    lines.push('');
    lines.push(`  ${pad('端点', 20)}${pad('判定', 12)}${pad('HTTP', 6)}说明`);
    lines.push(`  ${'-'.repeat(18)} ${'-'.repeat(10)} ${'-'.repeat(4)} ${'-'.repeat(40)}`);
    for (const r of all) {
      lines.push(`  ${pad(r.key, 20)}${pad(r.verdict, 12)}${pad(r.httpStatus ?? '-', 6)}${r.reason}`);
    }
    lines.push('');
    lines.push(`  版本一致性: ${versionStatus}`);
    lines.push(`    ${versionNote}`);
    lines.push('');
    lines.push(`  应答方身份: ${targetService ?? '(未知)'}`);
    lines.push(`    ${serviceNote}`);
    lines.push(`  汇总: OK ${report.summary.ok} · DEGRADED ${report.summary.degraded} · NOT_FOUND ${report.summary.notFound}`
      + ` · ERROR ${report.summary.error} · MALFORMED ${report.summary.malformed} · UNREACHABLE ${report.summary.unreachable}`);
    if (degraded.length > 0) {
      lines.push(`  （DEGRADED ${degraded.length} 项为「服务可达但数据诚实不可得」，不算失败）`);
    }
    if (!report.pass) {
      lines.push('');
      lines.push(`  ✗ 未通过${args.strict ? '（STRICT：任一端点非 OK/DEGRADED 即失败）' : '（存在 UNREACHABLE 或版本不一致）'}`);
    } else {
      lines.push('');
      lines.push('  ✓ 通过');
    }
    lines.push('');
    process.stdout.write(lines.join('\n'));
  }

  process.exit(report.pass ? 0 : 1);
}

main().catch((err) => {
  process.stderr.write(`production-smoke 自身异常: ${err && err.stack || err}\n`);
  process.exit(2);
});