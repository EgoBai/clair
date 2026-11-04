# 影子测试普查（M2 第 0 步）

> 生成时间：2026-11-04 03:5x，批次 46 后更新 13:40（Asia/Shanghai）
> 工具：`node scripts/guard/shadow-test-census.mjs [--json]`（只读，不改任何文件）
> 基线：批次 46 后重扫（2026-11-04；13 个 D 类归档已移出扫描范围）

## 一、判定口径

「影子测试」= 测试文件**不 import 任何项目源码**：只 import vitest/第三方，或相对路径仍落在 `__tests__` 内。
它断言的是测试文件里自抄的一份实现（或复制来的数据结构），**项目代码改坏它也不会红**。

统计范围：`backend/src` + `frontend/src` 下全部 `*.test.*` / `*.spec.*`，排除 node_modules。

口径修正（2026-11-04）：此前正则只认行首静态 import，漏判 `await import('../x')` 动态导入，把 34 个真实导入测试误记为影子；census 与 candidates 两个脚本均已补 `import(` 分支，后续数字以新口径为准。

## 二、结论（数字）

| 指标 | 数值 |
|------|------|
| 测试文件总数 | 1,521 |
| 影子测试 | **687（45.2%）** |
| 真实导入 | 834 |
| 影子测试代码行 | **173,372 行** |
| 真实测试代码行 | 190,229 行 |

按行数算，47.7% 的测试代码在断言副本而不是产品代码。

## 三、目录分布

| 目录 | 影子/总数 | 影子占比 |
|------|-----------|----------|
| backend/src/__tests__（扁平） | 362/638 | 56.7% |
| frontend/src/__tests__（扁平） | 325/858 | 37.9% |
| backend/src/__tests__/models | 0/7 | 0% |
| backend/src/__tests__/services | 0/3 | 0% |
| frontend/src/__tests__/components | 0/9 | 0% |
| frontend/src/__tests__/config | 0/3 | 0% |

规律：**分层写进子目录的测试全部真实导入；影子全部堆在两个扁平 `__tests__` 根目录**。

## 四、最大的影子文件（Top 15，按行数）

| 行数 | 文件 |
|------|------|
| 869 | frontend/src/__tests__/userDeepDive.test.ts |
| 682 | frontend/src/__tests__/advancedCandlestickPatterns.test.ts |
| 658 | frontend/src/__tests__/advancedPageLogic.test.ts |
| 637 | frontend/src/__tests__/dashboardCustomization.test.ts |
| 628 | frontend/src/__tests__/serviceWorkerEnhanced.test.ts |
| 610 | backend/src/__tests__/stockLogicComprehensive.test.ts |
| 595 | backend/src/__tests__/tradingEngineDeep.test.ts |
| 576 | backend/src/__tests__/batchCalcsEngine.test.ts |
| 570 | frontend/src/__tests__/macroEconomicAnalysis.test.ts |
| 558 | frontend/src/__tests__/pageDataLogic.test.ts |
| 547 | frontend/src/__tests__/parameterOptimizer.test.ts |
| 546 | frontend/src/__tests__/cssAndVisualization.test.ts |
| 541 | frontend/src/__tests__/tradeSimulator.test.ts |
| 538 | backend/src/__tests__/technicalAnalysis.test.ts |
| 533 | frontend/src/__tests__/dataManager.test.ts |

## 五、迁移策略

不做大爆炸重写（861 个文件一次改必然大面积假红）。按批推进：

1. **批次规则**：单批 ≤30 文件、文件域零交叠、优先纯函数（指标计算/格式化/换算），组件与异步服务靠后。
2. **迁移动作**：删掉文件内自抄实现 → `import` 真实现 → 先跑红再补断言。一个文件一次 commit。
3. **验收**：测试必须 import 到 `src/`；抽 3 个文件做变异抽检（改坏真实现，测试必须失败）。
4. **禁止**：整文件删除冲抵数字（除非能证明被产品代码取代），否则等于用空白换指标。

## 六、已完成的迁移（批次 1 试点）

- `templateFormatter.test.ts`：旧版在文件里自抄 formatNumber/formatRelativeTime/applyConditionRule/formatStockChange，现全部改为 import `services/notification/templateFormatter` 的生产单例，并补上旧版零覆盖的 `render()` 模板语法、stockCode/compact/truncate/chineseAmount；25 tests 全绿。
- 效果：影子 861→860，且这 126 行断言从此能对产品代码回归。

## 六（续）、批次 2（2026-11-04 04:15）

- backend/src/__tests__/notification-service.test.ts：删除 706 行内联 NotificationService 与三套接口副本，改为 import 真实 service.ts / templates.ts / types.ts；40→41 用例（新增非法 actionUrl 白名单负向用例），41/41 通过。
- frontend/src/__tests__/i18nEnhanced.test.ts：formatters/RTL/SEO/语言包/LanguageSwitcher 改为 import 或渲染真实实现，77 例绑定真实代码；Dynamic Locale Loader 8 例生产无对应实现，保留并注释（不硬造生产代码）。85/85 通过。
- 效果：影子 860→858，shadowLoc 227,153→225,750，realLoc 133,658→134,723。
- 顺带发现：真实 createNotification 按 isAllowedActionUrl 白名单丢弃 '/test' 这类非法 actionUrl（旧副本无此校验，旧断言错误）；en-US 相对时间真实输出 '5 min ago'（旧断言 '5min ago' 错误）；均已按真实行为修正。

## 六（续）、批次 3（2026-11-04 04:52）

- backend/src/__tests__/quantitativeAnalysis.test.ts：72 用例保留，其中 63 例改接生产实现——VaR/CVaR/最大回撤 ← backend/src/services/riskBudgetEngine.ts；年化波动率/Pearson ← frontend/src/utils/globalCorrelationEngine.ts；Beta ← frontend/src/utils/correlationMatrix.ts；Sharpe/Sortino ← frontend/src/utils/backtestPerformanceAnalyzer.ts；蒙特卡洛 ← frontend/src/utils/monteCarloEngine.ts（固定 seed，移除 Math.random）。
- 旧副本行为差异（均判定生产正确）：VaR/CVaR 样本<10 返回 0；CVaR 取 cutoff+1 尾部均值；最大回撤吃收益率并返回 peakIndex/troughIndex（测试内 2 行换算，不复制算法）；Sharpe 默认 rf=0.03（旧 0.02）。
- 残留：MA Crossover 9 例无生产实现（backend/src/utils/backtestEngine.ts 的 generateSignalMA 未导出），保留本地 helper 并在文件头标注「未迁移」，未虚构生产代码 → 本文件按文件级计为非影子。
- 发现（未改生产）：frontend/src/utils/globalCorrelationEngine.ts 的 calculateMaxDrawdown 返回的 peak 是「最新全局峰值」而非回撤起点，与 trough 不属同一区间；本批未采用该函数。
- 不可迁移候选（无生产实现）：tradingEngineDeep.test.ts（撮合/VWAP/保证金/盘口深度）、batchCalcsEngine.test.ts（除 KDJ 外）、stockLogicComprehensive.test.ts（validateStockCode 接口不符）。
- 效果：影子 858→857，shadowLoc 225,750→225,172，realLoc 134,723→135,282。

## 六（续）、批次 4（2026-11-04 05:00）

- backend/src/__tests__/technicalIndicators.test.ts：19→20 用例（新增 Wilder 平滑口径对照），删除自抄 MA/EMA/MACD/RSI/KDJ/BOLL，改为 import backend/src/indicators/technical.ts；KDJ 生产入参为 high/low/close 三数组、返回 {k,d,j} 且首个有效 bar K=D=50（旧副本用 OHLCV[]、首值 (2/3)*50+(1/3)*RSV）；RSI 生产为 Wilder 平滑（index 6 = 68.9655，旧简单均值 66.6667）。
- backend/src/__tests__/technicalIndicatorsAdvanced.test.ts：15 用例保留，删除自抄实现改 import 同一模块；EMA 生产前 period-1 为 null、首值 SMA；MACD 生产返回 {macd,signal,histogram} 且 hist=macd-signal（旧副本 dif/dea 且 *2）；旧「线性上涨金叉」用例在生产 12/26/9 下 macd 与 signal 于 index 33 后精确收敛相等、本无金叉，改为先跌 40 再涨 40 → index 41 上穿；BOLL/MA 生产返回等长数组带 null 预热；3 处 Math.random 全部换成确定性序列。
- 残留：detectGoldenCross 保留为测试观测 helper（生产无金叉检测函数，grep 仅命中模型字符串 macd_golden_cross 与其他测试的自建 helper），已标注「未迁移」，未虚构生产代码。
- 验证：cd backend && npx vitest run 两个文件 → 35 passed；node scripts/guard/shadow-test-census.mjs --check → 855/1533。
- 效果：影子 857→855，shadowLoc 225,172→224,605，realLoc 135,282→135,715。

## 六（续）、批次 5（2026-11-04 05:06）

- backend/src/__tests__/derivativesPricing.test.ts：25 用例保留，删自抄 BS/希腊值/IV，改为 import `backend/src/services/impliedVolEngine.ts` 的 `bsmPrice/impliedVol` 与 `backend/src/services/optionsGreeksEngine.ts` 的 `delta/gamma/theta/vega`；接口由 `type:'call'|'put'` 改为生产口径 `isCall:boolean`（旧 API 生产根本不存在，改签名测试不会红）。
- frontend/src/__tests__/optionsGreeks.test.ts：36 用例保留，改为 import `frontend/src/utils/optionsPricingEngine.ts` 的 `normalCDF/blackScholesPrice/calculateGreeks/calculateImpliedVolatility`；量纲核对：vega/rho 每 1%、theta 每自然日，与旧断言一致。
- 旧测试错在哪：旧「到期 ITM call delta=1」在生产 `calculateGreeks` 的 `timeToExpiry<=0` 早退分支下返回全零（生产测试 optionsPricingEngine.test.ts:185-189 已固化）；旧二分 IV 无解返回 null，`if (iv !== null)` 守卫让用例可零断言通过，生产恒返回 number，已删守卫直接断言（零价格→0.001、价格 10→0.18797）。
- 残留未迁移（保留 helper 并注明）：后端 putCallParity/binomialTree（backend 无对应实现），前端 spreadPayoff（生产 priceStrategy 语义不同）。
- 发现（未改生产）：前端到期 delta 归零是生产已知局限（数学上到期 ITM call 应为 1）；本批按生产口径固化，未来修生产时该断言需反转。
- 验证：backend 25 passed、frontend 36 passed；census --check 853/1533。
- 效果：影子 855→853，shadowLoc 224,605→224,028，realLoc 135,715→136,164。

## 六（续）、批次 6（2026-11-04 05:22）

- frontend/src/__tests__/chartInteractions.test.ts：31→33 用例，删自抄 findNearestPoint/calculateTooltipPosition/dataToScreen/screenToData/zoom/pan，改为 import `frontend/src/utils/chartInteractionEngine.ts` 的 12 个真实函数（含 createViewport/calculateCrosshair/updateSelection/getSelectedData/findNearestIndex）。
- frontend/src/__tests__/dashboardCustomization2.test.ts：12→13 用例，改为 import `frontend/src/utils/dashboardLayoutEngine.ts` 的 validateLayout/checkOverlap/autoArrange/cloneLayout/getLayoutStats。
- 旧测试错在哪（生产正确、测试改口径）：`findNearestPoint(data,targetX)` 生产只按 x、无阈值（旧「超阈值返回 null」不成立）；`calculateCrosshair` 无画布边界裁剪（越界仍 visible=true，visible 是启用开关）；`calculateTooltipPosition` 只返回 {x,y}、默认光标右下、仅右/下翻转（无 placement/top）；`zoomViewport/panViewport` 在数据空间缩放/平移，无 offsetX/offsetY；`updateSelection` 以 dataX 生成 startX/endX + startIndex/endIndex；`validateLayout` 列溢出/重叠只进 warnings，不校验 layout.id/name/rows；`getLayoutStats` 利用率分母为已占用行（12x4=48 → 100%，旧按 12x8 算 50%）；生产 WidgetType 无 'card'（改 'gauge'）。
- 残留未迁移：画布边界判定 3 例（生产无越界裁剪，属组件层）、Widget resize 1 例（生产无 resize/行数概念），保留 helper 并注明。
- 发现（未改生产）：tooltip 无上方放置且极端尺寸仍可能溢出、crosshair 无裁剪、findNearest 隐含要求 x 升序、cloneLayout 用 Date.now 生成 id（同毫秒可能重复）且 widget 浅拷贝共享 config、validateLayout 不校验 id/name。
- 验证：frontend 46 passed（2 files）；census --check 851/1533。
- 效果：影子 853→851，shadowLoc 224,028→223,504，realLoc 136,164→136,677。

## 六（续）、批次 7（2026-11-04 05:33）

