# PWA + 移动端深度优化

## PWA 支持

### Manifest
- 应用名称、图标、主题色
- standalone 显示模式
- 快捷方式（首页/自选/选股）
- 多尺寸图标（72-512px）
- maskable 图标支持

### Service Worker 策略
| 资源类型 | 策略 | 说明 |
|----------|------|------|
| API 请求 | Network First (5s超时) | 数据新鲜优先 |
| JS/CSS/图片 | Cache First | 加载速度优先 |
| HTML 页面 | Network First (3s超时) | 内容更新优先 |

### 缓存管理
- 版本化缓存名 (`v1.4.0`)
- 激活时自动清理旧缓存
- API 缓存独立管理

### 推送通知
- 浏览器原生 Notification API
- Service Worker 推送支持
- 股价预警通知
- 系统通知

## 移动端组件

### MobileStockCard
- 紧凑布局（左侧信息 + 右侧价格）
- 涨跌着色
- 触摸反馈
- 支持滑动操作

### MobileNavigation
- 固定底部导航栏（5 Tab）
- 毛玻璃效果
- 当前页面高亮
- safe-area-inset 兼容刘海屏

## 触摸手势 (useMobileGestures)
| 手势 | 回调 | 用途 |
|------|------|------|
| 左滑 | onSwipeLeft | 删除/更多 |
| 右滑 | onSwipeRight | 加入自选 |
| 上滑 | onSwipeUp | 展开详情 |
| 下滑 | onSwipeDown | 收起面板 |
| 捏合 | onPinchZoom | K线缩放 |
| 长按 | onLongPress | 上下文菜单 |
| 双击 | onDoubleTap | 全屏/还原 |

### 手势参数
```typescript
swipeThreshold: 50,      // px
longPressDelay: 500,     // ms
doubleTapDelay: 300,     // ms
pinchThreshold: 0.1,     // 缩放比
```

## 响应式设计
- 768px 断点：侧边栏隐藏 → 抽屉菜单
- 480px 断点：更紧凑布局
- 触摸优化：44x44px 最小点击区域

## 最佳实践
- CSS `touch-action` 控制浏览器默认手势
- `passive: true` 优化滚动性能
- `-webkit-tap-highlight-color: transparent` 去除点击高亮
- `env(safe-area-inset-*)` 适配异形屏
