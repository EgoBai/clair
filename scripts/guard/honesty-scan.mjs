#!/usr/bin/env node
/**
 * honesty-scan —— 跨端「诚实红线」门禁扫描器（第一版：NON-BLOCKING）
 * ============================================================================
 * 目的：补上既有前端静态门禁（frontend/scripts/ui-guard/**，作用域硬绑 frontend/）
 *       无法覆盖的一环 —— **后端供数路径的伪数据** 与 **dataSource 诚实降级契约缺失**。
 *
 * 运行：node scripts/guard/honesty-scan.mjs      （必须从仓库根执行）
 * 产出：scripts/guard/honesty-baseline.md        （幂等覆盖，不追加）
 * 退出码：恒为 0（NON-BLOCKING；allowlist 定稿后才转阻断）
 *
 * 约束：纯 Node ESM，仅用内置模块 node:fs / node:path / node:url，无任何外部依赖。
 * ============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// 0. 仓库根与产物路径
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUT_FILE = path.join(REPO_ROOT, 'scripts', 'guard', 'honesty-baseline.md');

const SCAN_ROOTS = ['backend/src', 'frontend/src']; // 规则 A 扫描根（相对仓库根）
const SRC_EXT = new Set(['.ts', '.tsx']);           // 只扫 TS/TSX
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', '.vite']);

const GENERATED_CMD = 'node scripts/guard/honesty-scan.mjs';

// ---------------------------------------------------------------------------
// 1. 规则 A 分域判据（路径 → 域）
// ---------------------------------------------------------------------------
// 豁免域标记：归档 / 死代码 / 备份 / 测试 / 种子数据。命中即「仅计数、不判定」。
const EXEMPT_MARKERS = ['_archived', '.dead-code', '.bak', '.test.', '.spec.', '__tests__', 'seeds/'];

// 供数路径（RED）：后端 API 路由层 + 服务层，凡在此编造数值即红线。
const SUPPLY_MARKERS = ['backend/src/api/', 'backend/src/services/'];

/**
 * 归一化路径：统一为 POSIX 分隔符，并加前导 '/'，
 * 便于用 `seeds/`、`__tests__` 这类片段做「路径段」级匹配，避免误伤同名前缀。
 */
function normalizePath(p) {
  return '/' + p.split(path.sep).join('/');
}

/** 域判定：返回 'exempt' | 'red' | 'yellow'。豁免优先（_archived 下的 api 供数文件不计红线）。 */
function classifyDomain(relPath) {
  const norm = normalizePath(relPath);
  if (EXEMPT_MARKERS.some((m) => norm.includes(m))) return 'exempt';
  if (SUPPLY_MARKERS.some((m) => norm.includes(m))) return 'red';
  return 'yellow';
}

// ---------------------------------------------------------------------------
// 2. 递归遍历（自己实现，不引 glob）
// ---------------------------------------------------------------------------
function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(full, out);
    } else if (e.isFile() && SRC_EXT.has(path.extname(e.name))) {
      out.push(full);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3. 注释掩码（区分「代码里的 Math.random」与「注释里的提及」）
// ---------------------------------------------------------------------------
// 说明：注释中提及 Math.random（例如「原实现全量 Math.random 伪数据，已移除」）
//       不产生任何运行期伪数据，若判为红线即为假阳性、会击穿门禁可信度。
//       故这里用一个小状态机为每个字符打掩码：1=注释，0=代码。
// 限制（诚实声明）：模板字符串按「直到下一个未转义反引号」处理，不解析 ${} 嵌套；
//       整体仅为启发式，已覆盖本仓库实际写法。
function computeCommentMask(src) {
  const mask = new Uint8Array(src.length);
  let i = 0;
  let state = 'code';
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (state === 'code') {
      if (c === '/' && c2 === '/') { mask[i] = 1; mask[i + 1] = 1; i += 2; state = 'line'; continue; }
      if (c === '/' && c2 === '*') { mask[i] = 1; mask[i + 1] = 1; i += 2; state = 'block'; continue; }
      if (c === '"') { i++; state = 'dq'; continue; }
      if (c === "'") { i++; state = 'sq'; continue; }
      if (c === '`') { i++; state = 'tpl'; continue; }
      i++; continue;
    }
    if (state === 'line') {
      if (c === '\n') { state = 'code'; i++; continue; }
      mask[i] = 1; i++; continue;
    }
    if (state === 'block') {
      if (c === '*' && c2 === '/') { mask[i] = 1; mask[i + 1] = 1; i += 2; state = 'code'; continue; }
      mask[i] = 1; i++; continue;
    }
    if (state === 'dq' || state === 'sq' || state === 'tpl') {
      if (c === '\\') { i += 2; continue; }
      if ((state === 'dq' && c === '"') || (state === 'sq' && c === "'") || (state === 'tpl' && c === '`')) {
        state = 'code'; i++; continue;
      }
      i++; continue;
    }
    i++;
  }
  return mask;
}

