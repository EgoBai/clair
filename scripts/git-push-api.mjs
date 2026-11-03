#!/usr/bin/env node
/**
 * scripts/git-push-api.mjs — 用 GitHub Git Data API 把本地未推送提交推上去（零第三方依赖）
 *
 * ============================ 为什么需要它 ============================
 * 本环境下 `git push` 走 `github.com:443` 不稳定（常见 `Failed to connect to
 * github.com port 443 after 75001 ms`），走系统代理则报
 * `CONNECT tunnel failed, response 502`。但 `api.github.com` 稳定可达，
 * `gh` CLI 已登录。因此用 Git Data API（blob → tree → commit → ref）逐提交重建。
 *
 * ============================ 推送通道判定顺序 ============================
 *   ① 先去掉全部 proxy 变量、直连重试原生 push：
 *      env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY \
 *          -u all_proxy -u ALL_PROXY git push origin main
 *   ② ①失败再跑本脚本：node scripts/git-push-api.mjs
 *   ③ ①②都失败才上报（并把失败原文一并上报，不许假装成功）
 *
 * ============================ 三条纪律（血泪教训，勿删） ============================
 * 纪律 1｜API 推送会重建 commit 对象 ⟹ 远端 commit sha 必然与本地不同；
 *         提交顺序/父链不同时，快照基准变化也会让 **tree hash 不同**。
 * 纪律 2｜因此"内容是否落地"的判据只能是**文件级内容比对**（逐 path 比 blob sha，
 *         或对文件内容算 shasum）。**绝不能拿 commit sha / tree hash 当判据**
 *         （历史教训：曾把「单文件 shasum 相同」外推成「内容逐字节一致」，属过度外推）。
 *         本脚本的 --verify 做的是：本地 `git ls-tree -r HEAD` 的 path→blob-sha 映射
 *         与远端 head 递归 tree 的 path→blob-sha 映射**逐项相等**。git 的 blob sha
 *         与 GitHub API 返回的 blob sha 是同一个算法（sha1("blob <len>\0"+content)），
 *         所以这个比对是精确的、非近似的。
 * 纪律 3｜推送成功后**必须** `git update-ref refs/remotes/origin/main $(git rev-parse HEAD)`
 *         （只能指向本地 commit；指向远端重建 sha 会失败）。否则本地 origin/main 持续落后，
 *         后续 `git push` / `git status` / "有没有未推送提交" 的判断全部错位
 *         （历史教训：曾因此把已推内容重复计入，产生一个空提交 `a166db9c`）。
 * 纪律 4｜内容比对的**本地基准是"本次实际推送的那个 commit"（启动时冻结的 localHead）**，
 *        不是运行期再解析一次的符号 `HEAD`，更不是工作区/索引。
 *        ① 多 Agent 共享工作区时工作区常是脏的 ⟹ 读工作区必然误判，工作区**不参与比对**；
 *        ② 运行期间别的 Agent 可能又提交 ⟹ 符号 `HEAD` 会漂移，拿它比必然把"推对了"误判成 FAIL。
 *        两者都会伪装成"远端内容不对"，实测都复现过，故本脚本对基准做**冻结**处理，
 *        并在 HEAD 漂移时打 `HEAD_MOVED_DURING_RUN` 告警（告警 ≠ 失败）。
 *
 * ============================ 行为约定 ============================
 * - 无未推送提交（远端 head 内容与本地 HEAD 一致）→ 打印 `NOTHING_TO_PUSH`，exit 0。
 *   **且 exit 0 的每条路径都必定先打印 `CONTENT_CHECK=OK`** —— 调用方可用
 *   「退出码」或「CONTENT_CHECK=OK 这一行」任一条单独判定成功；
 *   不允许出现"退出 0 但没有任何校验结论"的路径（空提交全跳过的那条曾有此漏洞）。
 * - 内容级校验不通过 → 打印 `CONTENT_CHECK=FAIL` 与差异明细，exit 1（不静默成功）。
 * - 推送前发现远端 head 已被别人推进（并发）→ 打印 `PUSH_ABORTED`，exit 2（不覆盖）。
 * - 逐提交重建：每个本地提交生成一个远端 commit（base_tree 逐层叠加、parents 链接），
 *   最终一次性 PATCH ref（force:false）。**不是**把最终 tree 一把拍上去。
 * - **不使用任何临时 ref**：全程只 PATCH 目标分支一次，故失败/中止时没有自建 ref 需要清理
 *   （中止时已 POST 的 blob/tree/commit 会成为远端不可达对象，GitHub 自行回收，不影响分支）。
 *   这是刻意设计——"临时 ref + 事后 delete" 一旦在 delete 前崩溃，就会留下脏 ref 指向
 *   半成品 commit，比多留几个不可达对象危险得多。
 *
 * ============================ 用法 ============================
 *   node scripts/git-push-api.mjs              # 推送当前分支到 origin
 *   node scripts/git-push-api.mjs --dry-run    # 只算差异，不发写请求
 *   GPA_BRANCH=main GPA_REMOTE=origin node scripts/git-push-api.mjs
 *
 * exit code: 0 成功/无事可做，1 失败，2 并发中止
 */

