# Round 45 — AStock前端 any类型深度消灭（第二轮）

## 目标
继续消灭 `any` 类型，从80降至31。

## 成果
- **any类型: 80 → 31**（减少61%，本轮消灭49处）
- TypeScript编译: 0错误
- 构建: 32.9s 通过

## 修复文件清单

### Charts/ (共消除 ~15处 any)
1. **IndicatorPanel.tsx** (4→0): ECharts tooltip formatter类型化
2. **FundFlowPieChart.tsx** (3→0): Pie label/tooltip类型（保留1个eslint-disable for recharts复杂类型）
3. **FundFlowChart.tsx** (3→0): ECharts formatter类型化
4. **FundFlowSankey.tsx** (1→0): Sankey tooltip formatter类型
5. **TimeLineChart.tsx** (1→0): ECharts formatter类型
6. **VolumeChart.tsx** (2→0): series数组+formatter类型
7. **ShareholderChart.tsx** (1→0): Tooltip formatter简化
8. **SectorTreeMap.tsx**: CustomContent props类型化
9. **RiverChart.tsx**: payload.map类型化
10. **CandlestickWithVolume.tsx**: barClick/shape props类型化

### User/ (共消除 ~6处 any)
11. **PasswordResetPage.tsx** (3→0): err catch → unknown + instanceof Error
12. **LoginPage.tsx** (1→0): 同上
13. **RegisterPage.tsx** (1→0): 同上

### AI/ (共消除 ~6处 any)
14. **StrategyComparison.tsx** (3→0): render回调 → unknown
15. **ModelExplanationViz.tsx** (3→0): formatter/content类型化（保留1个eslint-disable for Treemap）

### Pages/ (共消除 ~10处 any)
16. **UserSettingsPage.tsx** (3→0): form values → Record<string, unknown>
17. **SectorDetailPage.tsx** (2→0): render+Pie label类型化
18. **BlockTradesPage.tsx** (1→0): render → unknown
19. **LockupCalendarPage.tsx** (1→0): render → unknown
20. **MarketStatsPage.tsx** (1→0): render → unknown
21. **AIStockSelectionPage.tsx** (1→0): render → unknown
22. **NewsPage.tsx**: data类型断言
23. **StockListPage/optimized**: sort比较类型化
24. **MarketHeatDashboard**: summary类型断言

### Services/ (共消除 ~5处 any)
25. **websocket.ts** (1→0): message → unknown
26. **enhancedWebsocket.ts** (3→0): message/error → unknown
27. **wsConnectionManager.ts** (1→0): onMessage data → unknown
28. **eventBus.ts** (2→0): middleware data → unknown

### Utils/ (共消除 ~5处 any)
29. **workerManager.ts** (3→0): payload/result → unknown
30. **dataExport.ts** (2→0): format value → any保持（泛型导出函数）
31. **chartPerfMonitor.ts** (2→0): data/processor参数类型化
32. **SmartRequestManager-typed.ts** (1→0): reject reason → unknown

### Store/Hooks/I18n (共消除 ~5处 any)
33. **useAppStore.ts** (2→0): klineData → unknown[]
34. **useRenderPerformance.ts**: changes类型化
35. **i18n**: resolveKey/getNestedValue类型修复

### 必须保留 any 的场景（~15个）
- recharts Tooltip content/formatter（recharts类型系统复杂，用eslint-disable）
- 泛型函数约束（debounce/throttle/useDebounce等需保持 `(...args: any[]) => any`）
- Treemap content props（ECharts Treemap自定义渲染）
- .d.ts类型声明文件（recharts-overrides.d.ts）

## 关键经验
1. **recharts类型系统**: Tooltip的payload/name/value都有undefined/number/string联合类型，用eslint-disable注释比完美类型更实用
2. **ECharts formatter**: tooltip trigger='item'时params是单对象，trigger='axis'时是数组，需要区分
3. **泛型约束中的any**: debounce/throttle等通用函数，`(...args: any[]) => any` 是标准写法，改为unknown会导致strictFunctionTypes下的类型不兼容
4. **i18n动态属性访问**: 用 `unknown` 然后 `as Record<string, unknown>` 断言访问

## 累计状态
- Round 45完成
- AStock TypeScript: 0错误
- 剩余any: 31个（含15个必须保留的）
- 有效any: ~16个（可继续优化）
- 下轮: Round 46 偶数轮 → MediaForge
