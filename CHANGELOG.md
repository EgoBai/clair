# Changelog

All notable changes to the A股行情分析网站 project.

## 📜 战略里程碑 / Strategic Milestones (D4–D8)

> 本段汇总澄观 Clair 近期的关键战略决策与交付里程碑；详细版本条目见下方。

### 战略重构决策 D4–D8
- **D4 数据源重构**：接入内资 + 外资专业数据源（Tushare Pro / AkShare / Alpha Vantage，统一经后端代理），提升数据广度与质量。
- **D5 AI 能力升级**：全部 AI 功能接入真实大模型（非规则引擎），并构建游戏化体验闭环 **探索 → 求证 → 决策 → 复盘 → 成长**。
- **D6 轻量静态 UI 守卫先行**：在重型重构前先建立低成本、可回归的 UI 质量基线（见 `npm run guard`）。
- **D7 前端现代化多端 + 小程序**：制定 React 19 审慎升级、动效、状态管理、设计 token、多端共存边界与 Taro 4 小程序移植路线。
- **D8 版本历史与项目主页同步**（本任务）：将战略文档与版本历史同步至 GitHub 仓库主页（CHANGELOG.md / README.md）。

### 内核完成 R301–R400（百轮迭代）
- 约 **19,215 行**代码、100+ 功能模块落地。
- 覆盖：个股技术分析、持仓风险管理、图表交互、用户体验升级、社区/笔记/观点、智能提醒、北向资金/融资融券、个股深度/行业比较、宏观经济/全球市场联动、数据导入导出、系统设置个性化。

### 市场洞察页硬伤修复（近期）
- 修复 `DiscoverPage` 六级逻辑硬伤：`displayMode` 未声明致命 bug、死状态、热力图独立区块重构、二级行业/概念板块数据补全、多维数据兜底。
- 修复 `++` 重复符号显示 bug。
- 新增 demoData 回归测试 **164 项全绿**；`tsc` + `build` 通过。

### 轻量静态 UI 质量守卫 D6 / S6-1
- 新增 `npm run guard`（ts-morph AST + 正则/数据基线扫描）。
- 基线扫描 **585 文件 = 0 ERROR**。
- 发现并报告 **6 处死 `useState`** 与 **9 处硬编码空兜底**（INFO 级，未阻断构建）。

### 前端现代化战略 D7
- 新增架构师《前端现代化技术战略》与产品经理《前端体验设计语言》两份文档（见 `design/` 与 `requirements/`）。
- 关键决策：React 19 审慎升级、`motion` 动效、Zustand 保持、CSS 变量 token 单一真相源、antd5 + echarts 共存边界、Taro 4 小程序可移植、P0–P3 四阶段迁移。

---

## [3.8.2] - 2026-07-29 (第24轮 — 导航 IA 响应式补齐：T6 移动端 TabBar 5+更多 Sheet + T8 详情页面包屑)

### Added
- **T6 移动端 TabBar「5 主入口 + 更多」**（`TabBar.tsx` 63→155 行 + `responsive.css` +70 行）：保留洞察/选股/自选/产业 4 主 Tab，新增「更多」Tab 展开底部 Sheet，动态复用 `NAV_GROUPS` 配置（过滤 4 主 Tab 已覆盖路径，空分组剔除），移动端与桌面侧栏导航体系完全同步；激活态三级判定（主 Tab / 更多 Tab / Sheet 子项 aria-current），触控 ≥48px + safe-area。
- **T8 详情页面包屑补齐**（3 页各 +11/12 行）：FinancialsPage（首页→股票 `/stocks`→财务三表·symbol）、IndexDetailPage（首页→指数名）、SectorDetailPage（首页→产业地图→板块名），复用 StockDetailPage 既有 Breadcrumb 模式，全部链接指向真实路由（守卫复扫 P0=0）。

### Quality
- tsc 0 错；build 5.07s 一次过；guard P0=0（INFO 非阻塞）；E2E chromium 20/20；10 核心路由 curl 全 200。
- 导航 IA 剩余 Ticket：T7 平板折叠、T12。

## [3.8.1] - 2026-07-29 (第23轮 — 收尾第22轮未提交改动：RAG ChatPanel 接入 + T11 导航单测 + 轮14遗留断言清理)

