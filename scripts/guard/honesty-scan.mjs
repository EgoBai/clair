#!/usr/bin/env node
/**
 * honesty-scan —— 跨端「诚实红线」门禁扫描器
 * ============================================================================
 * 目的：补上既有前端静态门禁（frontend/scripts/ui-guard/**，作用域硬绑 frontend/）
 *       无法覆盖的一环 —— **后端供数路径的伪数据** 与 **dataSource 诚实降级契约缺失**。
 *
 * 运行：node scripts/guard/honesty-scan.mjs                    （默认：NON-BLOCKING，exit 0；**只写 stdout**）
 *       node scripts/guard/honesty-scan.mjs --strict           （未豁免 RED / 过期豁免 / 台账不同步 → exit 1）
 *       node scripts/guard/honesty-scan.mjs --update-baseline  （额外把报告覆盖写入受控基线文件）
 *       node scripts/guard/honesty-scan.mjs --update-rulec-baseline （重写规则 C 棘轮基线 rulec-baseline.json）
 * 产出：默认**不写任何文件**；仅显式 `--update-baseline` 时写
 *       scripts/guard/honesty-baseline.md（幂等覆盖，不追加）。
 *       —— R0′-11a：写入改为 opt-in，杜绝「每次运行都弄脏工作树」与并发互相覆盖。
 *
 * 约束：纯 Node ESM，仅用内置模块 node:fs / node:path / node:url，无任何外部依赖。
 * ============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// 0. 仓库根、产物路径、运行模式
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUT_FILE = path.join(REPO_ROOT, 'scripts', 'guard', 'honesty-baseline.md');
const ALLOWLIST_FILE = path.join(REPO_ROOT, 'scripts', 'guard', 'allowlist.json');
// 规则 C 棘轮基线：存量（含良性）记账，新增即阻断；修完后用 --update-rulec-baseline 收缩。
const RULEC_BASELINE_FILE = path.join(REPO_ROOT, 'scripts', 'guard', 'rulec-baseline.json');

const STRICT = process.argv.includes('--strict');
// R0′-11a：基线写入改为显式 opt-in。默认只写 stdout，不触碰受版本控制的基线文件。
const UPDATE_BASELINE = process.argv.includes('--update-baseline');
const UPDATE_RULEC = process.argv.includes('--update-rulec-baseline');

const SCAN_ROOTS = ['backend/src', 'frontend/src']; // 规则 A 扫描根（相对仓库根）
const SRC_EXT = new Set(['.ts', '.tsx']);           // 只扫 TS/TSX
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', '.vite']);

const GENERATED_CMD = 'node scripts/guard/honesty-scan.mjs';

// 豁免类别枚举（allowlist.json 中 category 只允许这五种；越界即视为未豁免）
const CATEGORY_ENUM = new Set([
  'id-generation',
  'stochastic-algorithm',
  'behavioral-random',
  'unwired-module',
  'acknowledged-debt',
]);

// 「30 天内到期」高亮阈值
const EXPIRY_WARN_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// 豁免台账表头（渲染与 R0′-11b 同步校验共用同一常量，避免两处漂移）
const LEDGER_HEADER = '| 豁免ID | category | 路径 | match | 到期日期(expiresAt) | clearingTicket | 状态 |';

// ---------------------------------------------------------------------------
// 1. 规则 A 分域判据（路径 → 域）
// ---------------------------------------------------------------------------
// 豁免域标记：归档 / 死代码 / 备份 / 测试 / 种子数据。命中即「仅计数、不判定」。
const EXEMPT_MARKERS = ['_archived', '.dead-code', '.bak', '.test.', '.spec.', '__tests__', 'seeds/'];

// 供数路径（RED）：后端 API 路由层 + 服务层 + 内存库，凡在此编造数值即红线。
// 注：`backend/src/db/` 于 R0′-1 A.1 依主理人裁决升为 RED（InMemoryDatabase 伪行情）。
const SUPPLY_MARKERS = ['backend/src/api/', 'backend/src/services/', 'backend/src/db/'];

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
// 3. 非代码掩码（区分「可执行代码里的 Math.random」与「注释/字符串文本里的提及」）
// ---------------------------------------------------------------------------
// 说明：注释、以及**字符串字面量的文本部分**中提及 Math.random（例如
//       「原实现全量 Math.random 伪数据，已移除」或 console.warn('...Math.random 伪造...')）
//       都不会产生任何运行期伪数据，若判为红线即为假阳性、会击穿门禁可信度。
//       故用一个小状态机为每个字符打掩码：0=代码，1=注释，2=字符串文本。
// 关键：模板字符串的 `${ ... }` 插值部分**按代码处理**（不是字符串文本），
//       否则 `` `user_${Math.random()}` `` 这类真实调用会被误掩、造成漏报。
// 关键：必须识别 **正则字面量** —— 形如 `.replace(/"/g, ...)`、`/[&<>"']/g` 的正则内含引号，
//       若不识别会导致状态机失步、把后续真实调用误判为字符串文本（漏报）。故用
//       「前一个有意义字符」启发式区分正则 `/` 与除号 `/`（标识符/`)`/`]`/`}`/`.` 之后为除号）。
// 限制（诚实声明）：插值内用花括号深度计数处理对象字面量；`return /re/` 这类
//       关键字后接正则的写法未特殊处理。整体为启发式，已覆盖本仓库实际写法。
function computeNonCodeMask(src) {
  const mask = new Uint8Array(src.length); // 0=code, 1=comment, 2=string-text
  let i = 0;
  let mode = 'code';
  const tplStack = []; // 模板插值栈：记录每个 ${ } 内的花括号深度
  let inClass = false; // 正则 [...] 字符类内
  let prevSig = '';    // 代码模式下上一个「有意义字符」，用于判定 `/` 是正则还是除号
  const n = src.length;
  const isIdentChar = (ch) => /[A-Za-z0-9_$]/.test(ch);
  const isSpace = (ch) => ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n';

  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (mode === 'code') {
      // 模板插值内的花括号配平
      if (tplStack.length) {
        if (c === '{') { tplStack[tplStack.length - 1]++; prevSig = '{'; i++; continue; }
        if (c === '}') {
          if (tplStack[tplStack.length - 1] > 0) { tplStack[tplStack.length - 1]--; prevSig = '}'; i++; continue; }
          tplStack.pop(); mode = 'tplText'; i++; continue;
        }
      }
      if (c === '/' && c2 === '/') { mask[i] = 1; mask[i + 1] = 1; i += 2; mode = 'line'; continue; }
      if (c === '/' && c2 === '*') { mask[i] = 1; mask[i + 1] = 1; i += 2; mode = 'block'; continue; }
      if (c === '/') {
        const division = prevSig !== '' && (isIdentChar(prevSig) || prevSig === ')' || prevSig === ']' || prevSig === '}' || prevSig === '.');
        if (division) { prevSig = '/'; i++; continue; }
        inClass = false; mode = 'regex'; i++; continue; // 正则字面量
      }
      if (c === '"') { i++; mode = 'dq'; continue; }
      if (c === "'") { i++; mode = 'sq'; continue; }
      if (c === '`') { i++; mode = 'tplText'; continue; }
      if (!isSpace(c)) prevSig = c;
      i++; continue;
    }
    if (mode === 'line') {
      if (c === '\n') { mode = 'code'; i++; continue; }
      mask[i] = 1; i++; continue;
    }
    if (mode === 'block') {
      if (c === '*' && c2 === '/') { mask[i] = 1; mask[i + 1] = 1; i += 2; mode = 'code'; continue; }
      mask[i] = 1; i++; continue;
    }
    if (mode === 'regex') {
      if (c === '\\') { i += 2; continue; }
      if (c === '[') { inClass = true; i++; continue; }
      if (c === ']') { inClass = false; i++; continue; }
      if (c === '/' && !inClass) { mode = 'code'; prevSig = '/'; i++; continue; }
      if (c === '\n') { mode = 'code'; i++; continue; } // 未闭合正则兜底，避免吞掉整文件
      i++; continue;
    }
    if (mode === 'dq' || mode === 'sq') {
      if (c === '\\') { mask[i] = 2; i += 2; continue; }
      if ((mode === 'dq' && c === '"') || (mode === 'sq' && c === "'")) { mode = 'code'; prevSig = c; i++; continue; }
      mask[i] = 2; i++; continue;
    }
    if (mode === 'tplText') {
      if (c === '\\') { mask[i] = 2; i += 2; continue; }
      if (c === '`') { mode = 'code'; prevSig = '`'; i++; continue; }
      if (c === '$' && c2 === '{') { i += 2; tplStack.push(0); prevSig = ''; mode = 'code'; continue; } // 插值 → 代码
      mask[i] = 2; i++; continue;
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
  const hits = { red: [], yellow: [], exempt: [], comment: [] }; // 每条: {file, line, text, lineRaw}
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

    const mask = computeNonCodeMask(src);
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
      const lineRaw = lines[li].trim();                       // 未截断，供 allowlist 匹配
      const collapsed = lineRaw.replace(/\s+/g, ' ');
      const text = collapsed.length > MAX_SNIPPET ? collapsed.slice(0, MAX_SNIPPET) + '…' : collapsed;
      const isNonCode = mask[idx] !== 0;
      const rec = { file: rel, line: lineNo, text, lineRaw, mentionKind: mask[idx] === 1 ? 'comment' : 'string' };

      if (isNonCode) {
        hits.comment.push(rec);
      } else if (domain === 'exempt') {
        exemptByFile.set(rel, (exemptByFile.get(rel) || 0) + 1);
        hits.exempt.push(rec);
      } else if (domain === 'red') {
        hits.red.push(rec);
      } else {
        hits.yellow.push(rec);
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
// 5b. 规则 C：数值兜底扫描（RSI §8 / S3，2026-11-04）
// ---------------------------------------------------------------------------
// 判据：backend/src/api/** 内出现 `?? 0` / `?? -1` 即为数值兜底，
//       把「取不到」伪装成「是 0 / 不存在」，与诚实红线（禁零值顶替空态）冲突。
// 说明：只扫代码位置（注释/字符串中的示例不算），命中即阻断（--strict），无 allowlist 机制；
//       如为真实误报，应改本规则而不是加豁免，避免门禁被逐步掏空。
const NUMERIC_FALLBACK_RE = /\?\?\s*(-1|0)(?![0-9.])/g;

function scanRuleC() {
  const apiDir = path.join(REPO_ROOT, 'backend', 'src', 'api');
  const files = walk(apiDir, []);
  files.sort();
  const hits = [];
  for (const abs of files) {
    const rel = path.relative(REPO_ROOT, abs).split(path.sep).join('/');
    let src;
    try { src = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    if (!src.includes('??')) continue;
    const mask = computeNonCodeMask(src);
    const lines = src.split('\n');
    const lineStart = new Array(lines.length);
    let off = 0;
    for (let li = 0; li < lines.length; li++) { lineStart[li] = off; off += lines[li].length + 1; }
    NUMERIC_FALLBACK_RE.lastIndex = 0;
    let m;
    while ((m = NUMERIC_FALLBACK_RE.exec(src)) !== null) {
      const idx = m.index;
      if (mask[idx] !== 0) continue; // 注释 / 字符串文本
      let lo = 0, hi = lines.length - 1, li = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (lineStart[mid] <= idx) { li = mid; lo = mid + 1; } else { hi = mid - 1; }
      }
      const lineRaw = lines[li].trim();
      const collapsed = lineRaw.replace(/\s+/g, ' ');
      hits.push({ file: rel, line: li + 1, text: collapsed.length > MAX_SNIPPET ? collapsed.slice(0, MAX_SNIPPET) + '…' : collapsed });
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// 5c. 规则 C 棘轮基线（2026-11-04，S3 收口）
// ---------------------------------------------------------------------------
// 为什么不是 allowlist：35 处存量里 14 处是排序/计数/特征开关等良性写法，
// 逐条加 allowlist 需要写 expiresAt 与清理工单，成本高于收益且容易把门禁掏空。
// 改为「棘轮」：现有命中按 file+行文本记账放行；出现**新的**命中即阻断；
// 存量被修掉后基线条目变成 stale，也必须同步收缩（防基线偷偷长大）。
// 计数语义：同一文件内同一行文本可能重复（如两行 sort 比较器），按出现次数记账。
function rulecKey(h) {
  return `${h.file}\u0000${h.text}`;
}

function loadRulecBaseline() {
  if (!fs.existsSync(RULEC_BASELINE_FILE)) {
    return { entries: [], exists: false, counts: new Map() };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(RULEC_BASELINE_FILE, 'utf8'));
    const entries = Array.isArray(raw.entries) ? raw.entries : [];
    const counts = new Map();
    for (const e of entries) {
      const k = `${e.file}\u0000${e.text}`;
      counts.set(k, (counts.get(k) || 0) + (Number(e.count) > 0 ? Number(e.count) : 1));
    }
    return { entries, exists: true, raw, counts };
  } catch (err) {
    return { entries: [], exists: true, counts: new Map(), error: String(err && err.message ? err.message : err) };
  }
}

function splitRulecByBaseline(hits, baseline) {
  const remaining = new Map(baseline.counts);
  const baselined = [];
  const fresh = [];
  for (const h of hits) {
    const k = rulecKey(h);
    const n = remaining.get(k) || 0;
    if (n > 0) {
      remaining.set(k, n - 1);
      baselined.push(h);
    } else {
      fresh.push(h);
    }
  }
  const stale = [];
  for (const [k, n] of remaining) {
    if (n > 0) {
      const [file, text] = k.split('\u0000');
      stale.push({ file, text, count: n });
    }
  }
  return { baselined, fresh, stale };
}

function writeRulecBaseline(hits) {
  const counts = new Map();
  for (const h of hits) {
    const k = rulecKey(h);
    counts.set(k, (counts.get(k) || 0) + 1);
    counts.get(k);
  }
  const entries = [...counts.entries()]
    .map(([k, count]) => {
      const [file, text] = k.split('\u0000');
      return { file, text, count };
    })
    .sort((a, b) => (a.file === b.file ? a.text.localeCompare(b.text) : a.file.localeCompare(b.file)));
  const payload = {
    version: 1,
    generatedAt: new Date().toISOString().slice(0, 10),
    note: '规则 C 棘轮基线（存量放行，新增阻断）。修完存量后用 node scripts/guard/honesty-scan.mjs --update-rulec-baseline 收缩。删除测试或改行文本都需同步更新本文件。',
    total: hits.length,
    entries,
  };
  fs.mkdirSync(path.dirname(RULEC_BASELINE_FILE), { recursive: true });
  fs.writeFileSync(RULEC_BASELINE_FILE, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return entries.length;
}

// ---------------------------------------------------------------------------
// 6. allowlist 加载与豁免判定
// ---------------------------------------------------------------------------
function loadAllowlist() {
  if (!fs.existsSync(ALLOWLIST_FILE)) {
    return { entries: [], ok: true, error: null, exists: false };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(ALLOWLIST_FILE, 'utf8'));
    const entries = Array.isArray(raw.entries) ? raw.entries : [];
    return { entries, ok: true, error: null, exists: true, version: raw.version, updatedAt: raw.updatedAt };
  } catch (e) {
    return { entries: [], ok: false, error: String(e && e.message), exists: true };
  }
}

/** 解析 expiresAt → 当日 UTC 0 点毫秒; 非法/缺失返回 null */
function parseExpiry(s) {
  if (typeof s !== 'string' || !s.trim()) return null;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return Math.floor(t / DAY_MS) * DAY_MS; // 归一到当日 0 点，做「晚一天才算过期」的友好边界
}

