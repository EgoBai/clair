> 本文件为 v2.0 修订版，替代 v1.0；v1.0 的 §1.2/§4/§5.1⑤ 已被评审判定不成立，请勿引用。

# 澄观 Clair · RSI 递归自我迭代框架 总体方案设计 v2.0

| 项 | 值 |
|---|---|
| 版本 / 日期 | v2.0（修订版，非重写换方向） / 2026-09-20 |
| 方案编号 | **D26**（D14 已被 2026-07-27「真实化 API 密钥」决策占用；`DECISION_LOG.md` 已推进至 D25） |
| 评审来源 | 2026-09-20 方案评审（基准仓库 HEAD `39b5c63dd`），结论 **有条件通过** |
| 性质与口径 | 方向继承、事实与论证重写、R0′ 范围收窄；**唯一新增文件** = `design/rsi-framework-v2.md`；所有路径 / 行号 / 数字均取自已核验证据，不确定处标「待核验」，不臆造 |

## §0 V1→V2 修订对照表（先读本节）

> 说明：下表的 **P0 / P1 项号为 V2 重整编号**，用于把评审结论逐条钉到落点章节；原始评审文档的细分编号若与本表不同，以本表的事实与落点为准。

### §0.1 P0（阻断级：事实错误 / 范畴错误，必须改对）

| 项号 | v1.0 原表述 | 评审判定 | V2 处置 | 落点 |
|---|---|---|---|---|
| **P0-1** | §1.2 以 **8 步**流程（Observe→Compare→Ideate→Prioritize→Plan→Execute→Verify→Record）作为「用户侧核心循环母版」，映射表却只剩 7 格（Prioritize 被砍） | 该 8 步实为**研发侧 agent 自迭代引擎**（`CLAIR-STANDARDS.md:81-108`），**把研发侧引擎当用户侧母版**，属前提性事实错配；产品真实核心循环是 **4 步**（发掘→筛选→自选→复盘，`PRD.md:49-55`、`PROJECT-BRIEF.md:12`，明注「不做交易管理」） | §1.2 整节重写：先立 4 步母版，再做 7 格逐格校验（**1 存在 / 2-5 部分 / 6 不存在 / 7 部分**），并正面写出结论「**6/7 格无完整对应物，第 6 格（验证）是 RSI 递归闭环的核心却是空的**」 | **§1.2** |
| **P0-2** | §4 总体架构把研发侧 `eval-gate` 与用户侧 `eval_cases` 画成 `←→` **双向箭头**，暗示两者共享同一评估器 | **范畴错误**：研发侧评估器是**确定性机读真值**（tsc / vitest / e2e 渲染 / curl 存活），周期秒-分钟；用户侧真值是**延迟、噪声、多因子混淆**，周期天-周。二者只能共享「协议」，不能共享「引擎」 | §4 内**删除该双向箭头**；新增「**复用边界**」表，正面区分「可复用 = 协议骨架 5 条」与「不可复用 = 评估器」 | **§4** |
| **P0-3** | §5.1⑤ 三证核验协议含「**curl 证可用**」；并提议把 **AST 静态扫描降为 P1 警告**，改用 mock 环境运行时探针替代 | **双重错误**。①第 101 轮已实证证伪：本产品是 Vite SPA，**任意路径均命中 `index.html` fallback**，实测 `/definitely-not-a-route-xyz123` 同样返回 200，白屏/组件抛错时 curl 依旧全绿（`PLAN.md:289` 第 103 轮永久告示块已禁止复用该失效口径）。②仓库**已有** AST 扫描作为 CI 阻断级门禁，降级 = 倒退；且 mock 环境下请求必然发出，**无法区分「接真数据」与「发了请求但 fallback 假数据」**，探针逻辑不成立 | ①核验协议改为**四证**：`grep 证存在` + `读文件证逻辑` + `curl 证服务存活`（明确降级为存活探测）+ **`e2e 渲染断言证可用`**（路由/页面级改动强制）。②**AST 扫描保持 CI 阻断级，不降级**；诚实判据改为 **`dataSource` 契约断言** + **分域伪数据扫描** | **§5.2 / §5.3** |

### §0.2 P1（重要：须修正的事实、路径、数字与口径，14 项）