### Added
- **RAG 一期 ChatPanel 接入补全（主理人）**：`ChatPanel.tsx` 接线 `knowledgeRetrieval.retrieveRelevantNotes` / `buildRagContext`——发送前检索用户投资笔记，命中≥1条以 `system` 角色注入对话上下文（含 `pageContext.symbol` 精确过滤），气泡显示「已参考 N 条笔记」蓝 Tag，`Message.ragNoteCount` 字段扩展；检索失败静默容错不影响对话。补全第19轮 RAG 一期中缺失的 UI 落地环节。

### Fixed
- **T11 导航单测修复（主理人）**：旧 `NavigationMenu.test.tsx` 面向 v3.8.0 重构前实现（emoji 图标、移动端 ☰/✕ 抽屉、overlay、`.nav-tooltip`），实测 **7/16 失败**。重写为 17 用例匹配新两级折叠侧栏：6 分组渲染 / 24 子项全覆盖 / 链接 href 与 navGroups 配置一致性 / 折叠交互 + `localStorage(clair-nav-collapsed-groups)` 持久化与恢复 / 当前路由组强制展开 / `aria-expanded`·`aria-current` 可访问性 / 首页精确匹配 + 详情级前缀匹配激活态。**17/17 全绿**。
- **清理 2 处第14轮遗留过期断言**：① `prerenderConfig.test.ts` 预渲染路由下限 `≥8`→`≥6`（第14轮 UI 守卫回收 2 条死路径 /news、/dashboard 后有效路由为 6 条）；② `emptyStates.test.tsx` 空态按钮导航期望 `/advanced-screener`→`/screener`（第14轮将该死路径修正为 /screener，StateComponents.tsx:237）。全量单测回归 **17,704 用例全绿**。

### Quality
- 收尾验证：tsc 0 错 / build 8.13s 一次过 / guard ERROR=0（9 INFO 非阻塞）/ 全量单测 17,704 通过 / RAG ChatPanel 接线类型校验通过。

---

## [3.8.0] - 2026-07-29 (第22轮 — 用户拍板 D15/D3/D14/D2：导航 IA 上线 + 全局搜索复活 + 真实 AI 验证)

### Added
- **D15 导航 IA 推荐案 A 上线（T1-T3，Mimo）**：新建 `frontend/src/config/navGroups.ts`（126 行，6 组投研工作流分组 24 页面全覆盖：市场总览/个股研究/资金面/组合与风控/量化实验/成长旅程，antd 实名 icon + ROUTE_PATHS 常量引用）；`NavigationMenu.tsx` 重构为两级可折叠侧栏（341 行：分组折叠状态 localStorage `clair-nav-collapsed-groups`、当前路由组强制展开、aria-expanded/aria-current/44px 触控）。**16+ 个原先只能 URL 直达的页面首次获得导航入口**。
- **D3 GlobalSearch 复活（T4+T5，Hermes）**：`AppLayout.tsx` 顶部挂载 Header 搜索区，孤儿组件 `GlobalSearch.tsx` 首次接线——onSearch 双路合并（`/api/stocks?search=` 真实股票搜索 + 新建 `pageIndex.ts` 24 页面跳转索引），onSelect 分流（股票→个股详情/页面→直达路由）；**⌘K 快捷键复活**（既有处理器随 `data-search-input` 挂载自动生效）。SearchResult 扩展可选 `path` 字段。
- **D2 启动：小程序迁移评估**：新建 `design/miniprogram-migration-assessment.md`（150 行）——推荐 Taro 4.x React（明确不推荐原生/uni-app）；MVP 6 页窄而深；SSE 流式经 `wx.request enableChunked` 可原生消费后端零改造；**最高风险为金融类目审核合规（证券投资咨询资质）**；POC 四件套待拍板。

### Verified
- **D14 端到端真实 AI 验证通过**：`backend/.env` 已配置 DeepSeek key（AI_PROVIDER=deepseek），`/api/ai/chat` 真实流式输出验证成功（茅台问答逐 token SSE）——AI 链路"通电"确认，非演示兜底。剩余缺口：TUSHARE_TOKEN/ALPHAVANTAGE_KEY 未配置，fund-flow 仍演示兜底。

