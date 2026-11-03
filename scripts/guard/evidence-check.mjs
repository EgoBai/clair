#!/usr/bin/env node
/**
 * RSI E2 证据门禁（docs/rsi/dev-loop-v1.md §2-E2）
 *
 * 解析工单里的「证据」区块，只认两类运行时证据：
 *   1) curl：完整 URL + HTTP 状态 + 响应体片段（含 dataSource 且 >=3 个业务字段）
 *   2) playwright：frontend/e2e/*.spec.ts 的测试标题，用 --list 校验其真实存在
 * grep 命中、读文件、「我检查过」一律 FAIL。
 *
 * 用法：
 *   node scripts/guard/evidence-check.mjs --ticket T-2611-01
 *   node scripts/guard/evidence-check.mjs --file docs/rsi/T-2611-01.md
 *   node scripts/guard/evidence-check.mjs --ticket T-2611-01 --json
 *   node scripts/guard/evidence-check.mjs --ticket T-2611-01 --no-list   # 跳过 playwright --list（仅调试）
 *
 * 退出码：0=PASS；1=有 FAIL；2=参数/文件错误。
 *
 * 证据条目格式（每条一行，位于「## 证据」区块内）：
 *   - curl <完整URL> | HTTP <状态码> | <响应体片段 JSON>
 *   - playwright <frontend/e2e/xxx.spec.ts> :: <测试标题>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(__dirname, '..', '..');

const args = process.argv.slice(2);
const opt = { ticket: '', file: '', json: false, noList: false, root: DEFAULT_ROOT };
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === '--ticket') opt.ticket = args[++i] || '';
  else if (a === '--file') opt.file = args[++i] || '';
  else if (a === '--root') opt.root = path.resolve(args[++i] || DEFAULT_ROOT);
  else if (a === '--json') opt.json = true;
  else if (a === '--no-list') opt.noList = true;
  else if (a === '-h' || a === '--help') {
    console.log('用法: node scripts/guard/evidence-check.mjs --ticket <编号> | --file <路径> [--json] [--no-list]');
    process.exit(0);
  } else {
    console.error('E2 ERROR unknown-arg observed=' + a);
    process.exit(2);
  }
}

const ROOT = opt.root;
const FRONTEND = path.join(ROOT, 'frontend');

let relFile = '';
if (opt.file) {
  relFile = path.isAbsolute(opt.file) ? path.relative(ROOT, opt.file) : opt.file;
} else if (opt.ticket) {
  if (opt.ticket.endsWith('.md')) relFile = opt.ticket;
  else relFile = path.join('docs', 'rsi', opt.ticket + '.md');
} else {
  console.error('E2 ERROR missing-ticket 用法: --ticket <编号> 或 --file <路径>');
  process.exit(2);
}

const absFile = path.resolve(ROOT, relFile);
if (!fs.existsSync(absFile)) {
  console.error('E2 ERROR ticket-not-found observed=' + relFile);
  process.exit(2);
}

const text = fs.readFileSync(absFile, 'utf8');
const lines = text.split(/\r?\n/);
const ticket = opt.ticket || path.basename(relFile, '.md');

/* ---------- 解析「证据」区块 ---------- */
const sections = [];
let cur = null;
for (let i = 0; i < lines.length; i += 1) {
  const m = lines[i].match(/^(#{1,6})\s+(.*)$/);
  if (m) {
    cur = { level: m[1].length, title: m[2].trim(), startLine: i + 1, body: [] };
    sections.push(cur);
  } else if (cur) {
    cur.body.push({ no: i + 1, text: lines[i] });
  }
}
const evidenceSections = sections.filter((s) => {
  const t = s.title.replace(/^[\d.、)\s]+/, '').trim();
  return t.startsWith('证据') && !t.includes('要求');
});

const entries = [];
const violations = [];
for (const sec of evidenceSections) {
  for (const ln of sec.body) {
    const t = ln.text.trim();
    if (!t || !/^[-*]\s+/.test(t)) continue;
    const body = t.replace(/^[-*]\s+/, '').trim();
    const type = (/^curl\b/i.test(body) && 'curl') || (/^playwright\b/i.test(body) && 'playwright') || '';
    if (type) entries.push({ type, body, line: ln.no });
    else if (/(^|\s)(grep|rg)\b|读文件|我检查过|已复核|人工确认/i.test(body)) {
      violations.push({ line: ln.no, code: 'evidence-grep-only', body });
    }
  }
}

const results = [];
const failures = [];
function record(ok, line, code, detail) {
  const item = { line, ok, code, detail };
  results.push(item);
  if (!ok) failures.push(item);
}

/* ---------- curl 校验 ---------- */
function checkCurl(entry) {
  const body = entry.body.replace(/^curl\b/i, '').trim();
  const urlMatch = body.match(/https?:\/\/[^\s|]+/);
  if (!urlMatch) return { ok: false, code: 'curl-missing-url', detail: 'observed=no-url expected=https://...' };
  const url = urlMatch[0];
  const statusMatch = body.match(/(?:HTTP|status)\s*[=: ]\s*(\d{3})\b/i);
  if (!statusMatch) return { ok: false, code: 'curl-missing-status', detail: 'observed=no-status expected=HTTP 2xx' };
  const status = Number(statusMatch[1]);
  if (!(status >= 200 && status < 300)) {
    return { ok: false, code: 'curl-status-not-2xx', detail: 'observed=HTTP ' + status + ' expected=HTTP 2xx' };
  }
  const parts = body.split('|').map((s) => s.trim());
  const snippet = parts.length >= 3 ? parts.slice(2).join('|') : parts.length === 2 ? parts[1] : '';
  if (!snippet) return { ok: false, code: 'curl-missing-response-snippet', detail: 'observed=empty expected=JSON 片段' };
  const ds = snippet.match(/"dataSource"\s*:\s*"([^"]+)"/);
  if (!ds || !ds[1]) {
    return { ok: false, code: 'curl-missing-datasource', detail: 'observed=' + (ds ? 'empty' : 'absent') + ' expected="dataSource":"real|unavailable|..."' };
  }
  const fields = snippet.match(/"[A-Za-z_][A-Za-z0-9_]*"\s*:/g) || [];
  if (fields.length < 3) {
    return { ok: false, code: 'curl-too-few-fields', detail: 'observed=' + fields.length + ' fields expected>=3' };
  }
  return { ok: true, code: 'curl-ok', detail: 'dataSource=' + ds[1] };
}

