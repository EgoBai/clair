# 错误恢复与加载编排设计

## 概述

前端错误恢复管理器和加载状态编排器，参考 Linear App 极致体验设计。

## 错误分级体系

| 级别 | 含义 | 可重试 | 用户提示 |
|------|------|--------|----------|
| L1 | 客户端错误 (4xx) | 否 | 请求参数有误 |
| L2 | 网络/服务端错误 | 是 | 网络异常/服务器繁忙 |
| L3 | 未知错误 | 否 | 发生未知错误 |

## 错误恢复策略

### 指数退避重试
```
delay = initialDelay × backoffMultiplier^attempt + jitter(±20%)
```

- `initialDelay`: 1000ms
- `backoffMultiplier`: 2
- `maxDelay`: 30000ms
- `maxRetries`: 3

### 优雅降级
1. **重试**：网络错误/5xx
2. **缓存降级**：使用过期缓存数据
3. **空状态**：展示友好的空状态引导

## 加载编排器

### 任务优先级
- `critical`：首屏核心数据（影响首屏时间）
- `high`：重要但非阻塞
- `normal`：常规数据
- `low`：可延迟加载

### 首屏加载优化
目标：**<3秒首屏**

1. 关键任务并行加载
2. 非关键任务延迟加载
3. 骨架屏立即展示
4. 超时自动降级

## 交互反馈统一管理

### 消息类型
- `success`：操作成功（3秒自动消失）
- `error`：错误（5秒自动消失）
- `warning`：警告（3秒）
- `info`：信息提示（3秒）

### 设计原则
- 最多同时显示5条消息
- 最新消息在最上方
- 支持手动关闭
- 支持订阅模式

## 使用方式

```typescript
import { ErrorRecoveryManager, LoadingOrchestrator, FeedbackManager } from './utils';

// 错误恢复
const errorMgr = new ErrorRecoveryManager();
const data = await errorMgr.executeWithRetry('fetch-quote', 
  () => api.fetchQuote('600519'),
  { fallback: () => getCachedQuote('600519') }
);

// 加载编排
const loader = new LoadingOrchestrator();
loader.register('api', 'API数据', 'critical', 5000);
loader.register('chart', '图表', 'high', 10000);
loader.start('api');
// ... 异步完成后
loader.complete('api');

// 交互反馈
const feedback = new FeedbackManager();
feedback.success('自选股添加成功');
feedback.error('网络连接失败');
```
