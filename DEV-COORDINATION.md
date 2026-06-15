# 澄观 Clair — 开发协作看板

> MiMoCode + Hermes Agent 并行开发协调
> 最后更新: 2026-06-14

## 协作规则

1. **文件锁机制** — 正在修改的文件记录在此，避免冲突
2. **分工明确** — MiMoCode 负责 UI/UX/多端适配，Hermes 负责后端/API/数据
3. **文档互通** — 每完成一个模块，在此更新状态
4. **冲突预防** — 修改前先查看对方是否在改同一文件

## 当前分工

| 角色 | 负责领域 | 当前任务 |
|------|----------|----------|
| **MiMoCode** | 前端 UI/UX、多端适配、CSS、组件样式 | 多端适配核心框架已完成 |
| **Hermes Agent** | 后端 API、数据层、AI 功能、业务逻辑 | 待确认 |

## 文件锁

| 文件 | 锁定者 | 状态 | 说明 |
|------|--------|------|------|
| `frontend/src/services/websocket.ts` | MiMoCode | ✅ 完成 | Socket.IO 改造 |
| `frontend/package.json` | MiMoCode | ✅ 完成 | 添加 socket.io-client |
| `frontend/src/styles/responsive.css` | MiMoCode | ✅ 完成 | 多端设计系统 |
| `frontend/src/styles/pages-responsive.css` | MiMoCode | ✅ 完成 | 页面响应式规则 |
| `frontend/src/components/Layout/TabBar.tsx` | MiMoCode | ✅ 完成 | 移动端底部导航 |
| `frontend/src/components/Layout/AppLayout.tsx` | MiMoCode | ✅ 完成 | 集成TabBar |
| `frontend/src/components/Layout/NavigationMenu.tsx` | MiMoCode | ✅ 完成 | 移动端隐藏 |
| `frontend/src/main.tsx` | MiMoCode | ✅ 完成 | 导入响应式CSS |
| `frontend/index.html` | MiMoCode | ✅ 完成 | PWA viewport |
| `frontend/src/pages/DiscoverPage.tsx` | MiMoCode | ✅ 完成 | 响应式类名 |
| `frontend/src/pages/ScreenerPage.tsx` | MiMoCode | ✅ 完成 | 响应式类名 |
| `frontend/src/pages/WatchlistPage.tsx` | MiMoCode | ✅ 完成 | 响应式类名 |
| `frontend/src/pages/ReviewPage.tsx` | MiMoCode | ✅ 完成 | 响应式类名 |
| `frontend/public/manifest.json` | MiMoCode | ✅ 完成 | PWA配置 |

## 已完成的改动 (MiMoCode)

### 1. Vite Proxy 修复 ✅
- `frontend/.env` — 从绝对URL改为走proxy
- 效果：API和AI对话端到端可用

### 2. WebSocket Socket.IO 改造 ✅
- `frontend/src/services/websocket.ts` — 原生WebSocket → socket.io-client
- `frontend/package.json` — 添加 socket.io-client 依赖
- 效果：前后端协议对齐，实时行情可推送

### 3. 多端响应式适配 ✅ 核心框架完成
- **设计系统 CSS** (`styles/responsive.css`): 底部TabBar、安全区、卡片化表格、响应式网格
- **页面样式** (`styles/pages-responsive.css`): 各页面专属响应式规则
- **TabBar 组件** (`components/Layout/TabBar.tsx`): 移动端底部4Tab导航
- **AppLayout 改造**: 集成TabBar和响应式CSS
- **NavigationMenu**: 移动端完全隐藏，用TabBar替代
- **DiscoverPage**: 响应式类名替代 window.innerWidth
- **index.html**: viewport-fit=cover + PWA 支持
- **manifest.json**: orientation=any + display_override

## 待做清单

### MiMoCode
- [x] 多端适配方案设计 ✅
- [x] AppLayout 响应式改造 ✅
- [x] 核心4页面多端适配 ✅
- [x] 移动端导航改造（TabBar）✅
- [x] 触摸交互优化 ✅ (touch-interactions.css)
- [x] 卡片化表格组件 ✅ (MobileStockCard.tsx)
- [x] StockDetailPage 响应式 ✅
- [x] IndustryMapPage 响应式 ✅
- [ ] 图表响应式优化（下一步）
- [ ] 回测页面响应式（下一步）
- [ ] 实际效果测试验证（下一步）

### Hermes Agent (最新 140adfc)
- [x] ChatPanel错误日志增强 ✅
- [x] 策略选股筛选条件修复 ✅
- [x] 板块景气度评分逻辑透明化 ✅
- [x] 行业产业链地图页面 (IndustryMapPage) ✅
- [x] 路由系统重构 ✅
- [ ] 端到端功能验证
- [ ] ReviewPage 复盘数据验证
