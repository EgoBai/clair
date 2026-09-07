# TEAM-STRUCTURE — 多 Agent 团队分工方案与职责矩阵

> 更新：2026-09-05。本文档回答"项目工程日益混乱、复杂度上升但核心功能多数不可用"的解法：
> 按模块与专业方向划分 6 个 Lane（团队），以显式并行推进替代单线程混杂开发。
> 配套阅读：`HANDOFF.md`（当前状态）、`MULTI-AGENT.md`（工程规范与陷阱）、`DEV-COORDINATION.md`（历史协作简报）。

---

## 一、为什么要重组（问题诊断）

| 现状问题 | 根因 | 解法 |
|----------|------|------|
| 核心功能多数不可用（P0：概念板块 404、二级行业无数据） | 单线程开发不断切换上下文，功能半成品堆积 | 按 Lane 划分职责，每个功能必须有唯一 Owner 和验收闭环 |
| 交付文件需人工复制到其他对话框 | 上下文只存在于对话内存，不外置 | HANDOFF.md + wb-issues 看板作为唯一事实源 |
| 蜂群模式"默认不生效" | 蜂群无自动触发机制，主 Agent 必须显式并行 spawn；子代理不跨对话存活 | 主 Agent 每轮任务单条消息并行 spawn 多个 Lane Agent，先读交接文件再干活 |
| 复杂度持续上升 | 无模块边界，任何人都能改任何文件 | 职责边界 + 管辖路径清单，跨域改动需在交接文件登记 |

## 二、Lane（团队）划分与职责矩阵

### 职责总表（RACI）

| 工作类型 | PM | ARCH | FE | BE | DATA | QA |
|----------|----|------|----|----|------|----|
| 需求优先级 / 排期 | **A/R** | C | C | C | C | I |
| 页面交互 / 视觉 / 响应式 | C | C | **A/R** | I | I | C |
| API 端点设计 / Worker 路由 | I | **A** | C | **R** | C | I |
| 数据源接入 / 同步 / 落库 | I | C | I | C | **A/R** | I |
| 数据口径 / 评分模型 | C | C | I | C | **R** | A |
| 数据真实性审计（反虚构） | I | I | I | I | **R** | **A** |
| 端到端验证 / 回归 | I | I | C | C | C | **A/R** |
| 部署 / CI / 回归清单执行 | I | **A/R** | I | C | I | C |
| 交接文件 / 看板维护 | **A/R** | C | C | C | C | C |

R=负责执行 A=最终负责 C=被咨询 I=被告知

### Lane 1 — PM（产品管理 / 主 Agent）

- **使命**：拆解任务、分派并行、验收汇总、维护事实源。PM 即主 Agent 本身，不写业务代码。
- **职责**：每轮开始读 `HANDOFF.md` → 拆解为可并行任务 → 单条消息 spawn 多个 Lane Agent（蜂群显式化）→ 收集结果 → 更新 HANDOFF/看板 → 只在重大里程碑通知用户。
- **管辖**：`HANDOFF.md`、`DEV-COORDINATION.md`、wb-issues 看板。
- **禁止**：跳过交接文件直接开工；在无验收标准的情况下分派任务。

### Lane 2 — ARCH（架构 / 部署）

- **使命**：保证架构不漂移、部署链路畅通。
- **职责**：路由设计（新增端点先定契约再实现）、双路由系统（`main.tsx` 真入口）守护、Worker/Backend 职责划分（生产只有 Worker，新数据端点一律做 Worker）、CI/部署 runbook、生产回归清单执行。
- **管辖路径**：`clair-worker/`、`.github/workflows/`、`DEPLOY.md`、`frontend/src/main.tsx`、`vite.config.ts`。
- **DoD**：`node --check clair-worker/worker.js` 过 + 改动同步 `_worker.js` + 部署后 curl 生产 API 逐条验证。

### Lane 3 — FE（前端 UI/UX）

- **使命**：页面功能完善、清晰易用、不冗余；暗色主题一致性；移动端 375px 无水平滚动。
- **职责**：7 个核心页面的 UI/交互/响应式、组件暗色审查（禁止亮色残留）、空态/降级态设计（数据不可用时的诚实展示）、组件挂载与下线评估。
- **管辖路径**：`frontend/src/pages/`、`frontend/src/components/`、`frontend/src/styles/`。
- **DoD**：`npx tsc --noEmit` 0 错误 + 受影响 vitest 全过 + 浏览器截图验证（暗色、375px、空态三件套）。
- **红线**：白色背景禁止、空壳组件禁止（新组件必须挂载可达，否则删除）。

