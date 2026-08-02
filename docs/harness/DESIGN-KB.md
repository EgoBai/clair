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
- 后端未接入: Empty + 显式说明"…由后端实时接口提供, 当前后端未接入, 暂无可展示数据"

### 🚫 诚实数据红线 (硬约束, 2026-08-03 立)

**任何情况下, 接口失败 / 返回空 都不得回填演示数据。** 这是产品可信度底线,
一次违反就会让用户对全站数据失去信任。

- ❌ 禁止: `catch { setData(buildDemoXxx()) }` — 用假数据掩盖后端不可用
- ❌ 禁止: `setData(list.length > 0 ? list : DEMO_LIST)` — 空即降级演示
- ❌ 禁止: 用「演示数据」Tag 标注后照常展示假数值 — 标注不等于免责
- ✅ 正确: `catch { setData([]) }` + 渲染 `<Empty description="…后端未接入…">`
- ✅ 正确: `resolveDataSource(payload, isEmpty, false)` — 第三参 `demoFallback`
  必须传 `false`, 让空/失败归为 `unavailable`(红色"数据不可用"横幅), 而非 `demo`

**背景**: F19 专项已逐页清除 12 个页面 + 3 个 utils 生成器的演示兜底
(详见 `clair-realdata-audit-20260731.md` §11)。新增页面请直接遵循本条,
不要再引入 demo 兜底后等待事后清理。

### 错误处理
- API错误: message.error toast
- 页面崩溃: ErrorBoundary fallback
- 网络错误: 重试按钮
- 数据为空/接口失败: 如实置空 + Empty, 严禁 demo 兜底(见上方红线)

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
