#!/usr/bin/env node
/**
 * shadow-migration-candidates.mjs — 影子测试「可迁移候选」扫描（只读，不改任何文件）
 *
 * 背景：shadow-test-census.mjs 只回答「有多少影子」，不回答「下一批该迁哪个」。
 * 本脚本用两条证据给候选排序，避免凭感觉挑文件：
 *   1) 符号证据：影子测试里自抄的函数/常量名，是否在某个生产源码文件里被 export；
 *   2) 命名证据：测试文件名（去 .test）与生产源码路径的规范化字符串是否互相包含。
 * 只做线索，不判断接口是否兼容——迁移前仍需人工读生产实现。
 *
 * 用法：node scripts/guard/shadow-migration-candidates.mjs [--json] [--top N]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '../..');
const SCAN_DIRS = ['backend/src', 'frontend/src'];
const IMPORT_RE = /(?:^|\n)\s*(?:import\s+(?:[^'"]*?from\s*)?|export\s+[^'"]*?from\s*|require\()\s*['"]([^'"]+)['"]/g;
const EXPORT_RE = /export\s+(?:async\s+)?(?:default\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/g;
const TEST_FN_RE = /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g;
const TEST_CONST_RE = /(?:^|\n)\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(|function|[A-Za-z_$][\w$]*\s*=>)/g;
const IGNORE = new Set(['expect', 'describe', 'it', 'test', 'beforeEach', 'afterEach', 'beforeAll', 'afterAll', 'vi', 'jest', 'main', 'run', 'setup']);

function walk(dir, filter, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.git') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, filter, out);
    else if (filter(name)) out.push(p);
  }
  return out;
}
const isTest = (n) => /\.(test|spec)\.(t|j)sx?$/.test(n);
const isSource = (n) => /\.(t|j)sx?$/.test(n) && !isTest(n);

function isShadow(file) {
  const src = readFileSync(file, 'utf8');
  const testDir = dirname(file);
  for (const m of src.matchAll(IMPORT_RE)) {
    const s = m[1];
    if (!s.startsWith('.')) continue;
    const rel = relative(ROOT, resolve(testDir, s));
    if (rel.startsWith('..')) continue;
    if (rel.split(sep).includes('__tests__')) continue;
    if (rel.includes('node_modules')) continue;
    return false;
  }
  return true;
}
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d), (n) => isSource(n) || isTest(n)));
const sources = files.filter((f) => isSource(f.split(sep).pop()));
const tests = files.filter((f) => isTest(f.split(sep).pop())).filter((f) => isShadow(f));

const exportIndex = new Map(); // symbol -> [source file]
for (const f of sources) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(EXPORT_RE)) {
    const name = m[1];
    if (IGNORE.has(name) || name.length < 4) continue;
    const arr = exportIndex.get(name) || [];
    arr.push(relative(ROOT, f));
    exportIndex.set(name, arr);
  }
}

const rows = [];
for (const t of tests) {
  const src = readFileSync(t, 'utf8');
  const declared = new Set();
  for (const m of src.matchAll(TEST_FN_RE)) declared.add(m[1]);
  for (const m of src.matchAll(TEST_CONST_RE)) declared.add(m[1]);
  const hits = new Map(); // source file -> Set(matched symbols)
  for (const name of declared) {
    if (IGNORE.has(name) || name.length < 4) continue;
    const targets = exportIndex.get(name);
    if (!targets) continue;
    for (const s of targets) {
      if (!hits.has(s)) hits.set(s, new Set());
      hits.get(s).add(name);
    }
  }
  const stem = norm(t.split(sep).pop().replace(/\.(test|spec)\.(t|j)sx?$/, ''));
  const ranked = [...hits.entries()]
    .map(([file, syms]) => ({ file, symbols: [...syms].sort(), score: syms.size }))
    .sort((a, b) => b.score - a.score);
  const nameMatch = ranked.find((c) => norm(c.file).includes(stem) || stem.includes(norm(dirname(c.file).split(sep).pop())));
  rows.push({
    test: relative(ROOT, t),
    loc: src.split('\n').length,
    declaredSymbols: declared.size,
    top: ranked.slice(0, 3),
    score: ranked.length ? ranked[0].score : 0,
    nameMatch: !!nameMatch,
  });
}

rows.sort((a, b) => (b.score - a.score) || (a.loc - b.loc));
const topArg = process.argv.indexOf('--top');
const topN = topArg > -1 ? Number(process.argv[topArg + 1]) || 25 : 25;
const strong = rows.filter((r) => r.score >= 2);
// 分数分布：让「有多少影子一个生产符号都对不上」可量化，用于制定收口策略
const distribution = rows.reduce((m, r) => {
  const k = String(r.score);
  m[k] = (m[k] || 0) + 1;
  return m;
}, {});
const out = {
  shadowTests: rows.length,
  withExportOverlap: strong.length,
  distribution,
  top: strong.slice(0, topN),
  // --all 输出全部影子行（含 0/1 重叠），供抽样审计分类，不改变默认输出
  all: process.argv.includes('--all') ? rows : undefined,
};
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log('影子测试: ' + rows.length + '，其中检测到生产 export 符号重叠: ' + strong.length);
  console.log('\n候选（按重叠符号数降序，仅线索，需人工读接口）:');
  for (const r of strong.slice(0, topN)) {
    console.log('  [' + r.score + '] ' + r.test + ' (' + r.loc + ' 行)');
    for (const c of r.top) console.log('      → ' + c.file + '  ' + c.symbols.join(','));
  }
}
