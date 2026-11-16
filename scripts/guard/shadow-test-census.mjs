#!/usr/bin/env node
/**
 * shadow-test-census.mjs — 影子测试普查（只读，不改任何文件）
 *
 * 判定口径：一个测试文件若**不 import 任何项目源码**（只 import vitest / 第三方库 /
 * 相对路径仍在 __tests__ 内），即为「影子测试」——它断言的是测试文件里自抄的一份实现，
 * 项目代码改坏它也不会红。
 *
 * 分类档（2026-11-17 新增）：对每个影子测试，抽取其自抄的 function / 函数型 const / class 名，
 * 与生产源码（backend/src、frontend/src、shared）的 export 名做同名匹配：
 *   - bindable（有生产源可绑）：至少命中 1 个同名生产导出，可进迁移队列做接口核对；
 *   - no-source（无生产源）：0 命中，不能靠改绑消化，只能归档或等生产补实现。
 * 同名只是线索，不代表接口兼容；是否可迁仍须读生产实现。
 *
 * 用法：node scripts/guard/shadow-test-census.mjs [--json] [--check]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '../..');
const SCAN_DIRS = ['backend/src', 'frontend/src'];
const PROD_DIRS = ['backend/src', 'frontend/src', 'shared'];
const IMPORT_RE = /(?:^|\n)\s*(?:import\s+(?:[^'"]*?from\s*)?|export\s+[^'"]*?from\s*|require\()\s*['"]([^'"]+)['"]/g;
// 动态 import \`await import('../x')\` 不在行首，上面的正则会漏判，导致真实导入被算成影子（2026-11-04 审计发现 14 例假阴性）
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]/g;
// 生产导出符号（只收值导出；type/interface 不算可绑实现）
const EXPORT_RE = /export\s+(?:async\s+)?(?:default\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g;
const REEXPORT_RE = /export\s*\{([^}]+)\}/g;
// 测试内自抄实现：函数声明、函数型 const/let/var、class
const TEST_FN_RE = /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g;
const TEST_CONST_RE = /(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(|function|[A-Za-z_$][\w$]*\s*=>)/g;
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

// 生产导出符号索引：symbol -> [source file]
const exportIndex = new Map();
function addExport(name, file) {
  if (!name || IGNORE.has(name) || name.length < 4) return;
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) return;
  const arr = exportIndex.get(name) || [];
  if (!arr.includes(file)) arr.push(file);
  exportIndex.set(name, arr);
}
for (const d of PROD_DIRS) {
  for (const f of walk(join(ROOT, d), isSource)) {
    const rel = relative(ROOT, f);
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(EXPORT_RE)) addExport(m[1], rel);
    for (const m of src.matchAll(REEXPORT_RE)) {
      for (const part of m[1].split(',')) {
        let name = part.trim().replace(/^type\s+/, '');
        const asIdx = name.indexOf(' as ');
        if (asIdx !== -1) name = name.slice(asIdx + 4).trim();
        addExport(name, rel);
      }
    }
  }
}

function sourcesOfShadow(file) {
  const src = readFileSync(join(ROOT, file), 'utf8');
  const declared = new Set();
  for (const m of src.matchAll(TEST_FN_RE)) declared.add(m[1]);
  for (const m of src.matchAll(TEST_CONST_RE)) declared.add(m[1]);
  const hits = new Map(); // source file -> Set(symbol)
  for (const name of declared) {
    if (IGNORE.has(name) || name.length < 4) continue;
    const targets = exportIndex.get(name);
    if (!targets) continue;
    for (const s of targets) {
      if (!hits.has(s)) hits.set(s, new Set());
      hits.get(s).add(name);
    }
  }
  const matchedSymbols = new Set();
  for (const set of hits.values()) for (const n of set) matchedSymbols.add(n);
  const sources = [...hits.entries()]
    .map(([f, syms]) => ({ file: f, symbols: [...syms].sort() }))
    .sort((a, b) => b.symbols.length - a.symbols.length)
    .slice(0, 3);
  return {
    category: matchedSymbols.size > 0 ? 'bindable' : 'no-source',
    matchedExports: matchedSymbols.size,
    sources,
  };
}

const all = [];
for (const d of SCAN_DIRS) all.push(...walk(join(ROOT, d), isTest));

// 按「__tests__ 目录（含其下一层子目录）」聚合，而不是按单个文件
function groupOf(file) {
  const parts = file.split(sep);
  const i = parts.indexOf('__tests__');
  if (i === -1) return parts.slice(0, -1).join('/');
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
for (const r of shadowRows) r.binding = sourcesOfShadow(r.file);
const bindable = shadowRows.filter((r) => r.binding.category === 'bindable');
const noSource = shadowRows.filter((r) => r.binding.category === 'no-source');
const byLocDesc = (a, b) => b.loc - a.loc;
const queueTop = [...bindable]
  .sort((a, b) => (b.binding.matchedExports - a.binding.matchedExports) || (b.loc - a.loc))
  .slice(0, 20)
  .map((r) => ({ file: r.file, loc: r.loc, matchedExports: r.binding.matchedExports, sources: r.binding.sources }));
const shadowFiles = [...shadowRows].sort(byLocDesc).map((r) => ({
  file: r.file,
  loc: r.loc,
  category: r.binding.category,
  matchedExports: r.binding.matchedExports,
}));
const summary = {
  total,
  shadow,
  real: total - shadow,
  ratio: total ? +(shadow / total * 100).toFixed(1) : 0,
  shadowLoc: shadowRows.reduce((s, r) => s + r.loc, 0),
  realLoc: realRows.reduce((s, r) => s + r.loc, 0),
  byDir: [...byDir.values()].sort((a, b) => b.shadow - a.shadow),
  largestShadow: [...shadowRows].sort(byLocDesc).slice(0, 15)
    .map((r) => ({ file: r.file, loc: r.loc })),
  binding: {
    bindable: bindable.length,
    noSource: noSource.length,
    note: '同名导出匹配只是迁移线索，不代表接口兼容；bindable + noSource = shadow。',
    queueTop,
  },
  shadowFiles,
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
  console.log('分类档: 可绑 ' + bindable.length + '，无生产源 ' + noSource.length);
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
  console.log('分类档      : 可绑 ' + bindable.length + '，无生产源 ' + noSource.length);
  console.log('\n按目录（影子数降序）:');
  for (const e of summary.byDir.slice(0, 12)) {
    console.log('  ' + String(e.shadow).padStart(4) + '/' + String(e.total).padEnd(4) + '  ' + e.dir);
  }
}