function todayStartMs(now) {
  return Math.floor(now.getTime() / DAY_MS) * DAY_MS;
}

function daysUntil(expiryMs, now) {
  return Math.round((expiryMs - todayStartMs(now)) / DAY_MS);
}

/**
 * 逐条 RED 命中做豁免判定。匹配策略：path 相等 && 源行(lineRaw)包含 match 片段。
 * **行号仅作提示，不作判据** —— 避免无关编辑导致行号漂移、门禁脆断。
 * 返回 { usedIds, unexempted, expiredEntries }
 */
function annotateExemptions(hits, allowlist, now) {
  const usedIds = new Set();
  const expiredEntries = new Map(); // id -> entry
  for (const h of hits.red) {
    const entry = allowlist.entries.find(
      (e) => e && e.path === h.file && typeof e.match === 'string' && e.match.length > 0 && h.lineRaw.includes(e.match),
    );
    if (!entry) { h.status = 'unexempted'; h.reasonNote = '无匹配豁免条目'; continue; }
    usedIds.add(entry.id);
    h.entryId = entry.id;
    if (!CATEGORY_ENUM.has(entry.category)) {
      h.status = 'unexempted';
      h.reasonNote = `category 越界（${entry.category}）`;
      continue;
    }
    const exp = parseExpiry(entry.expiresAt);
    if (exp === null) {
      h.status = 'unexempted';
      h.reasonNote = '缺少或非法 expiresAt';
      continue;
    }
    if (exp < todayStartMs(now)) {
      h.status = 'expired';
      h.reasonNote = `豁免已于 ${entry.expiresAt} 到期`;
      expiredEntries.set(entry.id, entry);
      continue;
    }
    h.status = 'exempted';
  }
  const unexempted = hits.red.filter((h) => h.status === 'unexempted');
  const blocking = hits.red.filter((h) => h.status === 'unexempted' || h.status === 'expired');
  return { usedIds, unexempted, blocking, expiredEntries };
}

