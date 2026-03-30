# 渲染性能优化设计文档

## 概述
参考 Google Core Web Vitals 标准，针对大数据量场景进行渲染性能优化。

## 优化方向

### 1. 虚拟滚动
- 只渲染视口内的 DOM 元素
- overscan 缓冲区避免快速滚动白屏
- O(1) 计算复杂度

### 2. 批量状态更新
- 使用 requestAnimationFrame 合并多次状态更新
- 减少不必要的重渲染

### 3. 防抖渲染
- 高频更新场景（WebSocket 实时数据）使用节流
- 保证帧率稳定

### 4. 稳定化引用
- useStableObject / useStableArray
- 避免子组件因引用变化重渲染

### 5. 分块渲染
- 大列表分批处理，每批之间让出主线程
- 避免长任务阻塞 UI

### 6. 数据缓存
- 前端内存缓存（DataCache 类）
- TTL 过期 + 按模式失效
- 减少重复 API 请求

### 7. 渲染性能分析
- RenderProfiler 测量渲染耗时
- 超过 16ms 帧预算自动警告
- P50/P95/P99 统计

## 工具清单
| 工具 | 用途 |
|------|------|
| calculateVirtualScroll | 虚拟列表计算 |
| useBatchedUpdates | 批量更新 |
| useThrottledRender | 节流渲染 |
| useStableObject | 稳定引用 |
| chunkedRender | 分块处理 |
| DataCache | 数据缓存 |
| RenderProfiler | 性能分析 |

## 参考
- Google Core Web Vitals
- React 官方性能优化指南
