# 研发侧 RSI 设计 v1（机器判闭环）

> 范围：**只覆盖研发侧交付闭环**。用户侧 RSI（体验/信号）见 §6，本文件不展开。
> 生成日期 2026-11-03。本文件是设计稿，落地动作见 §7；文中标 `需新增` 的资产目前在仓库中**不存在**。
> 已核实存在的资产：`scripts/guard/honesty-scan.mjs`、`scripts/guard/allowlist.json`、`scripts/guard/honesty-baseline.md`、`.github/workflows/ci.yml`（job: `quality` / `unit-tests` / `honesty-guard`）、`scripts/smoke/production-smoke.mjs`、`scripts/git-push-api.mjs`、`frontend/e2e/route-render-smoke.spec.ts`、`frontend/playwright.config.ts`、`frontend/src/__tests__/noRootAbsoluteAnchor.test.ts`、`backend/src/utils/tradingCalendar.ts`、`docs/harness/TICKET-LEDGER.md`、`docs/harness/TRADING-CALENDAR.md`。

## 1. 闭环定义

`clair-loop`（`~/.workbuddy/skills/clair-loop/SKILL.md`）实际是 **8 步**：Observe → Compare → Ideate → Prioritize → Plan → Execute → Verify → Record。本设计不新造流程，把它折叠为研发交付所需的 6 段，并**逐段指定判定主体**（机器门禁 / 人）。

| # | 步 | 输入 | 输出物 | 责任人 | 判定主体 |
|---|---|---|---|---|---|
| 1 | SCAN = Observe | 用户反馈、CI 日志（`gh run list --workflow=CI`）、`node scripts/guard/honesty-scan.mjs`（默认非阻断，只打 stdout）、`node scripts/smoke/production-smoke.mjs --base <url> --json` | 缺陷条目（含 `路径:行` + 实测响应片段） | 子 Agent | **机器**：脚本产出的 `路径:行` 与 verdict 是唯一可采信来源 |
| 2 | EVAL = Compare + Ideate | 上一步条目 + 基线（`scripts/guard/honesty-baseline.md`、`docs/harness/TICKET-LEDGER.md`） | 优先级排序（P0/P1/P2）+ 每条对应的评估器编号（§2 的 E1–E5） | 主理人 | **人**：排序与"是否值得修"是价值判断，不可机判 |
| 3 | PLAN = Prioritize + Plan | 排序结果 | 工单四元组（§3 模板）+ 文件域声明 | 主理人 | **机器**（部分）：文件域零交集可由脚本校验；目标合理性**人**判 |
| 4 | EXEC = Execute | 工单 | 代码改动 + **实证材料**（curl 响应 / Playwright 输出 / 红绿两次记录） | 子 Agent | **机器**：只认 §2 的实证，不认自述 |
| 5 | VERIFY = Verify | 改动 + 实证 | E1–E5 评分卡（逐条 PASS/FAIL + `路径:行`） | CI + 复验者 | **机器**判 FAIL 项；**人**只在机器全 PASS 后做"值不值得收口" |
| 6 | CAPTURE = Record | PASS 结果 | ① 台账状态推进（`待派工`→…→`已收口`）② **新增门禁/断言**（失败回灌产物，§4）③ baseline 更新（`honesty-scan.mjs --update-baseline`，opt-in） | 主理人 | **机器**：没有新增门禁的收口不计入 CAPTURE（见 §4 判据） |

关键分界：**第 1/4/5/6 步的"是否合格"一律机器判**；人只保留三件事——排优先级（2）、定工单边界（3）、决定收口（5 末尾）。

现状缺口（诚实标注）：第 5 步今天没有 E2/E3/E5 三门，只有 E1 的粗粒度版（`honesty-scan.mjs` 规则 B 仅判"文件里有路由但全文零 `dataSource`"）与 E4（`git-push-api.mjs --verify`）。E2 可达性、E3 红绿对照、E5 数据及时性**全部需新增**。

## 2. 评估器（核心）