// ---------------------------------------------------------------------------
// 4. 规则 A：分域 Math.random 扫描
// ---------------------------------------------------------------------------
const RANDOM_RE = /Math\.random/g;
const MAX_SNIPPET = 120;

function scanRuleA() {
  const hits = { red: [], yellow: [], exempt: [], comment: [] }; // 每条: {file, line, text}
  const exemptByFile = new Map(); // file -> count（豁免域仅计数）

  const files = [];
  for (const root of SCAN_ROOTS) walk(path.join(REPO_ROOT, root), files);
  files.sort(); // 确定性输出

  for (const abs of files) {
    const rel = path.relative(REPO_ROOT, abs).split(path.sep).join('/');
    const domain = classifyDomain(rel);
    let src;
    try {
      src = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    if (!src.includes('Math.random')) continue;

    const mask = computeCommentMask(src);
    const lines = src.split('\n');
    // 预计算每行起始 offset
    const lineStart = new Array(lines.length);
    let off = 0;
    for (let li = 0; li < lines.length; li++) { lineStart[li] = off; off += lines[li].length + 1; }

    RANDOM_RE.lastIndex = 0;
    let m;
    while ((m = RANDOM_RE.exec(src)) !== null) {
      const idx = m.index;
      // 定位行号
      let lo = 0, hi = lines.length - 1, li = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (lineStart[mid] <= idx) { li = mid; lo = mid + 1; } else { hi = mid - 1; }
      }
      const lineNo = li + 1;
      const raw = lines[li].trim().replace(/\s+/g, ' ');
      const text = raw.length > MAX_SNIPPET ? raw.slice(0, MAX_SNIPPET) + '…' : raw;
      const isComment = mask[idx] === 1;

      if (isComment) {
        hits.comment.push({ file: rel, line: lineNo, text });
      } else if (domain === 'exempt') {
        exemptByFile.set(rel, (exemptByFile.get(rel) || 0) + 1);
        hits.exempt.push({ file: rel, line: lineNo, text });
      } else if (domain === 'red') {
        hits.red.push({ file: rel, line: lineNo, text });
      } else {
        hits.yellow.push({ file: rel, line: lineNo, text });
      }
    }
  }
  return { hits, exemptByFile };
}

