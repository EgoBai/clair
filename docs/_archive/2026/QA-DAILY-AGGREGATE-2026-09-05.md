# QA 每日测评缺陷汇总 · 主 Agent 交接包

> 生成：2026-09-05（第 109 轮后） · 来源：qa-swarm 蜂群 12 份每日报告（2026-08-22 → 2026-09-04）
> 交付对象：澄观 Clair 投研助手主 Agent（本仓自主循环）
> 用途：将此前「只报告、不闭环」的 QA 产出**登记进计划系统**，使自主循环下一轮起可自动取项修复

---

## 一、汇总口径

- **样本**：12 份 `qa-report-*.md`（`/Users/ego_bai/WorkBuddy/Claw/`），跨度 14 天，覆盖 5 画像 × 25+ 模块
- **计数口径**：`首现日期` + `累计报告次数`（比单日自述的 dayN 更客观，跨报告可核对）
- **分级**：P0（阻断/假数据/安全）· P1（重要功能受损）· P2（体验瑕疵）
- **红线**：任何 `Math.random` / 硬编码参与对用户供数 ⇒ P0（违反诚实红线）

## 二、缺陷纵向轨迹（按持续时长降序）

| 缺陷 | 首现 | 累计报告 | 当前等级 | 状态 | 核心证据 |
|------|------|---------|---------|------|---------|
| **backtest 信号引擎零交易** | 08-24 | **11 次** | P1 | 🔴 未修 | `POST /api/backtest/run` 三类策略均 `totalTrades:0`、指标全 0；K 线已真实（08-29 收敛根因至信号层，非数据层） |
| **top-traders 龙虎榜死链** | 08-25 | **9 次** | P1 | 🔴 未修 | `app.ts` 未挂载 `_archived/top-traders.ts` → 404，但 `navGroups.ts:86` 仍暴露入口 |
| **compare 同业对比不可用** | 08-26 | **9 次** | P1 | 🔴 未修 | 08-26~30 记 400/404（契约），09-02 更正为**500**（路由存在、处理器抛错） |
| **screener 恒空（伪空态）** | 08-27 | **8 次** | P1 | 🔴 未修 | `POST /api/screener/filter` 恒 `stocks:[]`；`screener.ts` catch 静默吞错，以空结果冒充「无匹配」 |
| **strategies 模板库空** | 08-27 | **8 次** | P2 | 🟡 未修 | `/api/strategy-templates` → `templates:[]`，200 不报错 |
| **fund-flow 资金流数据缺失** | 08-26 | **6 次** | P1 | 🔴 未修 | 08-26/27 行业映射异常 → 09-01 LCG 伪兜底 → 09-02 五档全 null → 09-04 当日五档全 0 + 历史 LCG 伪兜底 |
| **lockup-calendar 解禁伪数据** | 08-28(P2)/**09-01(P0)** | **P0 连续 4 次** | **P0** | 🔴 未修 | `lockup-shares.ts:55-82` 17 处 `Math.random` 编造日期/股数/市值/股东并直接供数；`eventCalendar.ts:18` 已自述伪数据仍在线 |
| **ai/diagnose 五维评分随机** | 09-02 | **3 次** | **P0** | 🔴 未修 | `ai-stock-selection.ts:121-130` 五项评分全 `Math.random()*40+60`，strengths/risks 硬编码 |
| **portfolio 游客越权** | 09-01 | **4 次** | **P0(安全)** | 🔴 未修 | `portfolio.ts` 无 auth 中间件，游客 `GET /api/portfolio` 200 读 ¥27 万持仓；与 `watchlist` 401 口径矛盾 |
| **factor-lab IC 全 0 + asOf 滞后** | 09-01 | **4 次** | P1 | 🔴 未修 | `/api/factors/overview` `dataSource:'real'` 但 `asOf:2026-06-05`（滞后 ~3 月）、EP 等 `ic:0/valid:false` |
| **watchlist 游客 401 缺引导** | 08-28 | 6 次 | P2 | 🟡 未修 | 401 本身诚实（合规），但无登录引导/游客兜底，P1/P5 画像核心路径阻断 |
| **report-center AI 推荐** | 08-24 | 8 次 | P2 | ⚠️ 波动 | 08-29 曾「已修复 200」→ 09-01 404 → 09-02 空 → 09-03 硬编码评分 → **09-04 诚实降级（`unavailable`）** |

**已真修复（可销号）**：Swagger 死路由文档清理（08-22）· `.bak` 页面文件清理（08-24）· radar `/api/ai/gems` 与 financials 误报撤回（09-02，实际均为真实可用）· `ai/recommendations` 诚实口径达标（09-04）

## 三、结构性根因（本次交接的核心结论）

> **QA 报告与主 Agent 计划系统之间存在投递断裂 —— 这是「连续 11 日只报告不修复」的真正原因，而非开发能力问题。**

1. **产出侧**：12 份 QA 报告落在 `/Users/ego_bai/WorkBuddy/Claw/`，属**外部目录**，不在本仓循环视野内。
2. **消费侧**：自主循环的取项机制是 `PLAN.md` 第九节「自主改进池 IP-1~IP-11」——每轮从池中取 1 项推进。
3. **断裂点**：QA 报告的 P0/P1 **从未被登记进该改进池**。第 104~109 轮主 Agent 持续消耗在 IP-8（三态统一，P3 体验项）并于第 109 轮收官；改进池仅剩 IP-7（utils 拆分，P3 待用户决策，非最小侵入项）。
4. **后果**：P0 红线缺陷（解禁伪数据 / 诊断随机评分 / 组合越权）连续 4/3/4 日零修复，而循环自我报告「IP-8 六批全部完成」——**验收语言与真实健康度脱节**，与 IP-9 曾证伪的「curl 全 200 假绿」同类病灶。

**处置**：本次将 QA 积压缺陷**正式登记为 IP-12~IP-20**（见下），纳入改进池取项序列，使第 110 轮起自动消费。

## 四、派发表（文件域零交集，可并行派发子 agent）

| 编号 | 改进项 | 优先级 | 文件域（零交集） | 验收断言 |
|------|--------|--------|-----------------|---------|
| **IP-12** | 红线收口·lockup 解禁伪数据下线 | **P0** | `backend/src/api/lockup-shares.ts`、`eventCalendar.ts` | grep 该域 `Math.random` = 0 命中；`/api/lockup/calendar` 返回 `dataSource:'unavailable'` + 空数组 + notes（照搬 `margin.ts` 范式）；补 Joi `year/month` 字段 |
| **IP-13** | 红线收口·ai/diagnose 五维随机评分 | **P0** | `backend/src/api/ai-stock-selection.ts` | grep 该域 `Math.random` = 0；`/api/ai/diagnose/600519` 五维评分来自真实因子或置 `null` + `dataSource:'unavailable'`；移除硬编码 strengths/risks |
| **IP-14** | 安全·portfolio 鉴权补齐 | **P0** | `backend/src/api/portfolio.ts`、`risk-center.ts` | 游客 `GET /api/portfolio` = 401（与 watchlist 一致）；已登录仍 200 |
| **IP-15** | backtest 信号引擎归零攻坚（最痛·11 日） | P1 | `backend/src/api/backtest-routes.ts` + 信号引擎 | 单测锚定「600519.SH / 近 8 月真实 K 线 / ma_cross(5,20) 交叉数 > 0」；`totalTrades>0`、指标非全 0；同批统一 `presets↔run` 契约（对象 vs 字符串枚举） |
| **IP-16** | screener 伪空态收口 | P1 | `backend/src/api/screener.ts` | 移除 catch 静默返空；真实查询失败时返回 `dataSource:'unavailable'` 而非冒充「无匹配」；恢复前端兜底 `/api/stocks/top` |
| **IP-17** | compare 500 修复 | P1 | `backend/src/api/stock-compare.ts` | `GET /api/compare?symbols[]=…` = 200 且返回真实对比数据；补错误日志定位抛点 |
| **IP-18** | top-traders 死链二选一 | P1 | `frontend/src/config/navGroups.ts`（或重新挂载 router） | 二选一：接真实龙虎榜源并挂载，或从 navGroups 摘除入口 + 「功能建设中」占位；**禁止留 404 死链** |
| **IP-19** | factor-lab IC 重算与 asOf 刷新 | P1 | `backend/src/api/factors.ts` | 对齐因子暴露与前瞻收益序列后 `ic/rankIC` 非全 0、`valid:true`；`asOf` 刷新至最近交易日 |
| **IP-20** | fund-flow 五档真实化 | P1 | `backend/src/api/fund-flow.ts`、`frontend/src/utils/fundFlowPageDemo.ts` | 当日五档接入真实源（或全档 `null` + `dataSource:'unavailable'`）；移除 LCG 伪历史与前端 demo 序列 |

## 五、主 Agent 执行序列建议（第 110 轮起）

按「红线 > 安全 > 功能阻断」排序，每轮 1 项、最小侵入、走完整验收后销号：

1. **第 110 轮 → IP-12**（解禁伪数据下线，红线最高优先，文件域最小）
2. **第 111 轮 → IP-13**（诊断随机评分，红线）
3. **第 112 轮 → IP-14**（组合鉴权，安全）
4. **第 113 轮 → IP-15**（backtest 信号引擎，连续 11 日最痛，需单测锚定）
5. **第 114 轮起 → IP-16 → IP-17 → IP-18 → IP-19 → IP-20**（P1 收口）

**并发安全**：IP-12~IP-20 文件域两两零交集，可并行派发子 agent；但**执行前须确认主循环 Automation 已暂停**（单通道红线），子 agent 输出必须独立验证（grep/read），**不得轻信自报**。

## 六、通用验收基线（每项完成后均需复跑）

- `npm run typecheck`（backend + frontend）0 错
- `npm run build` 一次过
- `npm run guard` ERROR=0 WARN=0 INFO=0（维持 IP-1 后基线）
- e2e `route-render-smoke` 全通过（零白屏/零崩溃/零 404 退化）
- **诚实红线专项**：`grep -rln "Math.random" backend/src/api/ frontend/src/ | grep -v "_archived|\.test\.|__tests__|\.dead-code"` → 仅剩请求 ID/抖动重试/性能采样等**非供数**用途
- 服务存活：dev `:5173` / 后端 `:3001`

---

*本交接包为「报告→计划→执行」闭环的投递凭据。后续每日 qa-report 的新增 P0/P1 应即时登记进 `PLAN.md` 第九节改进池，避免再次形成积压外循环。*
