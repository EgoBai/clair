# 离线模式设计

## 概述

离线模式允许用户在网络断开时继续使用已缓存的数据，并在网络恢复后自动同步操作。

## 核心组件

```
offlineMode.ts
├── OfflineCache         # IndexedDB 缓存层
├── OfflineQueue         # 离线操作队列
├── OfflineManager       # 离线管理器
└── React Hooks
    ├── useNetworkStatus()
    ├── useOfflineCache()
    └── useOfflineQueue()
```

## 缓存策略

### IndexedDB 存储

- **cache** 对象存储: 缓存 API 响应数据
  - `key`: 缓存键
  - `data`: 缓存数据
  - `timestamp`: 缓存时间
  - `ttl`: 生存时间 (默认5分钟)
  - `version`: 版本号

- **offlineQueue** 对象存储: 待同步操作
  - `id`: 操作唯一ID
  - `type`: 操作类型
  - `payload`: 操作参数
  - `timestamp`: 创建时间
  - `retryCount`: 重试次数

### 数据获取流程

```
请求数据
  → 检查 IndexedDB 缓存
  → 有缓存且未过期? → 返回缓存
  → 在线? → 从 API 获取 → 更新缓存 → 返回新数据
  → 离线? → 有缓存? → 返回过期缓存 (标记 stale)
  → 无缓存? → 抛出错误
```

### 离线操作队列

```
用户操作 (离线)
  → 加入 IndexedDB 队列
  → 网络恢复
  → 逐个执行队列操作
  → 成功 → 移除
  → 失败 → 重试 (最多3次)
  → 超过最大重试 → 标记失败
```

## React Hooks

### useNetworkStatus()

```typescript
const { status, isOnline } = useNetworkStatus();
// status: 'online' | 'offline' | 'reconnecting'
// isOnline: boolean
```

### useOfflineCache()

```typescript
const { data, loading, error, isStale, refresh } = useOfflineCache(
  'cache-key',
  () => fetch('/api/data').then(r => r.json()),
  5 * 60 * 1000 // 5分钟TTL
);
```

### useOfflineQueue()

```typescript
const { pendingCount, enqueueAction, processQueue } = useOfflineQueue();

// 离线时添加操作
await enqueueAction('add_watchlist', { symbol: '600519.SH' });

// 网络恢复后处理
await processQueue();
```

## 用户体验

1. **离线提示**: 顶部横幅显示网络状态
2. **Stale 标记**: 离线缓存数据标记为"可能已过期"
3. **操作队列**: 离线操作有计数器显示待同步数
4. **自动恢复**: 网络恢复后自动处理队列并刷新数据
5. **渐进降级**: 优先保证可读性，写操作延迟执行

## 缓存清理

- **自动清理**: 定期清理过期缓存条目
- **手动清理**: `clearCache()` 清除所有缓存
- **最大条目**: 默认 1000 条，LRU 淘汰