| 项号 | v1.0 原表述 | 仓库事实 | V2 处置 | 落点 |
|---|---|---|---|---|
| **P1-01** | 引用根目录 `CLAUDE.md` 作为 Agent 指令入口 | **无根 `CLAUDE.md`**；入口是 **`.claude/CLAUDE.md`**，其 **24-47 行**已有「开发循环 (Clair Loop)」（SCAN→EVAL→PLAN→EXEC→VERIFY→CAPTURE 六步）、**73-81 行**已有「质量门禁」 | 改指 `.claude/CLAUDE.md`；并登记该文件自身的**口径漂移**：73-81 行第 3 条仍写「`curl` 端到端」、第 2 条写 `npx vitest run` 但 CI 未跑（见 P1-10） | §0 / §5.4 / §9-R6 |
| **P1-02** | 方案编号沿用旧序列 | **D14 已被占用**，`DECISION_LOG.md` 已推进至 **D25** | 本方案编号 = **D26**（见头部与 §10） | 头部 / §10 |
| **P1-03** | 提及 `useFeedbackStore` / `useAIMStore` 并暗指其已存在 | 前端目录是 **`frontend/src/store/`（单数）**，现有仅 `useAppStore.ts` / `useGamificationStore.ts` / `useStockStore.ts`；`useFeedbackStore` / `useAIMStore` **不存在（待建）** | 明确标注「**待建**」，不当作既有能力 | §6 |
| **P1-04** | 「复用已定义的 `useGamificationStore`（bond / loopPhase）」 | **`bond` / `loopPhase` 全仓不存在**（grep 命中系 `convertibleBondEngine` 等金融术语误匹配）。游戏化真实字段 = **XP / level / streak / counters / achievements / quests / companion mood**，定义于 `frontend/src/config/gamification.ts`，状态机 `frontend/src/store/useGamificationStore.ts`，UI `frontend/src/pages/JourneyPage.tsx` | 改用真实字段名；并写明「**壳已建、线未接**」：`touchDaily` 无调用者 → `streakDays` 恒 0 → 伴生情绪永远停在最低档 `sleepy`；配置声明的计数器 **5/9 无触发点**（`watchlist_added` / `ai_chat` / `report_generated` / `factor_run` / `risk_checked`）→ 对应成就**永不可解锁** | §1.3 / §9-R6 |
| **P1-05** | 将 `eventBus` 视为可挂载的既有事件能力 | `frontend/src/services/eventBus.ts` **零生产引用**（仅被 `frontend/src/__tests__/eventBus.test.ts` 引用）→ **死代码** | 明示其为死代码，不得当作既有能力；若复用须先登记为「新建接线」 | §1.1 / §9-R5 |
| **P1-06** | 引用 `NotesPage.tsx` 等页面名 | 真实文件名：投资笔记 = **`frontend/src/pages/KnowledgeBase.tsx`**（**不存在 `NotesPage.tsx`**）；自选/复盘 = **`frontend/src/pages/WatchlistHubPage.tsx`** + **`frontend/src/pages/ReviewPage.tsx`**（`/review` 重定向到 `/watchlist?tab=review`） | 全部改为真实文件名与真实路由关系 | §1.2 / §6 |
| **P1-07** | 建表落点与后端迁移格式含混 | 迁移目录 **`backend/src/db/migrations/`**，现有 `003_performance_indexes.sql` / `performance_indexes.sql` / `004_industry_chains.sql` / `strategy_templates.sql`（**均 .sql，无 .ts**） | 建表一律落 .sql 迁移；DDL 示意见附录 B | §6 / 附录 B |
| **P1-08** | 默认向量检索能力可用 | **未启用 pgvector**：无 `CREATE EXTENSION vector`，依赖中无 pgvector。HNSW 索引需 pgvector **≥0.5.0**；带 WHERE 过滤的向量检索建议 **≥0.8.0（`hnsw.iterative_scan`）**，否则小选择性谓词下会**静默退化**。PG 原生 `tsvector`/`ts_rank_cd` **不是 BM25**；混合检索用 **RRF 融合**（或 ParadeDB `pg_search`） | 标注「未启用」状态与版本门槛；混合检索口径改为 RRF；`partial HNSW` 索引合法（DDL 不报错）但默认**不进入 R0′** | 附录 B / §3 |
| **P1-09** | 多处把既有资产写成「新建」（如 `baseline-hub` / `eval-gate`） | **均已存在**：CI 已在跑阻断级门禁 `.github/workflows/ci.yml`（name: *Lint & Typecheck & Build*，含前端 `npm run guard`，`ci.yml:48-51`，注释明写「发现 ERROR 级问题时进程非零退出，使 CI 失败」）；`npm run guard` = `tsx scripts/ui-guard/ast-scan.mts && tsx scripts/ui-guard/baseline-scan.mts`（`frontend/package.json`）；`frontend/COVERAGE-BASELINE.md`；`docs/harness/ENGINEERING-KB.md`（已执行「每次 CAPTURE 追加条目」只追加纪律）；`knowledge-base/`（92 篇 md）；`PLAN.md` 第九节「自主改进池」（IP-1~IP-20）；`frontend/e2e/route-render-smoke.spec.ts`（32 例真实浏览器渲染冒烟，含反 404 退化守卫） | 全部改为「**扩展**」：扩展 `ui-guard`（`ast-scan` + `baseline-scan`）与 `e2e` 冒烟，**不新建 6 组件、不新建 `eval-gate`** | §5.1 |
| **P1-10** | 假定测试在 CI 中运行 | **CI 不含 `vitest run`**：前端 **17802** 个用例 / **853** 个测试文件、后端 **14839** 个用例 / **614** 个测试文件**从未在 CI 运行** | 新增「CI 补 vitest job」为 R0′ 交付物（分阶段：先非阻断收集 → 再阻断） | §5.4 |
| **P1-11** | 未识别数据层降级风险 | `backend/src/db/dbFactory.ts:11-59` **静默降级**：初始 `currentType='memory'`，PG 连接失败即降级到 `InMemoryDatabase`（**20 只 mock 股票**） | 降级必须**显式暴露**（启动横幅 / health 端点字段），禁止静默 | §5.5 / §9-R2 |
| **P1-12** | 使用单一股票数常量 | **双口径并存**：**5541**（`clair-worker/worker.js:33,70`、`frontend/src/utils/demoData.ts:420`）与 **5544**（`backend/src/services/aiService.ts:88`；另见 `.claude/CLAUDE.md:20`） | 基线**不得用 `eq`**，须 `range`/`gte` 且**分环境**（PG 生产 vs 内存降级），否则门禁必然假红 | §5.3 |
| **P1-13** | 拟做「`Math.random` 零容忍」 | 生产代码实测 **110 处**（backend 55 + frontend 55；口径：排除 `.test.` / `_archived` / `.dead-code` / `.bak`；含归档约 163）。蒙特卡洛/相关性引擎**本身需要随机**（应可播种），id 生成与抖动合法。三引擎**确已清零**：`backend/src/api/ai-analysis.ts`=0、`backend/src/services/financialsDataService.ts`=0、`backend/src/api/etf.ts` 的 2 处命中**均为注释** | 改**分域白名单**：供数路径零容忍 / 计算引擎需可播种 / 种子脚本·归档·测试豁免；且明示三引擎已清零，**不得再当作缺口** | §5.3 |
| **P1-14** | 用户侧现状描述与产品实际不符（信号、复盘、归因、用户体系、埋点） | 见 §6 逐项：信号**仅 2 项真实**（「保存到投资笔记」`ChatPanel.tsx:472-494`、「笔记 RAG 引用」`ChatPanel.tsx:272-311`，**赞/踩 = 0、纠错 = 0**）；复盘**手动触发**（`ReviewPage.tsx:925-941`，须用户点「开始分析」）、**无状态单次调用**（`backend/src/api/ai-chat.ts:465-476` 的 prompt **无任何历史建议字段**）、**无历史复盘存储**、**无周期自动复盘**（全仓 `setInterval` 仅用于限流/指标/WS 心跳/30s 行情轮询）；`frontend/src/utils/analytics.ts` 有全套埋点 API，但全仓**仅 `trackPageView` 被调用一次**（`main.tsx:118`）；后端有 `backend/src/api/analytics.ts` 但生产 `clair-worker/worker.js` **无此路由（生产断链）**；**用户体系未启用**（`frontend/src/components/User/LoginPage.tsx` **未挂任何路由**；`backend/src/api/user.ts` 用**内存 Map** 存储；自选/复盘直接读 localStorage） | §6 逐项按实况标注（现状列 = 真实 / 部分 / 不存在）；首期**不依赖 `user_id` 隔离与鉴权**；归因改用**超额收益基准**（个股 vs 所属行业指数 vs 沪深300） | §6 |

### §0.3 补充核正（评审附带事实，非独立编号项）

