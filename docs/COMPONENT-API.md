/**
 * 组件 API 文档
 * A股行情分析网站前端组件使用指南
 * 
 * 参考 Ant Design 文档标准
 */

# A股行情分析网站 - 组件 API 文档

## 目录

1. [图表组件](#图表组件)
2. [通用组件](#通用组件)
3. [布局组件](#布局组件)
4. [股票组件](#股票组件)
5. [Hooks](#hooks)
6. [工具函数](#工具函数)

---

## 图表组件

### KLineChart - K线图

**文件**: `components/Charts/KLineChart.tsx`

```tsx
import KLineChart from '@/components/Charts/KLineChart';

<KLineChart
  data={klineData}
  height={400}
  showMA={true}
  maPeriods={[5, 10, 20, 60]}
  showVolume={true}
  subIndicator="macd"
  onPeriodChange={(period) => console.log(period)}
/>
```

**Props**:
| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `data` | `KLineData[]` | - | K线数据数组 (必填) |
| `height` | `number` | `400` | 图表高度(px) |
| `showMA` | `boolean` | `true` | 显示均线 |
| `maPeriods` | `number[]` | `[5,10,20,60]` | 均线周期 |
| `showVolume` | `boolean` | `true` | 显示成交量 |
| `subIndicator` | `'volume' \| 'macd' \| 'kdj' \| 'rsi' \| 'none'` | `'volume'` | 副图指标 |
| `onPeriodChange` | `(period: string) => void` | - | 周期切换回调 |

**数据类型**:
```typescript
interface KLineData {
  date: string;       // 日期 'YYYY-MM-DD' 或 'YYYY-MM-DD HH:mm'
  open: number;       // 开盘价
  high: number;       // 最高价
  low: number;        // 最低价
  close: number;      // 收盘价
  volume: number;     // 成交量
  amount?: number;    // 成交额
}
```

---

### TimeLineChart - 分时图

**文件**: `components/Charts/TimeLineChart.tsx`

```tsx
import TimeLineChart from '@/components/Charts/TimeLineChart';

<TimeLineChart
  data={timelineData}
  yesterdayClose={100.50}
  height={300}
/>
```

**Props**:
| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `data` | `TimelineData[]` | - | 分时数据 (必填) |
| `yesterdayClose` | `number` | - | 昨收价 (必填) |
| `height` | `number` | `300` | 图表高度 |

---

### FundFlowChart - 资金流向图

**文件**: `components/Charts/FundFlowChart.tsx`

```tsx
import { FundFlowChart, IndustryFlowChart } from '@/components/Charts/FundFlowChart';

// 个股资金流向
<FundFlowChart data={fundFlowData} height={300} />

// 行业资金流向排行
<IndustryFlowChart data={industryFlowData} height={400} />
```

---

### IndicatorPanel - 技术指标面板

**文件**: `components/Charts/IndicatorPanel.tsx`

```tsx
import IndicatorPanel from '@/components/Charts/IndicatorPanel';

<IndicatorPanel
  data={klineData}
  indicators={['macd', 'kdj', 'rsi', 'boll']}
  height={120}
/>
```

---

## 通用组件

### ErrorBoundary - 错误边界

**文件**: `components/Common/ErrorBoundary.tsx`

```tsx
import ErrorBoundary from '@/components/Common/ErrorBoundary';

<ErrorBoundary fallback={<div>出错了</div>}>
  <YourComponent />
</ErrorBoundary>
```

### ThemeProvider - 主题管理

**文件**: `components/Common/ThemeProvider.tsx`

```tsx
import ThemeProvider from '@/components/Common/ThemeProvider';

<ThemeProvider defaultTheme="system">
  <App />
</ThemeProvider>
```

### Skeletons - 骨架屏

**文件**: `components/Common/Skeletons.tsx`

```tsx
import {
  QuoteCardSkeleton,
  TableSkeleton,
  KLineSkeleton,
  PieChartSkeleton,
  HomePageSkeleton,
  StockDetailSkeleton,
} from '@/components/Common/Skeletons';

// 使用示例
{loading ? <TableSkeleton rows={10} columns={6} /> : <DataTable />}
{loading ? <HomePageSkeleton /> : <HomePage />}
```

**可用组件**:
- `QuoteCardSkeleton` - 行情卡片骨架
- `TableSkeleton` - 表格骨架 (`rows`, `columns` props)
- `KLineSkeleton` - K线图骨架
- `PieChartSkeleton` - 饼图骨架
- `BarChartSkeleton` - 柱状图骨架
- `LineSkeleton` - 折线图骨架
- `CardSkeleton` - 通用卡片骨架
- `HomePageSkeleton` - 首页完整骨架
- `StockDetailSkeleton` - 详情页完整骨架
- `WatchlistSkeleton` - 自选股页骨架
- `NewsSkeleton` - 新闻页骨架
- `ScreenerSkeleton` - 选股器骨架

---

## Hooks

### useWebSocket - WebSocket连接

```tsx
import { useWebSocket, useRealtimeQuote } from '@/hooks/useWebSocket';

// 单股票实时行情
const quote = useRealtimeQuote('600519');
// quote: { price, change, changePercent, volume, ... }

// 批量订阅
const quotes = useRealtimeQuotes(['600519', '000858']);
```

### useKeyboardShortcuts - 快捷键

```tsx
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

// 已预定义 7 个快捷键:
// ⌘/Ctrl + K - 聚焦搜索
// / - 聚焦搜索 (GitHub风格)
// Esc - 关闭弹窗
// Alt + 1/2/3 - 快速导航
// Alt + T - 切换主题
// Backspace - 返回
```

### 通用 Hooks (`hooks/useHooks.ts`)

```tsx
import {
  useDebounce,
  useWindowSize,
  useIsMobile,
  useAsyncData,
  useLocalStorage,
  usePrevious,
} from '@/hooks/useHooks';

const debouncedValue = useDebounce(value, 300);
const { width, height } = useWindowSize();
const isMobile = useIsMobile();
const { data, loading, error } = useAsyncData(fetchFn);
const [stored, setStored] = useLocalStorage('key', defaultValue);
const prevValue = usePrevious(currentValue);
```

---

## 工具函数

### 格式化 (`shared/formatters.ts`)

```typescript
import {
  formatPrice,
  formatVolume,
  formatAmount,
  formatChangePercent,
  formatMarketCap,
  getChangeColor,
  getChangeHexColor,
} from '@shared/formatters';

formatPrice(1234.567)      // '1,234.57'
formatVolume(123456789)    // '1.23亿'
formatAmount(987654321)    // '9.88亿'
formatChangePercent(3.45)  // '+3.45%'
formatMarketCap(1234567890123) // '1.23万亿'
getChangeColor(2.5)        // { color: '#cf1322' } (红涨)
getChangeHexColor(-1.2)    // '#3f8600' (绿跌)
```

### 国际化 (`i18n/index.tsx`)

```tsx
import { useI18n, formatters } from '@/i18n';

const { t, locale, setLocale } = useI18n();
t('nav.home')              // '首页' 或 'Home'
t('stock.price')           // '价格' 或 'Price'
t('stock.change', { value: '+3.5%' }) // '涨跌幅: +3.5%'

formatters.number(1234567, 'zh-CN')  // '1,234,567'
formatters.currency(999999, 'zh-CN') // '¥999,999'
formatters.percent(0.1234, 'zh-CN')  // '12.34%'
formatters.volume(123456789, 'zh-CN') // '1.23亿'
```

### 无障碍 (`utils/accessibility.ts`)

```tsx
import {
  useAriaId,
  SkipLink,
  LiveRegion,
  useFocusTrap,
  useAnnounce,
  useArrowNavigation,
  usePrefersReducedMotion,
} from '@/utils/accessibility';

const id = useAriaId('label');
const announce = useAnnounce();
announce('搜索结果已更新');
const prefersReduced = usePrefersReducedMotion();
```

---

## 状态管理

### Zustand Store (`store/useAppStore.ts`)

```tsx
import { useAppStore, useResolvedTheme, useKlinePeriod } from '@/store/useAppStore';

// 状态
const watchlist = useAppStore(s => s.watchlist);
const theme = useResolvedTheme();
const period = useKlinePeriod();

// 操作
const addToWatchlist = useAppStore(s => s.addToWatchlist);
const toggleTheme = useAppStore(s => s.toggleTheme);
const setKlinePeriod = useAppStore(s => s.setKlinePeriod);

// URL同步
const syncFromURL = useAppStore(s => s.syncFromURL);
const toURLParams = useAppStore(s => s.toURLParams);
```

---

## CSS 工具类

### 涨跌颜色

```css
.text-up      { color: #cf1322; }  /* 红涨 */
.text-down    { color: #3f8600; }  /* 绿跌 */
.text-flat    { color: #8c8c8c; }  /* 平盘 */
.bg-up        { background-color: #fff1f0; }
.bg-down      { background-color: #f6ffed; }
```

### 动画

```css
.fade-in      { animation: fadeIn 0.3s ease; }
.slide-up     { animation: slideUp 0.3s ease; }
.pulse        { animation: pulse 2s infinite; }
.shimmer      { animation: shimmer 1.5s infinite; }
```

### 响应式断点

```css
/* 移动端: < 768px */
@media (max-width: 768px) { ... }

/* 小屏: < 480px */
@media (max-width: 480px) { ... }
```

---

## 最佳实践

1. **加载状态**: 使用骨架屏组件而非简单loading
2. **错误处理**: 组件外层包裹ErrorBoundary
3. **性能**: 使用React.memo优化列表项，使用虚拟列表处理大数据
4. **无障碍**: 交互元素添加aria标签，支持键盘导航
5. **主题**: 使用CSS变量而非硬编码颜色值
6. **国际化**: 文本内容使用t()函数，数字/日期使用formatters

---

## 新增组件 (v2.0)

### 增强型错误边界 (`EnhancedErrorBoundary.tsx`)

```tsx
import EnhancedErrorBoundary, { withErrorBoundary, getErrorReports } from '@/components/Common/EnhancedErrorBoundary';

// 基础使用
<EnhancedErrorBoundary name="ChartPanel" maxRetries={3} onError={handleError}>
  <KLineChart />
</EnhancedErrorBoundary>

// 自定义 fallback
<EnhancedErrorBoundary fallback={(error, retry) => (
  <div>出错: {error.message} <button onClick={retry}>重试</button></div>
)}>
  <Component />
</EnhancedErrorBoundary>

// HOC 包裹
const SafeChart = withErrorBoundary(KLineChart, { name: 'KLineChart' });

// resetKeys - 依赖变化自动重置
<EnhancedErrorBoundary resetKeys={[stockSymbol]}>
  <StockDetail symbol={stockSymbol} />
</EnhancedErrorBoundary>

// 获取错误报告
const reports = getErrorReports(); // ErrorReport[]
```

### 图表主题系统 (`utils/chartTheme.ts`)

```typescript
import { chartThemeManager, LIGHT_THEME, DARK_THEME, getKLineChartTheme, getMAColor } from '@/utils/chartTheme';

// 获取当前主题
const theme = chartThemeManager.get();

// 切换主题
chartThemeManager.set(DARK_THEME);

// 监听主题变化
const unsub = chartThemeManager.subscribe((newTheme) => {
  chartRef.current?.setOption({ backgroundColor: newTheme.colors.bg });
});

// 获取K线配色
const klineStyle = getKLineChartTheme(isUp); // { color, borderColor, itemStyle }

// 获取MA颜色
const ma5Color = getMAColor(0); // '#F59E0B'
const ma10Color = getMAColor(1); // '#3B82F6'
```

### 图表性能优化 (`utils/chartPerformance.ts`)

```typescript
import { sampleData, sampleLTTB, calculateVirtualRange, renderProfiler } from '@/utils/chartPerformance';

// LTTB 采样 (推荐)
const sampled = sampleLTTB(rawData, 200); // 5000点 → 200点

// 通用采样入口
const sampled = sampleData(data, { maxPoints: 200, strategy: 'lttb' });

// 虚拟列表
const range = calculateVirtualRange(totalItems, viewportWidth, itemWidth, scrollLeft);

// 性能分析
renderProfiler.measure('chart-render', () => chart.setOption(opt));
// 超过16ms自动console.warn
```

### 空状态扩展 (`EmptyStates.tsx`)

```tsx
import {
  EmptyBacktest,      // 回测空状态
  EmptyPortfolio,     // 投资组合空状态
  EmptyNews,          // 新闻空状态
  EmptyScreenerResult,// 选股器无结果
  EmptySocial,        // 社交空状态
  LoadingState,       // 统一加载状态
  PermissionDeniedState, // 权限不足
} from '@/components/Common/EmptyStates';

// 使用
<EmptyBacktest />
<LoadingState title="获取行情" description="正在从服务器获取数据..." />
<PermissionDeniedState onLogin={() => navigate('/login')} />
```

### Barrel Exports (统一导入)

```typescript
// 图表组件
import { KLineChart, TimeLineChart, FundFlowChart } from '@/components/Charts';

// 通用组件
import { ErrorBoundary, ThemeProvider, EmptySearch, Skeletons } from '@/components/Common';

// Hooks
import { useWebSocket, useKeyboardShortcuts, useDebounce } from '@/hooks';

// 工具函数
import { formatPrice, chartThemeManager, sampleLTTB } from '@/utils';
```
