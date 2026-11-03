#!/usr/bin/env node
/**
 * redgreen.mjs —— E3 红绿对照工具（RSI 研发侧，docs/rsi/dev-loop-v1.md §2-E3 / §7-S4）
 *
 * 目的：证明一条防复发断言真的挂着它声称防护的代码，而不是恒绿噪声。
 * 做法：备份目标行 → 注入一行投毒改动 → 跑测试期望失败 → 还原 → 再跑期望通过。
 *
 * 用法：
 *   node scripts/guard/redgreen.mjs \
 *     --spec frontend/src/__tests__/noRootAbsoluteAnchor.test.ts \
 *     --poison frontend/src/pages/LockupCalendarPage.tsx:383 \
 *     --to '<a href={`/stocks/${record.symbol}`}>{record.name}</a>'
 *
 * 与设计稿的差异（有意，已记录在 scripts/guard/README.md）：
 *   设计稿只写 --poison <file:line> 未说明投毒内容。不同断言需要不同形态的投毒，
 *   工具无法凭空推断；故增加必填 --to「替换后的整行内容」，由操作者显式给出。
 *   file:line 提供定位与前置校验（该行当前内容会打印出来），--to 提供变异形态。
 *
 * 纪律：
 *   - 内部不传 --retry，红就是红。
 *   - 目标文件必须干净（git status 无改动）；运行前后各取一次 status，非空即中止。
 *   - 还原走 try/finally + 原始字节写回，不给工作树留污染。
 *   - 退出码：0=PASS（红→绿）；1=断言无效或恢复失败；2=环境/参数错误。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function die(msg, code = 2) {
  console.error(`redgreen: ${msg}`);
  process.exit(code);
}

function parseArgs(argv) {
  const out = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    switch (a) {
      case '--spec': out.spec = argv[++i]; break;
      case '--poison': out.poison = argv[++i]; break;
      case '--to': out.to = argv[++i]; break;
      case '--root': out.root = argv[++i]; break;
      case '--json': out.json = true; break;
      case '--help': case '-h':
        console.log('usage: redgreen.mjs --spec <test-file> --poison <file:line> --to "<mutated line>" [--root <repo>] [--json]');
        process.exit(0);
        break;
      default: die(`unknown argument: ${a}`);
    }
  }
  return out;
}

function git(root, args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) die(`git ${args.join(' ')} failed: ${(r.stderr || '').trim()}`);
  return r.stdout;
}

function statusFor(root, absPath) {
  const r = spawnSync('git', ['status', '--short', '--', absPath], { cwd: root, encoding: 'utf8' });
  return (r.stdout || '').trim();
}

function tail(text, lines = 18) {
  const all = String(text || '').trimEnd().split('\n');
  return all.slice(Math.max(0, all.length - lines)).join('\n');
}

const args = parseArgs(process.argv.slice(2));
if (!args.spec) die('missing --spec <test-file>');
if (!args.poison) die('missing --poison <file:line>');
if (!args.to) die('missing --to "<mutated line>"（投毒后的整行内容）');

const root = path.resolve(args.root || git(process.cwd(), ['rev-parse', '--show-toplevel']).trim());
if (!fs.existsSync(root)) die(`root not found: ${root}`);

const m = String(args.poison).match(/^(.+):(\d+)$/);
if (!m) die('--poison must be <file>:<line>');
const targetAbs = path.resolve(root, m[1]);
const lineNo = Number(m[2]);
const specAbs = path.resolve(root, args.spec);
const rootPrefix = root + path.sep;
if (!targetAbs.startsWith(rootPrefix) || !specAbs.startsWith(rootPrefix)) die('paths must be inside repo root');
if (!fs.existsSync(targetAbs)) die(`poison target not found: ${m[1]}`);
if (!fs.existsSync(specAbs)) die(`spec not found: ${args.spec}`);

const specRel = path.relative(root, specAbs);
const cwd = specRel.startsWith('frontend' + path.sep) ? path.join(root, 'frontend')
  : specRel.startsWith('backend' + path.sep) ? path.join(root, 'backend')
  : root;
const specArg = path.relative(cwd, specAbs);

const before = statusFor(root, targetAbs);
if (before) die(`target file is dirty, refuse to poison:\n${before}`, 2);

const original = fs.readFileSync(targetAbs, 'utf8');
const lines = original.split('\n');
if (!Number.isInteger(lineNo) || lineNo < 1 || lineNo > lines.length) {
  die(`line ${lineNo} out of range (${lines.length} lines)`);
}
const origLine = lines[lineNo - 1];
console.log(`[redgreen] spec=${specRel}`);
console.log(`[redgreen] poison=${path.relative(root, targetAbs)}:${lineNo}`);
console.log(`[redgreen] before: ${origLine.trim()}`);
console.log(`[redgreen] after : ${args.to.trim()}`);

function runVitest() {
  const started = Date.now();
  const r = spawnSync('npx', ['vitest', 'run', specArg], {
    cwd,
    encoding: 'utf8',
    timeout: 600000,
    env: { ...process.env, CI: '1' },
  });
  return {
    status: typeof r.status === 'number' ? r.status : 1,
    signal: r.signal,
    ms: Date.now() - started,
    out: `${r.stdout || ''}\n${r.stderr || ''}`,
  };
}

let red;
try {
  lines[lineNo - 1] = args.to;
  fs.writeFileSync(targetAbs, lines.join('\n'));
  red = runVitest();
} finally {
  fs.writeFileSync(targetAbs, original);
}

const after = statusFor(root, targetAbs);
console.log(`[redgreen] poisoned run: exit=${red.status} ${red.signal || ''} (${(red.ms / 1000).toFixed(1)}s)`);
if (red.status === 0) {
  console.log(tail(red.out));
  console.log('E3 FAIL green-without-red observed=0-fail-after-poison expected=>=1-fail（断言与缺陷无因果关系）');
  process.exit(1);
}

if (after) {
  console.log('E3 FAIL worktree-dirty-after-restore:');
  console.log(after);
  process.exit(2);
}

const green = runVitest();
console.log(`[redgreen] restored run: exit=${green.status} ${green.signal || ''} (${(green.ms / 1000).toFixed(1)}s)`);
if (green.status !== 0) {
  console.log(tail(green.out));
  console.log('E3 FAIL restored-still-red observed=' + green.status + ' expected=0（还原后必须绿）');
  process.exit(1);
}

const result = {
  spec: specRel,
  poison: `${path.relative(root, targetAbs)}:${lineNo}`,
  before: origLine,
  after: args.to,
  poisoned: 'FAIL',
  restored: 'PASS',
  poisonedMs: red.ms,
  restoredMs: green.ms,
  worktreeDirty: false,
};
if (args.json) console.log(JSON.stringify(result, null, 2));
else {
  console.log('');
  console.log('poisoned=FAIL restored=PASS');
  console.log(`E3 PASS red→green 成立：${specRel} 对 ${path.relative(root, targetAbs)}:${lineNo} 的改动敏感`);
}
process.exit(0);