| 项 | v1.0 / 存量文档表述 | 事实 | V2 处置 | 落点 |
|---|---|---|---|---|
| 补充-1 合规 | 未提及 | AI system prompt **已有硬约束**（必须含风险提示、不做买卖建议、「不构成投资建议」），**真实存在** | 写为「**已具备，需扩展覆盖**」，并补合规三件套：留存期限 / 导出权 / 授权同意 | §6.4 |
| 补充-2 文档漂移 | 未提及 | `DEPLOY.md` / `docs/ARCHITECTURE.md` **仍写旧 Nginx + Docker 架构**（与实际 Cloudflare Pages + GitHub Pages 不符）；`.claude/CLAUDE.md:73-81` 第 3 条仍为 `curl` 口径 | 登记为风险，纳入 R0′ 文档同步清单 | §9-R6 |
| 补充-3 引用 | 3 个无出处数字 + 3 处夸大 | 见附录 A 逐条修正 | 全部改口径或删除 | §3 / 附录 A |

> 说明：v1.0 中「分形 / 同构」类修辞**未经证实**，本版**不作为任何论证前提**；「复盘天然就是引擎」的表述亦已删除。

## §1 概念对齐

### §1.1 两个尺度，两条循环（不是一条）

Clair 存在两个**互不等价**的自我迭代对象：

| 尺度 | 对象 | 循环母版 | 真值形态 | 周期 | 当前状态 |
|---|---|---|---|---|---|
| **研发侧（RSI-Dev）** | 代码库与文档 | `.claude/CLAUDE.md:24-47` 的 **Clair Loop 六步**（SCAN→EVAL→PLAN→EXEC→VERIFY→CAPTURE） | **确定性机读真值**（tsc / vitest / e2e 渲染 / curl 存活） | 秒 - 分钟 | 已有循环纪律 + CI 阻断门禁，**缺三块基线**（见 §5） |
| **用户侧（RSI-User）** | 用户的投资研究工作流 | 产品核心循环 **4 步**（发掘→筛选→自选→复盘，`PRD.md:49-55`） | **延迟、噪声、多因子混淆** | 天 - 周 | **闭环尚未闭合**：第 6 格「验证」不存在（见 §1.2） |

补充事实：`frontend/src/services/eventBus.ts` **零生产引用**（仅被 `frontend/src/__tests__/eventBus.test.ts` 引用），是**死代码**——本方案不把它当作既有能力。

### §1.2 用户侧核心循环：4 步母版与 7 格逐格校验（**P0-1 修正**）

**母版更正。** v1.0 误用研发侧 8 步 agent 引擎（`CLAIR-STANDARDS.md:81-108`）作为用户侧母版。产品真实核心循环是 **4 步**（`PRD.md:49-55`、`PROJECT-BRIEF.md:12`，明注「不做交易管理」）：

```
发掘 (Discover) → 筛选 (Screen) → 自选 (Watchlist) → 复盘 (Review)
```

**逐格校验**（沿用 v1.0 §1.2 的 7 格分期框架，逐格给出真实仓库结论）：

| # | 格位 | 判定 | 真实对应物 | 缺口 |
|---|---|---|---|---|
| 1 | 发掘 | **存在** | `DiscoverPage` 下钻 | 无「信号沉淀」 |
| 2 | 比较 | **部分** | 仅「自选区间涨跌对照」 | **无「AI 上轮建议 vs 实际结果」对照** |
| 3 | 构思 | **部分** | 筛选工具在 | 「偏好假设」**无落库** |
| 4 | 规划 | **部分** | 加自选、AI 诊断各自存在 | 彼此**无绑定** |
| 5 | 执行 | **部分** | 观察 / 追问 / 笔记在（`KnowledgeBase.tsx`） | **「持有」不存在**——产品不做交易管理 |
| 6 | 验证 | **不存在** | 无任何「验证上轮判断」机制 | **这是 RSI 递归闭环的核心，却是空的** |
| 7 | 记录 | **部分** | 笔记 + XP 真实 | `bond` 不存在；**无「记→验」回路** |

**结论：6/7 格无完整对应物。** 因此用户侧 R0′ 的唯一正确起点是**补第 6 格**，而非先谈「复用闭环语义」。

**页面与路由真实名称**（P1-06）：投资笔记 = `frontend/src/pages/KnowledgeBase.tsx`（**不存在 `NotesPage.tsx`**）；自选/复盘 = `frontend/src/pages/WatchlistHubPage.tsx` + `frontend/src/pages/ReviewPage.tsx`，`/review` 重定向到 `/watchlist?tab=review`。

### §1.3 双成长螺旋：真实字段与「接线不全」现状（**P1-04 修正**）

v1.0 所称 `useGamificationStore` 中的 `bond` / `loopPhase` **全仓不存在**（grep 命中系 `convertibleBondEngine` 等金融术语误匹配）。真实字段与载体如下：

| 维度 | 真实字段 | 载体 |
|---|---|---|
| 成长 | **XP / level** | `frontend/src/config/gamification.ts`（定义）→ `frontend/src/store/useGamificationStore.ts`（状态机）→ `frontend/src/pages/JourneyPage.tsx`（UI） |
| 连续 | **streak**（`streakDays`） | 同上 |
| 计数 | **counters** | 同上 |
| 成就 | **achievements** | 同上 |
| 任务 | **quests** | 同上 |
| 伴生 | **companion mood** | 同上 |

**必须写明的现状（壳已建、线未接）**：

- `touchDaily` **无调用者** → `streakDays` **恒 0** → 伴生情绪**永远停在最低档 `sleepy`**；
- 配置声明的计数器有 **5/9 无触发点**：`watchlist_added` / `ai_chat` / `report_generated` / `factor_run` / `risk_checked` → 对应成就**永不可解锁**。

故「双成长螺旋」在 v2.0 中是**设计意图 + 待接线清单**，不是既有能力。

## §2 设计原则

1. **诚实降级优先（`dataSource` 契约）**——所有供数端点响应**必须**含 `dataSource`；非 `real` 时**必须**带 `notes`。这条契约是本方案**两尺度唯一真正的复用点**：研发侧把它当**门禁断言**，用户侧用它决定**信号是否允许入库**（非 `real` 的数据不得进入复盘快照）。
2. **验证与实现分离**——实现者不得自证可用；路由/页面级改动必须由 e2e 渲染断言背书。
3. **不静默**——数据源降级、能力缺失、跳过验证，一律显式暴露（横幅 / 字段 / 日志）。
4. **最小侵入**——只扩展既有资产（`ui-guard` / `e2e` / CI / KB），不新建并行体系。
5. **先补缺口，再谈复用**——用户侧闭环未闭合前，不讨论「复用同一引擎」。
6. **触发性演进 + 文件域零交集**——重度能力（记忆层 / bandit / judge）不设时间表、只设**触发条件**（§7）；多 Agent 并行作业时写域互斥（§8）。

## §3 业界研究结论（引用全部按修正后口径）