### Changed
- 侧栏样式全面 token 化：清除 `#1a1a2e/#16213e` 渐变与 `#667eea/#764ba2` 紫色硬编码，统一 `--bg-*/--text-*/--accent-*` 设计变量；GlobalSearch 下拉面板深色主题适配（8 处硬编码色→token）。

### Quality
- tsc 0 错 / build 5.28s 一次过 / guard P0=0 / E2E chromium 20/20 / 6 关键路由 200 / grep 计数复核全部属实。

---

## [3.7.1] - 2026-07-29 (第20轮 — 低风险清理：RAG 检索单测 + T8 路由常量补齐)

### Added
- **RAG 检索引擎单元测试**：新增 `frontend/src/utils/__tests__/knowledgeRetrieval.test.mts`（21 用例全绿，tsx 直跑独立可复现）——覆盖中文 bigram/英文 token 分词、字段加权排序（tags×3 > question×2 > answer×1）、symbol 精确命中 +5（query token 与 opts.symbol 双路径）、180 天时间衰减区间验证、limit 截断与降序、空态（空 query/无命中/空库）、`buildRagContext` 前缀/单条截断/整体 1200 字上限；Node 环境注入内存版 localStorage shim。

### Fixed
- **T8 清零**：`routes/paths.ts` 补齐 4 条既有可达路由缺失的 `ROUTE_PATHS` 常量（`INDEX_DETAIL: /index/:symbol`、`SECTOR_DETAIL: /sectors/:symbol`、`RADAR: /radar`、`KNOWLEDGE: /knowledge`），路径字符串与 `routes/index.tsx` 完全一致，不改动任何路由行为（第19轮导航 IA 审计发现项，亦为 IA 实施 T10 前置）。

### Quality
- tsc 0 错 / build 5.20s 一次过 / guard P0=0 / E2E chromium 20/20 / 7 关键路由 200 / RAG 单测 21/21。

---

## [3.7.0] - 2026-07-28 (第19轮 — P3 知识库 RAG 一期 + D7 导航 IA 方案)

### Added
- **知识库 RAG 一期（P3 差异化首块，无需任何 API key）**：新增 `frontend/src/utils/knowledgeRetrieval.ts`（158 行）——确定性本地检索引擎：中文双字 bigram + 英文/数字 token 分词，加权打分（tags×3 / question×2 / answer×1 / symbol 精确 +5）+ 180 天线性时间衰减，`buildRagContext` 将命中笔记压缩为 ≤1200 字系统提示。
- **ChatPanel 检索增强注入**（+25 行）：发送消息前检索用户投资笔记，命中 ≥1 条时以 `system` 角色注入对话上下文（现有系统提示后、历史消息前），AI 回复气泡显示「已参考 N 条笔记」蓝色 Tag；检索失败静默跳过，不影响流式/降级/防重复既有逻辑。
- **D7 导航信息架构方案**：新增 `design/navigation-ia-proposal.md`（336 行，纯文档）——33 路由现状全审计（15+ 页面仅 URL 直达不可发现）、6 组投研工作流分组推荐案 + 5 阶段旅程导航备选案、GlobalSearch Header 恢复集成点（D3 联动）、移动端底部 Tab 响应式策略、12 个实施 Ticket 拆解。**待用户拍板（D15）后进入实现**。

### Fixed / Found
- 审计附带发现：⌘K 全局搜索快捷键处理器存在但目标组件未挂载，实际失效（D3 新证据）；4 条路由缺 `ROUTE_PATHS` 常量（新观察项 T8，待补齐）。

### Quality
- tsc 0 错；build 4.54s 一次通过；ui-guard P0=0；E2E chromium 20/20；6 关键路由 200。

---

## [3.6.0] - 2026-07-28 (第18轮 — D4 前端收官 + P2 游戏化二期 UI 首秀)

