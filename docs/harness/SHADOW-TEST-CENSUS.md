# 影子测试普查（M2 第 0 步）

> 生成时间：2026-11-04 03:5x，批次 10 迁移后更新 05:44（Asia/Shanghai）
> 工具：`node scripts/guard/shadow-test-census.mjs [--json]`（只读，不改任何文件）
> 基线：HEAD 7da89354f

## 一、判定口径

「影子测试」= 测试文件**不 import 任何项目源码**：只 import vitest/第三方，或相对路径仍落在 `__tests__` 内。
它断言的是测试文件里自抄的一份实现（或复制来的数据结构），**项目代码改坏它也不会红**。

统计范围：`backend/src` + `frontend/src` 下全部 `*.test.*` / `*.spec.*`，排除 node_modules。

## 二、结论（数字）

| 指标 | 数值 |
|------|------|
| 测试文件总数 | 1,533 |
| 影子测试 | **843（55.0%）** |
| 真实导入 | 690 |
| 影子测试代码行 | **220,676 行** |
| 真实测试代码行 | 139,270 行 |

按行数算，61% 的测试代码在断言副本而不是产品代码。

## 三、目录分布

| 目录 | 影子/总数 | 影子占比 |
|------|-----------|----------|
| backend/src/__tests__（扁平） | 423/640 | 66.1% |
| frontend/src/__tests__（扁平） | 420/868 | 48.4% |
| backend/src/__tests__/models | 0/7 | 0% |
| backend/src/__tests__/services | 0/3 | 0% |
| frontend/src/__tests__/components | 0/9 | 0% |
| frontend/src/__tests__/config | 0/3 | 0% |

规律：**分层写进子目录的测试全部真实导入；影子全部堆在两个扁平 `__tests__` 根目录**。

## 四、最大的影子文件（Top 15，按行数）

| 行数 | 文件 |
|------|------|
| 869 | frontend/src/__tests__/userDeepDive.test.ts |
| 707 | backend/src/__tests__/notification-service.test.ts |
| 696 | frontend/src/__tests__/i18nEnhanced.test.ts |
| 682 | frontend/src/__tests__/advancedCandlestickPatterns.test.ts |
| 658 | frontend/src/__tests__/advancedPageLogic.test.ts |
| 637 | frontend/src/__tests__/dashboardCustomization.test.ts |
| 628 | frontend/src/__tests__/serviceWorkerEnhanced.test.ts |
| 610 | backend/src/__tests__/stockLogicComprehensive.test.ts |
| 595 | backend/src/__tests__/tradingEngineDeep.test.ts |
| 581 | backend/src/__tests__/quantitativeAnalysis.test.ts |
| 581 | frontend/src/__tests__/frontendLogicComprehensive.test.ts |
| 580 | backend/src/__tests__/userSystemEnhanced.test.ts |
| 576 | backend/src/__tests__/batchCalcsEngine.test.ts |
| 570 | frontend/src/__tests__/macroEconomicAnalysis.test.ts |
| 558 | frontend/src/__tests__/pageDataLogic.test.ts |

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

## 七、CI 守卫（已上线）

- `scripts/guard/shadow-test-census.mjs --check` 读取 `scripts/guard/shadow-baseline.json`，影子数高于基线即 exit 1；降低时需手动下调基线（避免数字回弹）。
- `.github/workflows/ci.yml` 的 `shadow-test-guard` job 在 honesty-guard 之后阻断执行，node 20。
- 基线：shadow 843 / total 1533 / shadowLoc 220,676（批次 10 后；批次 7 后 849、批次 6 后 851）。

## 八、迁移候选扫描（工具）

不再凭感觉挑文件：`node scripts/guard/shadow-migration-candidates.mjs [--json] [--top N]`（只读）给出两条证据：

1. **符号证据**：影子测试里自抄的函数/常量名，是否在某个生产源码文件里被 `export`；
2. **命名证据**：测试文件名与生产源码路径的规范化字符串是否互相包含。

输出按「重叠符号数」降序，仅作线索——接口是否兼容仍须人工读生产实现。当前结果：843 个影子测试中 87 个检测到 ≥2 个生产 export 符号重叠（2 个 63、3 个 17、4 个 4、5 个 3）；另有 248 个只有 1 个符号重叠、508 个零重叠。`--all` 输出全量行，`distribution` 给出分数字段，供收口策略分层。

## 九、下一步

- 批次 8 候选：`optionsAndDerivatives.test.ts`（307 行）对接 `backend/src/services/optionsGreeksEngine.ts`；`volatilityRisk.test.ts`（346 行）对接 `frontend/src/utils/backtestPerformanceAnalyzer.ts` 与 `globalCorrelationEngine.ts`（注意：batch 3 已确认 calculateMaxDrawdown 的 peak 取全局峰值，与 trough 不属同一回撤区间，需谨慎）。
- 备选：`priceFormatter.test.ts` / `numberFormatEngine.test.ts` 对接 `frontend/src/utils/formatters.ts`（formatNumber 带千分位、formatPercent 收 0.15 这类小数）。
- 新增关注：`backend/src/indicators/technical.ts` 无 OBV/CCI/WilliamsR 实现，相关测试暂留本地 helper。
- 关注点：`frontend/src/utils/optionsPricingEngine.ts` 到期希腊值全零属生产已知局限，已由测试固化，待产品阶段评估是否修。
- 每批迁移后同步下调基线数字，并在本文件追加一节。