| 结论 | 可溯源表述 | 对本方案的用法 | v1.0 错误 |
|---|---|---|---|
| **ACE 自进化 Agent** | ACE（arXiv:2510.04618, ICLR 2026）在 **AppWorld 均分**上以开源 **DeepSeek-V3.1** 大致追平榜首 **IBM-CUGA**（**60.3% vs 59.4/59.5**，后者由 GPT-4.1 驱动）。**论文自述该比较仅为语境参照、非方法学基线、不做直接比较**。机制（Generator-Reflector-Curator + **结构化 delta 防上下文坍缩**）属实 | 支撑「记忆只 delta 追加」的纪律 | ❌ 收窄为「配 ACE 可追平 GPT-4.1 级 agent」的绝对断言 |
| **GEPA** | 最新版：**六项任务平均超 GRPO 约 6%、最高 20%**；rollout **最多少 35 倍**。**硬边界**：GEPA 依赖**可执行 / 可打分的反馈函数** | 支撑「有真值才谈优化」；也正因如此**不可移植到用户侧** | ❌ 沿用旧版四项任务口径「10%」 |
| **自纠错的天花板** | ICLR 2024（arXiv:2310.01798）「无外部信号的自纠错会把对改错」**可沿用**，但须补三个限定词：**intrinsic** self-correction + **reasoning 任务** + **GPT-4 一代模型** | 支撑「必须引入外部信号（`dataSource` / 超额收益）」 | ⚠️ 未加限定词 |
| **in-context bandit RL** | arXiv:2410.05362 原文归因是 **exploration 缺失**，且承认**有显式 CoT 推理时模型能从错误中学习**；**限定为二值奖励分类任务** | 不得当普适规律；据此**不采用 bandit 作为 R0′ 机制** | ❌ 概括为「负反馈几乎学不动」 |
| **LLM 自偏好** | Zheng et al. 2023（MT-Bench, NeurIPS 2023）测得自偏好胜率 **GPT-4 +10% / Claude-v1 +25%** | 作为「需在自身数据上实测」的依据 | ❌ 引用「自偏好 20-30%」「金融/临床/法律域一致率 60-68%」——仅见于**同一篇厂商博客**，无一手论文 / 样本量 / 置信区间，且被 2026 年新证据部分反驳 → **删除** |
| **位置偏见** | Shi et al. IJCNLP-AACL：位置偏见**可翻转结论**，且在**候选质量接近时最主导** | 支撑「judge 结论需实测校准」（R2′ 才引入） | ⚠️ 未引用 |
| **探索/比较的门槛** | 「Thompson 每臂 ≥30 才比较」**找不到任何文献支持 → 删除**。合理表述：每臂 **≥50-100** 再开始倾斜，**≥200** 才解读量级，且为**经验值非文献定论** | 用于 R2′ 的准入门槛，明确标注经验值 | ❌ 无出处数字 |
| **检索与嵌入** | PG 原生 `tsvector` / `ts_rank_cd` **不是 BM25**，混合检索用 **RRF 融合**（或 ParadeDB `pg_search`）；**DeepSeek 无官方 embedding API**（截至 2026-09 核实，官方仅对话模型）；硅基流动托管 **BAAI/bge-m3 = 1024 维、免费档、OpenAI 兼容**；`partial HNSW` 索引**合法**（DDL 不报错）但 pgvector **未启用**（P1-08） | 附录 B 检索设计；说明记忆层为何被**移出 R0′** | ❌ 当成 BM25 / ❌ 默认向量可用 |

> 统一纪律：本文所有外部数字**只作为方向性参照**，任何进入门禁或评估器的阈值**必须先在自身数据上实测**。

## §4 总体架构（删除 `eval-gate ←→ eval_cases` 双向箭头）

```
协议骨架层（两尺度共享 · 5 条）
  ① 任务卡四元组 {task_id, 文件清单, 验收标准, 核验命令}
  ② 诚实降级契约 dataSource     ③ 记忆纪律（只 delta 追加 / 软覆盖 / 双时态 / 版本化可回滚）
  ④ 人在环出口                  ⑤ 单通道红线 + 文件域零交集
        ▼                                              ▼
  研发侧 RSI-Dev：载体 `.claude/CLAUDE.md` + Clair Loop 六步；门禁 CI + ui-guard(**扩展**)；
                  评估器 = 确定性机读真值；周期 秒-分钟
  用户侧 RSI-User：载体 复盘快照 + 回头看卡；母版 发掘→筛选→自选→复盘；
                  真值 = 超额收益（延迟 / 噪声）；评估器 = **（R0′ 不设）**；周期 天-周
  ✗ 删除 v1.0 的 eval-gate ←→ eval_cases 双向箭头
```

### §4.1 复用边界（核心结论）

| 维度 | 研发侧 RSI-Dev | 用户侧 RSI-User | 可否复用 |
|---|---|---|---|
| **协议骨架** | 任务卡四元组 / `dataSource` / 记忆纪律 / 人在环出口 / 单通道红线 | **同 5 条**（其中 `dataSource` 直接决定信号是否入库） | ✅ **可复用** |
| **评估器** | 确定性机读真值（tsc / vitest / e2e 渲染 / curl 存活），周期秒-分钟 | 延迟、噪声、多因子混淆（超额收益口径），周期天-周 | ❌ **不可复用**（v1.0 的 `←→` 为范畴错误） |
| **记忆层** | 工程 KB（只追加） | 复盘快照（只追加） | ✅ 纪律可复用；**存储实现不复用** |

> 一句话：**能复用同一套闭环「协议」，不能复用同一套闭环「引擎」**；且用户侧当前**闭环尚未闭合**，正确顺序是「**先补缺口，再谈复用语义**」。

## §5 研发侧 RSI-Dev（扩展既有资产，而非新建 6 组件）

### §5.1 定位：扩展 `ui-guard` + `e2e` + CI，不新建体系

既有资产（**不得重复建设**，见 P1-09）：

- `.github/workflows/ci.yml`（*Lint & Typecheck & Build*）：后端 install+lint、前端 install+lint+build、**前端 `npm run guard`**（`ci.yml:48-51`，注释明写「发现 ERROR 级问题时进程非零退出，使 CI 失败」）→ **扩展**：补 vitest job（§5.4）。
- `npm run guard` = `tsx scripts/ui-guard/ast-scan.mts && tsx scripts/ui-guard/baseline-scan.mts`（`frontend/package.json`）：AST 静态扫描 + 数据基线扫描，**已是阻断级** → **扩展**：新增三条基线（§5.3）；**AST 扫描不降级**。
- `frontend/COVERAGE-BASELINE.md`、`docs/harness/ENGINEERING-KB.md`（已执行「每次 CAPTURE 阶段追加条目」只追加纪律）、`knowledge-base/`（92 篇 md）→ 前者扩展为分环境基线说明（§5.3）；中者复用该纪律作为「记忆纪律」的既有实现；后者不动。
- `PLAN.md` 第九节「自主改进池」（IP-1~IP-20）→ 作为欠账清偿台账（§5.7）。
- `frontend/e2e/route-render-smoke.spec.ts`（32 例真实浏览器渲染冒烟，含反 404 退化守卫）→ 扩展为「路由/页面级改动的强制证据」（§5.2）。