// ---------------------------------------------------------------------------
// 5. 规则 B：dataSource 契约缺失扫描（backend/src/api/*.ts，仅一层）
// ---------------------------------------------------------------------------
const ROUTE_RE = /router\.(get|post|put|delete)\s*\(/g;

function scanRuleB() {
  const apiDir = path.join(REPO_ROOT, 'backend', 'src', 'api');
  const results = []; // {file, routes:N, dataSource:M}
  let entries;
  try {
    entries = fs.readdirSync(apiDir, { withFileTypes: true });
  } catch {
    return results;
  }
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.d.ts'))
    .map((e) => e.name)
    .sort();

  for (const name of files) {
    const abs = path.join(apiDir, name);
    let src;
    try {
      src = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    ROUTE_RE.lastIndex = 0;
    let n = 0;
    while (ROUTE_RE.exec(src) !== null) n++;
    const mCount = (src.match(/dataSource/g) || []).length;
    results.push({ file: `backend/src/api/${name}`, routes: n, dataSource: mCount });
  }
  return results;
}

// ---------------------------------------------------------------------------
// 6. 报告渲染（幂等覆盖写）
// ---------------------------------------------------------------------------
function fmtRows(hits) {
  if (!hits.length) return '| — | （无命中） |\n';
  return hits.map((h) => `| \`${h.file}:${h.line}\` | \`${h.text}\` |`).join('\n') + '\n';
}

function renderReport({ ruleA, ruleB, generatedAt }) {
  const { hits, exemptByFile } = ruleA;
  const contractMissing = ruleB.filter((r) => r.routes > 0 && r.dataSource === 0);

  const exemptFileCount = exemptByFile.size;
  const exemptLineCount = hits.exempt.length;

  const L = [];
  L.push('# 诚实红线门禁基线报告（honesty-scan）');
  L.push('');
  L.push('> **当前状态：NON-BLOCKING（非阻断）** —— 白名单（allowlist）尚未定稿，退出码恒为 0；allowlist 定稿后转阻断级。');
  L.push('');
  L.push(`- 生成命令：\`${GENERATED_CMD}\`（在仓库根执行）`);
  L.push(`- 生成时间：${generatedAt}`);
  L.push(`- 扫描根：${SCAN_ROOTS.map((r) => '`' + r + '`').join('、')}（仅 \`*.ts\` / \`*.tsx\`）`);
  L.push('- 规则 A 判据：`Math.random` 按路径分域（RED=供数路径 / YELLOW=其它 / 豁免=归档·测试·种子）；注释内提及单列、不计违规。');
  L.push('- 规则 B 判据：`backend/src/api/*.ts` 一层内 路由数 N>0 且 `dataSource` 次数 M==0 → `CONTRACT-MISSING`。');
  L.push('');
  L.push('## 摘要');
  L.push('');
  L.push('| 域 / 指标 | 判据 | 命中数 |');
  L.push('|---|---|---|');
  L.push(`| **RED**（供数路径） | 路径含 \`backend/src/api/\` 或 \`backend/src/services/\` | **${hits.red.length}** |`);
  L.push(`| **YELLOW**（其它） | 其余前端/后端代码 | **${hits.yellow.length}** |`);
  L.push(`| 豁免域 | \`_archived\` / \`.bak\` / \`.test.\` / \`.spec.\` / \`__tests__\` / \`seeds/\` | ${exemptLineCount} 行 / ${exemptFileCount} 文件（仅计数） |`);
  L.push(`| 注释中提及（非违规） | 位于注释内，不产生运行期伪数据 | ${hits.comment.length} |`);
  L.push(`| **规则 B 命中文件数** | 有路由但全文无 \`dataSource\` | **${contractMissing.length}** |`);
  L.push('');

  L.push('## 规则 A 明细');
  L.push('');
  L.push('### RED 域（供数路径，红线候选）');
  L.push('');
  L.push('| 路径:行 | 行内容（截断 120 字符） |');
  L.push('|---|---|');
  L.push(fmtRows(hits.red).trimEnd());
  L.push('');
  L.push('### YELLOW 域（非供数路径，待评估）');
  L.push('');
  L.push('| 路径:行 | 行内容（截断 120 字符） |');
  L.push('|---|---|');
  L.push(fmtRows(hits.yellow).trimEnd());
  L.push('');
  L.push('### 豁免域（仅计数，不逐行列出）');
  L.push('');
  if (exemptByFile.size) {
    L.push('| 文件 | 命中行数 |');
    L.push('|---|---|');
    [...exemptByFile.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([f, c]) => L.push(`| \`${f}\` | ${c} |`));
  } else {
    L.push('（无）');
  }
  L.push('');
  L.push('### 注释中提及（非违规，仅供参考）');
  L.push('');
  L.push('| 路径:行 | 行内容（截断 120 字符） |');
  L.push('|---|---|');
  L.push(fmtRows(hits.comment).trimEnd());
  L.push('');

  L.push('## 规则 B 明细（backend/src/api/*.ts）');
  L.push('');
  L.push('| 文件 | 路由数 N | dataSource 次数 M | 标记 |');
  L.push('|---|---:|---:|---|');
  if (ruleB.length) {
    for (const r of ruleB) {
      const flag = r.routes > 0 && r.dataSource === 0 ? '`CONTRACT-MISSING`' : '';
      L.push(`| \`${r.file}\` | ${r.routes} | ${r.dataSource} | ${flag} |`);
    }
  } else {
    L.push('| — | 0 | 0 | （未读到 api 目录） |');
  }
  L.push('');
  L.push('> 注意：规则 B 必有误报（纯鉴权 / 健康检查 / meta / docs 端点本就不供数），第一版**只列不判死**，供主理人建白名单。');
  L.push('');
  L.push('---');
  L.push('');
  L.push(`**当前状态：NON-BLOCKING（非阻断）** —— 白名单（allowlist）尚未定稿，退出码恒为 0；allowlist 定稿后转阻断级。`);
  L.push('');
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// 7. main
// ---------------------------------------------------------------------------
function main() {
  const generatedAt = new Date().toISOString();
  const ruleA = scanRuleA();
  const ruleB = scanRuleB();
  const report = renderReport({ ruleA, ruleB, generatedAt });

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, report, 'utf8'); // 覆盖写，幂等，不追加

  const contractMissing = ruleB.filter((r) => r.routes > 0 && r.dataSource === 0);
  const relOut = path.relative(REPO_ROOT, OUT_FILE).split(path.sep).join('/');

  const out = [];
  out.push('=== honesty-scan (NON-BLOCKING) ===');
  out.push(`RED (供数路径)        : ${ruleA.hits.red.length}`);
  out.push(`YELLOW (其它)         : ${ruleA.hits.yellow.length}`);
  out.push(`豁免域 (仅计数)       : ${ruleA.hits.exempt.length} 行 / ${ruleA.exemptByFile.size} 文件`);
  out.push(`注释提及 (非违规)     : ${ruleA.hits.comment.length}`);
  out.push(`规则B CONTRACT-MISSING: ${contractMissing.length} 文件`);
  out.push(`报告已落盘            : ${relOut}`);
  out.push('[NON-BLOCKING] exit 0');
  process.stdout.write(out.join('\n') + '\n');

  process.exitCode = 0;
}

main();
