# Clair (AStock) 研发计划

> 更新于 2026-06-09 | 状态：Phase 11 完成 — 性能优化

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

## Phase 12: 部署与监控 📋 计划中

### 任务
- [ ] 生产环境部署
- [ ] 性能监控
- [ ] 错误追踪
- [ ] 用户分析

## 相关文件

- 项目代码：`~/.openclaw/workspace/a-stock-website/`
- GitHub：https://github.com/EgoBai/clair.git