**明确不新建**：`baseline-hub` / `eval-gate` / 6 个新组件。

### §5.2 核验协议：**四证**（P0-3 修正）

| # | 证 | 判据 | 适用 | 说明 |
|---|---|---|---|---|
| 1 | **grep 证存在** | 目标符号/脚本/文件确实存在 | 全部改动 | 防「实现了但没接线」 |
| 2 | **读文件证逻辑** | 逐行确认逻辑与声明一致 | 全部改动 | 防「有名字没逻辑」 |
| 3 | **curl 证服务存活** | 服务进程可达 | 仅作**存活探测** | **降级**：Vite SPA 任意路径均 200，对渲染健康零信息量 |
| 4 | **e2e 渲染断言证可用** | `e2e/route-render-smoke.spec.ts` 断言通过 | **路由/页面级改动强制** | 唯一可采信的「可用」证据 |

**永久禁止**：以「N 路由 curl 全 200」作为渲染健康或功能可用的证据（`PLAN.md:289` 第 103 轮告示块已明令禁止复用该失效口径）。

### §5.3 三条新基线（扩展 `ui-guard`）

**基线 1 — `dataSource` 契约断言（替代失效的运行时探针）**

- 判据：所有**供数端点**响应必须含 `dataSource`；**非 `real` 时必须带 `notes`**。
- 理由：mock 环境下请求必然发出，**无法区分「接真数据」与「发了请求但 fallback 假数据」**；契约断言可从响应契约层直接判定诚实性。

**基线 2 — 分域伪数据扫描 + 白名单（**不搞零容忍**）**

生产代码 `Math.random` 实测 **110 处**（backend 55 + frontend 55；口径：排除 `.test.` / `_archived` / `.dead-code` / `.bak`；含归档约 163）。

| 域 | 政策 | 依据 |
|---|---|---|
| 供数路径（API / 供数服务） | **零容忍** | 直接面向用户，伪数据 = 红线 |
| 计算引擎（蒙特卡洛 / 相关性等） | **允许，但须可播种** | 随机是算法本体需要，确定性来自 seed |
| 种子脚本 / `_archived` / `.dead-code` / `.bak` / 测试文件（`.test.` / `.spec.`） | **豁免** | 非生产路径或测试夹具 |

**已清零、不得再当缺口**：`backend/src/api/ai-analysis.ts`=0、`backend/src/services/financialsDataService.ts`=0、`backend/src/api/etf.ts` 的 2 处命中**均为注释**（注明已替换）。

**基线 3 — e2e 渲染冒烟（既有，扩展覆盖）**

- 载体：`frontend/e2e/route-render-smoke.spec.ts`（32 例，含反 404 退化守卫）。
- 扩展：新增页面（含 R0′ 回顾卡）必须纳入冒烟清单。

### §5.4 CI 补 `vitest run`（P1-10）

- 现状：**CI 不含 `vitest run`**；前端 **17802** 用例 / **853** 文件、后端 **14839** 用例 / **614** 文件**从未在 CI 运行**。R0′ 动作分阶段（避免一次性假红）：① 新增 **非阻断** job 跑 vitest 并归档结果，暴露真实基线 → ② 清理基线失败项 → ③ 转**阻断级**，与 `npm run guard` 并列。
- 同步修正文档漂移：`.claude/CLAUDE.md:73-81` 第 2 条写 `npx vitest run` 但 CI 未跑、第 3 条仍写 `curl` 口径。

### §5.5 静默降级必须显式暴露（P1-11）

`backend/src/db/dbFactory.ts:11-59`：初始 `currentType='memory'`，PG 连接失败即降级到 `InMemoryDatabase`（**20 只 mock 股票**）。

R0′ 要求：① 启动时打印**显式横幅**（当前 `DbType` + 降级原因）；② health 端点新增 **`dbType` 字段**；③ 任何依赖「生产股票数」的断言必须**读环境**而非硬编码。

### §5.6 基线分环境 + 禁 `eq`（P1-12）

股票数**双口径并存**：**5541**（`clair-worker/worker.js:33,70`、`frontend/src/utils/demoData.ts:420`）与 **5544**（`backend/src/services/aiService.ts:88`；另见 `.claude/CLAUDE.md:20`）。

- **禁止**写 `stocks === 5541` 之类 `eq` 断言；
- 必须用 **`range` / `gte`**，且**分环境**（PG 生产 vs 内存降级），否则门禁必然假红。

### §5.7 同批清偿 4 项诚实红线欠账

| 项 | 目标 | 现状 | R0′ 处置 |
|---|---|---|---|
| **IP-12**（P0） | `backend/src/api/lockup-shares.ts` 伪数据 | 解禁日期/股数/市值/比例/股东由随机生成，经 `/lockup/calendar`、`/lockup/rank` 直接供数 | 照既有 `dataSource` 范式移除随机生成器，改 `dataSource:'unavailable'` + 空数组 + `notes` |
| **IP-18** | 龙虎榜死链 | `backend/src/api/_archived/top-traders.ts` 未挂载（`app.ts` 零命中）→ 404，而 `frontend/src/config/navGroups.ts:87` 仍暴露「龙虎榜」入口 | 二选一：接真实源并挂载，或摘除入口 + 「功能建设中」占位；**禁止留 404 死链** |
| **IP-19** | 因子 IC 滞后 / `asOf` 陈旧 | `/api/factors/overview` 标 `dataSource:'real'` 但 `asOf` 陈旧，EP/BP 等 `ic/rankIC/icir` 为 0、`valid:false` | 对齐因子暴露与前瞻收益序列后**重算 IC**；刷新计算窗口至最近交易日 |
| **IP-20** | fund-flow 五档伪数据 | `backend/src/api/fund-flow.ts` 后端侧已于第 116 轮收口（改 `dataSource:'unavailable'`）；但 `frontend/src/utils/fundFlowPageDemo.ts` **前端 demo 序列仍在**，IP-20 原处置明列「移除 LCG 伪历史与前端 demo」 | **残余复核项**：以分域伪数据扫描实测为准；若前端 demo 仍在供数路径则**重开 IP-20**（待核验销号口径） |

**门禁捕获力的活体验证**：新增基线首次运行时即报出 **IP-12**——这既是门禁有效性的实证，也是 R0′ 的第一个红项。

## §6 用户侧 RSI-User（R0′ 只做「回头看卡」最小闭环）

> **本节的「回头看卡 / 复盘快照」是新建能力**，不是对既有能力的复用。用户侧闭环当前**尚未闭合**（§1.2 第 6 格缺失）。

### §6.1 现状体检（逐项按实况标注）

