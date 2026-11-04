#!/usr/bin/env node
/**
 * scripts/aux/doctor.mjs —— 辅助方巡检体检（只读，不改任何文件、不碰 git 写操作）
 *
 * 为什么需要它：辅助方每轮都要回答同一个问题——「主导方这一批有没有退步？」
 * 若每轮靠即兴敲命令，口径会漂移，结论不可比。本脚本把口径固定下来。
 *
 * 设计约束（与项目诚实红线一致）：
 *   - 任何检查跑不了 → 打印 n/a + 原因，**绝不用 0 顶替**（0 是比空更隐蔽的谎）。
 *   - 默认只做「廉价检查」（git + 读文件），秒级返回。
 *   - --deep 才跑重检查（honesty-scan / 影子普查 / PG 新鲜度），可能数十秒。
 *
 * 用法：
 *   node scripts/aux/doctor.mjs
 *   node scripts/aux/doctor.mjs --deep
 *   node scripts/aux/doctor.mjs --json
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Set(process.argv.slice(2));
const DEEP = args.has('--deep');
const JSON_OUT = args.has('--json');

const checks = [];
function record(name, status, detail) {
  checks.push({ name, status, detail });
}
function n_a(name, reason) {
  record(name, 'n/a', reason);
}
function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, encoding: 'utf8', timeout: opts.timeout ?? 120000 });
  const raw = r.stdout || '';
  // 注意：不要在此处 trim。git status --porcelain 的每行以状态位开头，首行 trim 会吞掉
  // 第一个空格（" M path" → "M path"），使 slice(3) 偏移错位、路径首字符被吃掉。
  return { ok: r.status === 0, code: r.status, raw, out: raw.trim(), err: (r.stderr || '').trim() };
}

// ---------- 1. 仓库状态 + 在途文件归属 ----------
const AUX_OWNED = [/^AGENTS\.md$/, /^docs\/harness\/AUX-/, /^docs\/harness\/CO-AGENT-CONTRACT\.md$/, /^scripts\/aux\//, /^docs\/rsi\//, /^\.claude\/CLAUDE\.md$/];
const MEMORY_ONLY = [/^\.workbuddy\/memory\//];

const st = run('git', ['status', '--porcelain', '-z']);
if (!st.ok) {
  n_a('工作树', `git status 失败: ${st.err || st.code}`);
} else {
  // -z：以 NUL 分隔，规避含空格/中文路径被加引号的问题
  const lines = st.raw.split('\0').filter((s) => s.length > 0);
  const buckets = { aux: [], lead: [], memory: [] };
  for (const raw of lines) {
    // porcelain v1: XY<space>path（前两位是状态码）
    const p = raw.slice(3).trim().replace(/^"(.*)"$/, '$1');
    if (MEMORY_ONLY.some((re) => re.test(p))) buckets.memory.push(p);
    else if (AUX_OWNED.some((re) => re.test(p))) buckets.aux.push(p);
    else buckets.lead.push(p);
  }
  record('工作树·辅助方在途', 'info', buckets.aux.join(', ') || '无');
  record('工作树·记忆/记账', 'info', `${buckets.memory.length} 个（容忍类）`);
  record(
    '工作树·主导方域在途',
    buckets.lead.length ? 'warn' : 'ok',
    buckets.lead.length
      ? `${buckets.lead.length} 个：${buckets.lead.slice(0, 8).join(', ')}${buckets.lead.length > 8 ? ' …' : ''}｜单通道：辅助方只许提交自己域内文件`
      : '干净'
  );
}

// ---------- 2. HEAD 与今日提交 ----------
const head = run('git', ['log', '-1', '--format=%H|%ad|%s', '--date=format:%Y-%m-%d %H:%M']);
if (head.ok && head.out) {
  const [sha, when, subj] = head.out.split('|');
  record('HEAD', 'info', `${sha.slice(0, 10)} @ ${when} — ${subj}`);
  const today = run('git', ['log', '--since=midnight', '--format=%s']);
  if (today.ok) {
    const subs = today.out ? today.out.split('\n') : [];
    const byType = {};
    for (const s of subs) {
      const m = s.match(/^([a-z]+)(?:\(|:)/);
      if (m) byType[m[1]] = (byType[m[1]] || 0) + 1;
    }
    const summary = Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' ');
    record('今日提交', 'info', `${subs.length} 个${summary ? '（' + summary + '）' : ''}`);
  }
}

// ---------- 3. 基线文件（防「用删测试冲抵数量」） ----------
function readJson(rel) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  } catch (e) {
    return { __error: e.message };
  }
}
const shadow = readJson('scripts/guard/shadow-baseline.json');
if (shadow.__error) n_a('影子基线', shadow.__error);
else record('影子基线', 'info', `shadow=${shadow.shadow} / total=${shadow.total}（记录于 ${shadow.recordedAt}，只许下调）`);

const rulec = readJson('scripts/guard/rulec-baseline.json');
if (rulec.__error) n_a('规则 C 基线', rulec.__error);
else record('规则 C 基线', 'info', `${rulec.total} 条（棘轮：存量放行、新增阻断）`);

// ---------- 4. 深度检查 ----------
if (DEEP) {
  const honesty = run('node', ['scripts/guard/honesty-scan.mjs', '--strict'], { timeout: 300000 });
  // 约定：exit 0 = 通过；非 0 可能是「有新增红线」或「脚本自身失败」，必须区分，不可一概判绿/红
  if (honesty.code === 0) record('诚实门禁 --strict', 'ok', 'exit 0');
  else if (honesty.code === null) n_a('诚实门禁 --strict', '超时或无法执行');
  else record('诚实门禁 --strict', 'fail', `exit ${honesty.code}；末 3 行：${(honesty.err || honesty.out).split('\n').slice(-3).join(' ⏎ ')}`);

  const census = run('node', ['scripts/guard/shadow-test-census.mjs'], { timeout: 300000 });
  if (census.ok) {
    const tail = census.out.split('\n').slice(-6).join(' ⏎ ');
    record('影子普查', 'info', tail || '(无输出)');
  } else n_a('影子普查', `exit ${census.code}：${census.err.split('\n')[0] || '无输出'}`);

  const psql = run('psql', ['-d', 'clair', '-tAc', 'select max(trade_date) from daily_quotes'], { timeout: 30000 });
  if (psql.ok && /^\d{4}-\d{2}-\d{2}$/.test(psql.out)) {
    const maxDate = psql.out;
    const days = Math.floor((Date.now() - new Date(maxDate + 'T00:00:00+08:00').getTime()) / 86400000);
    // 仅作提示：周末 + 单日假期可到 3~4 天；不做「是否交易日」的硬判定（需真实日历，见 docs/harness/TRADING-CALENDAR.md）
    record('行情新鲜度', days <= 4 ? 'ok' : 'warn', `daily_quotes 最新 ${maxDate}（距今 ${days} 天，含周末/假期，仅提示）`);
  } else {
    n_a('行情新鲜度', `psql 不可用或返回异常：${(psql.err || psql.out).split('\n')[0] || 'exit ' + psql.code}`);
  }
}

// ---------- 输出 ----------
if (JSON_OUT) {
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), deep: DEEP, checks }, null, 2));
} else {
  const tag = { ok: 'OK  ', info: 'INFO', warn: 'WARN', fail: 'FAIL', 'n/a': 'n/a ' };
  console.log(`\nClair 辅助方体检  ${new Date().toLocaleString('zh-CN', { hour12: false })}${DEEP ? '  [deep]' : ''}\n`);
  for (const c of checks) console.log(`  [${tag[c.status] || c.status}] ${c.name}：${c.detail}`);
  const bad = checks.filter((c) => c.status === 'fail' || c.status === 'warn');
  console.log(`\n  结论：${bad.length ? `${bad.length} 项需关注（${bad.map((b) => b.name).join('、')}）` : '无异常项'}`);
  if (!DEEP) console.log('  提示：加 --deep 跑门禁/普查/数据库新鲜度（较慢）\n');
  else console.log('');
}
