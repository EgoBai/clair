# AGENTS.md — 澄观 Clair · Agent 通用入口

> 本文件是**跨 harness 通用入口**：Claude Code / Codex / DeepSeek harness / WorkBuddy 均读这里。
> `.claude/CLAUDE.md` 是历史入口，其「当前状态 (Phase 14)」「Agent 分工」两节已过期（测试数、部署形态、主导角色均已变），**勿作为事实依据**。
> 建立日期 2026-11-04；维护者：主导 Agent。

## 一、交接现状（2026-11-04 起生效）

| 角色 | 承担者 | 权限 |
|---|---|---|
| **主导（Lead）** | DeepSeek harness | 源码写权、commit、push、台账/计划/决策日志维护 |
| **辅助（Aux）** | WorkBuddy 主 Agent | 只读复验、旁观分析、文档；**不改生产源码、不 push** |
| **裁决** | 用户 ego_bai | 产品方向、资源投入、平台选型、红线判定 |

权责边界与信道定义见 `docs/harness/CO-AGENT-CONTRACT.md`（**开工前必读**）。

## 二、开工必读（按顺序，勿跳）

1. `docs/harness/CO-AGENT-CONTRACT.md` — 你是谁、能改什么、怎么和另一个 Agent 交接
2. `docs/harness/TICKET-LEDGER.md` — 工单状态（唯一真源，但**会滞后**；派工前必须源码实测复核）
3. `DECISION_LOG.md` 末 60 行 — 最近拍板的决定与代价
4. `docs/rsi/dev-loop-v1.md` — 研发侧闭环与 E1–E5 证据体系
5. `docs/harness/REGRESSION-ASSETS.md` — 已收口缺陷「靠什么再也回不来」

## 三、红线（违反即回滚）

1. **诚实数据**：无真实数据 → `dataSource:'unavailable'` 或字段置 `null`。
   禁 `Math.random`、禁用 `0` 顶替空态、禁硬编码冒充真实、**禁用 A 口径倒算 B 口径**（如用成交额倒算净买入）。
2. **单通道**：生产源码在途（`M`/`??`）时暂停并行改动；`git add` 逐文件，**严禁 `git add -A`**。
3. **四证**：grep 证存在 → 读文件证逻辑 → curl/测试证行为 → e2e 渲染断言。
   **自报完成一律复验**，尤其「service 写了但没挂载」这类死代码。
4. **不可复现的结论不算结论**：写「无法判定」并说明原因，不要猜。

## 四、环境坑（本机实测，已反复踩）

| 坑 | 正确做法 |
|---|---|
| 沙箱 `grep` 是坏 shim（静默丢输出） | 一律用 `rg` |
| 全量 `tsc --noEmit` / vitest / `vite build` 会 OOM 出假错 | 单文件 `esbuild --bundle --packages=external --outfile=/dev/null`；定向单文件测试 |
| 探测回环被 HTTPS_PROXY 拦成 502 | `curl --noproxy '*'` |
| `tsx` 无热重载 | 改完起新实例；用独占高位端口 |
| **禁止** `pkill -f "tsx src/index.ts"` | 宽模式会误杀他人实例（已发生过）。用 `bash scripts/dev/down.sh`（只杀记录的 PID） |
| `vite build` 清 `dist/` 触发 safe-delete 拦截 | 必须 `--outDir /tmp/xxx` |
| macOS 无 `timeout` 命令 | 空跑比不跑更危险；用后台任务 + 轮询 |
| 共享工作区禁止 `git reset --hard` / `checkout -- .` / `clean -fd` | 需要干净起点用 `git worktree add /tmp/xxx` |

## 五、常用命令

```bash
# 起本地环境（后台常驻 + 就绪探测；端口占用会报错退出，不抢不杀）
bash scripts/dev/up.sh
CLAIR_BACKEND_PORT=3471 CLAIR_FRONTEND_PORT=5271 bash scripts/dev/up.sh
bash scripts/dev/down.sh          # 收工，只杀上面记录的 PID

# 诚实红线门禁
node scripts/guard/honesty-scan.mjs              # 规则 C 棘轮 + 红线扫描
node scripts/guard/honesty-scan.mjs --strict     # CI 口径，必须 exit 0
node scripts/guard/metrics.mjs --week 2026-W45   # RSI 五指标（缺数据打 n/a，不填 0）

# 影子测试与红绿验证
node scripts/guard/shadow-migration-candidates.mjs
node scripts/guard/shadow-test-census.mjs
node scripts/guard/redgreen.mjs <参数见脚本头>    # E3：投毒证测试会红、还原证会绿

# 线上契约烟测
node scripts/smoke/production-smoke.mjs --expect-commit <sha> --allow-unreachable
```

## 六、当前阶段目标（见 `docs/harness/ROADMAP-2026Q4.md`）

Sprint 2-3：功能稳定性 + 一致性保障。当前实际推进：影子测试迁移（E3 绑定生产实现）、
guard 棘轮收缩、E5 数据及时性可观测、Worker 与 Express 契约对齐。