| 能力 | 现状 | 证据 |
|---|---|---|
| 复盘触发 | **手动**（用户点「开始分析」才调 AI） | `frontend/src/pages/ReviewPage.tsx:925-941` |
| 复盘上下文 | **无状态单次调用**（prompt 中**无任何历史建议字段**） | `backend/src/api/ai-chat.ts:465-476` |
| 历史复盘存储 | **无** | 待核验（无对应表/迁移） |
| 周期自动复盘 | **无**（全仓 `setInterval` 仅用于限流 / 指标 / WS 心跳 / 30s 行情轮询） | — |
| 采纳信号 | **存在**（「保存到投资笔记」≈ 采纳） | `frontend/src/components/ChatPanel.tsx:472-494` |
| 引用信号 | **存在**（笔记 RAG 引用） | `frontend/src/components/ChatPanel.tsx:272-311` |
| 赞 / 踩 / 纠错 | **0 / 0 / 0** | — |
| 埋点 | API 全套存在（`frontend/src/utils/analytics.ts`），但全仓**仅 `trackPageView` 被调用一次**（`frontend/src/main.tsx:118`）；且**生产链路断链**（后端 `backend/src/api/analytics.ts` 存在，但生产 `clair-worker/worker.js` 无此路由） | — |
| 用户体系 | **未启用**（`frontend/src/components/User/LoginPage.tsx` **未挂任何路由**；`backend/src/api/user.ts` 用**内存 Map**；自选/复盘直接读 localStorage） | — |

**信号表口径**：真实存在的信号**仅 2 项**；其余为**待建**。首期**不依赖 `user_id` 隔离与鉴权**。

### §6.2 R0′ 最小闭环：回头看卡（三件套）

1. **复盘快照存储**（新建）：落点 `backend/src/db/migrations/` 下新增 **`.sql`** 迁移（P1-07）；内容 `{snapshot_id, created_at, as_of, symbols[], ai_claims[], dataSource, notes}`；纪律 **只 delta 追加**，且 `dataSource != 'real'` 的快照**禁止入库**（§2 原则 1）。
2. **超额收益基准（归因修正）**：个股涨跌由**市场 beta 主导**——AI 逻辑正确而股价因大盘下跌而跌会被判「未兑现」，reward 装的是**市场噪声**；故以**个股 vs 所属行业指数 vs 沪深300** 三层超额收益取代绝对涨跌。
3. **卡片展示**（新建）：落点 `frontend/src/pages/ReviewPage.tsx` / `WatchlistHubPage.tsx` 的复盘视图，呈现「上一轮判断 → 本期实际（超额口径）→ 结论」；页面级改动**强制 e2e 渲染断言**（§5.2 第四证）。

### §6.3 首期隔离与信号采集（不依赖 `user_id`）

- 快照以 **localStorage / 设备级标识**关联，避免依赖未启用的用户体系；迁移到 `user_id` 隔离作为 **R1′** 触发式任务（前置条件见 §7）。
- R0′ **只接已有 2 项信号**（采纳 / 引用），**不新增**；「纠错 / 赞踩」为**待建**，且其累计条数是 R1′ 的**触发条件**（§7）。

### §6.4 合规三件套（扩展既有硬约束）

现有 AI system prompt **已具备**硬约束（必须含风险提示、不做买卖建议、「不构成投资建议」）→ **已具备，需扩展覆盖**，补三件套：① **留存期限**（复盘快照的保存期限与自动清理策略）；② **导出权**（用户可导出自身复盘数据）；③ **授权同意**（埋点与快照存储需显式同意，配合 §6.1 的埋点链路打通）。

## §7 路线图（R0′ / R1′ / R2′，触发式）

### §7.1 R0′（本方案执行范围）——收窄案

| 段 | 内容 | 责任角色 | 验收标准（四证口径） |
|---|---|---|---|
| R0′-1 | 扩展 `ui-guard`：三条新基线（`dataSource` 契约断言 / 分域伪数据扫描 + 白名单 / e2e 覆盖扩展） | hermes-be + 主理人 | grep 证脚本改动存在；读文件证判据逻辑；**首次运行须报出 IP-12**（活体验证）；`npm run guard` 退出码符合预期 |
| R0′-2 | CI 补 vitest job（先非阻断） | hermes-be | `ci.yml` 含新 job（grep）；一次真实 CI 运行结果归档 |
| R0′-3 | 静默降级显式暴露（启动横幅 + health `dbType`） | hermes-be | 读文件证两处落位；命中断言时横幅/字段可见 |
| R0′-4 | 基线分环境 + 禁 `eq`（股票数 5541/5544 双口径） | hermes-be | 读文件证 `range/gte` 与分环境分支存在 |
| R0′-5 | 清偿 IP-12 / IP-18 / IP-19（+ IP-20 残余复核） | hermes-be | 每项：grep + 读文件；端点级 `dataSource` 契约断言通过 |
| R0′-6 | 用户侧回头看卡最小闭环（快照存储 + 超额收益基准 + 卡片） | hermes-be（后端/迁移） + mimo-fe（前端） | 新增 `.sql` 迁移存在；卡片页面 **e2e 渲染断言**通过；快照含 `dataSource` 与三层超额收益字段 |
| R0′-7 | 独立验证与走查 | red-team / qa-swarm | red-team 只读复现全部断言；qa-swarm 输出走查报告 |
| R0′-8 | 文档同步（`.claude/CLAUDE.md:73-81` 口径、`DEPLOY.md`、`docs/ARCHITECTURE.md`） | 主理人（独占） | grep 证旧口径已替换 |

### §7.2 R1′（**触发式**，不设时间表）

**触发条件（二者同时满足）**：**纠错/采纳信号累计 ≥ 200 条** **且** **用户体系启用**。

内容：埋点生产链路接通（`clair-worker/worker.js` 注册 `analytics` 路由）→ 信号入库 → 游戏化接线（`touchDaily` 调用点、5/9 计数器触发点）→ 复盘周期化（在 `setInterval` 中新增唯一合法用途：周期复盘）。

### §7.3 R2′（触发式）

内容：**评估器分叉**——研发侧维持确定性机读真值；用户侧在**实测校准**后引入 agent judge（此时才使用 §3 的自偏好 / 位置偏见修正口径与「每臂 ≥50-100 / ≥200」经验门槛）。

> 被**砍出 R0′** 的能力：embedding 记忆层、bandit、judge。理由：pgvector 未启用（P1-08）、评估器不可复用（§4.1）、用户侧真值延迟噪声（§6.2）。

## §8 多 Agent 协作计划

### §8.1 运行时状态声明（**必须如实写明**）

旧 `clair-swarm` 六名成员 —— **fe-agent / be-agent / fin-agent / news-agent / ai-fix-agent / general-purpose-4** —— 其运行时状态**全部 unresumable**：**不可自动恢复**、**不得声称其仍在运行**、须按角色**重建**。