// ---------------------------------------------------------------------------
// 6.5 【R0′-11b】窄口径台账同步校验（仅 --strict 执行）
// ---------------------------------------------------------------------------
// 动机：本项目已发生「只改源 allowlist.json、未同步派生基线」的缺陷
// （假清偿凭证留在已提交报告里，见 commit 224695142 → 00bd31579）。
// 本校验把 allowlist 每条 AL 的 expiresAt / clearingTicket **渲染值** 与已提交基线
// 的对应行比对，不一致即失败 —— 这是该类「改源忘派生」缺陷的唯一机器防线。
//
// 刻意只查「台账条目集合 + expiresAt + clearingTicket」这一窄口径：
// 宽口径（断言「提交基线 == 当前源码全量产物」）被否决（R0′-11c），因为它会把一个
// **派生文件**升格为 CI 阻断不变量，与「基线不得在源码在途时定稿」冲突，产生死循环。
function stripCell(s) {
  return String(s).trim().replace(/^`+/, '').replace(/`+$/, '').trim();
}

/** 从基线文本解析台账明细表 → Map<id, {expiresAt, clearingTicket}>；找不到表头返回 null */
function parseLedgerRows(baselineText) {
  const lines = baselineText.split('\n');
  const headerIdx = lines.findIndex((l) => l.trim() === LEDGER_HEADER);
  if (headerIdx === -1) return null;
  const rows = new Map();
  for (let i = headerIdx + 2; i < lines.length; i++) { // +2：跳过表头行与 |---| 分隔行
    const l = lines[i];
    if (!l.startsWith('|')) break; // 表格结束
    const cells = l.split('|');
    if (cells.length < 8) continue;
    const id = stripCell(cells[1]);
    if (!/^AL-\d+$/.test(id)) continue;
    // 从右取列，避免 match 内含 '|' 时左侧索引错位（expiresAt/clearingTicket/状态 不含 '|'）
    rows.set(id, { expiresAt: stripCell(cells[cells.length - 4]), clearingTicket: stripCell(cells[cells.length - 3]) });
  }
  return rows;
}