### 新增
- **D4-b 资金流前端页**（`frontend/src/pages/FundFlowPage.tsx` 411行 + `utils/fundFlowPageDemo.ts` 130行，路由 `/fund-flow`）
  - 5 区块：市场资金概览 / 个股资金流查询（GET `/api/fund-flow/:symbol` 趋势图）/ 行业资金流排行（GET `/industry` 条形图+表）/ **外资视角**（GET `/global`，Alpha Vantage 骨架数据）/ 数据源状态条（`dataSource` Tag：真实源 blue、演示 gold）+ `/meta` provider 链诊断折叠面板
  - 每请求 try/catch + AbortController 超时；后端不可达时 LCG 种子 20260728 确定性演示兜底，页面不空转
  - **D4 全链路闭环：后端 5 适配器骨架（3.5.0）+ 前端消费展示（本版）**，真 key（D14）到位即端到端真实数据
- **P2-b 游戏化二期 UI 首秀**（用户可见）
  - 新建成长中心 `JourneyPage`（263行，路由 `/journey`）：成长概览（等级/称号/XP进度）/ 14 成就墙 / 任务面板（daily/weekly/onboarding）/ 伴生助手卡
  - `track()` 埋点接入 4 高频页：StockDetail(`stock_viewed`) / Screener(`page_visited_distinct`) / KnowledgeBase(`note_created`) / Backtest(`backtest_run`)，均 ≤9 行最小侵入
  - ChatPanel 头部注入伴生状态（情绪 emoji + 昵称，+13 行），不触碰对话/流式/降级逻辑

### 质量
- 前端 tsc 0 错 / build 4.44s / guard P0=0 / E2E chromium 20/20 / 6 路由 200；新页 chunk（JourneyPage/FundFlowPage）确认生成

---

## [3.5.0] - 2026-07-28 (第17轮 — D4 资金流适配器骨架 + P2 游戏化 store 一期)

### 新增
- **D4-a 资金流后端适配器骨架**（`backend/src/services/fundFlowProviders.ts` 415行）
  - 统一 `FundFlowProvider` 接口 + 5 适配器：Tushare Pro（POST api.tushare.pro moneyflow，env `TUSHARE_TOKEN`）/ AkShare（HTTP 代理，env `AKSHARE_PROXY_URL`）/ Alpha Vantage（FX_DAILY 国际资金视角，env `ALPHAVANTAGE_KEY`）/ Eastmoney（既有）/ Demo（FNV-1a^20260728+LCG 确定性链尾兜底）
  - `resolveProviderChain()` 优先级链 + `getFundFlowMeta()` 诊断；真 key 到位一键切换（D14 选项C）
  - fund-flow API 新增 `GET /meta`、`GET /global`（外资视角骨架）、响应体 `dataSource` 字段；`.env.example` 记录 3 key
- **P2-a 游戏化状态机一期**（`frontend/src/config/gamification.ts` 158行 + `frontend/src/store/useGamificationStore.ts` 239行）
  - 配置驱动：10 级投研叙事成长曲线 + 14 成就 + 7 任务（daily/weekly/onboarding）+ 伴生情绪配置
  - 五切片 progression/counters/achievements/quests/companion；`track()` 一次埋点联动计数/成就解锁/任务推进/xp 发放（防重复）
  - persist `clair-gamification`（partialize）+ useShallow 细粒度 hooks；零 UI 侵入，UI 挂载二期

### 修复
- **fund-flow 既有路由顺序 bug**：`/fund-flow/industry` 原注册在 `/:symbol` 之后被参数路由吞掉，静态路径（/meta /global /industry /batch）全部前置
- fund-flow 历史与行业兜底 `Math.random` 非确定性 mock 全清，改为 DemoProvider 确定性生成（主理人复核补修行业分支 2 处遗漏）

### 质量
- 前端 tsc 0 错 / build 5.17s / guard P0=0 / E2E chromium 20/20 / 6 路由 200；后端 tsc 维持基线无新增

---

## [3.4.0] - 2026-07-28 (第16轮 — 战略重构 P1 单点真实化收官)

### 新增
- **知识库「AI 润色」**（`frontend/src/utils/notePolish.ts` 48行 + `KnowledgeBase.tsx` +95行 + `knowledgeStore.updateEntry`）
  - 真实 LLM 链路：aiClient.chat → 后端 LLM 网关（落实 D5：非本地模板规则）
  - 15s 超时保护；原文 vs 润色稿对比 Modal，用户确认「采用」才覆盖
  - 失败降级不做假润色，仅提示"原文未改动"；已润色笔记带「AI 润色」Tag

