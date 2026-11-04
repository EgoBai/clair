#!/usr/bin/env node
/**
 * 可达性报告：从真实入口做 import 图，判断测试绑定的模块是否「用户走得到」。
 *
 * 起因（2026-11-04 轮 16-17）：M2 的 687 个影子测试里有大量模块从 main.tsx 走不到，
 * 「绑定生产实现」只能证明库自洽。本脚本不改任何文件，只输出分层统计。
 *
 * 用法：
 *   node scripts/guard/reachability.mjs            # 人类可读表格
 *   node scripts/guard/reachability.mjs --json     # JSON（供其他脚本消费）
 *   node scripts/guard/reachability.mjs --check    # 仅打印一行摘要，退出码恒 0（不阻断 CI）
 *
 * 口径（与 handover/21 一致）：
 *   入口：frontend/src/main.tsx、backend/src/index.ts + backend/src/app.ts、clair-worker/worker.js
 *   解析：from / import( / require( ；别名 @/ → frontend/src，@shared/ → shared；
 *         相对路径补 .ts/.tsx/.js/.jsx/.mjs/.cjs 与 /index.*
 *   排除：__tests__、*.test.*、_archived、node_modules、dist、*.d.ts
 * 局限：不识别运行时拼接的 import；「不可达」是强证据，「可达」是必要条件。
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const SKIP_DIRS = ['__tests__', 'node_modules', '_archived', 'dist', '.git'];
/** shared/formatters.js 是被 .gitignore 的构建影子产物，不能计入项目源码 */
const SKIP_FILES = new Set(['shared/formatters.js']);
const SOURCE_ROOTS = ['frontend/src', 'backend/src', 'shared', 'clair-worker'];

const args = new Set(process.argv.slice(2));
const asJson = args.has('--json');
const checkOnly = args.has('--check');

function walk(rel, opts = {}) {
  const base = path.join(ROOT, rel);
  const out = [];
  if (!fs.existsSync(base)) return out;
  const stack = [base];
  while (stack.length) {
    const dir = stack.pop();
    const skips = opts.includeTests ? SKIP_DIRS.filter((d) => d !== '__tests__') : SKIP_DIRS;
    if (skips.some((s) => dir.includes(path.sep + s + path.sep) || dir.endsWith(path.sep + s))) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(p);
      } else if (EXTS.includes(path.extname(e.name)) && !e.name.endsWith('.d.ts') && !SKIP_FILES.has(path.relative(ROOT, p))) {
        out.push(p);
      }
    }
  }
  return out;
}

const projectFiles = new Set();
for (const rel of SOURCE_ROOTS) {
  for (const f of walk(rel)) projectFiles.add(f);
}

