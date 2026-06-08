# Clair (AStock) 研发计划

> 更新于 2026-06-08 | 状态：Phase 8 进行中 — 数据质量提升

## 核心原则

**Clair 是当前最高优先级项目**。定位：AI陪伴式投资研究助手。
核心循环：发掘 → 筛选 → 自选 → 复盘

## 当前状态

| 指标 | 状态 |
|------|------|
| 构建 | ✅ 通过（Vite + tsc 0错误） |
| 测试 | ✅ 17749/17750 通过 |
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

## Phase 8: 数据质量提升 🔄 进行中

### 任务
- [x] 全量A股数据完整性验证 — 已导入5541只A股到PostgreSQL
- [x] 行业/板块/概念标签准确性 — 所有股票均有行业标签
- [ ] 实时行情数据源稳定性
- [ ] 历史数据回补

## Phase 9: 交互体验优化 📋 计划中

### 任务
- [ ] 页面间数据流串联
- [ ] AI对话体验优化（Streaming）
- [ ] 移动端适配
- [ ] 加载状态与错误处理

## Phase 10: 策略引擎 📋 计划中

### 任务
- [ ] 策略模板系统
- [ ] 自定义筛选条件
- [ ] 策略回测
- [ ] AI策略推荐

## Phase 11: 性能优化 📋 计划中

### 任务
- [ ] 后端查询优化
- [ ] 前端渲染性能
- [ ] 缓存策略
- [ ] 数据库索引优化

## Phase 12: 部署与监控 📋 计划中

### 任务
- [ ] 生产环境部署
- [ ] 性能监控
- [ ] 错误追踪
- [ ] 用户分析

## 相关文件

- 项目代码：`~/.openclaw/workspace/a-stock-website/`
- GitHub：https://github.com/EgoBai/clair.git
