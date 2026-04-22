# Round 46 — AStock前端 any类型极致消灭（第三轮）

## 目标
继续消灭 `any` 类型，从31降至19。

## 成果
- **any类型: 31 → 19**（减少39%，本轮消灭12处）
- TypeScript编译: 0错误
- 构建: 5.73s 通过

## 修复内容
- Pages render回调: BlockTrades/LockupCalendar → unknown
- StockListPage sorting: aValue/bValue → string|number + String()包装
- NewsPage: data → 显式类型断言
- MarketStatsPage: summary → 显式接口类型
- ErrorBoundary resetKeys → unknown[]
- useHooks deps → unknown[]
- useRenderPerformance changes → unknown
- chartPerfMonitor data/processor → unknown

## 必须保留的19个 any
- **泛型函数约束** (5个): useDebounce/useThrottle/useStableCallback + useCallback内部实现
- **recharts/ECharts复杂组件** (5个): customTooltip/SectorTreeMap/CandlestickShape/ModelExplanationViz content/SectorDetailPage label
- **导出工具函数** (4个): dataExport.ts format/exportToJSON + ExportButton columns
- **workerManager返回类型** (1个): calculateIndicators返回
- **其他** (4个): RiverChart payload/EmptyStates StarOutlined/VolumeChart series/CandlestickWithVolume handleBarClick

## 累计统计
从Round 43结束时的264个any → Round 46结束时的19个any，总共消灭245个（减少93%）。

## 累计状态
- Round 46完成
- AStock TypeScript: 0错误
- 剩余any: 19个（全部为必须保留的场景）
- 下轮: Round 47 奇数轮 → AStock（方向待定）
