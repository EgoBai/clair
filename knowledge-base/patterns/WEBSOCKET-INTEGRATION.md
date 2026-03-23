# WebSocket 实时数据集成模式

## React Hook 设计

### useWebSocket
- 管理连接生命周期
- 提供 subscribe/unsubscribe API
- 自动重连（指数退避）
- 连接状态跟踪

### useRealtimeQuote(symbol)
- 自动订阅指定股票
- 行情更新时自动刷新 state
- 15秒无更新标记 stale（数据可能过期）
- 组件卸载时自动取消订阅

### useRealtimeQuotes(symbols[])
- 批量订阅多只股票
- 自动 diff 新旧 symbols（只增减差异）
- Map 结构高效查找

### useWSMessage(type)
- 监听特定类型消息
- 泛型支持类型安全

## 设计原则

### 与静态数据融合
```
1. 初始加载：HTTP API 获取完整数据
2. 实时更新：WS 推送覆盖静态数据
3. 展示策略：优先显示 WS 数据，回退到 HTTP 数据
```

### 状态指示
- 连接中：黄色 pulse
- 已连接：绿色
- 数据过期：黄色
- 断开：灰色

### 性能考虑
- 避免高频更新导致重绘（throttle）
- 使用 useRef 存储不触发渲染的值
- 条件订阅（只订阅当前页面可见的股票）
