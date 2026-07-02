# Clair (AStock) 研发计划

> 更新于 2026-06-27 | 状态：Phase 14 — 质量闭环 + 数据深度

## 核心原则

**Clair 是当前最高优先级项目**。定位：AI陪伴式投资研究助手。
核心循环：发掘 → 筛选 → 自选 → 复盘

## 当前状态

| 指标 | 状态 |
|------|------|
| 构建 | ✅ 通过（Vite + tsc 0错误） |
| 测试 | ✅ 前端 17732/17733 + 后端 14190/14190 通过 |
| 部署 | ✅ GitHub Actions 自动部署 |
| AI核心 | ✅ DeepSeek v4-pro 集成 |
| 核心循环 | ✅ 发掘→筛选→自选→复盘 四页闭环 |
| 导航 | ✅ 4项核心导航 |
| 市场数据 | ✅ 真实DB查询（5541只涨跌/成交/涨跌停） |
| 行业分类 | ✅ 90.5%覆盖率（528只综合/退市） |
| WebSocket | ✅ 实时行情推送已桥接 |
| 筛选逻辑 | ✅ PE/PB/换手率/振幅数据到位 |

## Phase 5: AI原生化 ✅ 完成

- [x] aiService.ts — LLM统一调用层
- [x] ai-chat.ts — AI API路由（9个端点）
- [x] ChatPanel.tsx — 对话界面组件
- [x] narrativeEngine.ts — 叙事引擎升级为LLM
- [x] StockDetailPage — 集成AI诊断
- [x] DeepSeek v4-pro 集成

## Phase 6: 产品打磨 ✅ 完成

- [x] 代码瘦身：归档41个未使用Engine + 31个测试文件
- [x] Prompt优化：AI分析质量提升
- [x] 删除首页，发掘页作为唯一入口
- [x] 筛选页重新设计（核心指标+策略模板）
- [x] 自选页策略信号概览
- [x] 导航精简为4项核心页面

## Phase 7: 页面清理与代码瘦身 ✅ 完成

### 任务
### 任务
- [x] 清理未使用页面（30 → 10）— 20个页面已归档到 `_archived/`
- [x] 路由精简 — 10个路由（4核心+5穿透+404）
- [x] 前端代码分割优化 — 懒加载已配置，vendor包gzip后~817KB
- [x] 后端API端点审查 — 归档3个未使用API（order-book, shareholder-changes, top-traders）

## Phase 8: 数据质量提升 ✅ 完成

### 任务
- [x] 全量A股数据完整性验证 — 已导入5541只A股到PostgreSQL
- [x] 行业/板块/概念标签准确性 — 所有股票均有行业标签
- [x] 实时行情数据源稳定性 — 同步服务支持全量5541只股票
- [x] 历史数据回补 — API支持批量回补120天K线数据

## Phase 9: 交互体验优化 ✅ 完成

### 任务
### 任务
- [x] 页面间数据流串联 — ScreenerPage添加加入自选功能
- [x] AI对话体验优化（Streaming）— 已实现流式输出
- [x] 移动端适配 — DiscoverPage响应式布局
- [x] 加载状态与错误处理 — apiFetch统一错误处理

## Phase 10: 策略引擎 ✅ 完成

### 任务
- [x] 策略模板系统 — PostgreSQL表 + CRUD API + 前端管理
- [x] 自定义筛选条件 — 动态条件构建器 + API模板集成
- [x] 策略回测 — 深色主题BacktestPage + 多策略选择 + 可视化
- [x] AI策略推荐 — DeepSeek集成 + 市场洞察 + 流式响应

## Phase 11: 性能优化 ✅ 完成

### 任务
- [x] 数据库索引优化 — 10+性能索引 + 2个物化视图(mv_market_stats, mv_industry_stats)
- [x] 后端查询优化 — queryOptimizer.ts (批量查询/避免N+1/高效分页)
- [x] 缓存策略 — 内存缓存 + API缓存增强(getStats/getOrSet/cleanup)
- [x] 前端渲染性能 — VirtualList虚拟列表 + performance.ts工具库(防抖/节流/懒加载)

## Phase 12: 部署与监控 ✅ 完成

### 任务
- [x] 生产环境部署 — GitHub Pages + Cloudflare Workers
- [x] 性能监控 — webVitals.ts (FCP/LCP/CLS/FID/TTFB/INP)
- [x] 错误追踪 — UnifiedErrorBoundary + 自动重试
- [x] 用户分析 — analytics.ts + /api/analytics 端点

