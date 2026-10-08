/**
 * P0-STALEPX · 现状复现扫描
 *
 * 逐个拉取受影响标的的**当前**腾讯实时快照，检查：
 *   1. session 字段能否被现有守卫解析（`parts[30]` 匹配 ^\d{14}$）
 *   2. open / volume 是否为 0
 *   3. 结论：该标的今天若跑采集，会不会又写出一行伪数据
 *
 * 用途：证明修复的必要性（修复前会写、修复后不写）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const PSQL = '/opt/homebrew/opt/postgresql@15/bin/psql';
const argv = process.argv.slice(2);
const argOf = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};
const OUT = argOf('--out', '/tmp/p0stalepx/live-repro.json');
const CONC = Number(argOf('--concurrency', '8'));

const symbols = execFileSync(
  PSQL,
  [
    '-d',
    'clair',
    '-tAF',
    '\x1f',
    '-c',
    `SELECT s.symbol || E'\\x1f' || s.name FROM daily_quotes dq JOIN stocks s ON s.id=dq.stock_id
     WHERE dq.open_price=0 AND dq.volume=0 GROUP BY s.symbol,s.name ORDER BY s.symbol;`,
  ],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
)
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l) => {
    const [symbol, name] = l.split('\x1f');
    return { symbol, name };
  });

console.error(`扫描 ${symbols.length} 只标的当前快照，并发 ${CONC}\n`);

async function probe({ symbol, name }) {
  const [code, mkt] = symbol.split('.');
  const prefix = mkt === 'SH' ? 'sh' : mkt === 'SZ' ? 'sz' : 'bj';
  try {
    const res = await fetch(`https://qt.gtimg.cn/q=${prefix}${code}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://gu.qq.com/' },
    });
    const txt = new TextDecoder('gbk').decode(Buffer.from(await res.arrayBuffer()));
    const body = txt.split('"')[1];
    if (!body) return { symbol, name, error: 'empty' };
    const p = body.split('~');
    const sessionRaw = p[30] ?? '';
    const sessionParsed = /^\d{4}(\d{2})(\d{2})\d{6}$/.test(sessionRaw.trim());
    const open = Number(p[5]);
    const volume = Number(p[6]);
    return {
      symbol,
      name,
      fieldCount: p.length,
      sessionRaw,
      sessionParsedByProdGuard: sessionParsed,
      open,
      volume,
      // 现有守卫（session 可解析 且 是交易日）会放行 → 就会写出一行伪数据
      wouldWriteFakeRow: sessionParsed && (open === 0 || volume === 0),
      blockedByProdGuard: !sessionParsed,
    };
  } catch (e) {
    return { symbol, name, error: String(e.message || e) };
  }
}

const out = [];
let done = 0;
const pool = [...symbols];
await Promise.all(
  Array.from({ length: CONC }, async () => {
    while (pool.length) {
      out.push(await probe(pool.pop()));
      if (++done % 100 === 0) console.error(`  ${done}/${symbols.length}`);
    }
  }),
);

out.sort((a, b) => (a.symbol < b.symbol ? -1 : 1));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));

const errs = out.filter((r) => r.error);
const would = out.filter((r) => r.wouldWriteFakeRow);
const blocked = out.filter((r) => r.blockedByProdGuard);
const clean = out.filter((r) => !r.error && !r.wouldWriteFakeRow && !r.blockedByProdGuard);

console.log(`\n── 现状复现结论 ──`);
console.log(`取数失败            : ${errs.length}`);
console.log(`现有守卫会放行→写伪行: ${would.length}`);
console.log(`被现有守卫拦下      : ${blocked.length}`);
console.log(`完全正常            : ${clean.length}`);
if (would.length) {
  console.log(`\n⚠ 以下标的现在跑采集就会再造伪行（前 15 条）：`);
  for (const r of would.slice(0, 15))
    console.log(`   ${r.symbol} ${r.name} open=${r.open} vol=${r.volume} session=${r.sessionRaw}`);
}
console.log(`\n明细：${OUT}`);
