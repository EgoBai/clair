# 影子测试普查（M2 第 0 步）

> 生成时间：2026-11-04 03:5x，批次 4 迁移后更新 05:00（Asia/Shanghai）
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
| 影子测试 | **855（55.8%）** |
| 真实导入 | 678 |
| 影子测试代码行 | **224,605 行** |
| 真实测试代码行 | 135,715 行 |

按行数算，63% 的测试代码在断言副本而不是产品代码。

## 三、目录分布

| 目录 | 影子/总数 | 影子占比 |
|------|-----------|----------|
| backend/src/__tests__（扁平） | 430/640 | 67.2% |
| frontend/src/__tests__（扁平） | 425/868 | 49.0% |
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

## 七、CI 守卫（已上线）

- `scripts/guard/shadow-test-census.mjs --check` 读取 `scripts/guard/shadow-baseline.json`，影子数高于基线即 exit 1；降低时需手动下调基线（避免数字回弹）。
- `.github/workflows/ci.yml` 的 `shadow-test-guard` job 在 honesty-guard 之后阻断执行，node 20。
- 基线：shadow 855 / total 1533 / shadowLoc 224,605（批次 4 后；批次 3 后为 857）。

## 八、迁移候选扫描（工具）

不再凭感觉挑文件：`node scripts/guard/shadow-migration-candidates.mjs [--json] [--top N]`（只读）给出两条证据：

1. **符号证据**：影子测试里自抄的函数/常量名，是否在某个生产源码文件里被 `export`；
2. **命名证据**：测试文件名与生产源码路径的规范化字符串是否互相包含。

输出按「重叠符号数」降序，仅作线索——接口是否兼容仍须人工读生产实现。当前结果：855 个影子测试中 99 个检测到生产 export 符号重叠（其余多为纯 UI 形状或虚构能力，不硬造生产代码）。

## 九、下一步

- 批次 5 候选：`priceFormatter.test.ts`（257 行，5 个 format* 符号重叠）对接 `frontend/src/utils/formatters.ts`；`dateTimeUtils.test.ts`（233 行）对接 `backend/src/utils/tradingCalendar.ts`；`sharedTypes.test.ts`（394 行，16 符号重叠 formatters.ts）需先判断前端 utils 与后端测试的边界是否合理。
- 每批迁移后同步下调基线数字，并在本文件追加一节。
