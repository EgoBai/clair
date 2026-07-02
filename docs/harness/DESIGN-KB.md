# 设计知识库 — Clair (澄观)

> 持续更新。每次 CAPTURE 阶段追加条目。

## 设计系统

### 色板（暗色主题）
```
背景:    #0f172a (BG)
卡片:    #1e293b (CARD)
边框:    rgba(148,163,184,0.1)
涨(红):  #cf2a2a (UP)    — 中国A股惯例
跌(绿):  #1db468 (DOWN)
强调:    #3b82f6 (ACCENT)
金色:    #f59e0b (GOLD)
文字主:  #f8fafc (TEXT)
文字副:  #94a3b8 (TEXT_SEC)
文字弱:  #64748b (TEXT_MUTED)
```

### 字体
```
标题: 24px/700 #f8fafc
副标题: 16px/600 #f8fafc
正文: 14px/400 #f8fafc
辅助: 12px/400 #94a3b8
数字: font-variant-numeric: tabular-nums
```

### 间距
```
页面padding: 16px
卡片间距: 12px
组件内间距: 8px-16px
最大宽度: 1400px (居中)
```

### 圆角
```
卡片: 8px
按钮: 6px
标签: 4px
```

## 组件模式

### 状态组件 (StateComponents.tsx)
已存在但未完全使用：
- `LoadingState` — 加载中
- `EmptyState` — 空数据
- `ErrorState` — 错误+重试
- `PageTitle` — 页面标题

**规则**: 新页面/重构时优先使用这些统一组件

### 图表模式
- ECharts: `echarts-for-react` 组件
- 暗色tooltip: `backgroundColor: 'rgba(30,41,59,0.96)'`
- 暗色导出: `backgroundColor: '#0f172a'`
- K线红涨绿跌: `color: '#cf2a2a'` (阳线) `color0: '#1db468'` (阴线)

### 表格模式
- Ant Design Table + `size="small"`
- 暗色背景: `style={{ background: 'transparent' }}`
- 行悬浮: `rgba(59,130,246,0.05)`
- 虚拟滚动: 6000+行时加 `virtual` prop

### 卡片模式
```tsx
<Card
  size="small"
  style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 8 }}
  title={<span style={{ fontWeight: 700, color: TEXT, fontSize: 14 }}>标题</span>}
>
```

## 交互模式

### 加载状态
- 首次加载: 骨架屏 (Skeleton)
- 刷新: Spin overlay
- 按钮加载: Button loading prop

### 空状态
- 无数据: Empty + 描述文字
- 无搜索结果: Empty + "暂无符合条件的..."

### 错误处理
- API错误: message.error toast
- 页面崩溃: ErrorBoundary fallback
- 网络错误: 重试按钮

### 响应式断点
```
xs: 0-480px   (手机竖屏)
sm: 481-768px (手机横屏/小平板)
md: 769-1024px (平板)
lg: 1025-1440px (桌面)
xl: 1441px+   (大屏)
```

### 移动端导航
- ≤768px: 隐藏侧边栏，显示底部TabBar
- TabBar 4个核心tab: 发掘/筛选/自选/复盘
- 穿透页(雷达/详情/回测等): 返回按钮导航

## 页面布局模板

### 标准页面
```
[页面标题] + [操作按钮]
[筛选/统计卡片 row]
[主内容 area]
```

### 详情页面
```
[面包屑] + [标题] + [操作按钮]
[股票基本信息 row]
[图表/数据 area]
[AI分析 area]
```

### 列表页面
```
[页面标题] + [操作按钮]
[筛选条件 row]
[表格/列表]
[分页]
```

## 图表配色方案

### K线图
- 阳线(涨): #cf2a2a (红)
- 阴线(跌): #1db468 (绿)
- MA5: #f59e0b (金)
- MA10: #3b82f6 (蓝)
- MA20: #8b5cf6 (紫)
- MA60: #ec4899 (粉)
- BOLL: rgba(59,130,246,0.4) (蓝半透)

### 雷达图
- 主色: #3b82f6 (蓝)
- 面积: rgba(59,130,246,0.2)
- 网格: rgba(148,163,184,0.2)

### 热力图
- 涨: 红色系 (#ef4444 → #dc2626)
- 跌: 绿色系 (#22c55e → #16a34a)
- 平: 灰色 (#64748b)