## Phase 13: AI融合深化 🔄 进行中

### 已完成
- [x] FloatingChat上下文感知
- [x] ChatPanel系统提示注入
- [x] multi-signal端点优化
- [x] normalizeSymbol修复
- [x] stock API symbol修复
- [x] 板块表现NaN修复
- [x] **DiscoverPage v3 重设计** (2026-06-22) — 全宽双栏AI市场解读 + 关键数据高亮 + 数字彩色渲染 + 领涨/领跌速览
- [x] **ScreenerPage v5 增强** (2026-06-22) — 8策略模板 + 10核心指标×5维度 + 策略说明面板 + 振幅/PB/市值列
- [x] **行业分类重分类** (2026-06-22) — 关键词匹配修正334只股票，综合从2151→1823
- [x] **industries路由修复** (2026-06-22) — createRequire + asyncHandler路径修正
- [x] **PostgreSQL行业数据同步** — 本地DB已更新为v2分类
- [x] **Worker POST /api/tech/batch 批量技术指标API** (2026-06-22) — change5d/change20d/ma20/maDeviation/rsi14/volatility20d，并行K线拉取
- [x] **ScreenerPage v5.1 技术指标列** (2026-06-22) — 5日/20日涨跌、MA偏离、RSI14，按页懒加载
- [x] **多Agent协作模式落地** (2026-06-22) — MULTI-AGENT.md 共享简报 + 主编排/子执行/验收闭环

### 待完成
- [ ] Worker部署到Cloudflare Pages（需网络代理）

## Phase 14: 质量闭环 + 产品深度 ✅ 完成 (2026-07-01)

### 成果
- 7项核心bug修复(K线/回测/AI潜力/自选/复盘/多信号/产业地图)
- 潜力雷达+产业地图深度优化
- ECharts按需(-99KB) + recharts分离 + localStorage安全
- AI问答增强(猜你想问+FloatingChat v2)
- 个人知识库(保存/分类/浏览)
- Harness+Loop自主迭代引擎部署

## Phase 15: 数据可靠 + UI打磨 🔄 进行中 (2026-07-01)

### 15.1 数据源可靠性
- [ ] 腾讯API健康监控 + 降级策略
- [ ] 数据新鲜度检查(交易时段<5分钟)
- [ ] EastMoney API同步行业分类(剩余528只)

### 15.2 代码质量
- [ ] 前端TS错误 33→15 (分批修复)
- [ ] 后端TS错误 21→10

### 15.3 移动端适配
- [ ] 6核心页面移动端响应式检查
- [ ] 触控交互优化
- [ ] 字体/间距统一

## Phase 14: 质量闭环 + 产品深度 ✅ 完成

### 14.1 测试修复 ✅
- [x] 后端3个失败测试修复（metrics.ts/industries.ts/industryChain*.ts）
- [x] 前端198个lint warnings修复（unused vars前缀_）
- [x] 前端852文件/17733测试全绿
- [x] 后端588文件/14334测试全绿

### 14.2 API端点验证 ✅
- [x] 所有核心API端点返回200
- [x] market-insight-llm: 真实DB数据 + LLM结构化解读
- [x] watchlist-summary/trade-analysis: 正常返回分析
- [x] industries?level=2: 75个二级行业
- [x] stocks/:symbol/kline: K线数据

### 14.3 AI功能验证 ✅
- [x] AI市场洞察引用真实市场数据（板块景气度/涨跌幅/涨停数/市场宽度）
- [x] LLM生成4段结构化解读（市场基本面/资金面/政策面/风险提示）
- [x] FloatingChat 上下文注入当前页面数据
- [x] 自选股AI追踪总结正常

### 14.4 待完成
- [ ] Worker本地验证（wrangler dev）
- [ ] 生产部署端到端测试

## Phase 13: AI融合深化 ✅ 完成

## 多Agent协作模式

2026-06-22 起采用多Agent协作开发模式：

- **主Agent**负责任务编排与交付验收（拆分模块、下发任务、统一自查/curl/端到端验证）。
- **子Agent**并行执行各模块开发（前端、Worker API、数据修复等），无对话记忆，执行前必读共享简报。
- **文件按归属分区**，每个子Agent只改分配给自己的文件，避免并行写冲突。
- **共享简报**见 `MULTI-AGENT.md`（项目坐标、启动命令、验证标准、架构陷阱、交付规范），弥补子Agent无上下文的缺陷。

## 相关文件

- 项目代码：`~/.openclaw/workspace/a-stock-website/`
- GitHub：https://github.com/EgoBai/clair.git