统一约定：
- 每条评估器是一个可独立运行的脚本，**退出码 0 = PASS，1 = FAIL，2 = 参数/环境错误**；stdout 只输出机器可读行（`--json` 时纯 JSON）。
- 失败行格式固定为一行一条，便于直接粘贴进工单：
  `<评估器> FAIL <相对路径>:<行号> <判据名> observed=<实测> expected=<期望> ticket=<编号>`
- 所有评估器必须**零外部依赖**（沿用 `honesty-scan.mjs` 的纯 Node ESM 约定），以免又引入 `npm ci` 的不稳定性。

### E1 接口真实性（dataSource 与数据自洽）

- **判据**（三条同时成立才 PASS）：
  1. 供数端点响应体含 `dataSource`；取值域由现行实现归纳为 `real` / `unavailable` / `degraded` / 上游源名（如 `sina`、`eastmoney`）。缺字段即 FAIL。
  2. `dataSource != 'real'` 时必须有非空 `notes`；`dataSource == 'real'` 时不得出现"整列 `0` / `-1` / `null`"且无 `notes` 的字段——这正是"哨兵值冒充数据"。
  3. 静态侧：`backend/src/api/**` 供数路径内不得出现 `?? 0` / `?? -1` 作为数值兜底（`honesty-scan.mjs` 规则 A 目前只抓 `Math.random`，需扩规则 C）。
- **落点**：静态扩展 `scripts/guard/honesty-scan.mjs`（**新增规则 C**）；运行时 `需新增 scripts/guard/datasource-truth.mjs --base <url>`（打一批端点，按上述 1、2 判）。既有 `scripts/smoke/production-smoke.mjs` 已能区分 `OK` / `DEGRADED` / `ERROR`，可作为运行时底座复用其 adapter，不必重写 HTTP 层。
- **阈值**：未豁免违规 = 0。豁免只走 `scripts/guard/allowlist.json`，必须带 `expiresAt` 与 `clearingTicket`（沿用现有 5 类 category 枚举，新增类别需主理人批准）。
- **失败输出示例**：
  `E1 FAIL backend/src/api/fund-flow.ts:184 sentinel-as-data field=mainNet observed=-1 expected:null+notes ticket=T-2610-02`

### E2 可达性（声称生效 ⟹ 必须给调用/渲染证据）

- **判据**：每条"已修复"必须挂 ≥1 条**运行时**证据，证据类型白名单只有两类：
  - `curl`：完整 URL + HTTP 状态 + **响应体片段**（≥3 个业务字段，含 `dataSource`）；
  - Playwright：`frontend/e2e/*.spec.ts` 里**测试标题 + 通过输出**（`npx playwright test <file> -g "<title>"`）。
  **grep 命中、读文件、"我检查过了"一律计 0 分并直接判 FAIL**——这是本项目最高频的伪证。
- **落点**：`需新增 scripts/guard/evidence-check.mjs`——解析工单里的「证据」区块，校验 ①证据类型在白名单内 ②curl 类必须带 URL 且响应片段含 `dataSource` ③Playwright 类必须能在 `frontend/e2e/` 找到同名 spec 与标题（用 `--list` 列举，不真跑）。真实渲染断言复用 `frontend/e2e/route-render-smoke.spec.ts` 的既有四条断言（`.app-content` 可见 / `.content-wrapper` 非空 / 无 `pageerror` / 未落入 `UnifiedErrorBoundary`），这几条恰好覆盖"curl 200 但白屏"。
- **阈值**：每工单 ≥1 条；涉及页面改动的工单必须含 Playwright 类。缺证据 = FAIL，不允许"下轮补"。
- **失败输出**：`E2 FAIL docs/rsi/<ticket>.md:12 evidence-grep-only observed=grep-hit expected=curl|playwright ticket=<编号>`

### E3 测试有效性（防复发断言必须红→绿）

- **判据**：每条新增的防复发断言必须提交**两次运行的原始输出**：
  1. **投毒/删除后必红**（证明断言真的挂着这段代码）；
  2. **还原后必绿**（证明断言不是恒红噪声）。
  只有绿、没有红，判 FAIL——那说明断言与缺陷无因果关系（影子测试）。