### Lane 4 — BE（后端 API / Worker 业务逻辑）

- **使命**：端点可用、降级诚实、容错完备。
- **职责**：Worker handler 实现、上游容错（多主机/多源降级）、路由与参数校验、v2/v3 投影逻辑、Express 后端（开发环境）维护。
- **管辖路径**：`clair-worker/worker.js`（与 ARCH 共管，改动需登记）、`backend/src/api/`、`backend/src/services/`。
- **DoD**：curl 实测每个端点（正常态 + 上游故障态）+ 响应结构与 shared/types 一致。
- **红线**：上游挂了就返回 `data:null`+原因，绝不填充虚构/演示数据。

### Lane 5 — DATA（数据 / 模型口径）

- **使命**：5541 只股票一只不能少；评分模型口径与 backend v3 一致。
- **职责**：数据源探测与选型（腾讯/东财/新浪可用性验证）、行业分类准确性（申万一级 31 / 二级补齐 / 概念表）、KV 历史落库（collect-history）、评分算法口径对齐（pctile 线性插值、null 语义）。
- **管辖路径**：`backend/src/data-sync/`、`backend/src/db/`、Worker 内数据函数、`shared/types.ts`（与 BE 共管）。
- **DoD**：数据量核对（count=5541）+ 字段单位核对（市值万元/PB null 语义）+ 与 backend 同口径算法 diff 为零。

### Lane 6 — QA（测试 / 端到端验证）

- **使命**："编译通过"≠"功能可用"的守门人。
- **职责**：受影响测试圈定与执行、生产回归清单执行（`DEV-PLAN-5DIM.md` 第二节）、数据真实性抽查（随机抽股票对照上游源）、移动端/空态巡检。
- **管辖路径**：`frontend/src/__tests__/`、`backend/src/__tests__/`、回归清单文档。
- **DoD**：每轮交付附验证结果表（测试数/通过数/生产 curl 结果）；不通过则打回对应 Lane，不得带病合并。

## 三、并行协作模式（蜂群的正确打开方式）

```
用户指令
   │
   ▼
PM(主Agent)：读 HANDOFF.md → 拆解 → 定验收标准
   │
   ├─ spawn FE Agent ──→ 页面改动 ──┐
   ├─ spawn BE Agent ──→ Worker改动 ─┤  单条消息并行发起
   ├─ spawn DATA Agent → 数据验证 ──┤  各Lane只碰自己管辖路径
   └─ spawn QA Agent ──→ 回归验证 ──┘
   │
   ▼
PM：汇总各Lane结果 → 冲突仲裁 → 更新HANDOFF+看板 → 里程碑通知用户
```

**规则**：
1. 蜂群必须显式：主 Agent 在**单条消息**中并行发起多个子代理调用；无自动蜂群。
2. 子代理无记忆：spawn 时 prompt 必须自带上下文或指向 `/workspace/clair/HANDOFF.md`。
3. 共管文件（worker.js）同一轮只分配给一个 Lane，避免编辑冲突。
4. 所有跨 Lane 事实（口径变更、数据源结论、部署状态）写入 HANDOFF.md 第六节，不靠口头传递。

## 四、模块优先级（按此顺序逐模块落实）

| 优先级 | 模块 | Owner | 当前状态 |
|--------|------|-------|----------|
| P0 | 部署链路（推送→CI→生产验证） | ARCH | 改动就绪，等推送条件 |
| P0 | 概念板块端点 `/api/sectors/concept`（404） | DATA+BE | 未开工 |
| P1 | 14 维历史数据底座（KV 落库+全路径验证） | DATA | 引擎就绪，等 push2his 恢复 |
| P1 | 策略回测日期选择器 | FE | 未开工 |
| P1 | 产业地图节点下钻 | FE | 未开工 |
| P1 | 二级行业分类补齐（528 只未分类） | DATA | 未开工 |
| P2 | 投资笔记入口可见性 | FE | 未开工 |
| P2 | DiscoverPage 排序/热力图逻辑梳理 | FE | 市场情绪卡已完成第一步 |

## 五、wb-issues 共享任务看板（建卡规范）

- 每个任务一张卡：标题格式 `[LANE] 模块 — 动作`（如 `[DATA] 历史底座 — KV每日收盘落库`）。
- 卡描述必须含：背景一句话 + 验收标准 + 管辖路径 + 前置依赖。
- 状态流转：`pending → in_progress → completed`；阻塞时写明原因到评论。
- PM 每轮结束对账一次：看板与 HANDOFF.md 不允许出现事实分叉。
