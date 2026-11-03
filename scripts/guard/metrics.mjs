#!/usr/bin/env node
/**
 * metrics.mjs —— RSI 度量采集（docs/rsi/dev-loop-v1.md §5 / §7-S5）
 *
 * 五个指标：一次通过率 / 缺陷回潮率 / 验收返工轮次 / 门禁拦截数 / 平均修复时长。
 *
 * 原则（设计稿硬约束）：
 *   - 缺数据项显式打 n/a，**不许用 0 顶替**（度量本身也不许哨兵值）。
 *   - 台账 markdown 表解析失败（缺列）必须 exit 2 并打印缺失列名，**不返回 0 条**。
 *
 * 数据现实（2026-11-04）：
 *   - 台账（docs/harness/TICKET-LEDGER.md）只存**当前状态**，没有状态流转历史；
 *     「首轮即通过」「打回次数」「已派工→已收口时长」无法从单期快照还原 → n/a（原因见行内）。
 *   - 缺陷回潮率需跨 release 快照交集，当前只有一期 → n/a。
 *   - 门禁拦截数可直接取 gh run list，真实可算。
 *
 * 用法：
 *   node scripts/guard/metrics.mjs --week 2026-W45
 *   node scripts/guard/metrics.mjs --week 2026-W45 --json
 *   node scripts/guard/metrics.mjs --week 2026-W45 --ledger docs/harness/TICKET-LEDGER.md
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function die(msg, code = 2) {
  console.error(`metrics: ${msg}`);
  process.exit(code);
}

function parseArgs(argv) {
  const out = { json: false, week: null, ledger: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--week') out.week = argv[++i];
    else if (a === '--ledger') out.ledger = argv[++i];
    else if (a === '--json') out.json = true;
    else if (a === '--help' || a === '-h') {
      console.log('usage: metrics.mjs --week YYYY-Www [--ledger <path>] [--json]');
      process.exit(0);
    } else die(`unknown argument: ${a}`);
  }
  return out;
}

function isoWeekOf(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function weekRange(week) {
  const m = /^(\d{4})-W(\d{2})$/.exec(week || '');
  if (!m) die('--week must be YYYY-Www（例 2026-W45）');
  const year = Number(m[1]);
  const wk = Number(m[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (wk - 1) * 7);
  const sundayEnd = new Date(monday);
  sundayEnd.setUTCDate(monday.getUTCDate() + 7);
  return { start: monday, end: sundayEnd };
}

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
const ledgerPath = path.resolve(root, args.ledger || 'docs/harness/TICKET-LEDGER.md');
if (!fs.existsSync(ledgerPath)) die(`ledger not found: ${ledgerPath}`);

// ---- 台账解析 ----
const lines = fs.readFileSync(ledgerPath, 'utf8').split('\n');
const headerIdx = lines.findIndex((l) => l.trimStart().startsWith('| 编号'));
if (headerIdx < 0) die('台账缺少表头「| 编号 | ... |」，拒绝返回 0 条');
const header = lines[headerIdx].split('|').map((c) => c.trim()).filter(Boolean);
const required = ['编号', '状态'];
const missing = required.filter((c) => !header.includes(c));
if (missing.length) die(`台账缺列：${missing.join(', ')}（现有：${header.join(' / ')}）`);

const idxId = header.indexOf('编号');
const idxStatus = header.indexOf('状态');
const rows = [];
for (let i = headerIdx + 2; i < lines.length; i += 1) {
  const line = lines[i].trim();
  if (!line.startsWith('|')) continue;
  const cells = line.split('|').map((c) => c.trim());
  // split('|') 首尾为空串
  const body = cells.slice(1, -1);
  if (!body.length) continue;
  const id = body[idxId];
  if (!/^T-/.test(id || '')) continue;
  rows.push({ id, status: body[idxStatus] || '', raw: line });
}

const count = (re) => rows.filter((r) => re.test(r.status)).length;
const closed = count(/已收口|复验通过/);
const statusCounts = {};
for (const r of rows) {
  const key = r.status.split('·')[0].trim() || '(空)';
  statusCounts[key] = (statusCounts[key] || 0) + 1;
}

// ---- 门禁拦截数：gh run list ----
let gateFailures = null;
let gateNote = '';
try {
  const { start, end } = weekRange(args.week || isoWeekOf(new Date()));
  const raw = execFileSync('gh', ['run', 'list', '--workflow=CI', '--limit', '100', '--json', 'conclusion,createdAt,databaseId'], {
    cwd: root, encoding: 'utf8', timeout: 60000,
  });
  const runs = JSON.parse(raw);
  const inWeek = runs.filter((r) => {
    const t = new Date(r.createdAt).getTime();
    return t >= start.getTime() && t < end.getTime();
  });
  gateFailures = inWeek.filter((r) => r.conclusion === 'failure').length;
  gateNote = `CI runs in week: ${inWeek.length}（failure=${gateFailures}）`;
} catch (e) {
  gateNote = `gh 取数失败：${String(e.message || e).slice(0, 160)}`;
}

const week = args.week || isoWeekOf(new Date());
const metrics = [
  {
    name: '一次通过率',
    value: 'n/a',
    reason: '台账只存当前状态，无「已派工→复验通过」流转历史；不能把已收口倒推成首轮通过',
  },
  {
    name: '缺陷回潮率',
    value: 'n/a',
    reason: '需 ≥2 个 release 周期的 honesty-scan 快照做集合交集，当前只有单期',
  },
  {
    name: '验收返工轮次',
    value: 'n/a',
    reason: '台账状态列不是流转日志，无法统计每单「打回」次数中位数',
  },
  {
    name: '门禁拦截数',
    value: gateFailures === null ? 'n/a' : String(gateFailures),
    reason: gateFailures === null ? gateNote : gateNote,
  },
  {
    name: '平均修复时长',
    value: 'n/a',
    reason: '台账「复验证据」里的日期非结构化字段，无法可靠计算已派工→已收口差值',
  },
];

const summary = {
  week,
  ledger: path.relative(root, ledgerPath),
  rows: rows.length,
  statusCounts,
  metrics,
};

if (args.json) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log(`# 度量 · ${week}（台账 ${rows.length} 单：${rows.filter((r) => /已收口|复验通过/.test(r.status)).length} 已收口/复验通过）`);
  console.log('# 指标 | 值 | 说明');
  for (const m of metrics) {
    console.log(`${m.name} | ${m.value} | ${m.reason}`);
  }
}
process.exit(0);
