# 图表主题系统设计

## 设计目标

为 A 股行情网站提供统一的图表视觉系统，确保所有图表组件具有一致的配色和交互体验。

## 核心原则

### 1. 红涨绿跌（A股标准）
- 中国股市习惯：红色=涨，绿色=跌
- 所有图表、行情数字统一遵循此规则
- 前端 CSS 变量 `--color-rise` / `--color-fall` 同步

### 2. 主题自适应
- 浅色/暗色两套完整主题
- 自动检测系统偏好（`prefers-color-scheme`）
- 支持手动切换和跟随系统
- 运行时切换无需重新渲染

### 3. 组件级配色
- K线图：涨跌独立配色
- 成交量：半透明涨跌色
- 技术指标：MA(4色) / MACD(DIF/DEA/柱) / KDJ(K/D/J) / RSI(3线) / BOLL(3轨)
- 每个指标组件独立获取配色，不硬编码

## 架构

```
ChartThemeManager (单例)
├── LIGHT_THEME  - 浅色主题定义
├── DARK_THEME   - 暗色主题定义
├── subscribe()  - 主题变更订阅
├── get()        - 获取当前主题
├── set()        - 设置主题
└── autoDetect() - 自动检测

工具函数
├── getEChartsThemeOption() - ECharts 全局配置
├── getKLineChartTheme()    - K线图标准配置
└── getMAColor()            - MA均线颜色
```

## 配色规范

### 浅色主题
| 元素 | 颜色 |
|------|------|
| 涨 | `#EF4444` |
| 跌 | `#22C55E` |
| 平盘 | `#6B7280` |
| 背景 | `#FFFFFF` |
| 网格线 | `#F3F4F6` |
| 十字线 | `#374151` |
| 提示框 | `rgba(17,24,39,0.9)` |

### 暗色主题
| 元素 | 颜色 |
|------|------|
| 涨 | `#EF4444` |
| 跌 | `#22C55E` |
| 平盘 | `#9CA3AF` |
| 背景 | `#111827` |
| 网格线 | `#1F2937` |
| 十字线 | `#D1D5DB` |
| 提示框 | `rgba(255,255,255,0.95)` |

## 使用方式

```tsx
// 组件中获取主题
import { chartThemeManager, getKLineChartTheme } from '@/utils/chartTheme';

// 监听主题变化
useEffect(() => {
  return chartThemeManager.subscribe((theme) => {
    chartRef.current?.setOption({ ... });
  });
}, []);

// 获取K线配色
const klineTheme = getKLineChartTheme(isUp); // isUp: 是否上涨
// klineTheme.itemStyle → { color, borderColor, borderWidth }
```

## 扩展指南

1. 新增主题：在 `chartTheme.ts` 中添加新主题定义
2. 新增指标配色：扩展 `ChartTheme.indicators` 接口
3. 自定义主题色：覆盖 `theme.colors` 对应字段

## 参考

- TradingView 主题系统
- ECharts 自定义主题
- Ant Design 暗色算法
