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
| **MiMoCode** | 前端 UI/UX、多端适配、CSS、组件样式 | 多端响应式适配方案 |
| **Hermes Agent** | 后端 API、数据层、AI 功能、业务逻辑 | 待确认 |

## 文件锁

| 文件 | 锁定者 | 截止时间 | 说明 |
|------|--------|----------|------|
| `frontend/src/services/websocket.ts` | MiMoCode | 已完成 | Socket.IO 改造 |
| `frontend/package.json` | MiMoCode | 已完成 | 添加 socket.io-client |
| `frontend/src/App.css` | MiMoCode | 进行中 | 多端适配 CSS |
| `frontend/src/components/Layout/AppLayout.tsx` | MiMoCode | 进行中 | 布局响应式 |
| `frontend/src/pages/*.tsx` | MiMoCode | 进行中 | 页面响应式 |

## 已完成的改动 (MiMoCode)

### 1. Vite Proxy 修复 ✅
- `frontend/.env` — 从绝对URL改为走proxy
- 效果：API和AI对话端到端可用

### 2. WebSocket Socket.IO 改造 ✅
- `frontend/src/services/websocket.ts` — 原生WebSocket → socket.io-client
- `frontend/package.json` — 添加 socket.io-client 依赖
- 效果：前后端协议对齐，实时行情可推送

### 3. 多端响应式适配 🔄 进行中
- 目标：桌面/平板/手机三端完美适配
- 设计：行业领先的响应式方案

## 待做清单

### MiMoCode
- [ ] 多端适配方案设计
- [ ] AppLayout 响应式改造
- [ ] 核心4页面多端适配
- [ ] 移动端导航改造
- [ ] 触摸交互优化

### Hermes Agent
- [ ] 端到端功能验证
- [ ] ReviewPage 复盘数据验证
- [ ] 生产环境部署验证
