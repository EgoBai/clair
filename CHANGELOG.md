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