### 变更
- **AI 端点 mock 全清**（`backend/src/api/ai-chat.ts` +150行）
  - `/ai/diagnose/:symbol`、`/ai/strategy` 由硬编码"示例股票"切换为真实 DB 数据（`getStockWithLatestQuote` + 技术/财务指标末项）
  - DB 未命中时 FNV-1a+mulberry32 确定性演示兜底；响应新增 `dataSource: 'real' | 'demo'` 字段（结构向后兼容）
  - `/ai/market-insight-llm` 经幂等检查确认此前已接真实板块数据
- 至此战略重构 **P0（基建硬化）+ P1（单点真实化）两阶段完成**；真实 AI 端到端输出仅差 DeepSeek API key（D14）

### 质量
- 前端 tsc 0 错 / build 4.33s / guard P0=0 / E2E chromium 20/20 / 6 关键路由 200；后端 tsc 无新增错误

---

## [3.3.0] - 2026-07-27 (第15轮 — 战略重构 P0 基建硬化启动)

### 新增
- **后端 LLM 网关健壮性** (`backend/src/services/llmGateway.ts`，约260行)
  - 请求超时（非流式 30s / 流式首字节 20s，AbortController）
  - 指数退避重试（默认2次，仅网络错误/429/5xx，4xx 不重试）
  - 按 provider 熔断器（连续5次失败 open 60s → half-open 探测，`CircuitOpenError` 快速失败）
  - 内存计量：调用/失败/token 计数，`getGatewayStats()` 暴露
  - `aiService.ts` 6 处上游调用统一接入 `gatewayFetch`，对外签名与降级语义不变
- **ChatPanel 流式化 + 降级承接** (`frontend/src/components/AI/ChatPanel.tsx` + `utils/aiChatFallback.ts`)
  - `chat()` → `chatStream()` 打字机增量渲染，首包 15s 超时（Promise.race）
  - 流失败/超时降级本地确定性演示回复（FNV-1a+LCG 种子），消息附「降级·演示」徽标
  - 发送中防重复（输入/按钮禁用）

### 质量
- 前端 tsc 0 错 / build 5.86s / guard P0=0 / E2E chromium 20/20 / 8 关键路由 200
- 后端 tsc 无新增错误（维持基线）

## [3.2.0] - 2026-04-25 (Round 113 — parseFloat 假零陷阱系统性修复)

### 修复
- **后端数据管道 parseFloat||0 系统性修复** (DataSyncService.ts + advanced-screener.ts + screener.ts)
  - 47 处 `parseFloat(x) || 0` / `parseInt(x) || 0` 替换为 `Number.isFinite()` 守卫
  - 引入 `pf()`/`pn()`/`pi()` 辅助函数消除重复模式
  - 修复 `catch (error) { // 忽略解析错误 }` 为结构化日志输出
  - 可空字段（peRatio, marketCap, MA 等）使用 `pn()` 返回 `number | null`
- **dbFactory 代理测试修复** (dbFactory.test.ts)
  - 修复 `as unknown as Promise<T>` 导致的函数引用未调用 bug (2处)

### 质量
- 全量测试 32,980/32,980 通过，0 回归
- 累计 parseFloat||0 消除率:~49/115(43%)
- 累计 bug 修复: 105+

## [3.0.0] - 2026-03-30 (Round 104 - 用户系统增强)

### 新增
- **用户认证系统增强** (`utils/userEnhanced.ts` + `components/User/`)
  - 密码重置流程（邮箱验证、30分钟有效期、频率限制、防枚举）
  - 邮箱验证系统（24小时有效期、60秒冷却重发、功能限制提示）
  - Session管理（最多5设备、7天有效期、远程登出、批量登出）
  - 登录安全（5次/15分钟锁定、IP异常检测、登录日志）
- **前端用户UI组件** (`components/User/`)
  - LoginPage: 邮箱验证、记住我、加载状态、Enter键提交
  - RegisterPage: 密码强度指示器、昵称验证、确认密码校验
  - PasswordResetPage: 四步重置流程（输入邮箱→邮件已发送→重置密码→成功）
  - SessionManager: 设备列表、当前设备标记、远程登出确认
