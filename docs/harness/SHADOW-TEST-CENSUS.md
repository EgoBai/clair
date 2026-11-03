# 影子测试普查（M2 第 0 步）

> 生成时间：2026-11-04 03:5x，批次 25 迁移后更新 07:00（Asia/Shanghai）
> 工具：`node scripts/guard/shadow-test-census.mjs [--json]`（只读，不改任何文件）
> 基线：批次 25 后重扫（批次 23 提交 0adc30879 + 批次 24/25 工作区）

## 一、判定口径

「影子测试」= 测试文件**不 import 任何项目源码**：只 import vitest/第三方，或相对路径仍落在 `__tests__` 内。
它断言的是测试文件里自抄的一份实现（或复制来的数据结构），**项目代码改坏它也不会红**。

统计范围：`backend/src` + `frontend/src` 下全部 `*.test.*` / `*.spec.*`，排除 node_modules。

口径修正（2026-11-04）：此前正则只认行首静态 import，漏判 `await import('../x')` 动态导入，把 34 个真实导入测试误记为影子；census 与 candidates 两个脚本均已补 `import(` 分支，后续数字以新口径为准。

## 二、结论（数字）

| 指标 | 数值 |
|------|------|
| 测试文件总数 | 1,533 |
| 影子测试 | **760（49.6%）** |
| 真实导入 | 773 |
| 影子测试代码行 | **202,340 行** |
| 真实测试代码行 | 159,666 行 |

按行数算，55.9% 的测试代码在断言副本而不是产品代码。

## 三、目录分布

| 目录 | 影子/总数 | 影子占比 |
|------|-----------|----------|
| backend/src/__tests__（扁平） | 393/640 | 61.4% |
| frontend/src/__tests__（扁平） | 367/868 | 42.3% |
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

## 七、CI 守卫（已上线）

- `scripts/guard/shadow-test-census.mjs --check` 读取 `scripts/guard/shadow-baseline.json`，影子数高于基线即 exit 1；降低时需手动下调基线（避免数字回弹）。
- `.github/workflows/ci.yml` 的 `shadow-test-guard` job 在 honesty-guard 之后阻断执行，node 20。
- 基线：shadow 760 / total 1533 / shadowLoc 202,340（批次 27 后）。历史基线：批次 17–18 后 794、批次 14 后 835、批次 11 后 841、批次 10 后 843、批次 7 后 849、批次 6 后 851——批次 6–14 为旧口径（漏判动态 import），不可与新数字直接比较。

## 八、迁移候选扫描（工具）

不再凭感觉挑文件：`node scripts/guard/shadow-migration-candidates.mjs [--json] [--top N]`（只读）给出两条证据：

1. **符号证据**：影子测试里自抄的函数/常量名，是否在某个生产源码文件里被 `export`；
2. **命名证据**：测试文件名与生产源码路径的规范化字符串是否互相包含。

输出按「重叠符号数」降序，仅作线索——接口是否兼容仍须人工读生产实现。当前结果：760 个影子测试中 37 个检测到 2 个生产 export 符号重叠（≥3 已清零）；另有 1 个符号重叠 248 个、零重叠 475 个（批次 27 后重扫）。`--all` 输出全量行，`distribution` 给出分数字段，供收口策略分层。

## 九、下一步

- 批次 27 已消化 tableInteractionEngine/componentRendering/statisticalArbitrage/riskManagement；批次 26 消化 dateTimeEngine/formProcessing/chartDataUtils/kLineChart；批次 24–25 消化 advancedChartEngine/optionStrategyEngine/optionChainEngine/movingAverageSystem/index/performanceUtilsDeep；批次 23 消化 responsiveLogic/optionsGreeksAdvanced 等 8 个。
- 下一批候选（2 符号重叠 37 个里价值较高的）：`backend/src/__tests__/optionsPricing.test.ts`（215，blackScholes/impliedVolatility）、`frontend/src/__tests__/dataVizLogic.test.ts`（236，technical/trendFollowing 的 MA/EMA）、`frontend/src/__tests__/formInputValidationDeep.test.ts`（254）、`backend/src/__tests__/microstructure.test.ts`（265）、`backend/src/__tests__/backtestCombinations.test.ts`（267）、`frontend/src/__tests__/formValidationEnhanced.test.ts`（357）、`backend/src/__tests__/quantitativeStrategies.test.ts`（365）、`backend/src/__tests__/technicalPatterns.test.ts`（314）。
- 体量大需逐段确认：`frontend/src/__tests__/userDeepDive.test.ts`（869 行）、`advancedCandlestickPatterns.test.ts`（682）、`advancedPageLogic.test.ts`（658）。
- 零重叠 475：旧口径 508 的分类已完成（DSH 侧 `handover/11-零重叠归档候选.md`）：D 死链 119 个/26,258 行（删除审批队列）、R 活模块但 API 自造 105 个/25,267 行（唯一需重写，优先 backend/api → backend/middleware → frontend/utils）、S 纯规格 270 个/71,378 行（归档主体）、X 扫描假阳性 14 个（已由 D38 扫描器修复；比例需按 475 校准）。删除须用户批准，且不得计入迁移数字（D37）。
- 生产缺口待产品阶段评估（只报告未修）：`frontend/src/utils/optionsPricingEngine.ts` 到期希腊值全零、chartInteraction tooltip/crosshair、dashboardLayout clone 浅拷贝、`backend/src/indicators/technical.ts` 缺 OBV/CCI/WilliamsR、formatters formatVolume/formatTurnover 无 null 守卫、`StockDetailPage.tsx:141-153` 自带格式化副本、validateStockCode 只校验 6 位数字。
- 每批迁移后同步下调基线数字，并在本文件追加一节。