- backend/src/__tests__/advancedIndicatorsV2.test.ts：38 用例保留，删自抄 EMA/MACD/BOLL/ATR，改为 import `backend/src/indicators/technical.ts` 的 calculateEMA/calculateMACD/calculateBollingerBands/calculateATR（511→440 行）。
- backend/src/__tests__/marketSentiment.test.ts：28 用例保留，改为 import technical.ts 的 calculateEMA/calculateRSI/calculateATR/calculateBollingerBands。
- 旧测试错在哪（生产正确、测试改口径）：MACD histogram 旧写 (DIF-DEA)*2，生产为 macd-signal；ATR 旧从 i=0 算 TR、首值 index13，生产 trueRange[0]=null、首个 ATR index14；RSI 数据不足旧返回伪造中性 50、旧公式优先级 bug 使下降趋势得 -9900（旧断言「<50」正好掩盖），生产不足返回全 null、下降趋势 0、Wilder 平滑；ATR 不足旧返回 0（零值顶替空态），生产 null；EMA 旧无预热，生产前 period-1 为 null；去掉 advanced 里 Math.random 数据。
- 残留未迁移：advanced 19 例（OBV 9/CCI 5/WR 5）与 marketSentiment 15 例（涨跌家数/恐惧贪婪/TRIN/市场宽度/OBV）——backend technical.ts 无对应纯函数，前端副本无产品引用且口径不同，保留 helper 并注明。
- 发现（未改生产）：technical.ts 缺 OBV/CCI/WilliamsR 纯函数；市场情绪指标仅前端未使用副本。
- 验证：backend 66 passed；census --check 849/1533。
- 效果：影子 851→849，shadowLoc 223,504→222,610，realLoc 136,677→137,509。

## 六（续）、批次 8（2026-11-04 05:36）

- backend/src/__tests__/optionsAndDerivatives.test.ts：35→36 用例（新增 rho），删自抄 BS/希腊值/IV/基差，改为 import backend/src/services/impliedVolEngine.ts、optionsGreeksEngine.ts（isCall:boolean）、frontend/src/utils/futuresBasisEngine.ts。
- backend/src/__tests__/volatilityRisk.test.ts：30 用例保留，改为 import frontend/src/utils/globalCorrelationEngine.ts、backtestPerformanceAnalyzer.ts 与 backend/src/indicators/technical.ts。
- 旧测试错在哪（生产正确、测试改口径）：ATM call delta 在 r=0.05 时应为 0.6368（旧断言 0.5±0.1 只在 r=0 成立）；权证杠杆旧把 delta 写死 0.6，生产 0.8097；旧 IV 用例只算自抄 d1 是否有限、从未求 IV，改为 bsmPrice→impliedVol 往返断言；ATR 的 trueRange[0]=null、首个 ATR 在 index=period；布林键名 mid、空位 null；最大回撤返回索引非价格；Calmar(0,0)=Infinity；beta 参数序为 (market,stock)。
- 残留：期货持有成本定价、期货保证金、权证溢价/盈亏平衡、滚动波动率、CAPM alpha（生产无对应实现）。
- 验证：两文件 66 passed；census --check 847/1533。
- 效果：影子 849→847。

## 六（续）、批次 9（2026-11-04 05:40）

- backend/src/__tests__/tradingStrategyEngine.test.ts：27→31 用例，删自抄 MA/EMA/RSI/MACD/BOLL/止损，改为 import backend/src/utils/futureValueUtils.ts（calcMA/calcEMA/calcRSI/calcMACD）、chartDataEngine.calcBollingerBands、aiMarketAnalysis.StopLossCalculator。
- frontend/src/__tests__/chartCalculations.test.ts：26 用例保留，改为 import indicatorCalc.computeIndicatorSeries（StockDetailPage 实际取数路径）、trendFollowingEngine.calculateMA、styles/chart-theme.CHART_COLORS；EMA/RSI 因前端无导出纯函数，绑 backend futureValueUtils（跨包含先例）。
- 旧测试错在哪（生产正确、测试改口径）：前端 EMA 预热 null 且 index=period-1 用 SMA 作种子（旧 NaN）；computeIndicatorSeries 的 DEA 由 dif 补 0 后 EMA 得到、自 index 25 起（旧仅对有效 dif 求 EMA、起点 33）；RSI 为 Wilder 平滑（旧简单均值）；KDJ 出口 undefined（旧 null）；BOLL 生产前 19 个 undefined；K 线着色真实值 up #cf2a2a / down #1db468 且无平盘灰分支（旧 #ef4444/#22c55e/#888888）；后端 BOLL 数据不足返回 []、长度 n-period+1、键名 mid；止损 ATR 止盈 1.5×ATR（旧 2×ATR）；两处恒真断言（length >= 0）改为精确断言；数据工厂里 Math.random 改确定性序列。
- 口径差异：futureValueUtils.calcMACD histogram=2*(dif-dea)，与 technical.ts 的 macd-signal 不同，两文件各绑各的真源，未强行统一。
- 残留：MA/MACD 交叉信号（backtestEngine.generateSignalMA 未导出）、K 线着色与 ECharts 数据转换（内联在 Charts/KLineChart.tsx，无导出纯函数）。
- 验证：backend 31 passed、frontend 26 passed；census --check 845/1533。
- 效果：影子 847→845。

## 六（续）、批次 10（2026-11-04 05:42）

- backend/src/__tests__/sharedTypes.test.ts：56 用例保留，17 个自抄符号中 16 个改 import frontend/src/utils/formatters.ts；formatPrice 未迁移（该文件无此导出）。
- frontend/src/__tests__/priceFormatter.test.ts：40 用例保留，10 组中 9 组改 import frontend/src/utils/formatters.ts 与 dataTransformUtils.formatAmount；formatPrice 未迁移（前端无统一导出，价格由组件内联 toFixed）。
- 旧测试错在哪（生产正确、测试改口径）：backend 自抄块逐字来自 shared/formatters.ts（零产品引用），与产品真源 frontend 版分叉——空值 '-' vs '--'、0 值 '0' vs '0.00'、formatMarketCap 小值不带小数；frontend 侧成交量统一带「手」后缀（1.50亿手/500手）、零涨跌幅输出 '+0.00%'、涨跌色 #EF4444/#22C55E/#6B7280、负 PE 输出「亏损」。
- 发现的生产缺口（未修，暂按现状注释断言）：formatVolume 无 null/undefined 分支（输出 'null手'）；formatChangePercent/formatRatio 无 isFinite 守卫（NaN→'NaN%'、Infinity→'Infinity'）；formatMarketCap 无负值分支；shared/formatters.ts 与 frontend/src/utils/formatters.ts 长期分叉。
- 验证：backend 56 passed、frontend 40 passed；census --check 843/1533。
- 效果：影子 845→843，shadowLoc 222,610→220,676，realLoc 137,509→139,270。

## 六（续）、批次 11（2026-11-04 05:48）

- backend/src/__tests__/riskMetricsEngine.test.ts：29 用例保留；VaR/CVaR 绑 frontend/src/utils/portfolioRiskBudgetEngine.ts（参数法），Calmar/Omega/历史 CVaR 绑 frontend/src/utils/backtestPerformanceAnalyzer.ts，Beta 绑 frontend/src/utils/correlationMatrix.ts，IR 绑 frontend/src/utils/globalCorrelationEngine.ts。
- backend/src/__tests__/marketMicrostructureV2.test.ts：15 用例保留；Kyle/Amihud/VPIN 绑 backend/src/services/orderFlowToxicityEngine.ts 的 calcKyleLambda/calcAmihudIlliquidity/calcVPIN。
- 旧测试错在哪（生产正确、测试改口径）：VaR 旧为历史分位数取绝对值，生产只有参数法（预期收益/风险入参），预期盈利时 VaR 为负；历史 CVaR 生产返回带符号尾部均值；Calmar 生产签名 (annualizedReturn, maxDrawdown)、maxDD=0 返回 Infinity；IR 生产用 min 长度 + 样本标准差 n-1；Beta 补精确值防参数顺序颠倒仍 >0 蒙混；VPIN/Amihud 生产按 tick rule 分类且返回滚动数组。
- 未迁移（生产无对应可导出 API）：calculateAlpha、calculateTreynorRatio、calcTradeSign、calcAutocorrelation、calcRollSpread、calcHasbrouckLambda，保留本地 helper 并在文件头注明。
- 验证：backend 44 passed（29+15）；census --check 841/1533。
- 效果：影子 843→841，shadowLoc 220,676→220,244，realLoc 139,270→139,728。
## 六（续）、批次 12–14（2026-11-04 05:56）

- **批次 12**：`frontend/src/__tests__/numberFormatEngine.test.ts`（385→411 行，65→66 例）import `frontend/src/utils/formatters.ts` 的 formatNumber/formatPercent/formatChangePercent/formatFileSize/formatDuration 与 `chartAnimation.ts` 的 lerp；`frontend/src/__tests__/dateTimeUtils.test.ts`（232→227 行，26 例）import `tradingCalendarEngine.ts` 的 isTradingDay/getTradingDayInfo/countTradingDays、`marketCalendarEngine.ts` 的 MarketCalendar、`i18nManager.ts` 的 formatRelativeTime。92 passed。
- **批次 13**：`frontend/src/__tests__/klineProcessing.test.ts`（423→419 行，54→55 例）与 `chineseFinancialFormat.test.ts`（468→474 行，52→53 例）import `formatters.ts`（formatVolume/formatMarketCap/formatChangePercent/formatLargeNumber/formatTurnoverRate/getColorByChange）、`dataTransformUtils.ts`（formatAmount/sortByField）、`bloombergExportEngine.ts`（filterData）。108 passed。
- **批次 14**：`backend/src/__tests__/indexCalculations.test.ts`（264→316 行，38→41 例）import `backend/src/models/Stock.ts` 的 calculateChange/calculateAmplitude/calculateTurnoverRate、`utils/exRights.ts` 的 calculateDividendYield、`shared/formatters.ts` 的 formatMarketCap、`frontend/src/utils/financialAnalysisEngine.ts` 的 calculateRatios/calculateWACC、`featureEngineeringEngine.ts` 的 calculateVWAP；`indicatorsAPI.test.ts`（243→291 行，16→20 例）import `backend/src/indicators/technical.ts` 的 MA/EMA/MACD/RSI/KDJ/BOLL/calculateAllIndicators。61 passed。
- 旧测试错在哪（生产正确、测试改口径）：formatNumber(Infinity)='∞' 且无 separator 参数；正号只在 formatChangePercent；formatFileSize(0)='0.00 B'；formatDuration 为中文口径（500ms→'0秒'、3500ms→'3秒'）；lerp 不钳制 t；相对时间 30 秒='30秒钟前'、45 天='上个月'、400 天='去年'；涨跌色 #ef4444/#22c55e/#6b7280；formatVolume 单位「手」（亿手/万手）；formatLargeNumber 为千分位（非万亿缩写）；formatAmount 不带亿缩写；calculateRatios 返回小数、grossMargin 入参为 grossProfit、流动负债 0 → 0；calculateChange(100,0) 返回 {change:100,changePercent:0}；calculateVWAP 返回累计序列且无成交量回退 close；MA/EMA/BOLL 与输入等长并带预热 null、EMA 用 SMA 播种；RSI 返回数组、首个值 index=period、Wilder 平滑；KDJ 入参 high/low/close、首有效 bar K=D=50；BOLL 字段名 middle；MACD 30 根 K 线时 signal/histogram 全 null（需 longPeriod+signalPeriod-1=34 根）。
- 未迁移残留：number 文件 36/66 例仍为本地 helper（abbreviateNumber/factorial/combination/clamp/safeDivide/toPrecision/mapRange 生产无导出）；date 文件 Date Range 5/26 例保留（生产无对应）；K 线形态校验/分页/paginator/formatPrice/classifyTurnover/多列排序/URL state 均生产无对应导出，已注释标明。
- 新发现生产缺口（只报告未修）：formatDuration 丢亚秒精度（500ms→'0秒'）；formatFileSize 无 PB；formatPercent 收小数而 formatChangePercent 收百分数且无正号；formatNumber 无 NaN/null 守卫；styles/theme.ts、performanceAnalytics.ts、enhancedFormatters.ts、i18nEngine.ts 多套同名 formatter；tradingCalendarEngine.ts:48 注释称 2025-2026 但 HOLIDAYS 仅 2025 年 13 组，且 new Date(dateStr)/toISOString 在 UTC 负偏移时区会错一天；i18nManager 45 天显示「上个月」；MarketCalendar 除测试外无生产调用方（但 isMarketOpen 是唯一 A 股时段实现，故仍绑定）。
- 验证：cd frontend && npx vitest run 两文件 = 92 passed；cd frontend 另两文件 = 108 passed；cd backend 两文件 = 61 passed；census --check 835/1533。
- 效果：影子 841→835（-6），shadowLoc 220,244→218,223，realLoc 139,728→141,872。