- **认证服务** (`services/auth.ts`)
  - Token自动管理（localStorage、自动刷新、过期检测）
  - authFetch: 带认证的请求封装
  - 状态订阅机制：登录状态变化通知
  - rememberMe支持（30天 vs 1小时）

### 测试
- 新增 87 个测试（后端49 + 前端38）
- 总测试数: 18037

## [2.1.0] - 2026-03-24 (第17轮迭代)

### 新增
- **大宗交易数据** (`api/block-trades.ts` + `BlockTradesPage.tsx`)
  - 大宗交易列表（日期/股票筛选、分页）
  - 概览统计（笔数/金额/折溢价分布）
  - 个股大宗交易历史
  - 溢价/折价分布可视化
- **股东增减持数据** (`api/shareholder-changes.ts` + `ShareholderChangesPage.tsx`)
  - 增/减/新/退 4种变动类型
  - 机构/个人股东类型区分
  - 概览排名
  - 四色统计卡片
- **限售股解禁日历** (`api/lockup-shares.ts` + `LockupCalendarPage.tsx`)
  - 日历组件标注解禁事件
  - 解禁市值排行
  - 4种解禁类型
  - 高占比红色警示
- **AI智能选股** (`api/ai-stock-selection.ts` + `AIStockSelectionPage.tsx`)
  - 5种策略：价值/成长/技术/动量/逆向
  - 个股AI诊断（5维度评分+四档评级）
  - 行业轮动分析（10行业+四阶段模型）
  - 智能预警建议
- **渲染性能优化工具** (`utils/renderOptimize.ts`)
  - 虚拟滚动、批量更新、节流渲染、稳定引用
  - RenderProfiler 性能分析器
  - DataCache 前端数据缓存
  - 分块渲染（不让主线程阻塞）

### 改进
- 后端新增 4 个 API 路由（9个端点）
- 前端新增 4 个页面 + 4 个路由
- 侧边栏新增 4 个菜单项
- API 层新增 14 个函数
- 共享类型扩展 7 个接口
- 新增 61 个测试用例（后端37 + 前端24）
- 新增 4 篇设计文档
- 版本升级至 v1.6.0

### 文件清单（21个文件）
| 文件 | 操作 |
|------|------|
| `backend/src/api/block-trades.ts` | 新建 |
| `backend/src/api/shareholder-changes.ts` | 新建 |
| `backend/src/api/lockup-shares.ts` | 新建 |
| `backend/src/api/ai-stock-selection.ts` | 新建 |
| `frontend/src/pages/BlockTradesPage.tsx` | 新建 |
| `frontend/src/pages/ShareholderChangesPage.tsx` | 新建 |
| `frontend/src/pages/LockupCalendarPage.tsx` | 新建 |
| `frontend/src/pages/AIStockSelectionPage.tsx` | 新建 |
| `frontend/src/utils/renderOptimize.ts` | 新建 |
| `backend/src/__tests__/blockTradesAndAI.test.ts` | 新建 |
| `frontend/src/__tests__/renderOptimize.test.ts` | 新建 |
| `knowledge-base/design/BLOCK-TRADES-DESIGN.md` | 新建 |
| `knowledge-base/design/SHAREHOLDER-AND-LOCKUP-DESIGN.md` | 新建 |
| `knowledge-base/design/AI-STOCK-SELECTION-DESIGN.md` | 新建 |
| `knowledge-base/design/RENDER-PERFORMANCE.md` | 新建 |
| `backend/src/app.ts` | 更新 |
| `frontend/src/main.tsx` | 更新 |
| `frontend/src/components/Layout/AppLayout.tsx` | 更新 |
| `frontend/src/services/api.ts` | 更新 |
| `frontend/src/utils/index.ts` | 更新 |
| `shared/types.ts` | 更新 |

## [2.0.0] - 2026-03-24

### 🎉 终极打磨版 - 第10批迭代

#### 新增
- **图表主题系统** (`utils/chartTheme.ts`)
  - 支持浅色/暗色两套完整主题
  - 红涨绿跌标准配色（A股规范）
  - K线、均线、MACD/KDJ/RSI/BOLL 独立配色
  - 自动检测系统暗色偏好
  - 主题变更订阅机制