- **落点**：`需新增 scripts/guard/redgreen.mjs --spec <test-file> --poison <file:line>`：备份目标行 → 注入哨兵改动 → 跑 `npx vitest run <spec>` 期望非 0 → 还原 → 再跑期望 0 → 输出两段摘要。**禁止**用 `--retry` 掩盖，`redgreen.mjs` 内部不传 `--retry`。
- **阈值**：2/2 通过。抽样核验：每周随机抽 1 条存量断言做同样两步，抽检不过则该断言降级为"无防护"。
- **失败输出**：`E3 FAIL frontend/src/__tests__/noRootAbsoluteAnchor.test.ts green-without-red observed=0-fail-before-fix expected=≥1-fail ticket=<编号>`
- **反例锚定**：`noRootAbsoluteAnchor.test.ts` 是形态覆盖的正面样板（静态串 / 模板字面量 / 表达式 / 跨行 JSX 四态全建模，且自测白名单不腐烂）；对它的投毒可用"把 `LockupCalendarPage.tsx` 的 `<Link to=` 改回 `<a href="/stocks/`"。当前该 spec 实测 5/5 绿。

### E4 推送有效性（内容级比对，不看 sha）

- **判据**：本地 `git ls-tree -r HEAD` 的 `path → blob sha` 映射与远端 head 递归 tree **逐项相等**；差异 = 0。**禁止**以 commit sha、`origin/main` ref、tree hash 作判据（Git Data API 会重建 commit，三者都会骗人）。
- **落点**：已有 `scripts/git-push-api.mjs --verify`（纪律 1–4 已写在脚本头注释里），直接复用，不新增。补充约束：比对基准必须是脚本启动时冻结的 `localHead`，出现 `HEAD_MOVED_DURING_RUN` 只告警不算失败；成功后必须 `git update-ref refs/remotes/origin/main $(git rev-parse HEAD)`。
- **阈值**：`CONTENT_CHECK=PASS`，退出码 0。`NOTHING_TO_PUSH` 视为 PASS。`PUSH_ABORTED` 视为环境性中止（退出码 2），需重试而非记缺陷。
- **失败输出**：脚本自带 diff 明细（`CONTENT_CHECK=FAIL` + path 列表），工单里原文粘贴即可，不改格式。

### E5 数据及时性

- **判据**：`daily_quotes` 的最新 `trade_date` 与**真实最近交易日**之差 ≤ 1 个交易日（收盘 19:00 后按 T 计，之前按 T-1 计）。
  **真实交易日只能来自 `backend/src/utils/tradingCalendar.ts` 的 `latestTradingDay()`**（同一时区 `MARKET_TZ = 'Asia/Shanghai'`）。**禁止**用 `SELECT DISTINCT trade_date ... LIMIT 1` 反推——`docs/harness/TRADING-CALENDAR.md` 已实锤该法不可用（2026-10-07 国庆休市仍有 5541 行"抹布行"）。
- **落点**：`需新增 scripts/guard/data-freshness.mjs`：`import { latestTradingDay, tradingDaysStrictlyBetween }` 复用日历真源，连 PG 取 `MAX(trade_date)`，输出差值。已有 `scripts/data/scrub-stale-daily-quotes.ts` 可参考其连接方式，但**不复用其判据**（它做清洗，不做判定）。
- **阈值**：`lagTradingDays <= 1`；`lagTradingDays == 0` 为理想。超过阈值 FAIL，同时 PRINT `calendarPrecisionOfYear()`——若当年日历为 `provisional`，先降级为 WARN，避免用"假日历"判真数据。
- **失败输出**：`E5 FAIL daily_quotes max(trade_date)=2026-10-30 expected>=2026-11-02 lagTradingDays=2 ticket=<编号>`
- **当前状态**：`ACTIVE(本地) / BLOCKED(生产)` —— 线上后端已不存在，本评估器只能打本地实例，**不进 CI 阻断**。详见 §8.1。

## 3. 工单四元组模板

每条工单必须写满四项，缺一项不予派工（可由 §7-S2 的脚本半自动校验）：

```
### T-<yyMM>-<nn> <一句话目标>
1. 目标（含来源依据）
   - 现象：<可观测描述>
   - 依据：<文档:行 / 真实响应片段 / 脚本路径:行>   ← 禁止写"据说""之前发现"