## 六（续）、批次 15–16 与扫描器修复（2026-11-04 06:05）

- **批次 15**：`backend/src/__tests__/securityEnhancements.test.ts`（315→430 行，26 例）与 `apiSecurityComprehensive.test.ts`（379→691 行，51→55 例）改接 `backend/src/middleware/auth.ts:120/143/176/190/328/362/418`（signAccessToken/verifyAccessToken/generateRefreshToken/consumeRefreshToken/requireRole/handleTokenRefresh/cleanup）、`frontend/src/utils/securityEngine.ts:86/150/163/177/192/291/303/561/583`（sanitizeHTML/validateEmail/validatePhone/validateStockCode/validatePassword/maskPhone/maskEmail/signRequest/verifyRequestSignature）、`backend/src/middleware/securityHeaders.ts:41`、`validation.ts:716/734`（limitBodySize/sanitizeInput）、`corsConfig.ts:146`、`rateLimit.ts:90`、`backend/src/models/User.ts:118/122`。81 passed。
- **批次 15 旧断言错在哪**：maskEmail('test@example.com') 生产为 `t**t@example.com`（只留 local 首尾，长度≤2 不遮挡）；生产 signAccessToken 无过期参数（固定 15 分钟），旧用 -1 造过期改为 fake timers 推进；3 条"全局安全策略"恒真断言改为对 enhancedSecurityHeaders/limitBodySize/corsMiddleware 的真实断言；请求签名为冒号分隔 base36（旧竖线+8 位 hex）；requireRole 允许角色集合平铺匹配（无 guest/user/admin 层级）；刷新错误码为 400 VALIDATION_ERROR / 401 REFRESH_TOKEN_INVALID；密码策略只返回 {valid,errors}（旧强/中/弱判定全错）。
- **批次 15 残留**：maskSensitiveValue（`requestLogger.ts:62` 未 export）、nonce 存储、IP 白名单、API Key 管理器——生产无对应实现/导出，保留并注明；API Key 用例的随机 key 改确定性序号。
- **批次 16**：`frontend/src/__tests__/frontendLogicComprehensive.test.ts`（581→578 行，63 例）改接 `frontend/src/store/useAppStore.ts:156-212`（主题/K线周期/成交量/侧边栏/URLState）、`i18nManager.ts:27-51`、`useStockStore.ts:170/331-353/398-405/465-474`（自选股/搜索/reset）、`exportEngine.ts:316-356`（filterData/sortData）、`formatters.ts:70/99-108/148-152/266-275`、`enhancedFormatters.ts:138-176`、`routes/paths.ts:11-54`。63 passed。
- **批次 16 旧断言错在哪**：初始主题 'light'→'dark'；URL 默认值省略（默认 toURLParams() 为空串）、键名 sort→sortBy/sortOrder；60 秒→'刚刚'（阈值 5 分钟）、1 天以上→完整日期 yyyy-MM-dd；0%→'+0.00%'；美元→'US$1,234.50'；/sectors 参数 code→symbol；formatPercent 入参是小数（旧语义对应 formatChangePercent）。
- **批次 16 残留**：highlight/truncateHighlight（生产在 `SearchHighlight.tsx:16-72` 组件内未导出）、generateBreadcrumbs（各页面内联 antd items）；测试内用 vi.hoisted 装 Map-backed Storage 绕开 Node 25 空壳 localStorage。
- **扫描器修复**：census 与 candidates 的 IMPORT_RE 都不识别 `await import('../x')`，把 34 个真实导入测试误判成影子。两脚本均补 `import(` 分支后重扫：835→832（批次 15/16 三个文件迁完）→798（动态 import 修正），shadowLoc 218,223→216,948→211,476，realLoc 141,872→149,046。
- **验证**：backend 81 passed（26+55）、frontend 63 passed；`census --check` 798/1533 exit 0。

## 六（续）、批次 17–18（2026-11-04 06:15）

- **批次 17**：`frontend/src/__tests__/tableEngineV2.test.ts`（256→246 行，29 例）与 `tableDataGrid.test.ts`（319→310 行，34 例）改接 `frontend/src/utils/bloombergExportEngine.ts:584/607/628/645`（filterData/sortData/groupData/aggregateData）与 `exportEngine.ts:148`（exportToCSV）；63 passed。
- **批次 17 旧断言错在哪**：direction:null 生产无此语义（默认 asc）；operator 'in' 生产无分支（default true，行数 3→5）；between 改 gte+lte；分组缺失键由 'undefined' 变 '未分组'；starts_with/ends_with/ne 改 startsWith/endsWith/neq；aggregateData 签名由 (data,组字段,值字段,op) 变 (data, aggregations) 且键为 price_sum；groupBy 普通对象变 Map；contains 区分大小写（'ali' 命中 1→0）；Column.render 变 ExportColumn.format；exportToCSV 返回 ExportResult.content。
- **批次 17 残留**：paginateData（生产无 totalPages/hasNext 导出）、getColumnWidths（表格 UI 布局，生产无导出），均注明未迁移。
- **批次 18**：`backend/src/__tests__/advanced-screener2.test.ts`（222→229 行，14→15 例）与 `orderFlowAnalysis.test.ts`（233→296 行，22→25 例）改接 `futureValueUtils.ts:59`（calcRSI）、`orderFlowToxicityEngine.ts:134/293/374/492`（calcVPIN/orderImbalance/calcKyleLambda/detectIcebergOrders）、`classifyTrade:60`、Trade 类型；40 passed。
- **批次 18 旧断言错在哪**：RSI 四舍五入 77.78→77.77777777777777、不足数据 50→全 null；方向判定按 tick rule 而非 side（恒价+交替 side 全判 BUY → VPIN [1,1]/imbalance 1）；VPIN 第二参由桶数变累计成交量阈值；imbalance 从 i=1 起；Kyle Lambda 由 Δp/p 变价格差且 |Cov/Var|；冰山返回结构由 {time,side,count} 变 {price,estimatedHiddenVolume,confidence}。
- **批次 18 残留**：calcMicroPrice、tickSigns（生产无对应导出）；旧随机 makeTicks 改确定性 makeTrades。
- **验证**：frontend 63 passed、backend 40 passed；census --check 794/1533 exit 0。

## 六（续）、批次 19–20（2026-11-04 06:25）

- **批次 19**：`backend/src/__tests__/maAndVolumeAnalysis.test.ts`（509 行，43 例）与 `frontend/src/__tests__/stockDetailPageLogic.test.ts`（234 行，22 例）。SMA/EMA 绑 `frontend/src/utils/chartDataProcessing.ts:73/89`（未选 `backend/src/indicators/technical.ts:120/139`：后者 toFixed(4) 舍入，数值口径不同）；格式化绑 `frontend/src/utils/formatters.ts:228`（getColorByChange）、`:37`（formatVolume）、`:48`（formatTurnover）。
- **批次 19 旧断言错在哪**：`getColorByChange(0)` 旧 '#ef4444' → 生产 '#6b7280'（零涨跌灰）；formatVolume 旧 '1.50亿' → '1.50亿手'、'5万' → '5.00万手'、'500' → '500手'；formatTurnover(150000) '15万' → '15.00万'。
- **批次 19 残留**：WMA/DEMA/均线交叉/OBV/VRSI/量均线/异动检测/枢轴聚类（生产无同签名导出）。
- **批次 20**：`frontend/src/__tests__/componentHelpers.test.ts`（371 行，38 例）与 `formValidationExtended.test.ts`（401 行，47 例）。绑定 `securityEngine.ts:150/163/177`（validateEmail/validatePhone/validateStockCode，返回 {valid,errors,sanitized}）、`:192`（validatePassword）、`a11yEngine.ts:153`（parseColor）、`responsiveUtils.ts:130/58/258`、`validation.ts:32/75/113`（validateStockCode/isValidTradeDate/isInRange）。
- **批次 20 旧断言错在哪**：`getBreakpoint(1200)` 'xl' → 'lg'、断点阈值 576/992/1200/1600 → 640/1024/1280/1536、calculateColumns 加 max 6、validatePhone 接受分隔符、validateStockCode 先 trim+upper、`validateStockCode('999999')` 旧 false → 生产 true（只校验 6 位数字，已列生产缺陷候选）；旧 `new Date('2026-02-30')` 会归一化，改 isValidTradeDate 严格校验。
- **批次 20 残留**：validateTradeAmount/validateIdCard/validateRequired/composeValidators（无生产导出）；密码 20 位上限、禁 3 连、A 股前缀白名单作为本地业务规则保留；parseSize/adjustBrightness/formatPhoneNumber 等无生产导出。
- **验证**：backend 43 passed；frontend 22+38+47 = 107 passed；无 .skip/.only/Math.random。

## 六（续）、批次 21–22（2026-11-04 06:35）

- **批次 21**（commit 227b2dbb5，4 文件）：`frontend/src/__tests__/microstructureAnalytics.test.ts`（12→26 例，绑 `backend/src/services/orderFlowToxicityEngine.ts` classifyTrade:60/calcVPIN:134/calcKyleLambda:374/calcAmihudIlliquidity:429/tradeIntensity:331/generateOrderFlowSnapshot:557）；`backend/src/__tests__/userSystemEnhanced.test.ts`（49→51，绑 tokenManager:33、userEnhanced:23/166/274/446、userDeepDive:29/511、User:114/118/122/126、securityEngine:150/163/192）；`frontend/src/__tests__/languageSwitcherLogic.test.ts`（25→45，绑 i18nManager:23/134/151/162、i18n/index:31/146/149/161/214、LanguageSwitcher:20/31/36/41/100-111）；`frontend/src/__tests__/dataAggregation.test.ts`（17→40，绑 chartDataProcessing:20/73/145、dataFlowEngine:209/220、globalCorrelationEngine:98/106/114/268、correlationMatrix:46/59/78/92、dataQualityEngine:164）。
- **批次 21 旧断言错在哪**：JWT payload 无 email；refresh 是 96 hex 不透明串（TTL 在 Map）；Session 按 createdAt 删最旧；可疑 IP=同 IP 15 分钟 >20 次；重置/验证 token 前缀 rst_/vrf_；生产仅 4 语言（无 zh-TW）；Intl 日期 zh-CN '2024/03/15'、ko-KR '2024. 03. 15.'；currency zh-CN 小额无符号、大额 '1234.57万'；calculateReturns 不补首 0；minMax/zScore 4 位小数；detectOutliers 默认 3 返回 AnomalyRecord[]；相关矩阵入参 Record<string,number[]>；t() 用点号嵌套键。
- **批次 21 残留**：resampleKlines/interpolateMissing、colon 键与 storage prefix、avgTradeSize/blockTradeRatio/buyPressure、bcrypt 哈希、Session.requestCount、WMA/金叉/三均线/流动性评分/volume profile/turnoverRate（均注明原因）。
- **批次 22a**（commit cbd1491b3）：`backend/src/__tests__/movingAverageSystemV2.test.ts`（19→20，SMA/EMA 绑 `frontend/src/utils/chartDataProcessing.ts:73/89`）、`liquidityAnalysis.test.ts`（17，绑 orderFlowToxicityEngine:429/374）。旧断言：EMA 首价播种 10/16.667 → null/15/25；Amihud 标量 7.08e-10 → 滚动数组末元素 7.0768e-12；Kyle 未去均值 8.770e-5 → |Cov/Var| 8.1268e-5。残留 WMA/金叉/三均线/流动性评分/volume profile/turnoverRate。
- **批次 22b**：`frontend/src/__tests__/tableSortFilter.test.ts`（16→19，绑 bloombergExportEngine:584/607 与 exportEngine:148）、`i18nLogic.test.ts`（16→23，绑 i18n/index:22/214/42/71、i18nManager:134/151、i18nEngine:490/452/322/411）。旧断言：filterData 单键签名 → filters[] 数组、contains 区分大小写；排序 localeCompare('zh-CN') 精确顺序；t('app.title') 实为 home.title；detectBrowserLocale 返回完整码；en currency 缺 $；zh 日期不补零；pluralize 带 {n}；2 语言×27 键 → 4 语言×141 键。
- **批次 22b 缺陷候选（未改）**：i18nEngine:467 formatMarketCapLocalized 对非中文仍按 1e8/1e4 缩放（1.5e9→'15.00B'）；三套数字/日期格式化并存无单一真源；exportEngine:148 CSV 无 BOM/charset；两模块同名导出能力不同；i18nManager 无单例且无生产调用方。
- **验证**：批次 21 frontend 111 + backend 51 passed；批次 22a backend 37 passed；批次 22b frontend 42 passed；均无 .skip/.only/Math.random。
- **效果**：影子 790→782，shadowLoc 209,061→206,875，realLoc 151,650→154,498；候选分布变为 ≥3 重叠 0、2 个 59、1 个 248、零重叠 475。

## 六（续）、批次 23（2026-11-04 06:50）