const IMPORT_RE = /(?:from\s*|require\(\s*|import\(\s*|^\s*import\s*)['"]([^'"]+)['"]/gm;

function resolveSpec(spec, fromFile) {
  let base;
  if (spec.startsWith('@shared/')) base = path.join(ROOT, 'shared', spec.slice('@shared/'.length));
  else if (spec.startsWith('@/')) base = path.join(ROOT, 'frontend/src', spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else return null;
  const direct = [''].concat(EXTS).map((e) => base + e).find((p) => projectFiles.has(p));
  if (direct) return direct;
  return EXTS.map((e) => path.join(base, 'index' + e)).find((p) => projectFiles.has(p)) || null;
}

const graph = new Map();
for (const file of projectFiles) {
  let src = '';
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const deps = new Set();
  IMPORT_RE.lastIndex = 0;
  let m;
  while ((m = IMPORT_RE.exec(src)) !== null) {
    const r = resolveSpec(m[1], file);
    if (r) deps.add(r);
  }
  graph.set(file, deps);
}

function reach(entries) {
  const seen = new Set();
  const stack = entries.filter((p) => projectFiles.has(p));
  while (stack.length) {
    const n = stack.pop();
    if (seen.has(n)) continue;
    seen.add(n);
    for (const d of graph.get(n) || []) if (!seen.has(d)) stack.push(d);
  }
  return seen;
}

const entries = {
  frontend: [path.join(ROOT, 'frontend/src/main.tsx')],
  backend: [path.join(ROOT, 'backend/src/index.ts'), path.join(ROOT, 'backend/src/app.ts')],
  worker: [path.join(ROOT, 'clair-worker/worker.js')],
};
const reached = {
  frontend: reach(entries.frontend),
  backend: reach(entries.backend),
  worker: reach(entries.worker),
};

function reachTags(file) {
  const tags = [];
  for (const [k, set] of Object.entries(reached)) if (set.has(file)) tags.push(k);
  return tags;
}

// 测试文件：单独收集（walk 已跳过 __tests__ 目录，需要额外扫）
function walkTests(rel) {
  const out = [];
  const base = path.join(ROOT, rel);
  if (!fs.existsSync(base)) return out;
  for (const f of walk(rel, { includeTests: true })) {
    if (f.includes(path.sep + '__tests__' + path.sep) && /\.test\.[cm]?[jt]sx?$/.test(f)) out.push(f);
  }
  return out;
}

const testFiles = [
  ...walkTests('frontend/src'),
  ...walkTests('backend/src'),
  ...walkTests('clair-worker'),
];

const buckets = { reachable: [], unreachableOnly: [], noProjectImport: [] };
for (const testFile of testFiles) {
  let src = '';
  try {
    src = fs.readFileSync(testFile, 'utf8');
  } catch {
    continue;
  }
  const targets = new Set();
  IMPORT_RE.lastIndex = 0;
  let m;
  while ((m = IMPORT_RE.exec(src)) !== null) {
    const r = resolveSpec(m[1], testFile);
    if (r && !/__tests__/.test(r) && !/\.test\./.test(r)) targets.add(r);
  }
  const imports = [...targets];
  if (imports.length === 0) buckets.noProjectImport.push(testFile);
  else if (imports.some((p) => reachTags(p).length > 0)) buckets.reachable.push(testFile);
  else buckets.unreachableOnly.push(testFile);
}

function pkgOf(file) {
  const rel = path.relative(ROOT, file).split(path.sep)[0];
  return rel;
}

const utilsFrontend = [...projectFiles].filter((p) => p.includes(path.sep + 'frontend/src/utils' + path.sep));
const utilsUnreachable = utilsFrontend.filter((p) => reached.frontend.has(p) === false && reached.backend.has(p) === false);

const summary = {
  generatedAt: new Date().toISOString(),
  projectFiles: projectFiles.size,
  reached: {
    frontend: reached.frontend.size,
    backend: reached.backend.size,
    worker: reached.worker.size,
  },
  frontendUtils: {
    total: utilsFrontend.length,
    unreachable: utilsUnreachable.length,
    ratio: utilsFrontend.length ? Number((utilsUnreachable.length / utilsFrontend.length).toFixed(4)) : null,
  },
  tests: {
    total: testFiles.length,
    reachable: buckets.reachable.length,
    unreachableOnly: buckets.unreachableOnly.length,
    noProjectImport: buckets.noProjectImport.length,
    byPackage: {
      frontend: {
        reachable: buckets.reachable.filter((f) => pkgOf(f) === 'frontend').length,
        unreachableOnly: buckets.unreachableOnly.filter((f) => pkgOf(f) === 'frontend').length,
        noProjectImport: buckets.noProjectImport.filter((f) => pkgOf(f) === 'frontend').length,
      },
      backend: {
        reachable: buckets.reachable.filter((f) => pkgOf(f) === 'backend').length,
        unreachableOnly: buckets.unreachableOnly.filter((f) => pkgOf(f) === 'backend').length,
        noProjectImport: buckets.noProjectImport.filter((f) => pkgOf(f) === 'backend').length,
      },
      worker: {
        reachable: buckets.reachable.filter((f) => pkgOf(f) === 'clair-worker').length,
        unreachableOnly: buckets.unreachableOnly.filter((f) => pkgOf(f) === 'clair-worker').length,
        noProjectImport: buckets.noProjectImport.filter((f) => pkgOf(f) === 'clair-worker').length,
      },
    },
  },
  samples: {
    unreachableOnly: buckets.unreachableOnly.slice(0, 15).map((f) => path.relative(ROOT, f)),
  },
};

if (asJson) {
  console.log(JSON.stringify(summary, null, 2));
} else if (checkOnly) {
  const t = summary.tests;
  console.log(
    `reachability: tests ${t.total} | binds-reachable ${t.reachable} | unreachable-only ${t.unreachableOnly} | no-project-import ${t.noProjectImport} | frontend utils ${summary.frontendUtils.unreachable}/${summary.frontendUtils.total}`,
  );
} else {
  const t = summary.tests;
  console.log('可达性报告（只读，不阻断 CI）');
  console.log('');
  console.log('| 项 | 数值 |');
  console.log('|---|---|');
  console.log(`| 扫描项目文件 | ${summary.projectFiles} |`);
  console.log(`| 前端可达 | ${summary.reached.frontend} |`);
  console.log(`| 后端可达 | ${summary.reached.backend} |`);
  console.log(`| Worker 可达 | ${summary.reached.worker} |`);
  console.log(`| 前端 utils 不可达 | ${summary.frontendUtils.unreachable}/${summary.frontendUtils.total}（${(summary.frontendUtils.ratio * 100).toFixed(1)}%） |`);
  console.log('');
  console.log('| 测试分层 | 数量 |');
  console.log('|---|---|');
  console.log(`| 绑定到可达模块 | ${t.reachable} |`);
  console.log(`| 只绑定不可达模块 | ${t.unreachableOnly} |`);
  console.log(`| 不 import 项目源码 | ${t.noProjectImport} |`);
  console.log(`| 测试文件总数 | ${t.total} |`);
  console.log('');
  console.log('只绑定不可达模块的样例：');
  for (const s of summary.samples.unreachableOnly) console.log('  - ' + s);
}