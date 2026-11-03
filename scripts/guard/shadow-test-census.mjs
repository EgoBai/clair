#!/usr/bin/env node
/**
 * shadow-test-census.mjs — 影子测试普查（只读，不改任何文件）
 *
 * 判定口径：一个测试文件若**不 import 任何项目源码**（只 import vitest / 第三方库 /
 * 相对路径仍在 __tests__ 内），即为「影子测试」——它断言的是测试文件里自抄的一份实现，
 * 项目代码改坏它也不会红。
 *
 * 为什么要普查而不是直接重写：52% 的体量，大爆炸式重写会制造大面积假红。
 * 先按目录量化，再挑「纯函数、零副作用」的批次迁移。
 *
 * 用法：node scripts/guard/shadow-test-census.mjs [--json]
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '../..');
const SCAN_DIRS = ['backend/src', 'frontend/src'];
const IMPORT_RE = /(?:^|\n)\s*(?:import\s+(?:[^'"]*?from\s*)?|export\s+[^'"]*?from\s*|require\()\s*['"]([^'"]+)['"]/g;
// 动态 import `await import('../x')` 不在行首，上面的正则会漏判，导致真实导入被算成影子（2026-11-04 审计发现 14 例假阴性）
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]/g;

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.git') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(test|spec)\.(t|j)sx?$/.test(name)) out.push(p);
  }
  return out;
}

function classify(file) {
  const src = readFileSync(file, 'utf8');
  const loc = src.split('\n').length;
  const specs = [];
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(src))) specs.push(m[1]);
  DYNAMIC_IMPORT_RE.lastIndex = 0;
  while ((m = DYNAMIC_IMPORT_RE.exec(src))) specs.push(m[1]);
  const testDir = dirname(file);
  let projectImports = 0;
  for (const s of specs) {
    if (!s.startsWith('.')) continue;               // 第三方 / node: 内置
    const target = resolve(testDir, s);
    const rel = relative(ROOT, target);
    if (rel.startsWith('..')) continue;
    if (rel.split(sep).includes('__tests__')) continue; // 仍在测试目录内
    if (rel.includes('node_modules')) continue;
    projectImports += 1;
  }
  return { file: relative(ROOT, file), projectImports, loc, shadow: projectImports === 0 };
}

const all = [];
for (const d of SCAN_DIRS) all.push(...walk(join(ROOT, d)));

// 按「__tests__ 目录（含其下一层子目录）」聚合，而不是按单个文件
function groupOf(file) {
  const parts = file.split(sep);
  const i = parts.indexOf('__tests__');
  if (i === -1) return parts.slice(0, -1).join('/');
  // __tests__ 下再有一层子目录时按子目录分组，否则归到 __tests__ 本身
  const base = parts.slice(0, i + 1).join('/');
  const sub = parts.length > i + 2 ? '/' + parts[i + 1] : '';
  return base + sub;
}
const rows = all.map(classify);
const byDir = new Map();
for (const r of rows) {
  const dir = groupOf(r.file);
  const e = byDir.get(dir) || { dir, total: 0, shadow: 0 };
  e.total += 1;
  if (r.shadow) e.shadow += 1;
  byDir.set(dir, e);
}
const total = rows.length;
const shadow = rows.filter((r) => r.shadow).length;
const shadowRows = rows.filter((r) => r.shadow);
const realRows = rows.filter((r) => !r.shadow);
const summary = {
  total,
  shadow,
  real: total - shadow,
  ratio: total ? +(shadow / total * 100).toFixed(1) : 0,
  shadowLoc: shadowRows.reduce((s, r) => s + r.loc, 0),
  realLoc: realRows.reduce((s, r) => s + r.loc, 0),
  byDir: [...byDir.values()].sort((a, b) => b.shadow - a.shadow),
  largestShadow: [...shadowRows].sort((a, b) => b.loc - a.loc).slice(0, 15)
    .map((r) => ({ file: r.file, loc: r.loc })),
};

if (process.argv.includes('--check')) {
  // 基线守卫：影子测试数量只许降不许升。新增测试必须真实 import 产品代码。
  const baselinePath = join(ROOT, 'scripts/guard/shadow-baseline.json');
  let baseline;
  try {
    baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  } catch {
    console.error('缺少基线文件 scripts/guard/shadow-baseline.json，无法判定');
    process.exit(2);
  }
  console.log('影子测试: ' + shadow + '/' + total + '，基线上限 ' + baseline.shadow + '/' + baseline.total);
  if (shadow > baseline.shadow) {
    console.error('失败：影子测试从 ' + baseline.shadow + ' 升到 ' + shadow + '（新增测试未 import 产品代码）');
    process.exit(1);
  }
  if (shadow < baseline.shadow) {
    console.log('改善：影子测试减少 ' + (baseline.shadow - shadow) + '，请手动下调基线文件');
  }
  process.exit(0);
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log('测试文件总数: ' + total);
  console.log('影子测试    : ' + shadow + ' (' + summary.ratio + '%)');
  console.log('真实导入    : ' + (total - shadow));
  console.log('\n按目录（影子数降序）:');
  for (const e of summary.byDir.slice(0, 12)) {
    console.log('  ' + String(e.shadow).padStart(4) + '/' + String(e.total).padEnd(4) + '  ' + e.dir);
  }
}