- **批次 23a**（commit e0dc76807，4 文件）：`responsiveLogic.test.ts`（137→226，12→19；responsiveUtils:8/58/70/130/258 + debounceThrottle:6/141）、`apiValidation.test.ts`（139→310，15→20；apiResponse:49/74/103、validation:17/28/32/75/93、rateLimit:129/138）、`tradingCostOptimizer.test.ts`（141→165，11→13；tradingCostEngine:80/91/143/198、aStockTradeCostEngine:82/99/105）、`convertibleBondArbV2.test.ts`（143→183，10→12；convertibleBondEngine:73/80/89）。
- **批次 23b**（4 文件）：`securityLogic.test.ts`（180→164，17→22；securityEngine:54/86-121/291/303/315/377/508-554）、`tableInteraction.test.ts`（187→182，22→22；bloombergExportEngine:584/607）、`regimeDetectionV2.test.ts`（190→202，11→12；futureValueUtils:39/59）、`optionsGreeksAdvanced.test.ts`（167→180，33→37；optionsPricingEngine:54/68/130/152-219）。
- **旧断言错在哪**：断点 'xxl'→'2xl'、阈值 576/992/1200/1600→640/768/1024/1280/1536、栅格上限 6；成功响应 {code:0,...}→{success:true,...}、分页 data.total→data.pagination.totalCount、限速虚构 60/10→真实 120/5；佣金入参金额 5400→4500、限价滑点 0→0.0104 且无上限、过户费按成交额、optimizeSplit→suggestSlicing、转股价值 116.67→116.62、债底 98.09→94.42（固定 5%）；sanitizeHTML 生产是白名单删标签（script→空串）非实体转义、CSRF token 32→64 位、maskIDCard 3+11+4→4+10+4、RateLimiter.check(now) 返回 resetAt；sortData 键序签名、calcMA null 前缀、calcRSI Wilder 平滑（前 14 个 null、index14=84.61538461538461）、blackScholesPrice 改参数对象、ATM call=10.4505754154、Charm call 生产 +0.1594771474。
- **批次 23 缺陷候选（未改）**：后端分页 parseInt 不拒负数；estimateSlippage 忽略 orderType（限价=市价）且无上限；estimateTotalCost 不含印花税/过户费；calcBondFloor 固定 5% 折现忽略 ytm；securityEngine.sanitizeHTML 的 encodeEntities 死选项；maskEmail local≤2 不加掩码。
- **验证**：23a frontend 44 + backend 20 passed；23b frontend 44 + backend 49 passed；均无 .skip/.only/Math.random。
- **效果**：影子 782→774（50.5%），shadowLoc 206,875→205,583，realLoc 154,498→156,118；候选分布 2 个 51、1 个 248、零重叠 475。

## 六（续）、批次 24–25（2026-11-04 07:00）

- **批次 24a**（2 文件，frontend）：`advancedChartEngine.test.ts`（154→161，16→16；chartPatternEngine:136/151、chartInteractionEngine:617、formatters:37/70）、`optionStrategyEngine.test.ts`（170→168，10→10；advancedOptionsEngine:180/226/240）。旧断言错：锤子线生产严格 `<`（同夹具旧 true→false，high 改 102.5）、日期 token 只认小写（`YYYY-01-DD`→`2025-01-15`）、成交量恒带「手」、牛市价差/铁鹰/跨式生产按每股不乘 100（maxProfit 500→5、maxLoss -500→5、name 加「策略」后缀）。
- **批次 24b**（2 文件，backend）：`optionChainEngine.test.ts`（181→162，14→14；impliedVolEngine:16/25/40、optionsGreeksEngine:12/18/24/33）、`movingAverageSystem.test.ts`（297→304，24→24；chartDataProcessing:73/89 跨包）。旧断言错：volatilitySmile 返回 `number[]` 非 `{strike,moneyness,iv}[]`、隐含波动率二分法→Newton-Raphson、greeks 拆 4 个导出、SMA 预热 NaN→null、DEMA 断言加强（旧守卫可静默通过）。
- **批次 25a**（2 文件，frontend）：`index.test.ts`（188→175，12→12）、`performanceUtilsDeep.test.ts`（240→227，27→27）；两文件 `debounce/throttle` 绑 `frontend/src/utils/debounceThrottle.ts:6/141`，真源依据 `utils/index.ts:19` 显式再导出（`-typed` 副本仅测试引用）。旧断言无冲突，仅加 `fn.cancel()` 清定时器。
- **未迁移（生产无对应导出）**：到期 payoff、covered call、WMA/DEMA/金叉死叉/趋势强度、deltaHedge/portfolioPnL、createPagination/mergeConfigs/deepClone/shallowEqual/chunk/unique/groupBy；均文件内注明原因。
- **验证**：24a frontend 26 passed；24b backend 38 passed；25a frontend 39 passed；均无 Math.random / .skip/.only。
- **效果**：影子 774→768（50.1%），shadowLoc 205,583→204,347，realLoc 156,118→157,321；候选分布 2 个 45、1 个 248、零重叠 475。

## 六（续）、批次 26（2026-11-04 07:05）

- **批次 26a**（2 文件，frontend）：`dateTimeEngine.test.ts`（306→295，39→41；formatters:70-91 formatDate、i18nManager:176-202 formatRelativeTime、tradingCalendarEngine:62/70/191/195 isTradingDay/getTradingDayInfo/countTradingDays/getNthTradingDay）、`formProcessing.test.ts`（250→269，24→27；validation:43/57/75/118、securityEngine:54/86/150/163/192、debounceThrottle:6）。旧断言错：日期 token 只认小写、30 秒→「30秒钟前」、9 天→「上周」、2025-10-01 不是交易日（国庆节）、sanitizeStockCode 不补零、validatePrice('10.123') 生产为 true、sanitizeHTML 额外转义 `/` 为 `&#x2F;`、2026-02-30 严格判非法、validatePhone/Email 返回 {valid,errors,sanitized}。
- **批次 26b**（2 文件，frontend）：`chartDataUtils.test.ts`（339→298，29→32；chartDataProcessing:20/53/73/145、correlationMatrix:78、heatmapEngine:60、chartDataEngine:55 normalizeToRange 跨包）、`kLineChart.test.ts`（242→288，23→24；chartDataProcessing:20/73/89、formatters:37/48/148、chart-theme:10/74、trendFollowingEngine:113 detectCrossovers）。旧断言错：normalizeToRange 的 min/max 是输出区间、布林带预热 null/对象数组、相关性长度不等按 min 截断（≈0.8165）、热力图 hex、downsampleData 等距点抽样、MA/EMA 不舍入、涨跌幅带正号、均线交叉返回结构化 TrendSignal。
- **未迁移（生产无对应导出）**：getQuarter/daysSinceYearStart/endOfMonth/dateRange/parseDate/daysDiff/isSameDay/timestampToDate、债券价格与数量校验、multiSelectFilter/filterOptions/createFormDraft、interpolateData、KLineChart.tsx 内联 OHLC 提取与阳阴判定；均文件内注明原因。
- **验证**：我独立复验 4 文件 124 passed（41+27+32+24）；无 Math.random / Date.now / 无参 new Date / .skip/.only。
- **效果**：影子 768→764（49.8%），shadowLoc 204,347→203,206，realLoc 157,321→158,475；frontend 373→369；候选分布 2 个 41、1 个 248、零重叠 475。

## 六（续）、批次 27（2026-11-04 07:16）

- **批次 27a**（2 文件，frontend）：`tableInteractionEngine.test.ts`（190→204，18→20；bloombergExportEngine:584/607 filterData/sortData、dataTable:76/85/124 DataTableProcessor）、`componentRendering.test.ts`（259→275，29→31；formatters:60/99/148/174/219、dataTransformUtils:74/120/136 transformStock/sortByField/filterByChangeRange、SearchHighlight.tsx:20 渲染）。旧断言错：formatChangePercent(0) '0.00%'→'+0.00%'、getChangeClass 'rise/fall/flat'→getChangeColor 'positive/negative/neutral'、formatLargeNumber 不再万亿缩写（2.4e12→'2,400,000,000,000'）、sortData 调用形态 (data,key,order)、表格唯一值生产升序、SearchHighlight 用真实组件渲染断言 <mark>。
- **批次 27b**（2 文件，backend）：`statisticalArbitrage.test.ts`（202→306，20→21；correlationMatrix:78、pairsTradingEngine:48/110/249）、`riskManagement.test.ts`（211→402，21→24；riskManagementEngine:64/127/261、globalCorrelationEngine:334、drawdownProtectionEngine:37/113、positionSizingEngine:37/81、portfolioRiskBudgetEngine:41/77/106、riskScenarioEngine:61、monteCarloEngine:70 randomSeed=42、trendFollowingEngine:298）。旧断言错：历史法 VaR 乘市值 1200/2000、CVaR 尾均值 1600、最大回撤 peak/trough 为下标、零回撤 Calmar null、fKelly 不夹取 -0.4、ATR 止损以 currentPrice、止盈 115、压力测试权重口径 -0.25、风险预算协方差分解 30.77/69.23、ADF 统计量 ρ*sqrt(n)。
- **未迁移**：表格 paginateData/toggleSort/getColumnWidth/generateColumnDefs、组件 getRankBadge/filterStocks/paginate；27b 无未迁移（calculateVaR/calculateDrawdown 经 calculatePortfolioRisk 公共出口绑定）。均文件内注明。
- **验证**：我独立复验 27a frontend 51 passed、27b backend 45 passed；无 Math.random / Date.now / 无参 new Date / .skip/.only。
- **效果**：影子 764→760（49.6%），shadowLoc 203,206→202,340，realLoc 158,475→159,666；backend 393/640、frontend 367/868；候选分布 2 个 37、1 个 248、零重叠 475。

## 六（续）、批次 28–29（2026-11-04 07:26）

- **批次 28a**（2 文件）：`optionsPricing.test.ts`（214→248，26→30；backend 一套：impliedVolEngine:6/16/25 normCDF/bsmPrice/impliedVol、optionsGreeksEngine:12/18/24/33/39 delta/gamma/theta/vega/rho）、`dataVizLogic.test.ts`（235→289，23→26；chartDataProcessing:73/89、chart-theme:10、dataTransformUtils:45、chartTooltipFormatter:130）。旧断言错：theta 生产 /365、vega/rho 生产 /100、IV 容差 1e-6/下限 0.001、sigma=0 返回内在价值；EMA 生产前 2 位 null 且第 3 位 SMA 播种、K 线色 #cf2a2a/#1db468、Y 轴 toFixed(2)、tooltip 固定三段式。
- **批次 28b**（2 文件）：`formInputValidationDeep.test.ts`（253→360，42→55；securityEngine:177、validation:28/57/75/123/134/147、formatters:12）、`microstructure.test.ts`（264→406，28→38；orderFlowToxicityEngine:406/293/374/429/492/557、orderBookAnalyzer:59、chartDataProcessing:20 跨包）。旧断言错：validateStockCode('999999') 生产 true（无前缀白名单）、validateQuantity 无 market 参数统一 100 股、sanitizeText 整段删 script、VWAP 空返回 []、零量单笔回退价格、spreadPercent 分母 bestBid、Amihud 滚动数组。
- **批次 29a**（2 文件）：`backtestCombinations.test.ts`（266→250，22→23；chartDataProcessing:73/111、correlationMatrix:46、Backtest.ts:164）、`technicalPatterns.test.ts`（313→282，18→20；chartPatternEngine:136/151、volumePatternEngine:35）。旧断言错：calculateReturns 零价返回 0 非 Infinity；detectPatterns 只检第 i 根（i≥2）而非 i-1、confidence 锤子 0.65/吞没 0.7、旧 bullish 布尔改 type；findSupportResistance 扁平数组、tolerance 0.005、touches 合并累加；量价背离口径改为价跌量增→bullish/价涨量缩→bearish。
- **验证**：我独立复验 28a 56 passed（30+26）、28b 93 passed（55+38）、29a 43 passed（23+20）；无 Math.random / Date.now / 无参 new Date / .skip/.only/console.log。
- **效果**：影子 760→754（49.2%），shadowLoc 202,340→200,789，realLoc 159,666→161,506；backend 389/640、frontend 365/868；候选分布 2 个 31、1 个 248、零重叠 475。

## 六（续）、批次 30（2026-11-04 07:37）

