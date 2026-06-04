# Clair (AStock) 研发计划 — AI原生化优先交付

> 更新于 2026-06-03 | 状态：Phase 5 进行中

## 核心原则

**Clair 是当前最高优先级项目**，必须先完成 AI 原生化，再启动 MediaForge 编辑器。

## 当前状态

| 指标 | 状态 |
|------|------|
| 构建 | ✅ 通过（Vite 4.76s + tsc 0错误） |
| 测试 | ✅ 17749/17750 通过 |
| 部署 | ✅ GitHub Actions 自动部署 |
| AI核心 | ✅ aiService + ChatPanel + API路由 |
| AI集成 | 🟡 narrativeEngine已升级，StockDetailPage已集成 |
| API Key | ❌ 需要配置 OPENAI_API_KEY |

## Phase 5: AI原生化（进行中）

### 已完成 ✅
- [x] aiService.ts — LLM统一调用层（OpenAI/Claude/本地）
- [x] ai-chat.ts — AI API路由（6个端点）
- [x] ChatPanel.tsx — 对话界面组件
- [x] aiClient.ts — 前端AI客户端
- [x] narrativeEngine.ts — 叙事引擎升级为LLM
- [x] StockDetailPage — 集成MultiSignalPanel + AI诊断
- [x] .env — AI配置（API Key占位）

### 待完成 🔄
- [ ] **配置 OPENAI_API_KEY**（阻塞所有AI功能）
- [ ] **测试AI对话流程**（启动服务，验证端到端）
- [ ] **DiscoverPage AI解读增强**（替换模板为LLM）
- [ ] **WatchlistPage 智能提醒**（接入AI分析）
- [ ] **ReviewPage AI复盘**（交易行为分析）

### 交付标准
- AI对话界面可用（Streaming打字机效果）
- 个股诊断返回真实LLM分析
- 市场解读由LLM生成（非模板）
- 所有AI功能端到端可测

## Phase 6: 产品打磨（计划中）

### 任务清单
- [ ] 清理未使用的Engine（150+ → 50+）
- [ ] 清理未使用的页面（31 → 10）
- [ ] 前端代码分割优化
- [ ] 后端pytest测试补全
- [ ] 性能监控面板

## 时间线

```
本周（6/3-6/9）：
├── 配置API Key
├── 测试AI对话流程
├── 修复发现的bug
└── 提交 Phase 5 完整版本

下周（6/10-6/16）：
├── DiscoverPage AI增强
├── WatchlistPage 智能提醒
├── ReviewPage AI复盘
└── Phase 5 交付验收

后续：
├── Phase 6 产品打磨
└── 启动 MediaForge 编辑器（依赖 Clair Phase 5 完成）
```

## 依赖关系

```
Clair Phase 5 完成
    ↓
MediaForge 编辑器启动
    ↓
两个项目并行开发
```

**规则：Clair Phase 5 未完成前，不得启动 MediaForge 编辑器的新功能开发。**

## 相关文件

- 复盘报告：`~/.openclaw/workspace/memory/2026-06-01-REVIEW.md`
- 项目代码：`~/.openclaw/workspace/a-stock-website/`
- GitHub：https://github.com/EgoBai/clair.git
