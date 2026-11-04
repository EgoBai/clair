#!/usr/bin/env node
/**
 * E5 第 2 层发布器 —— 把 data-freshness.ts --publish 产出的快照写进 KV meta:freshness
 *
 * 为什么单独一步：快照必须在**有 PG 的机器**上算（Worker 没有驱动），
 * 而写入 KV 需要 Cloudflare 凭据。两者都不该混进 CI 常驻流程，故做成显式命令。
 *
 * 用法：
 *   node scripts/guard/publish-freshness.mjs --file /tmp/e5.json \
 *     --account <account_id> --namespace <kv_namespace_id> [--dry-run]
 * 凭据：环境变量 CLOUDFLARE_API_TOKEN（需 Workers KV Storage:Edit）。
 *
 * 硬约束：
 *   - 缺凭据 → 直接退出 2 并说明，不伪造成功（绝不打印「已发布」）。
 *   - 快照 verdict 必须存在且 checkedAt 可解析，否则拒绝发布（半成品不进生产）。
 *   - --dry-run 只校验并打印将要写入的内容，不发请求。
 */
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const opt = (n) => {
  const eq = argv.find((a) => a.startsWith(`--${n}=`));
  if (eq) return eq.slice(n.length + 3);
  const at = argv.indexOf(`--${n}`);
  if (at >= 0 && at + 1 < argv.length && !argv[at + 1].startsWith('--')) return argv[at + 1];
  return undefined;
};
const file = opt('file');
const account = opt('account') ?? process.env.CLOUDFLARE_ACCOUNT_ID;
const namespace = opt('namespace') ?? process.env.CLOUDFLARE_KV_NAMESPACE_ID;
const dryRun = argv.includes('--dry-run');

if (!file) {
  console.error('用法：node scripts/guard/publish-freshness.mjs --file <snapshot.json> --account <id> --namespace <id> [--dry-run]');
  process.exit(2);
}

let snapshot;
try {
  snapshot = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  console.error('E5 PUBLISH ERROR 读取快照失败：' + e.message);
  process.exit(2);
}
if (!snapshot.verdict || Number.isNaN(Date.parse(snapshot.checkedAt ?? ''))) {
  console.error('E5 PUBLISH ERROR 快照缺 verdict 或 checkedAt 不可解析，拒绝发布（半成品不进生产）');
  process.exit(2);
}

if (dryRun) {
  console.log('E5 PUBLISH DRY-RUN 将写入 meta:freshness：');
  console.log(JSON.stringify(snapshot, null, 2));
  process.exit(0);
}

const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token || !account || !namespace) {
  console.error('E5 PUBLISH ERROR 缺少凭据：需要 CLOUDFLARE_API_TOKEN（KV:Edit）、--account、--namespace');
  process.exit(2);
}

const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/storage/kv/namespaces/${encodeURIComponent(namespace)}/values/meta%3Afreshness`;
const resp = await fetch(url, {
  method: 'PUT',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
  body: JSON.stringify(snapshot),
});
let body = null;
try { body = await resp.json(); } catch { body = null; }
if (!resp.ok || !body || body.success !== true) {
  console.error(`E5 PUBLISH ERROR KV 写入失败：HTTP ${resp.status} ${JSON.stringify(body)?.slice(0, 300) ?? ''}`);
  process.exit(1);
}
console.log(`E5 PUBLISH OK meta:freshness 已写入（verdict=${snapshot.verdict} maxTradeDate=${snapshot.maxTradeDate} lag=${snapshot.lagTradingDays}）`);