- **批次 30a**（2 文件）：`chartDataProcessingDeep.test.ts`（272→394，28→32；Stock.ts:225/231 calculateChange/calculateAmplitude、chartDataEngine.ts:8/55 aggregateKlines/normalizeToRange、zScoreEngine.ts:6/10、futureValueUtils.ts:11、dataTransformUtils.ts:74/94、heatmapEngine.ts:60、accessibility.ts:115）、`themeStyleSystem.test.ts`（273→377，26→38；customThemes.ts:61/172/179/193/217、a11yEngine.ts:153/197/213、accessibility.ts:95/106/115/137、theme.ts:7/144、chart-theme.ts:10、chartAnimation.ts:62）。旧断言错：振幅分母 open→prevClose（20→16）、涨幅不取整、zScoreSeries 4 位舍入、热力图 min 绿→#0064ff/中间→#803280、factor<=1 返回原引用；浅色 text #333→#262626、rise/fall→up/down（#cf1322/#3f8600）、CSS 变量 `--color-up:` 且 key 不转 kebab、涨跌色 #ef4444/#22c55e/#6b7280、relativeLuminance 入参改 RGB 分量、contrastRatio 双签名。
- **批次 30b**（2 文件）：`alertEngineV2.test.ts`（277→328，22；alertRuleEngine.ts:46/75/106/8-21，跨包）、`dataPipelineEngine.test.ts`（279→323，45→48；dataFlowEngine.ts:39/52/62/71/209/220、zScoreEngine.ts:6/18、futureValueUtils.ts:11/19、dataQualityEngine.ts:164 对照口径）。旧断言错：eq 容差 0.001→0.0001、crosses_*→cross_*（previous 缺失必 false）、条件组/AND-OR→单条件+多规则、消息格式「<rule.name>: 当前值/阈值」、频率控制→evaluateRules 第 4 参 lastTriggerTimes（fake timers）、minMaxNormalize 全相同→0、detectOutliers→{indices,values}、groupBy→Map。
- **验证**：我独立复验 30a 70 passed（32+38）、30b 70 passed（22+48）；无 Math.random / Date.now / 无参 new Date / .skip/.only。
- **效果**：影子 754→750（48.9%），shadowLoc 200,789→199,684，realLoc 161,506→162,932；backend 387/640、frontend 363/868；候选分布 2 个 27、1 个 248、零重叠 475。本批不注册 REGRESSION-ASSETS 行：绑定生产实现属迁移，不是新发现的缺陷防复发物（与批次 24–25 口径一致）。

## 六（续）、批次 31（2026-11-04 07:46）

- **批次 31a**（2 文件，backend）：`factorModels.test.ts`（280→423，24）绑 factorAttributionEngine.ts:252 famaFrench3Factor、financialAnalysisEngine.ts:259/159 calculatePiotroskiScore/calculateQualityScore、creditRiskEngine.ts:83 calculateAltmanZScore、fundamentalQuantEngine.ts:43 quantScreening、marketRegimeEngine.ts:163 detectMomentumState；`quantitativeFactors.test.ts`（280→290，25）绑 zScoreEngine.ts:10、multiFactorEngine.ts:75/92/135、factorEngine.ts:153、factorDecayEngine.ts:66。旧断言订正：Piotroski 0..8→0..9、Altman 位置参数→FinancialData/zScore 且 X4 零负债取 10、Quality 四特征各 25→报表四维（满分 102 截断 100）、momentum 零基数→Infinity、多因子键 value/quality/…→价值/质量/成长/动量、zScore 0.99999041、等值归一化 0.5→0、并列百分位 0→0.25、decayWeights=exp(-.693i/halfLife)。
- **批次 31b**（2 文件）：`dataExportEngine.test.ts`（308→335，29→32；exportEngine.ts:73/112/136 formatNumber/formatDate/escapeCSVValue）、`domInteractions.test.ts`（296→326，30→32；debounceThrottle.ts:6/141 debounce/throttle、dataFlowEngine.ts:52/62 distinct/groupBy、batchOperations.ts:121 chunk，跨包）。旧断言订正：千分位固定 zh-CN 逗号（无 separator 参）、NaN→'NaN'、Infinity→'∞'、number 时间戳非 Date 原样返回、formatDate('')→'-'、escapeCSV 处理 \r、groupBy Record→Map、throttle leading+trailing+maxWait（vi.useFakeTimers）。
- **验证**：我独立复验 31a 49 passed（24+25）、31b 64 passed（32+32）；无 Math.random / Date.now / 无参 new Date / .skip/.only；探针 `__probe_31a.test.ts` 已删。
- **同轮修 CI 红**：`frontend/src/__tests__/nullAdapt.test.tsx`「用后端真实 price 展示现价」在慢机把表头与数据行拆成两帧（run 41739285077 重试 x2 均失败），改为同一 `waitFor` 同时等「现价」与「1.234」，commit `873772d1b`；本地连跑 3 次 25/25。
- **效果**：影子 750→746（48.7%），shadowLoc 199,684→198,516，realLoc 162,932→164,314；backend 384/640、frontend 362/868；候选分布 2 个 23、1 个 248、零重叠 475。

## 六（续）、批次 32（2026-11-04 10:02）

- **批次 32a**（2 文件，backend）：`dataWarehouse.test.ts`（345→303，32→33 例）绑 frontend/src/utils/bloombergExportEngine.ts:628 groupData、:645 aggregateData、dataFlowEngine.ts:137 slidingWindowAggregate、:209 zScoreNormalize、:220 minMaxNormalize、meanReversionEngine.ts:51 rollingStats、correlationMatrix.ts:78 calculateCorrelation、backend/src/utils/futureValueUtils.ts:27 percentileRank；`backtestEngineLogic.test.ts`（354→320，20→23）绑 backend/src/utils/backtestEngine.ts:308 runBacktest、frontend/src/utils/chartDataProcessing.ts:73/89 calculateSMA/calculateEMA、backend/src/models/Backtest.ts:164 calculateMaxDrawdown、shared/types.ts:136 KLineData。旧断言订正：Min-Max 常数数组 [0.5…]→生产 [0,0,0]、百分位 0–100→0..1、rollingStats 与输入等长且不足窗口为 NaN、相关用样本 n−1 并 clamp、聚合 count 只统计非 0 值且数值四舍五入 2 位；回测 <10 条直接 throw、initialCapital 0→1,000,000、commission/slippage 0→默认 0.0003/0.001、Trade 字段改 amount/commission/reason/signal、A 股 100 股整手与 T+1。
- **批次 32b**（2 文件，frontend）：`focusRingLogic.test.ts`（330→418，27→28）绑 frontend/src/utils/a11yEngine.ts:386 getFocusableElements、:399 createFocusTrap；`componentStateMgmt.test.ts`（343→398，35→36）绑 bloombergExportEngine.ts:584 filterData、:607 sortData、components/Common/SearchHighlight.tsx:20、i18n/i18nManager.ts:176 formatRelativeTime。旧断言订正：焦点集合按 tabIndex 排序→DOM 文档序且 button tabindex=-1 仍返回、focus trap 返回 activate/deactivate/isActive（不再是 first/last/canTrap）、filterData 谓词表→FilterConfig[]、高亮返回字符串→React 组件（mark 数量断言）、30 秒「刚刚」→「30秒钟前」、2 天→「前天」、固定 fake timers。
- **验证**：backend 56 passed（33+23）、frontend 64 passed（28+36）；无 Math.random / Date.now / 无参 new Date / .skip/.only；无探针残留。
- **事故记录**：32a 子代理在写完两文件后进程异常失败、未回报结果（32b 正常回报并提示其探针文件）；我独立复验：文件头三节齐全、import 均真实、探针 `__probe_32a.test.ts` 已由该子代理删除、56 passed。教训：子代理失败不等于工作未完成，需以文件+测试复核为准；下次要求子代理先写文件再报告，报告中断时按半成品复核。
- **效果**：影子 746→742（48.4%），shadowLoc 198,516→197,140，realLoc 164,314→165,757，真实 787→791；backend 382/640、frontend 360/868；候选分布 2 符号 23→19、单符号 248、零重叠 475。

## 六（续）、批次 33（2026-11-04 10:14）

- **批次 33a**（2 文件，frontend）：`chartDataAndLayout.test.ts`（354→335，29→31 例）绑 featureEngineeringEngine.ts:172 calculateVWAP（按 bar 逐根累计、零量回退 close[i]）、backend/src/services/chartDataEngine.ts:8 aggregateKlines（factor<=1 返回原引用）、enhancedFormatters.ts:118 getChangeColor、chartAnimation.ts:32/48/62 easings/lerp/lerpColor、responsiveUtils.ts:27/58 GRID_PRESETS/getCurrentBreakpoint、virtualScrollEngine.ts:96 calculateUniformVisibleRange（endIndex 含端点）；`renderOptimization.test.ts`（372→369，40 例）绑 virtualScroll.ts:28 calculateVirtualRange、i18nEngine.ts:213/411 createTranslator/pluralize、i18n/i18nManager.ts:134/151 formatDate/formatNumber。旧断言订正：涨跌色 #ff4d4f/#52c41a/#8c8c8c→#ef4444/#22c55e/#6b7280、断点改 Tailwind（xs/sm/md/lg/xl/2xl 阈值 640–1536）、虚拟列表 end 排他→endIndex 含端点（空列表 −1）、formatNumber/formatDate 弱断言改精确（'1,234,567'、'2024/01/15'）、pluralize/createTranslator 新签名、动画改 lerp+easings 组合。未迁移：calculateVolumeProfile、interpolateData、hexToRgba、calcSidebarWidth、calcAnimationDuration、simplifyPoints、calculateTickPositions、scrollToIndex。
- **批次 33b**（2 文件）：`formValidationEnhanced.test.ts`（356→351，38→40）绑 bloombergExportEngine.ts:122/129 formatPercent/formatCurrency（比率入参 ×100、无正号、null→'-'）、debounceThrottle.ts:6/141、securityEngine.ts:291/315/323、validation.ts:118；`quantitativeStrategies.test.ts`（364→376，43→44）绑 backend/src/utils/futureValueUtils.ts:19/39 zScore/calcMA（std=0→0）、backend/src/models/Backtest.ts:152/164 calculateSharpeRatio/calculateMaxDrawdown（样本 n−1）。旧断言订正：formatPercent 入参改比率且去 '+'、maskBankCard 仅保后四位、夏普改样本方差与年化口径；删除零断言 if 守卫（不同 lookback / z 触发点 / 交易价格），并补非空前置；随机夏普夹具改确定性 sin 序列，均值回归夹具按生产 std=0→0 重造。未迁移：ValidationRule/validateField/validateForm/parseNumberInput/inputConstraints、Trade/BacktestResult 与三套策略信号函数。
- **验证**：frontend 71 passed（31+40）、33b frontend 40 + backend 44；无 Math.random/Date.now/无参 new Date/.skip/.only；无探针残留；断言条数 67→71、47→57，只增未删。
- **效果**：影子 742→738（48.1%），shadowLoc 197,140→195,690，realLoc 165,757→167,192，真实 791→795；backend 381/640、frontend 357/868；候选 2 符号 19→15。

## 六（续）、批次 34（2026-11-04 10:24）

- **批次 34a**（2 文件，backend）：`financialMathEngine.test.ts`（378→369，39→42 例）绑 `frontend/src/utils/globalCorrelationEngine.ts:326/367`、`backtestPerformanceAnalyzer.ts:171/185/248`、`portfolioRiskBudgetEngine.ts:144/154`、`backend/src/services/kellyCriterionEngine.ts:27`、`frontend/src/utils/featureEngineeringEngine.ts:45`、`backend/src/indicators/technical.ts:233/356/461`；`signalsAndRisk.test.ts`（404→413，39→41）绑 `chartDataProcessing.ts:73/111`、`backend/src/services/stressTestEngine.ts:32`、`backend/src/models/Backtest.ts:152/164`、`frontend/src/utils/riskManagementEngine.ts:6/127/153`。
- **批次 34b**（2 文件）：`financialDataEngine.test.ts`（407→457，40→42）绑 `backend/src/services/chartDataEngine.ts:8-23`、`frontend/src/utils/dataTransformUtils.ts:45-56`；`technicalIndicatorsLib.test.ts`（415→423，37→39）绑 `chartDataEngine.ts:25-53`、`featureEngineeringEngine.ts:45/85/156`、`momentumDivergenceEngine.ts:107`、`technical.ts:461`、`zScoreEngine.ts:10`、`dataFlowEngine.ts:220`、`regimeDetectionEngine.ts:53`。
- **旧断言错在哪**：VaR 经验分位→参数法（置信度只认 0.95/0.99，其余回退 z=1.645；预期盈利时 VaR 为负）；Calmar 零回撤 0→Infinity；仓位不取整、按 maxPositionPct 封顶；止损布尔→止损价 entry×(1−value)；夏普默认 rf=0.03 且×√252；ATR number[]→{atr,trueRange} 前 period 位 null；布林带紧凑数组→等长带 null、键名 mid；MACD hist 不乘 2；zScore 4 位舍入；detectTrend 返回对象 .direction。
- **新记录生产缺口（未修）**：`featureEngineeringEngine.ts:157` calculateOBV([],[])→[undefined]。
- **验证**：我独立复验 backend 125 passed（3 文件）、frontend 39 passed；无 Math.random/Date.now/无参 new Date/.skip/.only；四文件 it/expect 只增未删；四模块顶部无第三方 import（不重演 xlsx 类 CI 失败）。
- **效果**：影子 738→734（47.9%），shadowLoc 195,690→194,082，realLoc 167,192→168,858，真实 795→799；backend 381/640→378/640、frontend 357/868→356/868；候选 11 个为 2 符号重叠（≥3 清零）。