2. 可机器验证的验收标准
   - E2 证据：curl <URL> → 断言 <字段>=<值>；或 playwright <spec> -g "<title>"
   - E3 红绿：<spec 文件> 投毒点 <file:line>
   - E5（若涉数据）：lagTradingDays <= 1
3. 零交集文件域（只允许改这些）
   - <path1>  <path2>
4. 证据要求
   - 必附：完整命令 + 原始输出（不得摘要、不得只贴结论）
   - 必附：改动前后 `git status --short` 该文件域切片
```

**填好的真实样例**（本项目已发生缺陷，现已修复 + 已挂门禁，此处展示"派工时该长什么样"）：

```
### T-2611-01 解禁日历股票列裸 <a href> 丢失 /clair/ 前缀
1. 目标（含来源依据）
   - 现象：线上解禁日历点股票名跳出站点，落 GitHub 通用 404
     「There isn't a GitHub Pages site here.」
   - 依据：frontend/src/pages/LockupCalendarPage.tsx:377（当时为
     <a href={`/stocks/${record.symbol}`}>）；裸 <a> 是整页导航，绕过
     React Router basename（生产 '/clair/'），浏览器解析为
     https://egobai.github.io/stocks/xxx，该路径无 Pages 站点。
     该页当月 154 条真实解禁记录 → 属"正在发生"，P0。
2. 可机器验证的验收标准
   - E2：playwright route-render-smoke.spec.ts 中「解禁日历页渲染」用例
     断言 .app-content 可见 + 无 pageerror；且 <a href> 计数=0
   - E3：frontend/src/__tests__/noRootAbsoluteAnchor.test.ts
     投毒点 frontend/src/pages/LockupCalendarPage.tsx:383
     （把 <Link to= 改回 <a href="/stocks/）→ 必红；还原 → 必绿
3. 零交集文件域
   - frontend/src/pages/LockupCalendarPage.tsx
   - frontend/src/__tests__/noRootAbsoluteAnchor.test.ts（需新增）
4. 证据要求
   - 必附两次 vitest 原始输出（红/绿）+ 该 spec 的 6 类形态覆盖说明