/** 比对源 allowlist 与提交基线台账。返回 { ok, diffs: string[] } */
function checkBaselineSync(allowlist) {
  const diffs = [];
  if (!fs.existsSync(OUT_FILE)) {
    return { ok: false, diffs: [`基线文件不存在：${path.relative(REPO_ROOT, OUT_FILE)}（无法校验派生一致性）`] };
  }
  const rows = parseLedgerRows(fs.readFileSync(OUT_FILE, 'utf8'));
  if (rows === null) {
    return { ok: false, diffs: ['基线中未找到台账表头，无法校验（可能被手工改动）'] };
  }
  const srcIds = new Set();
  for (const e of allowlist.entries) {
    srcIds.add(e.id);
    const exp = String(e.expiresAt ?? '—');
    const ct = String(e.clearingTicket ?? '—');
    const row = rows.get(e.id);
    if (!row) { diffs.push(`${e.id}：源 allowlist 有该条，但基线台账缺失（派生未跟上新增）`); continue; }
    if (row.expiresAt !== exp) diffs.push(`${e.id}.expiresAt：源=${exp} ≠ 基线=${row.expiresAt}`);
    if (row.clearingTicket !== ct) diffs.push(`${e.id}.clearingTicket：源=${ct} ≠ 基线=${row.clearingTicket}`);
  }
  for (const id of rows.keys()) {
    if (!srcIds.has(id)) diffs.push(`${id}：基线台账存在该条，但源 allowlist 已无（派生未跟上删除）`);
  }
  return { ok: diffs.length === 0, diffs };
}