## 六（续）、批次 35（2026-11-04 10:40）

- **technicalAnalysis.test.ts**（537→695，51→52 例，断言 73→193）11 组指标全部绑生产：`backend/src/utils/futureValueUtils.ts:39/89` calcMA/calcEMA、`backend/src/indicators/technical.ts:139/168/233/289/356/461` EMA/MACD/RSI/KDJ/BOLL/ATR、`backend/src/services/momentumDivergenceEngine.ts:139/164` findPivots/detectDivergences、`frontend/src/utils/regimeDetectionEngine.ts:53` detectTrend、`trendFollowingEngine.ts:113` detectCrossovers、`elliottWaveEngine.ts:307` calculateFibonacciLevels。
- **dashboardCustomization.test.ts**（636→984，53→93 例，断言 75→240）绑 `dashboardLayoutEngine.ts:49/92/150` validateLayout/checkOverlap/autoArrange、`customThemes.ts:61/172/179/193/217` PRESET_THEMES/getThemeById/mergeTheme/themeToCssVars/validateTheme、`a11yEngine.ts:153/186/197/213` parseColor/relativeLuminance/calculateContrastRatio/checkColorContrast、`chartInteractionEngine.ts:390` calculateTooltipPosition、`responsiveUtils.ts:8/27/58/130/258`、`dataFlowEngine.ts:180` binData。
- **旧断言错在哪（生产正确）**：MACD histogram 旧自算 0.4→生产 40 根夹具 hist[39]=0.0622 且恒等 round4(macd−signal)；RSI 旧 const 75/25→生产 96.2963/3.7037；KDJ 首有效 bar 生产强制 K=D=J=50；ATR trueRange[0]=null、atr 从 index=period 起；BOLL 有效起点 index=period−1；findPivots 返回索引非价格；detectTrend 返回对象 .direction、flat→neutral；交叉返回 TrendSignal[]。布局侧：溢出记 error→生产只进 warnings 且 valid 仍 true；断点 576/992/1200/1600→640/1024/1280/1536（xxl→2xl）；对比度 closeTo→精确 12.63；validateTheme 返回 {valid,errors}；binData start/end→min/max 且恒回 binCount 箱。
- **生产缺口（只记录未修）**：MACD 三份实现两种 histogram 口径（technical.ts:168 hist=macd−signal；futureValueUtils.ts:109 hist=2(dif−dea)）；RSI 四份实现（technical.ts:233、futureValueUtils.ts:59、chartDataEngine.ts:36、momentumDivergenceEngine.ts:36）预热与索引语义不同；validateLayout 不校验 layout.id/name、空单色不报错；binData 在 min===max 时仍切满箱；calculateTooltipPosition 无左/上翻转换算。
- **验证**：我独立复验 backend 52 passed、frontend 93 passed（含兄弟文件联跑 106 passed）；禁项仅命中解释旧实现的注释、无实际调用；import 全真实模块；无探针残留。
- **效果**：影子 734→732（47.8%），shadowLoc 194,082→192,907，realLoc 168,858→170,539，真实 799→801；backend 378→377、frontend 356→355；候选 11→9 个 2 符号重叠（≥3 清零）。

## 六（续）、批次 36（2026-11-04 10:50）

- **utils.test.ts**（476→505，70→84 例，断言 83→109）绑 `frontend/src/utils/dataTransformUtils.ts:45`、`formatters.ts:60/70/148/219`、`backend/src/utils/tradingCalendar.ts:379/417`、`backend/src/models/Stock.ts:225/236`、`backend/src/utils/exRights.ts:424`、`frontend/src/utils/securityEngine.ts:54/177`、`correlationMatrix.ts:54/59`。
- **etfAnalytics.test.ts**（416→475，48→52，断言 63→78）绑 `backend/src/models/BlockTrade.ts:85/90`、`frontend/src/utils/etfPremiumDiscountEngine.ts:51/190`、`correlationMatrix.ts:86`、`backend/src/services/portfolioStressEngine.ts:18`、`frontend/src/utils/etfHoldingEngine.ts:74`、`marketRegimeDetector.ts:94`。
- **advancedChartUtils.test.ts**（436→460，26→28，断言 52→90）与 **tradingStrategyEngine.test.ts**（506→570，52→54，断言 62→115）：绑 `featureEngineeringEngine.ts:45/85/218/266`、`chartDataProcessing.ts:73/145`、`backend/src/indicators/technical.ts:289`、`chartPatternEngine.ts:136`、`trendFollowingEngine.ts:73`、`backend/src/utils/futureValueUtils.ts:59/109`。
- **旧断言错在哪（生产正确）**：formatPercent 收小数比率×100 且无正号（正号只在 formatChangePercent）；formatLargeNumber 千分位不缩写；nextTradingDay 跳法定节假日；calculateChange 返回 {change,changePercent}；计算标准差用样本 n−1；ETF 溢价三档 ±0.5；跟踪误差年化 TE=1.94；市场状态三态+volatilityRegime；SMA/RSI null 预热、KDJ 返回 {k[],d[],j[]}、BOLL 预热 null 对象、momentum 不足周期长度 3、Williams range=0→−50；MACD 两份口径按副本选（frontend advancedChartUtils 用 featureEngineeringEngine 首值种子版，tradingStrategyEngine 用 futureValueUtils 2 倍柱版）。
- **生产缺口（只记录未修）**：`backend/src/models/BlockTrade.ts:85` 只拦 closePrice===0，负净值算出 −550，而前端 etfPremiumDiscountEngine 拦 nav<=0 返回 0（两套口径不一致，用例已断言差异）。
- **验证**：我独立复验 backend 136 passed、frontend 82 passed；禁项 grep 0 命中；四文件 it/expect 只增未删；无探针残留。
- **效果**：影子 732→728（47.5%），shadowLoc 192,907→191,069，realLoc 170,539→172,553，真实 801→805；backend 377→375、frontend 355→353；候选 9→5 个 2 符号重叠（≥3 清零）。

## 六（续）、批次 37（2026-11-04 10:56）

- **fundFlowDeep.test.ts**（420→430，33→35 例，断言 47→91）绑 `backend/src/models/FundFlow.ts:104/116/122/133` FLOW_THRESHOLDS/classifyFlowDirection/calculateFlowIntensity/formatFlowAmount、`frontend/src/utils/sectorFundFlow.ts:51/79` summarizeFundFlows/analyzeFlowTrend、`sectorFundFlowEngine.ts:101` analyzeFlowTrend（momentum/consistency）。
- **optionsMacroEngine.test.ts**（424→512，48→51，断言 62→108）绑 `frontend/src/utils/optionsPricingEngine.ts:54/130/152/222/298` normalCDF/blackScholesPrice/calculateGreeks/priceOption/putCallParity、`advancedOptionsEngine.ts:164` putCallParity、`marketDepthEngine.ts:62` analyzeOrderBookDepth、`eventDrivenBacktestEngine.ts:49` runEventBacktest。
- **prefetchCacheEngine.test.ts**（420→504，26→31，断言 38→77）绑 `frontend/src/utils/cacheEngine.ts:55/184/379/466/478/492` LRUCache/LFUCache/createCache/cacheToStorage/readFromStorage/cleanExpiredStorage、`debounceThrottle.ts:6/141` debounce/throttle。
- **utilityFunctions.test.ts**（439→510，44→49，断言 67→90）绑 `exportEngine.ts:361/381` groupData/aggregateData、`debounceThrottle.ts:6/141`、`enhancedFormatters.ts:9/71` formatRelativeTime/formatDate。
- **旧断言错在哪（生产正确）**：资金流三档 strong/weak 按绝对强度不分方向、零成交额→weak、无 score/mainForceRatio 字段；formatAmount(0)='+0.00'；期权不 clamp 时间价值（深实值 put 为负）、spreadBps 分母是 lastPrice（10.01→19.98001998）、回测空输入抛「没有交易数据」、expectancy 用比例制、normalCDF 在 ±8 外截断；LRU 靠 Map 插入序（非 lastAccess 时间戳）、ttl=0 表示永不过期、createCache('fifo') 实际返回 LRUCache、45 天相对时间退化为完整日期（'2025年12月1日'）、groupBy(keyFn)→groupData(字段名)、聚合键 `${key}_${type}` 且 count 排除 0。
- **生产缺口（只记录未修）**：`sectorFundFlow.ts` topOutflow 在流出不足 5 个时混入正流入；engine 单元素 momentum 退化为该值；`priceOption` timeValue 不 clamp；`cacheEngine.ts:8/379` fifo 静默降级 LRU、`:356` TTLCache.has 不查过期、`exportEngine.ts:403/406` 空数据 min/max 为 ±Infinity、groupData 缺失字段静默「未分组」、两个同名 formatRelativeTime 并存（formatters.ts:266 vs enhancedFormatters.ts:9）、exportEngine 未进 utils/index.ts 桶导出。
- **验证**：我独立复验 backend 86 passed、frontend 80 passed；禁项 grep 0 命中；四文件 it/expect 只增未删（35/91、51/108、31/77、49/90）；无探针残留。
- **效果**：影子 728→724（47.2%），shadowLoc 191,069→189,362，realLoc 172,553→174,513，真实 805→809；backend 375→373、frontend 353→351；2 符号重叠候选 5→1（仅剩 dashboardWidgets，≥3 清零）。

## 六（续）、批次 38（2026-11-04 11:12）

- **dashboardWidgets.test.ts**（482→590，34→41 例，断言 63→102）绑 `dashboardLayoutEngine.ts:49/92/150` validateLayout/checkOverlap/autoArrange、`dataTable.ts:38` DataTableProcessor、`customThemes.ts:61/193` PRESET_THEMES/themeToCssVars、`components/Common/SearchHighlight.tsx:20`（RTL 渲染真实组件）。
- **advancedPageLogic.test.ts**（657→731，64→69，断言 88→138）绑 `dataTable.ts:38/151` DataTableProcessor/exportToCSV、`chartDataProcessing.ts:145/111` calculateBollingerBands/calculateRSI、`chartTheme.ts:109/148` LIGHT_THEME/getKLineChartTheme。
- **advancedCandlestickPatterns.test.ts**（681→727，73→73，断言 89→117）绑 `chartPatternEngine.ts:136/151`（内部 :34/:51/:76/:94/:115 五个子检测器）、`volumePatternEngine.ts:35`；选 chartPatternEngine 而非 technicalPatternEngine（后者锤子不分上吊、吞没只有看涨）。
- **userDeepDive.test.ts**（868→992，64→70，断言 107→232）绑 `backend/src/utils/userDeepDive.ts:759-763` 五个 manager（细分 :38/:76/:112/:119 头像、:223/:234/:247/:256 偏好、:368/:392/:435/:460 日志、:521/:545/:570/:611/:632/:639 2FA、:708/:727/:731 统计）、`userEnhanced.ts:547` sessionManager、`notification/types.ts:5/18/63`+`templates.ts:78`、`securityEngine.ts:192`、`formatters.ts:70/266`、`responsiveUtils.ts:58/70/77/84/99`、`scrollInteractionEngine.ts:149/176/199/262`、`a11yEngine.ts:70/344/399`+`accessibility.ts:18/137`。
- **旧断言错在哪（生产正确）**：布局重叠只进 warnings 且 valid 仍 true；主题变量为 `--color-*`、涨跌 #cf1322/#3f8600；通知 priority 枚举是 urgent 非 critical；K 线色大写 #EF4444/#22C55E；BOLL/RSI 预热补 null（RSI Wilder 平滑）；分页只有 pagination.total 无 totalPages；上吊线按前一根方向区分、支撑阻力取局部极值、放量阈值 3x、不足 20 根抛错；日志阈值 1 分钟→5 分钟、备用码 [0-9A-F]、通知渠道 5 类无 wechat、WCAG 实测 2.21/2.99/2.95/1.83 均不通过 AA。
- **生产缺口（只记录未修）**：无独立刷新调度器与通知计数导出；`computeKLine` 藏在 workerManager.ts:86-99 模板字符串不可 import；`subscriptionManager.ts:269` 免打扰逻辑私有且依赖墙钟；表单单选状态机与列元数据无通用导出。
- **验证**：我独立复验 frontend 253 passed（4 文件联跑）；禁项 grep 0 命中；it/expect 41/102、69/138、73/117、70/232 均只增未减（用例 73→73 持平）；无探针残留。
- **效果**：影子 724→720（47.0%），shadowLoc 189,362→186,670，realLoc 174,513→177,556，真实 809→813；backend 373、frontend 351→347；符号重叠候选清零。

## 六（续）、批次 39（2026-11-04 11:20）