/* ---------- playwright 校验 ---------- */
const listCache = new Map();
function listSpec(specRel) {
  if (listCache.has(specRel)) return listCache.get(specRel);
  try {
    const out = execFileSync('npx', ['playwright', 'test', specRel, '--list'], {
      cwd: FRONTEND,
      encoding: 'utf8',
      timeout: 180000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    listCache.set(specRel, { ok: true, out });
    return { ok: true, out };
  } catch (e) {
    const out = String(e.stdout || '') + String(e.stderr || '');
    listCache.set(specRel, { ok: false, out });
    return { ok: false, out };
  }
}

function checkPlaywright(entry) {
  const body = entry.body.replace(/^playwright\b/i, '').trim();
  const specMatch = body.match(/(?:frontend\/)?e2e\/[\w./-]+\.spec\.ts/);
  if (!specMatch) return { ok: false, code: 'playwright-missing-spec', detail: 'observed=no-spec expected=frontend/e2e/*.spec.ts' };
  const specRel = specMatch[0].replace(/^frontend\//, '');
  const absSpec = path.join(FRONTEND, specRel);
  if (!fs.existsSync(absSpec)) {
    return { ok: false, code: 'playwright-spec-not-found', detail: 'observed=' + specRel };
  }
  const afterSpec = body.slice(body.indexOf(specMatch[0]) + specMatch[0].length).trim();
  const titleMatch = afterSpec.match(/^::\s*(.+)$/) || afterSpec.match(/[「“"](.+?)[」”"]/);
  const title = titleMatch ? titleMatch[1].trim() : '';
  if (!title) return { ok: false, code: 'playwright-missing-title', detail: 'observed=no-title expected=spec :: <标题>' };
  if (opt.noList) return { ok: true, code: 'playwright-ok(skipped-list)', detail: title };
  const listed = listSpec(specRel);
  if (!listed.ok) return { ok: false, code: 'playwright-list-failed', detail: 'observed=' + specRel + ' --list 失败' };
  if (!listed.out.includes(title)) {
    return { ok: false, code: 'playwright-title-not-found', detail: 'observed=' + title };
  }
  return { ok: true, code: 'playwright-ok', detail: title };
}

/* ---------- 执行 ---------- */
for (const e of entries) {
  const r = e.type === 'curl' ? checkCurl(e) : checkPlaywright(e);
  record(r.ok, e.line, r.code, r.detail);
}
for (const v of violations) record(false, v.line, v.code, 'observed=grep-hit expected=curl|playwright');

const pageChange = /frontend\/src\/(pages|components)\//.test(text) || /frontend\/src\/App\.tsx/.test(text);
const hasPlaywright = entries.some((e) => e.type === 'playwright');
if (pageChange && !hasPlaywright) {
  record(false, 1, 'page-change-needs-playwright', 'observed=no-playwright expected=至少 1 条 playwright 证据');
}
if (entries.length === 0) record(false, evidenceSections[0] ? evidenceSections[0].startLine : 1, 'missing-evidence', 'observed=0-entries expected>=1');

const ok = failures.length === 0;
if (opt.json) {
  console.log(JSON.stringify({ ticket, file: relFile, ok, entries: results, violations }, null, 2));
} else {
  for (const r of results) {
    if (r.ok) console.log('E2 PASS ' + relFile + ':' + r.line + ' ' + r.code + ' ' + r.detail + ' ticket=' + ticket);
    else console.log('E2 FAIL ' + relFile + ':' + r.line + ' ' + r.code + ' ' + r.detail + ' expected=curl|playwright ticket=' + ticket);
  }
  console.log((ok ? 'E2 PASS' : 'E2 FAIL') + ' evidence-check entries=' + entries.length + ' failures=' + failures.length + ' ticket=' + ticket);
}
process.exit(ok ? 0 : 1);