- **图表性能优化** (`utils/chartPerformance.ts`)
  - LTTB 采样算法（保留视觉特征的降采样）
  - 均匀采样 + 自适应采样（波动率驱动密度）
  - 大数据分块处理（不阻塞主线程）
  - 虚拟列表计算工具
  - 渲染性能分析器（慢帧检测）
- **增强型错误边界** (`EnhancedErrorBoundary.tsx`)
  - 自动重试机制（最多3次）
  - 错误上报与收集
  - HOC 包裹工具 `withErrorBoundary`
  - 开发模式详细错误栈
  - 支持 `resetKeys` 自动重置
- **空状态组件扩展**
  - `EmptyBacktest` - 回测空状态
  - `EmptyPortfolio` - 投资组合空状态
  - `EmptyNews` - 新闻空状态
  - `EmptyScreenerResult` - 选股器无结果
  - `EmptySocial` - 社交讨论空状态
  - `LoadingState` - 统一加载状态
  - `PermissionDeniedState` - 权限不足状态
- **模块 Barrel Exports**
  - `components/Charts/index.ts`
  - `components/Common/index.ts`
  - `hooks/index.ts`
  - `utils/index.ts`
- **测试覆盖**
  - `chartSystem.test.ts` - 图表主题+性能测试 (25+ 用例)
  - `emptyStates.test.tsx` - 空状态+错误边界测试 (30+ 用例)

#### 改进
- **EmptyStates 组件** 新增 7 个预设空状态
- **导入路径规范化** 通过 barrel exports 统一模块导出
- **错误边界** 升级为支持自动重试和错误收集
- **README** 全面更新，反映项目最新状态

#### 文件清单

| 文件 | 操作 | 描述 |
|------|------|------|
| `utils/chartTheme.ts` | 新建 | 图表主题系统 |
| `utils/chartPerformance.ts` | 新建 | 图表性能优化 |
| `components/Common/EnhancedErrorBoundary.tsx` | 新建 | 增强错误边界 |
| `components/Common/EmptyStates.tsx` | 更新 | 新增 7 个空状态 |
| `components/Charts/index.ts` | 新建 | Charts barrel export |
| `components/Common/index.ts` | 新建 | Common barrel export |
| `hooks/index.ts` | 新建 | Hooks barrel export |
| `utils/index.ts` | 新建 | Utils barrel export |
| `__tests__/chartSystem.test.ts` | 新建 | 图表系统测试 |
| `__tests__/emptyStates.test.tsx` | 新建 | 空状态+错误边界测试 |

---

## [1.0.0] - 2026-03-24

### 🏗️ 初始版本 - 9批迭代（12轮）

#### 核心功能
- **实时行情系统** - WebSocket 实时推送、分时图、K线图
- **技术指标引擎** - MACD/KDJ/RSI/BOLL/EMA 计算
- **股票搜索** - 8级智能匹配 + 拼音首字母
- **自选股系统** - 分组管理、拖拽排序
- **选股器** - 多条件组合筛选 + 高级筛选
- **预警系统** - 价格/涨跌幅/成交量预警
- **回测引擎** - 均线交叉/RSI/MACD 三种策略
- **投资组合** - 持仓管理、资产配置饼图
- **新闻资讯** - 分类筛选、情感标签
- **AI 分析** - 行情解读、止盈止损、板块轮动
- **复权引擎** - 前复权/后复权/不复权
- **社交功能** - 投资观点分享
- **国际化** - 中英文双语

#### 工程化
- **安全加固** - OWASP Top 10 全覆盖、SQL注入/XSS检测
- **性能监控** - Web Vitals 6项核心指标
- **PWA 支持** - Service Worker、离线缓存
- **暗色主题** - CSS 变量系统、自动检测
- **响应式设计** - PC/平板/手机全适配
- **无障碍** - WCAG 2.1 AA 标准
- **CI/CD** - GitHub Actions (lint→test→build→deploy)
- **E2E 测试** - Playwright 覆盖核心流程

#### 测试
- 后端：14 个测试文件，150+ 用例
- 前端：11 个测试文件，120+ 用例
- 覆盖：指标计算、搜索、缓存、复权、回测、新闻、安全

#### 文档
- API 文档 (OpenAPI 3.0)
- 部署指南
- 贡献指南
- 用户手册
- 组件 API 文档
- 9 篇设计文档（知识库）