- **符号证据池已空，本批起按语义匹配派工**：`shadow-migration-candidates.mjs distribution` 输出 717 个影子测试中重叠符号为 **0**，只能读生产模块的接口/语义判断能否绑定（D34 的排序依据到此失效，剩体量优先）。
- **orderBookEngine.test.ts**（529→565，52→53 例，断言 61→70）绑 `backend/src/services/orderBookAnalyzer.ts:6/12/51/55/59/67/72/113/240` 的 OrderBookLevel/OrderBook/OrderBookAnalyzer/setLargeOrderThreshold/addOrderBook/getOrderBook/analyzeImbalance/detectLargeOrders/getMarketImpact；新增「流动性不足返回 Infinity」用例。
- **旧断言错在哪（生产正确）**：加权中间价是全盘口量加权（1800.0809677419354，可高于最优卖价 1800.01）；imbalanceRatio = 买量/卖量（卖盘 0.25、均衡 1、空盘 1）；spreadPercent 分母是最优买价；卖单冲击取绝对值；大单判定 quantity>=阈值，ratio=1/orderCount。
- **reportGenerator.test.ts**（516→540，16→16，断言 25→25）：生产侧 researchReportEngine/researchReportAnalysisEngine/financialReportEngine 均无 createReport/ReportConfig/分页/分组，全仓无 ReportGenerator，保留内联替身并在文件头逐候选注明；只做确定性化（FIXED_NOW=1704187800000、sequence 生成 rpt_/col_/flt_ id、executionTime=0），断言未改，故本文件按口径仍是影子。
- **macroEconomicAnalysis.test.ts**（570→598，75→75，断言 98→98）绑 `frontend/src/utils/correlationMatrix.ts:78-84` calculateCorrelation（6 例/7 断言，n−1 协方差、[-1,1] 截断、零方差 0）、`:46-52` calculateReturns + `:59-64` calculateStdDev（forexVolatility 壳保留，注意样本 n−1 与旧总体 n 差 sqrt(n/(n−1))）；其余 17 个 helper 生产签名/语义不符，保留内联并逐条注明。
- **parameterOptimizer.test.ts**（547→613，21→22，断言 37→40）唯一绑定 `backend/src/services/walkForwardOptimizationEngine.ts:8-21` generateWindows（200 收益、窗宽 140、步长 60 → 1 个窗口，新增 toBe(1)）；把全部 Math.random 换成固定种子 LCG createTestRNG（s=(s*1664525+1013904223)>>>0，seed 42/20240101），新增「固定种子应可复现」用例；已知缺陷保留注明：walkForward 测试集仍用 gridSearch({maxIterations:1}) 取首项而非 trainResults[0].params。
- **验证**：我独立复验 backend 69 passed（53+16）、frontend 97 passed（75+22）；禁项 grep 0 命中；it/expect 52→53、61→70、75→75、98→98、21→22、37→40 均只增未减；无探针残留。
- **效果**：影子 720→717（46.8%），shadowLoc 186,670→185,047，realLoc 177,556→179,345，真实 813→816；backend 373→372、frontend 347→345。本批只减 3 个（reportGenerator 无生产契约，按口径不记迁移）。

## 六（续）、批次 40（2026-11-04 11:30）

- **pageDataLogic.test.ts**（557→627，45→47 例，断言 80→89）绑 `formatters.ts:24/60/148/228/266`（formatMarketCap/formatPercent/formatChangePercent/getColorByChange/formatRelativeTime）、`backend/src/models/Stock.ts:225/231`（calculateChange/calculateAmplitude）、`newsAggregationEngine.ts:77` filterNews、`stockScreener.ts:97` screenByPatterns（breakout_52w/near_support）、`etfPremiumDiscountEngine.ts:43/51`（calculatePremiumRate/classifyPremiumStatus）。
- **dashboardSystem.test.ts**（526→541，52→55，断言 85→105）绑 `dashboardLayoutEngine.ts:49/92/150/257`（validateLayout/checkOverlap/autoArrange/getLayoutStats）、`customThemes.ts:61/172/193`、`responsiveUtils.ts:8/58/99/258`。
- **chartDataAndInteraction.test.ts**（518→746，56→81，断言 71→125）绑 `chartDataProcessing.ts:20/53/73/89/111/145`、`featureEngineeringEngine.ts:45/85/172`（EMA 同名不同口径单独固化：chart 版 null 填充+SMA 种子、特征版首值起算）、`chartPatternEngine.ts:136/151`、`chartInteractionEngine.ts:86/390/617`、`dataTransformUtils.ts:74`+`chart-theme.ts:10/74`。
- **cssAndVisualization.test.ts**（545→716，62→84，断言 80→127）绑 `a11yEngine.ts:153/186/197/213`、`customThemes.ts:61/193`+`chart-theme.ts:10`+`chartTheme.ts:109/148`、`correlationMatrix.ts:78`、`chartInteractionEngine.ts:86/95/126/147`。
- **旧断言错在哪（生产正确）**：均线带不足周期是 null 非 NaN；涨跌色 transformStock 返回 red/green/gray、K 线 #cf2a2a/#1db468/#64748b；零值归 flat；Tooltip 只有 {x,y} 无 placement、钳到 offset=10 且取整；is52wLow 阈值 1.02→near_support 1.05；filterNews 用 categories 数组+英文枚举+keywords（区分大小写）；formatRelativeTime 超 24h 直接 yyyy-MM-dd；ETF premium 由 calculatePremiumRate 精确生成（±0.9091）；布局溢出/重叠只进 warnings 且 valid=true；getLayoutStats 无 totalCells/avgSize，改 gridUtilization/lockedWidgets；通知 priority urgent、type price_alert；主题变量 --color-*、#cf1322/#3f8600；断点 640/768/1024/1280/1536 与 '2xl'。
- **验证**：我独立复验 frontend 267 passed（165+102）；禁项 grep 0 命中；生产源码零改动；断言 80→89、85→105、71→125、80→127 只增未减。
- **效果**：影子 717→713（46.5%），shadowLoc 185,047→182,897，realLoc 179,345→181,979，真实 816→820；backend 372/640 不变、frontend 345→341/868。

## 六（续）、批次 41（2026-11-04 11:46）

- **portfolioRiskEngine.test.ts**（514→594，47→47 例，断言 60→90）绑 `riskManagementEngine.ts:64` calculatePortfolioRisk（10 例：市值/盈亏/历史模拟 VaR 金额 460/HHI/sectorExposure/空组合 beta=1）、`performanceAttributionEngine.ts:112` calculateRiskMetrics（8 例）、`backtestPerformanceAnalyzer.ts:171/185/248`、`regimeDetectionEngine.ts:53/296`、`tradingCalendarEngine.ts:138`、`dataQualityEngine.ts:57`。
- **tradingCosts.test.ts**（504→707，64→64，断言 86→121）绑 `aStockTradeCostEngine.ts:82/133`、`tradingCalendarEngine.ts:122/138`、`backend/src/utils/exRights.ts:93`、`securityEngine.ts:177`、`convertibleBondEngine.ts:73/80`、`adjustFactorEngine.ts:26/46`。
- **chartEngine.test.ts**（511→616，22→29，断言 46→88）绑 `chartDataProcessing.ts:20/73/89/111/145`、`indicatorCalc.ts:321`、`chartPatternEngine.ts:136/151`、`chartInteractionEngine.ts:86/390/617/633`；19 个 ChartEngine 实例规格（series/axis/annotation CRUD、0..1 缩放、主题）生产无聚合类导出，保留内联。
- **marketDataUtils.test.ts**（490→588，51→56，断言 69→95）绑 `orderBookEngine.ts:34`、`marketDepthEngine.ts:326`、`orderBookDepthEngine.ts:39`、`orderFlowEngine.ts:57`、`backend/src/services/zScoreEngine.ts:6/18`（跨包；该文件顶层零 import，CI 安全）、`formatters.ts:24/60/99/148`。
- **旧断言错在哪（生产正确）**：detectTrend 'sideways'→'neutral'；全正收益 Sortino 0→Infinity、Calmar maxDD=0→Infinity；VaR 历史模拟金额口径 460；涨跌停 35.83/29.31；A 股买入含经手费 0.49+证管费 0.02（10005.61）、最低佣金 5 元、万 0 券商成本 100011.07；红利税 180 天=10%、1 天=20%；除权零收盘无守卫得 -0.5；可转债平价 130（面值 100）；复权按事件累计而非任意连乘；spreadPct 是比率 0.001；formatChangePercent 恒 +0.00%、固定 2 位、高价转万阈值 1e4；detectOutliers 返回 {indices,values} 且单值全空；BOLL 返回 {upper,middle,lower}|null 数组。
- **验证**：我独立复验 backend 111 passed（47+64）、frontend 85 passed（29+56）；禁项 0；无探针；生产源码零改动。
- **效果**：影子 713→709（46.2%），shadowLoc 182,897→180,874，realLoc 181,979→184,488，真实 820→824；backend 372→370、frontend 341→339。

## 六（续）、批次 42（2026-11-04 12:02）

本批走 D 类归档复核给出的 R 类改绑路线（7 个「生产有同契约、测试却自造副本」的活模块优先），不需要用户批准。

- **circuitBreakerMarket.test.ts**（284→445，15→22 例，断言 26→106）绑 `backend/src/utils/circuitBreakerMarket.ts:7/9/17/27` MarketCircuitBreaker；fake timers 显式 `toFake: ['setTimeout','clearTimeout','Date','performance.now']`，契约：failureCount 累计、成功请求递减私有计数、被拒请求不刷新 lastStateChange、avg 只取最近 100 条。
- **tokenManagerDeep.test.ts**（251→543，28→39，断言 38→112）绑 `backend/src/utils/tokenManager.ts:82` generateAccessToken、`:130` verifyAccessToken（私有 sign 不可用）；契约：verify 只返回 {userId,username,role} 投影、exp 秒级、黑名单先于格式校验、refresh 一次性、黑名单 >10000 裁到 5000。
- **dataTableEngine.test.ts**（338→605，42→67，断言 54→118）绑 `dataTable.ts:10` SortConfig{column}、`:15` FilterConfig、`:38` DataTableProcessor、`:151` exportToCSV，交叉对照 `bloombergExportEngine.ts:607` sortData。
- **commandPalette.test.ts**（418→870，51→72，断言 64→169）绑 `CommandPalette.tsx:9/20/50` + ShortcutHelpOverlay，RTL 真实渲染：过滤四路、上下键取模、Enter、Esc、300ms 防抖、5 条截断、50ms 聚焦。
- **旧断言错在哪（生产正确）**：熔断器默认 5 次/30s 半开/3 次成功/60s 重置；verifyAccessToken 不返回 email；dataTable 排序字段名是 column 而非 key；命令面板过滤大小写不敏感且支持快捷键前缀。
- **验证**：我独立复验 backend 61 passed（22+39）、frontend 139 passed（67+72）；禁项 0；生产源码零改动；无探针。
- **效果**：影子 709→705（46.0%），shadowLoc 180,874→179,581，realLoc 184,488→186,955，真实 824→828；backend 370→368、frontend 339→337。

## 六（续）、批次 43（2026-11-04 12:45）

本批收掉 D 类复核判为 R 的最后两个 frontend 文件，并顺手处理两个 backend 语义可对的影子。

- **loadingOrchestratorDeep.test.ts**（458→683，33→39 例，断言 54→103）绑 `frontend/src/utils/loadingOrchestrator.ts:36-184` LoadingOrchestrator（:45 register、:58 start、:75 complete、:87 fail、:100 getState、:123 subscribe、:131 reset、:155 checkAllDone、:163 超时轮询）、`:188-229` FirstPaintTimer、`frontend/src/services/retryUtility.ts:31-60` withRetry。旧口径 11 处订正（success→complete、reset 不删任务只归 idle、attempts=总调用次数、超时由 1s 轮询自动置位等）。
- **uiPolishLogic.test.ts**（313→628，43→44，断言 61→109）绑 `frontend/src/utils/uiPolish.ts` 全部 10 个导出：animateValue:7、flashChange:47、bounceIn:70、slideToDelete:82、flipCard:98、typewriter:111、shake:139、addGlowEffect:156、animateBadge:178、animateReorder:191。旧文件 0 行 import（const duration=800; expect(duration).toBe(800) 自证），现改为断言真实写入的 style/关键帧/定时器参数。
- **batchOperationsLogic.test.ts**（342→413，26→31，断言 41→51）绑 `backend/src/services/batchOperations.ts:121` chunk（原 4 条分片用例契约一致）、新增 batchExecute:90、processInChunks:132；限流/重试策略类保留内联并注明原因。
- **requestLogger.test.ts**（483→842，37→55，断言 73→136）绑 `backend/src/utils/logger.ts:13/107` LogLevel、`backend/src/services/logger.ts:92` sanitizeData、:112 shouldLog、:71 configureLogger、:119 formatLogEntry、`backend/src/middleware/requestLogger.ts:99` 中间件；订正：脱敏标记 ***REDACTED***、traceId 8 位 hex、字段 durationMs→duration、requestId→traceId。
- **验证**：我独立复验 backend 86 passed（31+55）、frontend 83 passed（39+44）；禁项 0；生产源码零改动；无探针。
- **效果**：影子 705→701（45.7%），shadowLoc 179,581→177,981，realLoc 186,955→189,525，真实 828→832；backend 368→366、frontend 337→335。

