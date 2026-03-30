# 错误处理与恢复模式

## 设计理念

参考 Linear / Notion 的极致体验：
- 用户不应该看到白屏
- 每个错误都应该有明确的恢复路径
- 自动重试优于手动重试
- 开发者需要详细的错误信息

## 架构

```
ErrorBoundary (React 边界)
├── 错误捕获 - componentDidCatch
├── 自动重试 - maxRetries (默认3次)
├── 错误上报 - 收集到 errorReports 数组
├── 友好 UI - 图标 + 文案 + 操作按钮
├── HOC 工具 - withErrorBoundary(Component)
└── resetKeys - prop 变化自动重置
```

## 错误分级

### L1 - 可自动恢复
- 网络超时
- API 暂时不可用
- WebSocket 断连
- **处理**：指数退避重连 + 降级数据

### L2 - 需用户确认
- 数据校验失败
- 操作权限不足
- **处理**：错误提示 + 引导操作

### L3 - 不可恢复
- 组件渲染崩溃
- 致命 JS 错误
- **处理**：ErrorBoundary 捕获 + 重试

## 恢复策略

### 自动重试
```typescript
// 指数退避：1s → 2s → 4s → 8s → 最大30s
delay = Math.min(1000 * Math.pow(2, retry), 30000);
// 随机抖动 ±20% 避免惊群
delay *= (0.8 + Math.random() * 0.4);
```

### 降级策略
1. **缓存降级** - 优先使用本地缓存
2. **模拟数据** - 后端不可用时使用模拟数据
3. **空状态** - 所有手段失败时显示友好空状态

### 错误上报
- 开发环境：Console 详细输出
- 生产环境：可对接 Sentry / 自建日志系统
- 收集最近 50 条错误报告

## 组件体系

| 组件 | 用途 |
|------|------|
| `ErrorBoundary` | 基础错误边界 |
| `EnhancedErrorBoundary` | 增强版（自动重试 + HOC） |
| `ErrorState` | 可重试错误展示 |
| `DisconnectedState` | 网络断开状态 |
| `LoadingState` | 统一加载状态 |
| `EmptyState` + variants | 各场景空状态 |

## 最佳实践

1. **每个页面区域独立 ErrorBoundary** - 一个组件崩溃不影响其他区域
2. **重试次数限制** - 避免无限重试循环
3. **resetKeys** - 数据依赖变化时自动重置错误状态
4. **开发模式详细信息** - 生产环境不暴露技术细节
5. **错误边界命名** - `name` 属性帮助定位问题来源