// ---------------------------------------------------------------------------
// 7. 报告渲染（幂等覆盖写）
// ---------------------------------------------------------------------------
function fmtRows(hits) {
  if (!hits.length) return '| — | （无命中） |\n';
  return hits.map((h) => `| \`${h.file}:${h.line}\` | \`${h.text}\` |`).join('\n') + '\n';
}

function fmtRedRows(hits) {
  if (!hits.length) return '| — | （无命中） | — |\n';
  return hits.map((h) => {
    let badge = '`未豁免` ⛔';
    if (h.status === 'exempted') badge = `豁免 \`${h.entryId}\``;
    else if (h.status === 'expired') badge = `**过期豁免** \`${h.entryId}\` ⚠️`;
    else if (h.reasonNote) badge = `\`未豁免\` ⛔（${h.reasonNote}）`;
    return `| \`${h.file}:${h.line}\` | \`${h.text}\` | ${badge} |`;
  }).join('\n') + '\n';
}

function renderReport({ ruleA, ruleB, ruleC, allowlist, exemptions }) {
  const { hits, exemptByFile } = ruleA;
  const contractMissing = ruleB.filter((r) => r.routes > 0 && r.dataSource === 0);
  const now = new Date();

  const exemptFileCount = exemptByFile.size;
  const exemptLineCount = hits.exempt.length;

  const exemptedCount = hits.red.filter((h) => h.status === 'exempted').length;
  const expiredHitCount = hits.red.filter((h) => h.status === 'expired').length;
  const blocking = exemptions.blocking;
  const expiredEntries = [...exemptions.expiredEntries.values()];

  // 台账：按 category 分组
  const byCategory = new Map();
  for (const e of allowlist.entries) {
    const c = CATEGORY_ENUM.has(e.category) ? e.category : '(非法类别)';
    if (!byCategory.has(c)) byCategory.set(c, []);
    byCategory.get(c).push(e);
  }
  const unusedEntries = allowlist.entries.filter((e) => !exemptions.usedIds.has(e.id));

  const L = [];
  L.push('# 诚实红线门禁基线报告（honesty-scan）');
  L.push('');
  // 本报告为「可提交的静态产物」：措辞与调用方式无关、且不含随运行/日期变化的字段
  // （无生成时间、无「剩余天数」）。动态信号（本次是否 strict、近到期提醒、阻断明细）
  // 一律走 stdout，见 main()。
  L.push('> **门禁模式**：脚本默认非阻断（exit 0）；传 `--strict` 时，存在未豁免 RED 或过期豁免则 exit 1。');
  L.push('> 本报告措辞与调用方式无关，且不含生成时间戳 / 「剩余天数」等随运行漂移的字段，故可幂等提交；');
  L.push('> 台账「状态」列仅在条目真正到期（或代码变更致未命中）时变化，属真实状态变更。');
  L.push('');
  L.push(`- 运行命令：\`${GENERATED_CMD}\`（默认，非阻断；**只输出 stdout，不写任何文件**）/ \`${GENERATED_CMD} --strict\`（未豁免 RED / 过期豁免 / 台账不同步 → exit 1）/ \`${GENERATED_CMD} --update-baseline\`（**显式 opt-in：额外把本报告覆盖写入本文件**）；均在仓库根执行`);
  L.push(`- 扫描根：${SCAN_ROOTS.map((r) => '`' + r + '`').join('、')}（仅 \`*.ts\` / \`*.tsx\`）`);
  L.push('- 规则 A 判据：`Math.random` 按路径分域（RED=供数路径 / YELLOW=其它 / 豁免域=归档·测试·种子）；**注释与字符串文本内提及**单列、不计违规（模板 `${}` 插值仍算代码）。');
  L.push('- 规则 B 判据：`backend/src/api/*.ts` 一层内 路由数 N>0 且 `dataSource` 次数 M==0 → `CONTRACT-MISSING`。');
  L.push('- 豁免匹配：`allowlist.json` 以 **path + match（源行片段）** 匹配，**行号仅提示不作判据**；每条必须有 `expiresAt`，到期自动转计为 RED。');
  L.push('');
  L.push('## 摘要');
  L.push('');
  L.push('| 域 / 指标 | 判据 | 命中数 |');
  L.push('|---|---|---|');
  L.push(`| **RED**（供数路径，原始命中） | 路径含 \`backend/src/api/\` / \`backend/src/services/\` / \`backend/src/db/\` | **${hits.red.length}** |`);
  L.push(`| ├ 其中已豁免 | 命中 allowlist 且类别合法、未过期 | ${exemptedCount} |`);
  L.push(`| ├ **未豁免 RED（阻断项）** | 无豁免条目 / 类别越界 / 无 expiresAt / **已过期** | **${blocking.length}** |`);
  L.push(`| └ 其中过期豁免 | 豁免已到期，自动转计为 RED | ${expiredHitCount}（${expiredEntries.length} 条条目） |`);
  L.push(`| **YELLOW**（其它） | 其余前端/后端代码 | **${hits.yellow.length}** |`);
  L.push(`| 豁免域 | \`_archived\` / \`.bak\` / \`.test.\` / \`.spec.\` / \`__tests__\` / \`seeds/\` | ${exemptLineCount} 行 / ${exemptFileCount} 文件（仅计数） |`);
  L.push(`| 注释/字符串中提及（非违规） | 位于注释或字符串文本内，不产生运行期伪数据 | ${hits.comment.length} |`);
  L.push(`| **规则 B 命中文件数** | 有路由但全文无 \`dataSource\` | **${contractMissing.length}** |`);
  L.push(`| **规则 C 命中（数值兜底）** | \`backend/src/api/**\` 内代码出现 \`?? 0\` / \`?? -1\` | **${ruleC.length}** |`);
  L.push(`| 豁免台账规模 | allowlist 条目数（未命中 ${unusedEntries.length} 条） | ${allowlist.entries.length} |`);
  L.push('');

  L.push('## 规则 A 明细');
  L.push('');
  L.push('### RED 域（供数路径）');
  L.push('');
  L.push('| 路径:行 | 行内容（截断 120 字符） | 豁免状态 |');
  L.push('|---|---|---|');
  L.push(fmtRedRows(hits.red).trimEnd());
  L.push('');

  if (blocking.length) {
    L.push('#### ⛔ 未豁免 RED（阻断项，含过期豁免）');
    L.push('');
    L.push('| 路径:行 | 行内容 | 原因 |');
    L.push('|---|---|---|');
    L.push(blocking.map((h) => `| \`${h.file}:${h.line}\` | \`${h.text}\` | ${h.reasonNote || '—'} |`).join('\n'));
    L.push('');
  }

  if (expiredEntries.length) {
    L.push('#### ⚠️ 过期豁免（到期未清偿，已转计为 RED）');
    L.push('');
    L.push('| 豁免ID | 路径 | match | 到期日 | clearingTicket |');
    L.push('|---|---|---|---|---|');
    for (const e of expiredEntries) {
      L.push(`| \`${e.id}\` | \`${e.path}\` | \`${e.match}\` | ${e.expiresAt} | ${e.clearingTicket ?? '—'} |`);
    }
    L.push('');
  }

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
  L.push('### 注释 / 字符串文本中提及（非违规，仅供参考）');
  L.push('');
  L.push('| 路径:行 | 类型 | 行内容（截断 120 字符） |');
  L.push('|---|---|---|');
  if (hits.comment.length) {
    for (const h of hits.comment) {
      L.push(`| \`${h.file}:${h.line}\` | ${h.mentionKind === 'comment' ? '注释' : '字符串'} | \`${h.text}\` |`);
    }
  } else {
    L.push('| — | — | （无） |');
  }
  L.push('');

  // ---- 豁免台账 ----
  L.push('## 豁免台账（allowlist）');
  L.push('');
  if (!allowlist.exists) {
    L.push('（未找到 `scripts/guard/allowlist.json`）');
    L.push('');
  } else if (!allowlist.ok) {
    L.push(`⚠️ allowlist.json 解析失败，全部条目视为未豁免：\`${allowlist.error}\``);
    L.push('');
  } else {
    L.push(`- version：${allowlist.version ?? '—'}　updatedAt：${allowlist.updatedAt ?? '—'}`);
    L.push(`- 共 ${allowlist.entries.length} 条；未命中 ${unusedEntries.length} 条。`);
    L.push('');
    L.push('### 按类别分组计数');
    L.push('');
    L.push('| category | 条目数 |');
    L.push('|---|---:|');
    for (const c of CATEGORY_ENUM) {
      L.push(`| \`${c}\` | ${(byCategory.get(c) || []).length} |`);
    }
    if (byCategory.has('(非法类别)')) L.push(`| ⛔ \`(非法类别)\` | ${byCategory.get('(非法类别)').length} |`);
    L.push('');

    // 说明：本表只放**静态**字段。「到期日期」为绝对日期（不随时间变，保幂等）；
    // 「剩 N 天」是唯一随时间变的相对量，故只走 stdout（见 main()）。
    L.push('### 明细');
    L.push('');
    L.push(LEDGER_HEADER);
    L.push('|---|---|---|---|---|---|---|');
    for (const e of allowlist.entries) {
      const exp = parseExpiry(e.expiresAt);
      const st = unusedEntries.includes(e) ? '未命中'
        : (exp !== null && exp < todayStartMs(now) ? '**已过期** ⚠️' : '生效中');
      const cat = CATEGORY_ENUM.has(e.category) ? `\`${e.category}\`` : `⛔ \`${e.category}\``;
      L.push(`| \`${e.id}\` | ${cat} | \`${e.path}\` | \`${e.match}\` | ${e.expiresAt ?? '—'} | ${e.clearingTicket ?? '—'} | ${st} |`);
    }
    L.push('');
    if (unusedEntries.length) {
      L.push('> 未命中条目：可能对应代码已修复或片段已漂移，建议下轮清理（不影响本门禁结论）。');
      L.push('');
    }
  }

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
  L.push('> 已知覆盖边界：本规则仅统计 `router.(get|post|put|delete)(` 前缀，**不涵盖** `app.get` / `router.use` / `router.route` 等其它挂载写法（可能漏计）。');
  L.push('');

  L.push('## 规则 C 明细（backend/src/api/** 数值兜底）');
  L.push('');
  L.push('> 判据：代码位置出现 `?? 0` / `?? -1`（注释、字符串示例不算）。**棘轮门禁**：存量按 file+行文本记入 `scripts/guard/rulec-baseline.json` 放行，**新增命中 --strict 即阻断**；修掉存量后必须 `--update-rulec-baseline` 收缩，否则「基线失效」也阻断。');
  L.push('');
  L.push('| 路径:行 | 行内容（截断 120 字符） |');
  L.push('|---|---|');
  if (ruleC.length) {
    for (const h of ruleC) L.push(`| \`${h.file}:${h.line}\` | \`${h.text}\` |`);
  } else {
    L.push('| — | （无命中） |');
  }
  L.push('');
  L.push('---');
  L.push('');
  L.push('**门禁模式**：脚本默认非阻断（exit 0）；传 `--strict` 时，存在未豁免 RED、过期豁免、规则 C 新增或规则 C 基线失效则 exit 1。');
  L.push('');
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// 8. main
// ---------------------------------------------------------------------------
function main() {
  const now = new Date();
  const ruleA = scanRuleA();
  const ruleB = scanRuleB();
  const ruleC = scanRuleC();
  const rulecBaseline = loadRulecBaseline();
  let rulecSplit = splitRulecByBaseline(ruleC, rulecBaseline);
  let rulecEntryCount = rulecBaseline.entries.length;
  if (UPDATE_RULEC) {
    rulecEntryCount = writeRulecBaseline(ruleC);
    rulecSplit = { baselined: ruleC, fresh: [], stale: [] };
  }
  const allowlist = loadAllowlist();
  const exemptions = annotateExemptions(ruleA.hits, allowlist, now);

  const report = renderReport({ ruleA, ruleB, ruleC, allowlist, exemptions });

  // R0′-11a：默认**不写**受版本控制的基线（仅 stdout）；仅 --update-baseline 时覆盖写。
  // 这样任何默认运行（含 CI 的 --strict）都不会弄脏工作树，也消除并发运行互相覆盖。
  const relOut = path.relative(REPO_ROOT, OUT_FILE).split(path.sep).join('/');
  let wroteBaseline = false;
  if (UPDATE_BASELINE) {
    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, report, 'utf8'); // 覆盖写，幂等，不追加
    wroteBaseline = true;
  }

  const hits = ruleA.hits;
  const exemptedCount = hits.red.filter((h) => h.status === 'exempted').length;
  const expiredHitCount = hits.red.filter((h) => h.status === 'expired').length;
  const unexempted = exemptions.blocking; // 未豁免 RED（含已过期豁免，均属阻断项）
  const contractMissing = ruleB.filter((r) => r.routes > 0 && r.dataSource === 0);

  // R0′-11b：仅 --strict 下做窄口径台账同步校验（源 allowlist vs 已提交基线）
  const sync = STRICT ? checkBaselineSync(allowlist) : { ok: true, diffs: [] };

  const fail = unexempted.length > 0 || !sync.ok || rulecSplit.fresh.length > 0 || rulecSplit.stale.length > 0;

  const modeTags = [STRICT ? '--strict' : 'NON-BLOCKING'];
  if (UPDATE_BASELINE) modeTags.push('--update-baseline');
  const out = [];
  out.push(`=== honesty-scan (${modeTags.join(', ')}) ===`);
  out.push(`RED (供数路径) 原始     : ${hits.red.length}`);
  out.push(`  ├ 已豁免             : ${exemptedCount}`);
  out.push(`  ├ 未豁免 RED         : ${unexempted.length}`);
  out.push(`  └ 过期豁免           : ${expiredHitCount}（${exemptions.expiredEntries.size} 条条目）`);
  out.push(`YELLOW (其它)          : ${hits.yellow.length}`);
  out.push(`豁免域 (仅计数)        : ${hits.exempt.length} 行 / ${ruleA.exemptByFile.size} 文件`);
  out.push(`注释/字符串提及(非违规): ${hits.comment.length}`);
  out.push(`规则B CONTRACT-MISSING : ${contractMissing.length} 文件`);
  out.push(`规则C 数值兜底(?? 0/-1) : ${ruleC.length} 处（基线内 ${rulecSplit.baselined.length} / 新增 ${rulecSplit.fresh.length} / 基线失效 ${rulecSplit.stale.length}；基线条目 ${rulecEntryCount}）`);
  out.push(`allowlist 条目         : ${allowlist.entries.length}（未命中 ${allowlist.entries.filter((e) => !exemptions.usedIds.has(e.id)).length}）`);
  out.push(`基线文件               : ${wroteBaseline ? `已写入 ${relOut}` : `未写（默认只读；需 --update-baseline 才写 ${relOut}）`}`);

  // 近到期提醒（日期相对，故只走 stdout，不进报告文件以保幂等）
  const soonExpiring = allowlist.entries
    .filter((e) => { const x = parseExpiry(e.expiresAt); return x !== null && daysUntil(x, now) >= 0 && daysUntil(x, now) <= EXPIRY_WARN_DAYS; })
    .sort((a, b) => String(a.expiresAt).localeCompare(String(b.expiresAt)));
  if (soonExpiring.length) {
    out.push('');
    out.push(`🔔 ${EXPIRY_WARN_DAYS} 天内到期豁免（${soonExpiring.length} 条）—— 到期未清偿将自动转计为 RED 并使 --strict 失败：`);
    for (const e of soonExpiring) {
      const x = parseExpiry(e.expiresAt);
      out.push(`  ${e.id}  ${e.expiresAt}（剩 ${daysUntil(x, now)} 天）  ${e.path}  ← ${e.clearingTicket ?? '无 clearingTicket'}`);
    }
  }

  // 阻断明细打到 stdout（CI 日志可见）—— 报告默认不再落盘（R0′-11a），
  // 若只依赖文件，开发者只会看到计数而不知是哪个文件哪一行，门禁即不可操作。
  if (unexempted.length) {
    out.push('');
    out.push(`⛔ 阻断明细（${unexempted.length} 条，未豁免 RED / 过期豁免）：`);
    for (const h of unexempted) {
      out.push(`  ${h.file}:${h.line}`);
      out.push(`      ${h.text}`);
      out.push(`      原因: ${h.reasonNote || '—'}`);
      if (h.entryId) {
        const e = allowlist.entries.find((x) => x.id === h.entryId);
        if (e) out.push(`      豁免条目: ${e.id}（expiresAt=${e.expiresAt ?? '—'}, clearingTicket=${e.clearingTicket ?? '—'}）`);
      }
    }
  }

  // 规则 C 明细（棘轮：存量放行、新增阻断、失效需收缩）
  if (ruleC.length || rulecSplit.stale.length) {
    out.push('');
    out.push(`规则 C 明细：存量 ${rulecSplit.baselined.length} 处（基线放行）/ 新增 ${rulecSplit.fresh.length} 处 / 基线失效 ${rulecSplit.stale.length} 处；`);
    out.push('      棘轮语义：新增命中 --strict 阻断；修掉存量后必须 --update-rulec-baseline 收缩基线，否则按「基线失效」阻断。');
    for (const h of rulecSplit.baselined) out.push(`  基线内 ${h.file}:${h.line}  ${h.text}`);
    for (const h of rulecSplit.fresh) out.push(`  ⛔ 新增  ${h.file}:${h.line}  ${h.text}`);
    for (const s of rulecSplit.stale) out.push(`  ⚠ 失效  ${s.file}  x${s.count}  ${s.text}`);
  }

  // R0′-11b：台账同步校验结果（仅 --strict 会真正校验）
  if (STRICT && !sync.ok) {
    out.push('');
    out.push(`⛔ 台账同步校验失败（源 allowlist vs 已提交基线，${sync.diffs.length} 处不一致）——`);
    out.push(`   疑似「只改源、未同步派生基线」，请核对后提交基线更新：`);
    for (const d of sync.diffs) out.push(`   - ${d}`);
  } else if (STRICT) {
    out.push('');
    out.push(`✅ 台账同步校验通过（源 allowlist 与已提交基线的 条目集合 / expiresAt / clearingTicket 一致）`);
  }

  if (STRICT) {
    const reasons = [];
    if (unexempted.length) reasons.push('未豁免/过期 RED');
    if (!sync.ok) reasons.push('台账不同步');
    if (rulecSplit.fresh.length) reasons.push('规则 C 新增数值兜底');
    if (rulecSplit.stale.length) reasons.push('规则 C 基线失效（存量已修需收缩基线）');
    out.push(reasons.length ? `[STRICT] 阻断项：${reasons.join(' + ')} → exit 1` : '[STRICT] 无未豁免 RED、无过期豁免、台账同步、规则 C 无新增 → exit 0');
  } else {
    out.push('[NON-BLOCKING] exit 0');
  }
  process.stdout.write(out.join('\n') + '\n');

  process.exitCode = STRICT && fail ? 1 : 0;
}

main();