import { execFileSync } from 'node:child_process';

const EXIT_OK = 0;
const EXIT_FAIL = 1;
const EXIT_ABORT = 2;

const DRY_RUN = process.argv.includes('--dry-run');

function out(line) {
  process.stdout.write(line + '\n');
}
function die(msg) {
  process.stderr.write('PUSH_FAILED: ' + msg + '\n');
  process.exit(EXIT_FAIL);
}
function abortMsg(msg) {
  process.stderr.write('PUSH_ABORTED: ' + msg + '\n');
  process.exit(EXIT_ABORT);
}

// ---------------------------------------------------------------- git 封装
// 不在仓库内时 execFileSync 会抛原生异常（打一整屏 stack）。那样退出码虽然也是 1，
// 但读者看到的是"脚本崩了"，而实际是"环境不满足、脚本有权拒绝"——两者要分开表述。
let REPO;
try {
  REPO = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
} catch {
  die(`当前目录不是 git 工作区（git rev-parse --show-toplevel 失败），无法判断要推哪个仓库: ${process.cwd()}`);
}
const GIT_OPTS = { cwd: REPO, maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] };

/** 跑 git，返回 utf8 字符串；失败抛错 */
function git(args) {
  return execFileSync('git', ['-c', 'core.quotepath=off', ...args], { ...GIT_OPTS, encoding: 'utf8' });
}
/** 跑 git，返回 Buffer（取文件原始字节用） */
function gitBuf(args) {
  return execFileSync('git', ['-c', 'core.quotepath=off', ...args], GIT_OPTS);
}
/** 跑 git，失败返回 null */
function gitOpt(args) {
  try {
    return git(args);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- 远端/分支/凭证
const REMOTE = process.env.GPA_REMOTE || 'origin';
const BRANCH = process.env.GPA_BRANCH || git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
if (!BRANCH || BRANCH === 'HEAD') die('当前处于 detached HEAD，请先切到分支');

// remote get-url 失败（远端名写错 / .git/config 没有该 remote）时，git 会抛原生异常。
// 走 die 而不是让异常冒出去：退出码同为 1，但前者是一句可执行的提示，后者是一屏 stack，
// 事后没人能分清"环境没配好"和"推送通道有 bug"。
let remoteUrl;
try {
  remoteUrl = git(['remote', 'get-url', REMOTE]).trim();
} catch {
  die(`取不到远端 ${REMOTE} 的地址（git remote get-url 失败）：该 remote 不存在或 .git/config 损坏`);
}
const urlMatch = remoteUrl.match(/github\.com[:/]+([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
if (!urlMatch) die(`无法从远端地址解析 owner/repo: ${remoteUrl}`);
const [, OWNER, REPO_NAME] = urlMatch;

function readToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN.trim();
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  try {
    return execFileSync('gh', ['auth', 'token', '--hostname', 'github.com'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    die('拿不到 GitHub token（gh auth token 失败，且无 GH_TOKEN 环境变量）');
  }
}

// ---------------------------------------------------------------- API 封装
const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO_NAME}`;
let TOKEN = null;

async function api(path, { method = 'GET', body } = {}) {
  const url = API_BASE + path;
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'clair-git-push-api',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      if (res.ok) return text ? JSON.parse(text) : null;
      // 4xx 是确定性的，不重试
      if (res.status < 500) {
        throw Object.assign(new Error(`${method} ${path} -> HTTP ${res.status}: ${text.slice(0, 600)}`), {
          fatal: true,
        });
      }
      lastErr = new Error(`${method} ${path} -> HTTP ${res.status}: ${text.slice(0, 300)}`);
    } catch (err) {
      if (err.fatal) throw err;
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 400 * attempt));
  }
  throw lastErr ?? new Error(`${method} ${path} 未知错误`);
}

// ---------------------------------------------------------------- 树映射（内容级）
/**
 * 本地某个 commit 的文件级映射：path -> { mode, type, sha }
 * git 的 blob sha 与 GitHub blob sha 同算法，可直接比较。
 */
function localTreeMap(commit) {
  const raw = git(['ls-tree', '-r', '-z', commit]);
  const map = new Map();
  for (const rec of raw.split('\0')) {
    if (!rec) continue;
    const tab = rec.indexOf('\t');
    if (tab < 0) continue;
    const [mode, type, sha] = rec.slice(0, tab).split(' ');
    const path = rec.slice(tab + 1);
    map.set(path, { mode, type, sha });
  }
  return map;
}

/** 远端某个 tree 的文件级映射（递归） */
async function remoteTreeMap(treeSha) {
  const res = await api(`/git/trees/${treeSha}?recursive=1`);
  if (res.truncated) {
    throw Object.assign(
      new Error('远端递归 tree 返回 truncated=true，条目过多无法做完整内容比对，拒绝给出未经核实的结论'),
      { fatal: true }
    );
  }
  const map = new Map();
  for (const e of res.tree) {
    if (e.type !== 'blob' && e.type !== 'commit') continue;
    map.set(e.path, { mode: e.mode, type: e.type, sha: e.sha });
  }
  return map;
}

/**
 * 逐 path 比 blob sha **与 mode**，返回差异明细。
 *
 * 为什么必须比 mode：blob sha 只覆盖**文件内容**，不含权限位。老版本只比 sha，
 * 于是「内容一致、可执行位从 100644 变成 100755」这种差异会被判成 CONTENT_CHECK=OK
 * ——远端 tree 与本地 tree 并不相等，但脚本声称成功。这正是纪律 2 的反面：
 * 判据比它声称的窄，还叫"内容级比对"。宁可多一种明细（mode_mismatch），
 * 也不留一条"看起来验过、其实没验"的通道。
 */
function diffMaps(localMap, remoteMap) {
  const onlyLocal = [];
  const onlyRemote = [];
  const shaMismatch = [];
  const modeMismatch = [];
  for (const [path, ent] of localMap) {
    const r = remoteMap.get(path);
    if (!r) {
      onlyLocal.push(path);
      continue;
    }
    if (r.sha !== ent.sha) shaMismatch.push({ path, local: ent.sha, remote: r.sha });
    else if (r.mode !== ent.mode) modeMismatch.push({ path, local: ent.mode, remote: r.mode });
  }
  for (const path of remoteMap.keys()) {
    if (!localMap.has(path)) onlyRemote.push(path);
  }
  return { onlyLocal, onlyRemote, shaMismatch, modeMismatch };
}

function diffIsEmpty(d) {
  return (
    d.onlyLocal.length === 0 &&
    d.onlyRemote.length === 0 &&
    d.shaMismatch.length === 0 &&
    d.modeMismatch.length === 0
  );
}

// ---------------------------------------------------------------- 诊断辅助
function shortSha(s) {
  return s ? s.slice(0, 12) : '(none)';
}

/**
 * 诊断用：某个 path 在本地各层的 sha 分别是什么、工作区是否脏。
 * 目的：一眼区分「工作区污染」与「HEAD 前移」——两者都会表现成 blob sha 不一致。
 * 注意：工作区/索引**只用于打注解**，绝不参与判定。
 */
function localLayers(path, baselineCommit) {
  const parts = [];
  const baseSha = gitOpt(['rev-parse', `${baselineCommit}:${path}`]);
  parts.push(`baseline(${baselineCommit.slice(0, 12)})=${shortSha(baseSha && baseSha.trim())}`);

  const idxSha = gitOpt(['rev-parse', `:${path}`]);
  if (idxSha) parts.push(`index=${shortSha(idxSha.trim())}`);

  let wtSha = null;
  try {
    wtSha = execFileSync(
      'git',
      ['-c', 'core.quotepath=off', '-C', REPO, 'hash-object', '--', path],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
  } catch {
    wtSha = null;
  }
  if (wtSha) parts.push(`worktree=${shortSha(wtSha)}`);

  const dirty = gitOpt(['status', '--porcelain', '--', path]);
  if (dirty && dirty.trim()) parts.push('WORKTREE_DIRTY(未提交改动，不参与判定)');

  return parts.join(' ');
}

/** 打出差异明细，并对每条附上"本地各层 sha 来源"，便于区分工作区污染 / HEAD 前移 */
function printDiff(d, baselineCommit) {
  if (d.onlyLocal.length) {
    out(`only_local(${d.onlyLocal.length}) 远端缺这些 path：`);
    for (const p of d.onlyLocal.slice(0, 10)) out(`  ${p}  [${localLayers(p, baselineCommit)}]`);
  }
  if (d.onlyRemote.length) {
    out(`only_remote(${d.onlyRemote.length}) 本地基线缺这些 path：`);
    for (const p of d.onlyRemote.slice(0, 10)) out(`  ${p}`);
  }
  if (d.shaMismatch.length) {
    out(`sha_mismatch(${d.shaMismatch.length}) 同一 path 两侧 blob 不同：`);
    for (const m of d.shaMismatch.slice(0, 10)) {
      out(`  ${m.path}`);
      out(`    baseline=${m.local} remote=${m.remote}`);
      out(`    本地各层: ${localLayers(m.path, baselineCommit)}`);
    }
  }
  if (d.modeMismatch.length) {
    out(`mode_mismatch(${d.modeMismatch.length}) 内容相同但 mode 不同（可执行位/符号链接位）：`);
    for (const m of d.modeMismatch.slice(0, 10)) {
      out(`  ${m.path}`);
      out(`    baseline_mode=${m.local} remote_mode=${m.remote}`);
    }
  }
}

// ---------------------------------------------------------------- 定位推送基点
/**
 * 远端 head 可能在本地对象库里根本不存在（它是 API 重建出来的对象）。
 * 此时用**内容等价**在本地历史里找对应提交——这正是纪律 2 的用法：只认内容。
 */
async function resolveBase(remoteHead, localHead) {
  if (gitOpt(['cat-file', '-e', `${remoteHead}^{commit}`]) !== null) {
    if (gitOpt(['merge-base', '--is-ancestor', remoteHead, localHead]) !== null) {
      return { sha: remoteHead, how: 'local-object' };
    }
    abortMsg(
      `远端 head ${remoteHead.slice(0, 12)} 在本地存在但不是 ${localHead.slice(0, 12)} 的祖先（远端被并发推进或历史分叉），停止推送`
    );
  }
  out(`INFO 远端 head ${remoteHead.slice(0, 12)} 不在本地对象库，改用内容等价定位基点…`);
  const remoteHeadInfo = await api(`/git/commits/${remoteHead}`);
  const remoteMap = await remoteTreeMap(remoteHeadInfo.tree.sha);
  const locals = git(['rev-list', '--max-count=300', localHead])
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const c of locals) {
    if (diffIsEmpty(diffMaps(localTreeMap(c), remoteMap))) {
      return { sha: c, how: 'content-match' };
    }
  }
  abortMsg('无法在本地最近 300 个提交里找到与远端 head 内容等价的提交，拒绝盲目推送');
}

// ---------------------------------------------------------------- 单提交 → tree entries
function lsOne(commit, path) {
  const raw = git(['ls-tree', commit, '--', path]);
  const line = raw.split('\n').find(Boolean) ?? '';
  const tab = line.indexOf('\t');
  const [mode, type, sha] = (tab >= 0 ? line.slice(0, tab) : line).split(' ');
  return { mode, type, sha };
}

async function buildEntriesForCommit(commit) {
  // --no-renames：重命名拆成 D + A，blob 级处理更简单且语义等价
  const raw = git(['diff', '--name-status', '-z', '--no-renames', `${commit}^`, commit]);
  const parts = raw.split('\0').filter((s) => s.length > 0);
  const entries = [];
  const stats = { added: 0, modified: 0, deleted: 0 };

  for (let i = 0; i < parts.length; i += 2) {
    const status = parts[i];
    const path = parts[i + 1];
    if (!path) continue;

    if (status.startsWith('D')) {
      const parentEnt = lsOne(`${commit}^`, path);
      entries.push({
        path,
        mode: parentEnt.mode && parentEnt.mode !== 'undefined' ? parentEnt.mode : '100644',
        type: 'blob',
        sha: null, // sha=null 表示删除该路径
      });
      stats.deleted++;
      continue;
    }

    const ent = lsOne(commit, path);
    if (ent.type === 'commit') {
      // 子模块（gitlink）：直接引用，不上传 blob
      entries.push({ path, mode: ent.mode, type: 'commit', sha: ent.sha });
      stats.modified++;
      continue;
    }
    if (ent.type !== 'blob') {
      die(`提交 ${commit.slice(0, 12)} 的路径 ${path} 类型异常: ${ent.type}`);
    }

    const content = gitBuf(['show', `${commit}:${path}`]);
    const blob = await api('/git/blobs', {
      method: 'POST',
      body: { content: content.toString('base64'), encoding: 'base64' },
    });
    entries.push({ path, mode: ent.mode, type: 'blob', sha: blob.sha });
    if (status.startsWith('A')) stats.added++;
    else stats.modified++;
  }
  return { entries, stats };
}

// ---------------------------------------------------------------- 主流程
async function main() {
  process.chdir(REPO);
  const localHead = git(['rev-parse', 'HEAD']).trim();

  out(`INFO repo=${OWNER}/${REPO_NAME} branch=${BRANCH} local_head=${localHead.slice(0, 12)}`);

  const ref = await api(`/git/ref/heads/${BRANCH}`);
  const remoteHead = ref.object.sha;
  out(`INFO remote_head=${remoteHead.slice(0, 12)}`);

  // ---- 基点
  const base = await resolveBase(remoteHead, localHead);
  out(`INFO base=${base.sha.slice(0, 12)} (${base.how})`);

  const list = git(['rev-list', '--reverse', `${base.sha}..${localHead}`])
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  if (list.length === 0) {
    // 内容级确认一遍，避免"sha 不同但内容一致"被误报成待推送
    const remoteCommit = await api(`/git/commits/${remoteHead}`);
    const localMap = localTreeMap(localHead);
    const d = diffMaps(localMap, await remoteTreeMap(remoteCommit.tree.sha));
    if (!diffIsEmpty(d)) {
      out(`WARN sha 上无待推送提交，但远端 head 与 ${localHead.slice(0, 12)} 内容不一致（onlyLocal=${d.onlyLocal.length} onlyRemote=${d.onlyRemote.length} shaMismatch=${d.shaMismatch.length} modeMismatch=${d.modeMismatch.length}）`);
      printDiff(d, localHead);
      out('CONTENT_CHECK=FAIL');
      process.exit(EXIT_FAIL);
    }
    // exit 0 必须同时给出 CONTENT_CHECK=OK：让调用方可以二选一判据（退出码 或 该行），
    // 而不是"没有 FAIL 就当过"——后者在输出被截断时会静默放行。
    out(`CONTENT_CHECK=OK files=${localMap.size} baseline=${localHead.slice(0, 12)}`);
    out('NOTHING_TO_PUSH');
    // 顺手对齐本地远端跟踪 ref（纪律 3）
    if (!DRY_RUN) git(['update-ref', `refs/remotes/${REMOTE}/${BRANCH}`, localHead]);
    process.exit(EXIT_OK);
  }

  out(`INFO commits_to_push=${list.length}`);
  for (const c of list) {
    out(`  · ${c.slice(0, 12)} ${git(['log', '-1', '--format=%s', c]).trim()}`);
  }

  if (DRY_RUN) {
    out('DRY_RUN=1 未发送任何写请求');
    process.exit(EXIT_OK);
  }

  // ---- 逐提交重建
  let parent = remoteHead;
  let parentTree = (await api(`/git/commits/${remoteHead}`)).tree.sha;
  const mapping = [];

  for (const commit of list) {
    const { entries, stats } = await buildEntriesForCommit(commit);
    if (entries.length === 0) {
      out(`WARN 提交 ${commit.slice(0, 12)} 无文件变更（空提交），已跳过`);
      continue;
    }
    const treeRes = await api('/git/trees', {
      method: 'POST',
      body: { base_tree: parentTree, tree: entries },
    });
    const message = git(['log', '-1', '--format=%B', commit]).replace(/\s+$/, '');
    const commitRes = await api('/git/commits', {
      method: 'POST',
      body: { message, tree: treeRes.sha, parents: [parent] },
    });
    mapping.push({ local: commit, remote: commitRes.sha });
    out(
      `PUSHED commit ${commit.slice(0, 12)} -> ${commitRes.sha.slice(0, 12)} (+${stats.added} ~${stats.modified} -${stats.deleted})`
    );
    parent = commitRes.sha;
    parentTree = treeRes.sha;
  }

  if (mapping.length === 0) {
    // 走到这里说明 list 非空、但每个提交都是空提交（tree 不变），故远端 ref 无需移动。
    // ⚠️ 绝不能在此直接 exit 0：那是**一次未经任何校验的成功声明**。
    // 空提交不改 tree 只说明"base..localHead 之间没有内容变化"，不说明
    // "远端 head 与 localHead 内容相同"（resolveBase 走 content-match 分支时，
    // 两者的等价性来自一次独立比对，此处必须再确认一遍，口径与其他分支一致）。
    const remoteCommit = await api(`/git/commits/${remoteHead}`);
    const localMap = localTreeMap(localHead);
    const d = diffMaps(localMap, await remoteTreeMap(remoteCommit.tree.sha));
    if (!diffIsEmpty(d)) {
      out(`WARN ${list.length} 个待推送提交全是空提交，但远端 head 与 ${localHead.slice(0, 12)} 内容不一致（onlyLocal=${d.onlyLocal.length} onlyRemote=${d.onlyRemote.length} shaMismatch=${d.shaMismatch.length} modeMismatch=${d.modeMismatch.length}）`);
      printDiff(d, localHead);
      out('CONTENT_CHECK=FAIL');
      process.exit(EXIT_FAIL);
    }
    out(`CONTENT_CHECK=OK files=${localMap.size} baseline=${localHead.slice(0, 12)}（提交全为空，远端无需变更）`);
    out('NOTHING_TO_PUSH');
    git(['update-ref', `refs/remotes/${REMOTE}/${BRANCH}`, localHead]);
    process.exit(EXIT_OK);
  }

  // ---- 并发保护：PATCH 前重读远端 head
  const refNow = await api(`/git/ref/heads/${BRANCH}`);
  if (refNow.object.sha !== remoteHead) {
    abortMsg(
      `远端 ${BRANCH} 已被推进（期望 ${remoteHead.slice(0, 12)}，实际 ${refNow.object.sha.slice(0, 12)}），已重建的 commit 未落 ref，停止覆盖`
    );
  }

  // ---- 一次性移动 ref（force:false，非快进会被 GitHub 拒绝）
  await api(`/git/refs/heads/${BRANCH}`, {
    method: 'PATCH',
    body: { sha: parent, force: false },
  });

  const finalRef = await api(`/git/ref/heads/${BRANCH}`);
  if (finalRef.object.sha !== parent) {
    die(`ref 更新后校验失败：期望 ${parent}，实际 ${finalRef.object.sha}`);
  }
  out(`REMOTE_HEAD=${finalRef.object.sha}`);

  // ---- HEAD 漂移检测（只告警，不改变判定基准，也不判失败）
  const headNow = git(['rev-parse', 'HEAD']).trim();
  if (headNow !== localHead) {
    const extra = git(['rev-list', '--count', `${localHead}..${headNow}`]).trim();
    out(
      `WARN HEAD_MOVED_DURING_RUN 开始=${localHead.slice(0, 12)} 现在=${headNow.slice(0, 12)}（运行期内又落地 ${extra} 个提交）`
    );
    out(`WARN 本次只推了 ${localHead.slice(0, 12)}；内容比对基准已冻结在该 commit，不随 HEAD 漂移`);
  }

  // ---- 内容级校验（唯一可信判据）
  // 基准 = 本次实际推送的 commit。绝不用符号 'HEAD'（会漂移），绝不用工作区/索引（常态为脏）。
  const baseline = localHead;
  const baselineMap = localTreeMap(baseline);
  const finalCommit = await api(`/git/commits/${finalRef.object.sha}`);
  const d = diffMaps(baselineMap, await remoteTreeMap(finalCommit.tree.sha));
  if (!diffIsEmpty(d)) {
    out(`BASELINE=commit ${baseline.slice(0, 12)}（不是工作区，不是符号 HEAD）`);
    printDiff(d, baseline);
    out('CONTENT_CHECK=FAIL');
    // 此时远端 ref **已经移动**（PATCH 在比对之前），且无法回滚（GitHub 未提供反向移动的
    // 安全语义，force 回退反而是更危险的操作）。因此这里必须把"远端已被改坏"讲明白，
    // 让操作者知道不是"没推上去"，而是"推上去了但内容不对，需人工介入"。
    out(`WARN 远端 ${BRANCH} 已被指向 ${finalRef.object.sha.slice(0, 12)}，内容与期望不符；本次未对齐本地 origin/${BRANCH}，请人工核对`);
    die(`远端内容与本次推送的 commit ${baseline.slice(0, 12)} 不一致，拒绝声明成功`);
  }
  out(`CONTENT_CHECK=OK files=${baselineMap.size} baseline=${baseline.slice(0, 12)}`);

  // ---- 纪律 3：对齐本地远端跟踪 ref（只能指向本地 commit）
  git(['update-ref', `refs/remotes/${REMOTE}/${BRANCH}`, localHead]);
  out(`UPDATED_REF refs/remotes/${REMOTE}/${BRANCH} -> ${localHead.slice(0, 12)}`);
  out('PUSHED_VIA=git-data-api');
  out('NOTE 远端 commit sha 与本地不同是 API 推送的必然结果，内容一致性以上面的 CONTENT_CHECK 为准');
}

TOKEN = readToken();
main().catch((err) => {
  die(err?.message ?? String(err));
});