```

该单已收口：实现改为 `<Link to={\`/stocks/${record.symbol}\`}>`（`LockupCalendarPage.tsx:383`），并在 `noRootAbsoluteAnchor.test.ts` 头注释里显式记录了"只搜静态串会漏模板字面量"这一搜索形态盲区，测试把 6 种写法建模为可自测用例。

## 4. 失败回灌机制

**触发**：任一评估器退出码 1，或 CI 的 `honesty-guard` / `unit-tests` job 变红。

| 环节 | 规则 |
|---|---|
| 谁收到 | ① 工单责任人（子 Agent）② 主理人 ③ 台账：`docs/harness/TICKET-LEDGER.md` 该单状态改 `打回` |
| 形式 | 粘贴评估器原始 stdout（固定格式行），**不允许转述**。主理人只转发原文，避免二次失真 |
| 时限 | P0：同一工作日内处置；P1：48h 内；P2：下一次排期。超时由主理人在台账"变更日志"记一条逾期 |
| 复验 | 打回后重提必须重新跑**全套** E1–E5，不得只跑被打回的那一项（防止修 A 破 B） |

**防复发的硬判据（这是本节的要点）**：一张单从 `复验通过` 走向 `已收口`，必须额外满足其一，否则不允许标 `已收口`：

1. **新增/加严门禁**：`scripts/guard/honesty-scan.mjs` 新增规则、或 `allowlist.json` 新增带 `expiresAt` 的条目不适用于此路径、或 CI 新增一个 job；
2. **新增断言且通过 E3 红绿**：新 spec 文件或既有 spec 新增用例，且附红→绿两次输出；
3. **扩展现有断言的形态覆盖**：如 `noRootAbsoluteAnchor.test.ts` 从"只搜静态串"扩到 6 形态——必须同时补一条自测用例证明新形态会被捕获。

"下次注意""已 review""加强测试"三种表述**不构成**上述任何一项，台账不得据此收口。

防复发物**不写进台账**（`docs/harness/TICKET-LEDGER.md` 只负责"进度"，历史条目几十行，加列会让老行全是空格，且该文件多人并发编辑、加列必生合并冲突）。改为独立索引 `需新增 docs/harness/REGRESSION-ASSETS.md`，四列：

```
| 缺陷（对账台账编号） | 防复发物（文件:行 或 test 名） | 引入 commit | 红→绿证据 |
```

两文件的分工：台账回答"这单走到哪一步"，索引回答"这缺陷靠什么再也回不来"。索引行数少于已收口缺陷数 = 有单没交防复发物，见 §7-S2 的验收命令。

## 5. 度量指标（5 个）

| 指标 | 定义 | 自动采集方式 | 现状 |
|---|---|---|---|
| 一次通过率 | `复验通过` 首轮即通过的单数 / 首次提交复验的单数 | 台账状态流转（`已派工`→`复验通过` 无中间 `打回`） | 半自动：需 `需新增 scripts/guard/metrics.mjs` 解析台账 |
| 缺陷回潮率 | 同一 `路径:规则名` 在 ≥2 个 release 周期内重复出现次数 / 总缺陷条数 | `honesty-scan.mjs` 输出本就是 `路径:行 + 规则`，逐期取快照做集合交集 | 门禁侧可自动；规则名需稳定（规则 A/B/C 已有稳定命名） |
| 验收返工轮次 | 每单 `打回` 次数（取中位数，避免长尾拉偏） | 台账状态流转计数 | 半自动，同上 |
| 门禁拦截数 | 每周 CI `honesty-guard` / `unit-tests` 失败次数 | `gh run list --workflow=CI --limit 100 --json conclusion,createdAt` | **可直接自动**，无需新脚本 |
| 平均修复时长 | `已派工` → `已收口` 的时间差（中位数） | 台账"变更日志"里的日期戳 + 台账首列编号 | 半自动，依赖日志格式稳定 |

刻意不采的指标，以及**不采的理由**（不写理由，三个月后没人知道为什么没采）：

- **代码行数**——本项目多次出现"行数涨、可用性不涨"，改随机数为 `null + notes` 反而让行数下降，用它当产出会被反着激励。
- **测试数量**——影子测试是最快的数量作弊器：抄一份数据、不 import 真模块，用例数照涨（实测旧影子 40/40 全绿 vs 改 import 真模块后 4 红）。数量与有效性无相关性，故由 E3 红绿对照替代它。
- **覆盖率百分比**——行覆盖不区分"断言真的挂了这段代码"与"import 一下就算覆盖"，与上一条同源；本项目真实缺陷（死代码未挂载、哨兵值冒充数据）在覆盖率上通常**不降反升**。

替代原则：只采**能归因到具体 `路径:行` 且能被证伪**的指标。

## 6. 与用户侧 RSI 的边界

**用户侧 RSI（体验闭环 / 信号闭环 / 个性化推荐反馈环）不在本设计范围。** 本文件只回答"研发交付是否真的可用"，不回答"用户是否觉得好用"。

启动前置条件（全部勾选后才允许立项，本文件不写设计）：

- [ ] §2 的 E1–E5 全部有脚本落点且在 CI 中为**阻断级**（无 `continue-on-error`）
- [ ] 关键页面 Playwright 路由冒烟覆盖率：`frontend/src/pages/**` 中在路由表注册的页面 100% 有用例
- [ ] `dataSource` 契约在全部供数端点落地：`honesty-scan.mjs` 规则 B/C 未豁免命中 = 0
- [ ] E5 连续 10 个交易日 `lagTradingDays <= 1`（用真实日历判，非 `DISTINCT trade_date`）
- [ ] 推送通道稳定：连续 10 次推送 `CONTENT_CHECK=PASS`（`git-push-api.mjs --verify`）
- [ ] 台账债务清零：`docs/harness/TICKET-LEDGER.md` 中 P0/P1 无 `待派工` 项
- [ ] 生产后端有真实部署路径且**在线**（现状：`backend/src/` 无部署工作流，Render 服务与数据库已于 2026-11-03 因成本暂停，线上后端不存在，前端走 Cloudflare Worker 兜底 —— 见 §8）
- [ ] §8 的 E5 已从「本地态」升为「生产态」（两个前置同时满足）

## 7. 落地步骤（本周可完成）

**S1｜数据及时性门禁（E5）— 状态：`ACTIVE(本地) / BLOCKED(生产)`**
- 产出：`需新增 scripts/guard/data-freshness.mjs`，`import` `backend/src/utils/tradingCalendar.ts` 的 `latestTradingDay` / `tradingDaysStrictlyBetween`。
  - **本地态**（现在即可做）：`--base http://127.0.0.1:3001` 打本地实例，或直连本地 PG；**只做本地链路及时性校验，不进 CI、不阻断**。
  - **生产态**（待恢复）：`.github/workflows/ci.yml` 新增 job `data-freshness`，前置条件见 §8 第一条；二者缺一**不得**声明 E5 已上线。
- 验收（本地）：`node scripts/guard/data-freshness.mjs --base http://127.0.0.1:3001 --json` 输出含 `maxTradeDate` / `realLatestTradingDay` / `lagTradingDays`；人为把阈值调 0 时应 FAIL（证明不是恒绿）。

**S2｜证据门禁（E2）+ 防复发资产索引**
- 产出 ①：`需新增 scripts/guard/evidence-check.mjs`，读工单 markdown 的「2. 可机器验证的验收标准」区块，校验证据类型在 §2-E2 白名单内。
- 产出 ②：`需新增 docs/harness/REGRESSION-ASSETS.md`（**本文件不由本设计稿创建**，需主理人派人建；四列表头见 §4）。不修改 `docs/harness/TICKET-LEDGER.md` 任何列。
- 验收 ①：`node scripts/guard/evidence-check.mjs --ticket T-2611-01` PASS；手工删掉证据区块后同一命令必须 FAIL。
- 验收 ②（逐单对账，不做总数比较——总数会因索引多记历史缺陷而永远假绿）：
  ```sh
  rg -o '^\| (T-[^|]+)\|[^|]*\|[^|]*\|[^|]*\|[^|]*\| (?:已收口|复验通过)' -r '$1' docs/harness/TICKET-LEDGER.md \
    | while read -r id; do rg -q --fixed-strings "$id" docs/harness/REGRESSION-ASSETS.md || echo "MISSING $id"; done
  ```
  输出必须为空。（`docs/harness/TICKET-LEDGER.md` 当前表内 `已收口`/`复验通过` 共 4 单：T-2604-02、T-2604-04、T-2610-01、T-2610-03；跑通时应输出 4 条 `MISSING`，索引建好后归零。）

**S3｜哨兵值静态门禁（E1 规则 C）**
- 产出：在 `scripts/guard/honesty-scan.mjs` 增加规则 C：`backend/src/api/**` 内 `?? 0` / `?? -1` 作为**数值字段兜底**命中即 RED（用现有 `computeNonCodeMask` 排除注释/字符串假阳），复用 `allowlist.json` 的 `expiresAt` 机制。
- 验收：`node scripts/guard/honesty-scan.mjs --strict` 在无豁免时应 exit 1 并打印 `路径:行`；给既有合法用法建 allowlist 后 exit 0。

**S4｜红绿对照工具（E3）**
- 产出：`需新增 scripts/guard/redgreen.mjs --spec <file> --poison <file:line> --restore`，内部不传 `--retry`，输出两段摘要；先用 `noRootAbsoluteAnchor.test.ts` 做首个样本（当前实测 5/5 绿，投毒点 `LockupCalendarPage.tsx:383`）。
- 验收：`node scripts/guard/redgreen.mjs --spec frontend/src/__tests__/noRootAbsoluteAnchor.test.ts --poison frontend/src/pages/LockupCalendarPage.tsx:383` 输出 `poisoned=FAIL restored=PASS`，且工作树最终干净（`git status --short` 无该文件）。

**S5｜度量采集**
- 产出：`需新增 scripts/guard/metrics.mjs`，解析台账 + `gh run list --workflow=CI --json conclusion,createdAt`，输出 §5 五指标。
- 验收：`node scripts/guard/metrics.mjs --week 2026-W45` 输出五行（五个指标），缺数据项显式打 `n/a` 而非 `0`——**度量本身也不许用哨兵值**。

落地顺序建议 S1 → S3 → S2 → S4 → S5：S1/S3 只加脚本不改语义风险最低，S2/S4 会改变派工与复验习惯，S5 依赖前四项产生数据。注意 S1 只能落地「本地态」，其 CI 部分受阻于 §8 第一条。

## 8. 已知风险与降级

### 8.1 E5 数据及时性：只有本地态，生产态不存在（最严重）

比"缺部署工作流"更严重：**Render 服务与数据库已于 2026-11-03 因成本暂停，线上后端当前不存在**，前端已切回 Cloudflare Worker 兜底。因此 E5 **没有任何可阻断的生产环境可打**。

分两态表述，禁止混同：

| 态 | 可用性 | 判据来源 | 是否阻断 CI | 声明口径 |
|---|---|---|---|---|
| **本地态（现在可用）** | ✅ | `--base http://127.0.0.1:3001` 或本地 PG | ❌ 不阻断 | 只能说"本地链路及时性校验通过"，**不得**说"E5 已上线" |
| **生产态（待恢复）** | ❌ | 生产实例 `/api/health` + 部署后自动烟测 | ✅ 阻断 | 需两个前置**同时**满足 |

生产态的两个前置（缺一不可）：
1. Render 或替代托管**恢复**，且 `backend/src/` 有真实部署路径（现无部署工作流）；
2. `scripts/smoke/production-smoke.mjs` 接入 CI，部署后自动跑（该脚本已支持 `--base` / `--strict` / `--json` / `--expect-commit`，无需新写，只需挂进 `deploy-*.yml` 的后续步骤）。

风险传导：E5 无法阻断 ⇒ 「`daily_quotes` 落后但无人发现」这一类缺陷，在 §7 全部落地后**仍只能靠人**在每日循环里手工跑一次 `data-freshness.mjs`。这是本设计当前的唯一人工兜底点，需在每日深度循环（`clair-loop` 深度模式）里显式列为一步。

### 8.2 其余风险（按严重度）

- **E2 依赖本地起服务**：库里没有"当前代码的可运行实例"（历史多次踩到 `:3001` 跑的是陈旧进程），`curl` 证据可能来自旧代码。缓解：证据必须带响应体里的 `version` / commit 字段，与 `git rev-parse HEAD` 比对（`production-smoke.mjs` 的 `VERSION_MISMATCH` 已实现该比对逻辑，本地态复用）。
- **E3 投毒可能污染工作树**：`redgreen.mjs` 必须 `try/finally` 还原，且运行前后各打一次 `git status --short` 该文件切片；两次不一致即中止。多 Agent 共享同一工作区，这是真实风险而非理论风险。
- **E1 运行时门禁需要实例**：与 E2 同源；本地态可跑，生产态受阻于 §8.1。
- **度量依赖台账文本格式**：`metrics.mjs` 解析 markdown 表格，台账一旦改表头会静默解析失败。缓解：解析不到列时 exit 2 并打印缺失列名，**不返回 0 条**（空集不是"零缺陷"）。

