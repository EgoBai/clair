# 性能优化设计文档

## 概述

A股行情分析网站性能优化基于 Google Core Web Vitals 标准设计。

## 性能指标目标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| FCP | < 1.8s | First Contentful Paint |
| LCP | < 2.5s | Largest Contentful Paint |
| FID | < 100ms | First Input Delay |
| CLS | < 0.1 | Cumulative Layout Shift |
| TTFB | < 800ms | Time to First Byte |
| INP | < 200ms | Interaction to Next Paint |

## 前端优化

### 1. 代码分割 (Code Splitting)

Vite配置4路手动分割:
```typescript
manualChunks: {
  'vendor-react': ['react', 'react-dom', 'react-router-dom'],
  'vendor-antd': ['antd', '@ant-design/icons'],
  'vendor-charts': ['echarts', 'echarts-for-react'],
  'vendor-utils': ['axios', 'dayjs', 'zustand'],
}
```

路由级别分割: 每个页面组件独立chunk，按需加载。

### 2. 资源压缩

- **JS/CSS**: Terser压缩 + drop_console
- **图片**: WebP格式优先，懒加载
- **字体**: WOFF2格式，font-display: swap
- **Gzip**: 服务端开启gzip/brotli压缩

### 3. 缓存策略

**Service Worker 缓存**:
| 资源类型 | 策略 | 缓存时长 |
|----------|------|---------|
| 静态资源 (JS/CSS/字体) | Cache First | 7天 |
| 图片 | Cache First | 30天 |
| 实时行情API | Network First | 30秒 |
| 搜索API | Stale While Revalidate | 60秒 |
| 自选股/配置 | Stale While Revalidate | 2分钟 |
| WebSocket | Network Only | - |
| 新闻/资讯 | Network First | 5分钟 |

**HTTP缓存头**:
- 静态资源: `Cache-Control: public, max-age=31536000, immutable`
- API响应: `Cache-Control: no-cache` + ETag

### 4. 渲染优化

**React优化**:
- `React.memo` 优化列表项渲染
- `useMemo` / `useCallback` 避免不必要计算
- 虚拟列表处理大数据 (>100条)
- 防抖搜索 (300ms)
- 批量状态更新 (requestAnimationFrame)

**骨架屏**:
- 首屏显示骨架屏避免布局偏移 (CLS)
- 12种骨架屏组件覆盖所有页面
- Shimmer动画提升感知性能

### 5. 懒加载

- **图片**: IntersectionObserver 懒加载
- **路由组件**: React.lazy + Suspense
- **图表**: 滚动到可视区域时初始化
- **首屏加载 < 3秒**: 关键路径优先

### 6. 预加载/预连接

```html
<link rel="preconnect" href="https://api.example.com">
<link rel="dns-prefetch" href="https://api.example.com">
<link rel="preload" href="/fonts/main.woff2" as="font" crossorigin>
```

## 后端优化

### 1. API响应压缩
- gzip/brotli 压缩所有API响应
- 压缩级别: 6 (平衡压缩率和CPU)

### 2. 数据库优化
- 连接池: min=2, max=10
- 慢查询监控: >500ms 告警
- 索引优化: 高频查询字段建索引
- 物化视图: 复杂聚合查询

### 3. 缓存层
- 内存缓存: 30秒TTL (实时数据)
- Redis缓存: 5分钟TTL (热点数据)
- 缓存命中率监控

### 4. 限流保护
- 普通API: 120次/分钟
- 同步API: 5次/分钟
- 防止DoS攻击

## 网络优化

### 1. CDN
- 静态资源CDN分发
- 边缘节点缓存

### 2. HTTP/2
- 多路复用
- Server Push (关键资源)
- 头部压缩

### 3. WebSocket
- 指数退避重连
- 心跳检测 (15秒间隔)
- 断线数据补全
- 多数据源容灾

## Web Vitals 监控

### 监控指标
- FCP / LCP / CLS / FID / TTFB / INP
- 资源大小统计
- 自动评级 (good/needs-improvement/poor)

### 报警机制
- LCP > 4s: 警告
- CLS > 0.25: 警告
- FID > 300ms: 警告
- 首屏加载 > 3s: 警告

## 性能测试

### 测试用例
- 虚拟列表计算: 可视区域、边界处理
- 防抖: 延迟执行验证
- 批量更新: 合并多次更新
- 图片懒加载: IntersectionObserver
- 大量数据分批渲染
- 缓存过期机制

### 性能预算
- JS bundle: < 500KB (gzipped)
- CSS: < 100KB (gzipped)
- 首屏图片: < 200KB
- 字体: < 100KB
- 总资源: < 1MB

## 工具链

- **Vite**: 构建工具
- **Terser**: JS压缩
- **Vitest**: 单元测试
- **Playwright**: E2E测试
- **Web Vitals API**: 性能监控
- **Chrome DevTools**: 性能分析

## 持续改进

1. 定期审计bundle大小
2. 监控Web Vitals趋势
3. 优化首屏关键路径
4. 评估新的优化技术
5. A/B测试性能改进