> 诚实说明：任务台账中这 6 项虽显示为 completed，但其**会话运行时已终止且不可 resume**；本方案不依赖其运行时状态。

### §8.2 角色表（重建）

| 角色 | 职责 | 文件域（写权） | 交付物 |
|---|---|---|---|
| **主理人** | 编排 / 验收；**`done` 的唯一设置者**；**独占** `PLAN.md` / `DECISION_LOG.md` / 路由挂载 | `PLAN.md`、`DECISION_LOG.md`、路由挂载点、本设计文档 | 决策记录、验收结论、任务卡 |
| **hermes-be** | 后端 / 门禁 / 迁移 | `backend/src/**`、`backend/src/db/migrations/**`、`.github/workflows/ci.yml`、`frontend/scripts/ui-guard/**` | 三条基线、vitest job、`.sql` 迁移、IP-12/18/19 修复 |
| **mimo-fe** | 前端 / UX | `frontend/src/**`（**不含** `frontend/e2e/`） | 回头看卡 UI、游戏化接线（R1′） |
| **red-team** | 独立验证（**只读** + `frontend/e2e/`） | `frontend/e2e/**`（仅新增/维护用例） | 反例探针、四证复核报告 |
| **qa-swarm** | 真人走查 | **只读**（不落 `src`） | 走查报告（缺陷 / 体验 / 数据异常） |

### §8.3 约束与顺序

- **文件域零交集**：上表写域两两无交集；跨域需求走主理人改派任务卡。
- **单通道红线**：任一时刻只允许一个「活跃写码通道」；`mimo-fe` 与 `hermes-be` 不得同轮改同一文件域。
- **依赖顺序**：R0′-1/2/3/4（门禁与暴露）→ R0′-5（欠账清偿）→ R0′-6（用户侧闭环）→ R0′-7（独立验证）→ R0′-8（文档同步）。
- **交付纪律**：每张任务卡为**四元组** `{task_id, 文件清单, 验收标准, 核验命令}`（§4 协议骨架 ①）。

## §9 风险登记册

| ID | 风险 | 现状证据 | 影响 | 缓解 |
|---|---|---|---|---|
| R1 | **门禁假红** | 股票数双口径 5541 / 5544 | 门禁不可用 | 基线 `range`/`gte` + 分环境，禁 `eq`（§5.6） |
| R2 | **静默降级** | `backend/src/db/dbFactory.ts:11-59`（20 只 mock 股票） | 用户看到假数据 | 启动横幅 + health `dbType`（§5.5） |
| R3 | **埋点生产断链** | `backend/src/api/analytics.ts` 不在 `clair-worker/worker.js` 路由 | 信号永远进不来 | R1′ 接通（§7.2） |
| R4 | **用户体系未启用** | `LoginPage.tsx` 未挂路由；`backend/src/api/user.ts` 内存 Map | 无法按用户隔离 | R0′ 不依赖 `user_id`（§6.3） |
| R5 | **既有资产被高估** | `frontend/src/services/eventBus.ts` 零生产引用（死代码）；成长系统「壳已建、线未接」（`touchDaily` 无调用者 → `streakDays` 恒 0 → 伴生情绪恒 `sleepy`；5/9 计数器无触发点） | 设计建立在不存在的能力上 | §1.1 / §1.3 明示；复用即登记为新建接线；R1′ 接线清单 |
| R6 | **文档漂移** | `DEPLOY.md` / `docs/ARCHITECTURE.md` 仍写旧 Nginx + Docker；`.claude/CLAUDE.md:73-81` 第 3 条仍为 `curl`、第 2 条 vitest 未在 CI 跑 | 后人按旧口径验收 | R0′-8 文档同步（§7.1） |
| R7 | **pgvector 未启用** | 无 `CREATE EXTENSION vector`；依赖无 pgvector | 向量检索方案不可落地；带过滤检索会**静默退化**（需 ≥0.8.0 `hnsw.iterative_scan`） | R0′ 不含记忆层；附录 B 标注门槛 |
| R8 | **IP-20 销号口径争议** | 后端已收口（第 116 轮），但 `frontend/src/utils/fundFlowPageDemo.ts` 前端 demo 仍在 | 「已完成」与「仍有伪数据」并存 | R0′-5 残余复核；必要时重开 IP-20 |
| R9 | **引用外推风险** | 自偏好 / 位置偏见数值来自他人模型与任务，阈值不可移植 | 结论可能被误当普适 | 任何阈值须在自身数据实测（§3 统一纪律） |
| R10 | **归因失效** | 个股涨跌由市场 beta 主导 | reward 装的是市场噪声，闭环学错 | 超额收益基准（个股 vs 行业指数 vs 沪深300，§6.2） |
| R11 | **用户侧真值延迟 / 噪声** | 周期天-周、多因子混淆 | 评估器不可与研发侧共用 | §4.1 复用边界；judge 延至 R2′ |
| R12 | **欠账清偿引入新伪数据** | IP-12 目标文件历史上曾为活跃在途写码 | 修复即倒退 | 每项以 `dataSource` 契约断言 + grep 双重验收（§5.7） |

## §10 决策记录（D26-1 ~ D26-10）

| 编号 | 决策 | 依据 |
|---|---|---|
| **D26-1** | **执行范围 = R0′ 收窄案**：只做「协议骨架复用 + 补用户侧 Verify 闭环」；**砍掉** embedding 记忆层与 bandit / judge，改为**触发式重启**（触发条件：纠错/采纳信号累计 ≥200 条 **且** 用户体系启用） | 用户侧闭环未闭合（§1.2）；pgvector 未启用（P1-08）；评估器不可复用（§4.1） |
| **D26-2** | **复用边界**：协议骨架 5 条可复用；评估器**不可复用**；删除 `eval-gate ←→ eval_cases` 双向箭头 | §4.1（P0-2） |
| **D26-3** | **核验协议 = 四证**；`curl` 降级为**存活探测**；路由/页面级改动**强制 e2e 渲染断言** | 第 101 轮实证 + `PLAN.md:289` 永久告示块（P0-3） |
| **D26-4** | **诚实红线口径** = `dataSource` 契约断言 + 分域伪数据扫描（白名单）；**AST 扫描保持 CI 阻断级，不降级** | mock 探针逻辑不成立；AST 已是阻断门禁（P0-3 / P1-13） |
| **D26-5** | **同批清偿 4 项欠账**：IP-12（P0）/ IP-18 / IP-19 / IP-20（残余复核）；门禁首次运行须报出 IP-12 作为捕获力活体验证 | §5.7 |
| **D26-6** | 用户侧 R0′ **不依赖 `user_id` 隔离与鉴权** | 用户体系未启用（P1-14 / R4） |
| **D26-7** | 基线**分环境** + **禁 `eq`**（股票数双口径） | P1-12 / R1 |
| **D26-8** | 数据源**静默降级必须显式暴露**（启动横幅 + health 字段） | P1-11 / R2 |
| **D26-9** | 合规**三件套**（留存期限 / 导出权 / 授权同意）；既有 system prompt 硬约束「已具备，需扩展覆盖」 | 补充-1 |
| **D26-10** | 旧 `clair-swarm` 六成员运行时**全部 unresumable**，**按角色重建**（主理人 / hermes-be / mimo-fe / red-team / qa-swarm） | §8.1 |