## 六（续）、批次 44（2026-11-04 13:05）

批次 44 前先做了一次只读语义复核（handover/15-批次44候选复核.md，9 个大体量影子共 4,507 行/273 例）：其中 8 个生产确无同契约，只有 dataEngineAdvanced 可部分绑定。

- **dataEngineAdvanced.test.ts**（495→546，48→48 例，断言 61→61）：
  · chunk 3 例绑 `backend/src/services/batchOperations.ts:121`（删除内联实现，逐行同语义）。
  · LRUCache 9 例绑 `backend/src/services/cacheEngine.ts:36`：构造改 `{ maxSize }`、key 固定 string、`size()` → `getStats().size`、每例 `destroy()` 清 setInterval；断言期望值零订正。
  · 未迁移 36 例（序列化 13、批量 13、FIFO 2、日志 8）均有候选但契约不符，文件头逐条注明。
- **验证**：我独立复验 48 passed（153ms，无句柄泄漏）；禁项 0；生产源码零改动；无探针。
- **效果**：影子 701→700（45.7%），shadowLoc 177,981→177,485，realLoc 189,525→190,072，真实 832→833；backend 366→365。

## 六（续）、批次 45（2026-11-04 13:25）

本批不是影子迁移，而是把批次 43–44 复验中记下的四处生产健壮性缺陷修掉（handover/09 的 B24–B27），并为每处补回归资产。

- **cacheEngine.ts:36 LRUCache**：set() 满容量覆写已有 key 会误淘汰无关条目；oldest 用 falsy 判断使空字符串 key 造成同步死循环；maxSize<=0 时淘汰条件恒真同样挂死；setNull() 的穿透标记定时器不登记，delete/clear/destroy 均不清理（泄漏且阻止进程退出）。
- **batchOperations.ts:121 chunk**：size<=0/负数时步进不前进，调用即挂死；现抛 RangeError，非整数按 Math.floor。
- **middleware/requestLogger.ts:82 sanitizeQuery**：大小写敏感判断使 ?Token= / ?APIKEY= 绕过脱敏进日志；改为与 sanitizeHeaders 一致的小写比较。
- **新增回归资产**：backend/src/__tests__/runtimeGuards.test.ts（11 例：覆写不淘汰、容量边界、maxSize 0/-3/NaN 退化、空 key 参与淘汰、setNull 定时器计数 1→3→2→1→0、chunk 非法 size 抛错）；requestLogger.test.ts 追加 1 例大小写脱敏。
- **红→绿证据**：旧代码快照（git show HEAD）探针 chunk([1,2,3],0) → V8 abort EXIT=134；LRUCache maxSize=1 先 set('') 再 set('a') → SIGALRM EXIT=142（挂死）。修复后同一探针：THREW RangeError / keys ["a","b"] evictions 1，EXIT=0；7 个受影响文件 238 passed。
- **效果**：影子仍 700，但因新增 1 个真实导入测试文件，总数 1,533→1,534、占比 45.7%→45.6%，realLoc 190,072→190,229；backend 365/641。--check exit 0、honesty-scan --strict exit 0。

## 六（续）、批次 46（2026-11-04 13:40，D 类归档执行）

本批不是迁移，是用户拍板后执行「审计后归档」：把复核判定为 D（死链）的 13 个测试文件移出 src，保留文件本身与 git 历史。

- **批准来源**：用户在 2026-11-04 13:24 拍板第二项「按建议归档 13 个 D，删除和归档确定无用的」、第七项「M2 收口选 2（归档）」。
- **归档清单 13 个 / 4,113 行**：backend 3 个（healthCheck、taskSchedulerEngine、rollbackManagerLogic）、frontend 10 个（contextMenuLogic、marketOverviewLogic、onboardingLogic、microFeedbackLogic、codeAuditDeep、virtualScrollDataLogic、emptyStatesLogic、virtualListLogic、stockTableLogic、accessibilityEngine）。
- **证据**：handover/14 复核（第一批 20 个里 D 成立 13、改判 R 7）；每个文件的核心符号在 backend/src + frontend/src + shared 做 rg -w 命中为 0；20/20 零项目源码 import、零交叉引用、未被 vitest/tsconfig/package.json 点名。R 类 7 个已在批次 42–44 全部改绑完毕，本批不涉及。
- **处置**：git mv 到 docs/_archive/dead-tests/2026-11/{backend,frontend}/，不 rm；目录 README 记录理由、逐文件依据与恢复命令。归档不计入迁移数（只有真实绑定才算）。
- **效果**：测试总数 1,534→1,521、影子 700→687（45.6%→45.2%）、shadowLoc 177,485→173,372，真实仍 834；realLoc 190,229 不变；backend 365→362/638、frontend 335→325/858。
- **复验**：census --check exit 0、honesty-scan --strict exit 0；归档文件已不在两包 vitest include 与 tsconfig include 内（出 src 即自动脱离）。

## 七、CI 守卫（已上线）

- `scripts/guard/shadow-test-census.mjs --check` 读取 `scripts/guard/shadow-baseline.json`，影子数高于基线即 exit 1；降低时需手动下调基线（避免数字回弹）。
- `.github/workflows/ci.yml` 的 `shadow-test-guard` job 在 honesty-guard 之后阻断执行，node 20。
- 基线：shadow 687 / total 1521 / shadowLoc 173,372（批次 46 后）。历史基线：批次 44 后 700/1533、批次 43 后 701/177,981、批次 42 后 705/179,581、批次 41 后 709/180,874、批次 40 后 713/182,897、批次 38 后 720/186,670、批次 37 后 724/189,362、批次 36 后 728/191,069、批次 35 后 732/192,907、批次 34 后 734/194,082、批次 33 后 738/195,690、批次 17–18 后 794、批次 14 后 835、批次 11 后 841、批次 10 后 843、批次 7 后 849、批次 6 后 851——批次 6–14 为旧口径（漏判动态 import），不可与新数字直接比较。

## 八、迁移候选扫描（工具）

不再凭感觉挑文件：`node scripts/guard/shadow-migration-candidates.mjs [--json] [--top N]`（只读）给出两条证据：

1. **符号证据**：影子测试里自抄的函数/常量名，是否在某个生产源码文件里被 `export`；
2. **命名证据**：测试文件名与生产源码路径的规范化字符串是否互相包含。

输出按「重叠符号数」降序，仅作线索——接口是否兼容仍须人工读生产实现。当前结果：687 个影子测试中 2 符号重叠已清零；符号名不再命中，后续只能按语义匹配生产实现（批次 38 后重扫）。`--all` 输出全量行，`distribution` 给出分数字段，供收口策略分层。

## 九、下一步

- 批次 43 已消化 loadingOrchestratorDeep/uiPolishLogic/batchOperationsLogic/requestLogger（前两个是 D 类复核 R 类最后的两个 frontend 文件）；批次 42 已消化 circuitBreakerMarket/tokenManagerDeep/dataTableEngine/commandPalette（D 类复核判定的 R 类改绑，不需批准）；批次 41 已消化 portfolioRiskEngine/tradingCosts/chartEngine/marketDataUtils；批次 40 已消化 pageDataLogic/dashboardSystem/chartDataAndInteraction/cssAndVisualization（四个都是页面逻辑自抄件，按语义绑到 formatters/Stock/dashboardLayoutEngine/chartDataProcessing/chartPatternEngine/chartInteractionEngine/theme 一层）；批次 39 已消化 orderBookEngine/macroEconomicAnalysis/parameterOptimizer（reportGenerator 无生产契约，记未迁移）；批次 38 已消化 dashboardWidgets/advancedPageLogic/advancedCandlestickPatterns/userDeepDive（符号名零命中，按语义绑定）；批次 37 已消化 fundFlowDeep/optionsMacroEngine/prefetchCacheEngine/utilityFunctions；批次 36 已消化 utils/etfAnalytics/advancedChartUtils/tradingStrategyEngine；批次 35 已消化 technicalAnalysis/dashboardCustomization；批次 34 已消化 financialMathEngine/signalsAndRisk/financialDataEngine/technicalIndicatorsLib；批次 33 已消化 chartDataAndLayout/renderOptimization/formValidationEnhanced/quantitativeStrategies；批次 32 已消化 dataWarehouse/backtestEngineLogic/focusRingLogic/componentStateMgmt；批次 31 已消化 factorModels/quantitativeFactors/dataExportEngine/domInteractions；批次 30 已消化 chartDataProcessingDeep/themeStyleSystem/alertEngineV2/dataPipelineEngine；批次 28–29 已消化 optionsPricing/dataVizLogic/formInputValidationDeep/microstructure/backtestCombinations/technicalPatterns；批次 27 消化 tableInteractionEngine/componentRendering/statisticalArbitrage/riskManagement；批次 26 消化 dateTimeEngine/formProcessing/chartDataUtils/kLineChart；批次 24–25 消化 advancedChartEngine/optionStrategyEngine/optionChainEngine/movingAverageSystem/index/performanceUtilsDeep。
- 下一批候选（批次 44 后）：已完成只读语义复核（handover/15，9 文件/273 例），仅 dataEngineAdvanced 可部分绑定且已在本批消化；剩余 8 个（tradeSimulator/dataManager/keyboardNavAdvanced/websocketPool/apiGateway/realtimeProcessing/dataSourceManager/stockModelOperations）生产确无同契约，25 个核心符号 rg 全 0 → 按文件迁移已到语义天花板，再往下只能靠「审计后归档」或改做生产缺陷。体量前四已知不可迁——`serviceWorkerEnhanced.test.ts`（628，类在测试内定义）、`stockLogicComprehensive.test.ts`（610，validateStockCode 契约不符）、`tradingEngineDeep.test.ts`（595，撮合/VWAP/保证金无实现）、`batchCalcsEngine.test.ts`（576，仅 KDJ 有实现）；可再试的是 `tradeSimulator.test.ts`（541）、`dataManager.test.ts`（533）、`keyboardNavAdvanced.test.ts`（508）、`dataEngineAdvanced.test.ts`（496）、`websocketPool.test.ts`（496）、`apiGateway.test.ts`（492）、`realtimeProcessing.test.ts`（490）、`dataSourceManager.test.ts`（480）、`stockModelOperations.test.ts`（480）。扁平目录剩余：backend 362、frontend 325。**已转向**：用户已批准 D 类归档（批次 46 执行 13 个），剩余影子为 S/R 类历史规格，后续以「改绑 R 类 + 归档 D 类」为主，深水区（tradeSimulator/dataManager 等 8 个）按 handover/15 结论不再逐文件迁移。另需注意：`services/batchOperations.ts:121` chunk 对 size<=0 无保护会死循环、`results.sort` 用 indexOf O(n²)，两处已是新增测试锁定口径之外的真实缺陷。
- 批次 41 记录一条 CI 风险：`marketDataUtils.test.ts` 跨包 import `backend/src/services/zScoreEngine`（该文件顶层零 import，安全）；今后跨包绑定时必须先查目标模块顶层是否有 db/logger/xlsx 类依赖，否则重演 run 41758036717 的解析失败。
- 体量大需逐段确认（批次 40 探测线索）：pageDataLogic/dashboardSystem/chartDataAndInteraction/cssAndVisualization 多为页面逻辑自抄件；dataManager/tradeSimulator/serviceWorkerEnhanced 的类均定义在测试内，生产无同名模块，须按语义（dashboardLayoutEngine/dataTable/chartPatternEngine 一类）再判。
- 零重叠 475：旧口径 508 的分类已完成（DSH 侧 `handover/11-零重叠归档候选.md`）：D 死链 119 个/26,258 行（删除审批队列）、R 活模块但 API 自造 105 个/25,267 行（唯一需重写，优先 backend/api → backend/middleware → frontend/utils）、S 纯规格 270 个/71,378 行（归档主体）、X 扫描假阳性 14 个（已由 D38 扫描器修复；比例需按 475 校准）。删除须用户批准，且不得计入迁移数字（D37）。
- 生产缺口待产品阶段评估（只报告未修）：`frontend/src/utils/optionsPricingEngine.ts` 到期希腊值全零、chartInteraction tooltip/crosshair、dashboardLayout clone 浅拷贝、`backend/src/indicators/technical.ts` 缺 OBV/CCI/WilliamsR、formatters formatVolume/formatTurnover 无 null 守卫、`StockDetailPage.tsx:141-153` 自带格式化副本、validateStockCode 只校验 6 位数字。
- 每批迁移后同步下调基线数字，并在本文件追加一节。