## 附录 A：引用修正清单

| 类别 | v1.0 内容 | V2 处置 |
|---|---|---|
| ❌ 删除 | 「Thompson 每臂 ≥30 才比较」；「自我偏好 20-30%」「金融/临床/法律域一致率 60-68%」 | 前者**找不到任何文献支持**，替换为 **≥50-100 再倾斜 / ≥200 才解读量级**（明标**经验值非文献定论**）；后者仅见于**同一篇厂商博客**，无一手论文 / 样本量 / CI，且被 2026 年新证据部分反驳，**删除** |
| ✅ 替换 | 自偏好数值 | **Zheng et al. 2023（MT-Bench, NeurIPS 2023）**：自偏好胜率 GPT-4 **+10%** / Claude-v1 **+25%** |
| ➕ 新增 | 位置偏见 | **Shi et al. IJCNLP-AACL**：位置偏见**可翻转结论**，候选质量接近时最主导 |
| 🔎 收窄 | 「DeepSeek-V3.1 配 ACE 可追平 GPT-4.1 级 agent」 | ACE（**arXiv:2510.04618, ICLR 2026**）在 **AppWorld 均分** 上以开源 DeepSeek-V3.1 大致追平榜首 IBM-CUGA（**60.3% vs 59.4/59.5**，GPT-4.1 驱动）；**论文自述该比较仅为语境参照、非方法学基线、不做直接比较**；机制（Generator-Reflector-Curator + 结构化 delta 防上下文坍缩）属实 |
| 🔄 更新 | GEPA「超 GRPO 10%」（旧版四项任务口径） | 最新版：**六项任务平均超 GRPO 约 6%、最高 20%**；rollout **最多少 35 倍**；补硬边界——**依赖可执行/可打分的反馈函数** |
| ⚠️ 限定 | 「in-context bandit RL 负反馈几乎学不动」 | 原文（**arXiv:2410.05362**）归因是 **exploration 缺失**，且承认**有显式 CoT 推理时模型能从错误中学习**；**限定为二值奖励分类任务**；不可作普适规律 |
| ✅ 沿用 | ICLR 2024 自纠错（**arXiv:2310.01798**）「无外部信号的自纠错会把对改错」 | 沿用，补三个限定词：**intrinsic** self-correction + **reasoning 任务** + **GPT-4 一代模型** |
| ➕ 新增 | 嵌入与检索 | **DeepSeek 无官方 embedding API**（截至 2026-09 核实，官方仅对话模型）；硅基流动托管 **BAAI/bge-m3 = 1024 维、免费档、OpenAI 兼容**；`partial HNSW` 索引**合法**（DDL 不报错） |
| ❌ 更正 | 混合检索当作 BM25 | PG 原生 `tsvector` / `ts_rank_cd` **不是 BM25**；混合检索用 **RRF 融合**（或 ParadeDB `pg_search`） |

## 附录 B：核心 DDL 示意

> ⚠️ **状态声明**：本仓库**未启用 pgvector**（无 `CREATE EXTENSION vector`，依赖中无 pgvector）。下表 DDL 为**示意**，落地前须先满足版本门槛；R0′ **不包含**向量检索。迁移一律落 **`backend/src/db/migrations/`** 下的 **`.sql`** 文件（现有 `003_performance_indexes.sql` / `performance_indexes.sql` / `004_industry_chains.sql` / `strategy_templates.sql`，**无 .ts**）。

### B.1 R0′：复盘快照（无向量依赖，可直接落地）

```sql
-- 示意：复盘快照（只 delta 追加；非 real 数据不入库）
CREATE TABLE review_snapshots (
  snapshot_id   BIGSERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  as_of         DATE        NOT NULL,
  symbols       TEXT[]      NOT NULL,
  ai_claims     JSONB       NOT NULL,          -- AI 上轮判断（结构化）
  benchmark     JSONB       NOT NULL,          -- 三层超额收益：个股/行业指数/沪深300
  data_source   TEXT        NOT NULL,          -- 与 dataSource 契约同名，'real' 方可入库
  notes         TEXT
);
CREATE INDEX idx_review_snapshots_as_of ON review_snapshots (as_of DESC);
```

### B.2 R2′：检索（**门槛未满足，暂不落地**）

| 能力 | 版本门槛 | 备注 |
|---|---|---|
| HNSW 索引 | pgvector **≥ 0.5.0** | 需先 `CREATE EXTENSION vector`（当前**未启用**） |
| 带 WHERE 过滤的向量检索 | pgvector **≥ 0.8.0**（`hnsw.iterative_scan`） | 否则小选择性谓词下**静默退化** |
| 混合检索 | PG 原生 `tsvector` + **RRF 融合**（或 ParadeDB `pg_search`） | `ts_rank_cd` **≠ BM25** |
| 嵌入维度 | **1024**（BAAI/bge-m3，硅基流动托管 / 免费档 / OpenAI 兼容） | DeepSeek **无官方 embedding API** |
| 部分索引 | `partial HNSW` **合法**（DDL 不报错） | 索引裁剪策略待 R2′ 实测 |

## 待核验清单（写作中无法确证、不臆造）

| # | 事项 | 需核实内容 |
|---|---|---|
| 1 | 「无历史复盘存储」 | 是否已有相关表/迁移（本次未逐一比对全部迁移文件） |
| 2 | `ReviewPage.tsx:925-941` 行号 | 本次未逐行复核该区间 |
| 3 | `ChatPanel.tsx:472-494` / `:272-311` 行号 | 本次未逐行复核 |
| 4 | 前端 853 / 后端 614 测试文件数与用例数 | 采用评审给定值，未本地全量统计 |
| 5 | `Math.random` 前端计数 | 同口径独立复核为 **51-55**（差异随 `_archived` 是否计入），本节统一采用 **55 / 合计 110** |
| 6 | IP-20 销号口径 | 后端已收口 vs 前端 demo 残留，是否应重开 |
| 7 | `analytics` 在 `clair-worker/worker.js` 的缺失 | 采用评审结论，未逐行通读 worker 路由表 |
| 8 | 复盘快照的合规留存期限具体值 | 需合规输入后确定 |
