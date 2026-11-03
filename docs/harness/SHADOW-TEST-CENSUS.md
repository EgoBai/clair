# 影子测试普查（M2 第 0 步）

> 生成时间：2026-11-04 03:5x，批次 2 迁移后更新 04:15（Asia/Shanghai）
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
| 影子测试 | **858（56.0%）** |
| 真实导入 | 675 |
| 影子测试代码行 | **225,750 行** |
| 真实测试代码行 | 134,723 行 |

按行数算，63% 的测试代码在断言副本而不是产品代码。

## 三、目录分布

| 目录 | 影子/总数 | 影子占比 |
|------|-----------|----------|
| backend/src/__tests__（扁平） | 433/640 | 67.7% |
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

## 七、CI 守卫（已上线）

- `scripts/guard/shadow-test-census.mjs --check` 读取 `scripts/guard/shadow-baseline.json`，影子数高于基线即 exit 1；降低时需手动下调基线（避免数字回弹）。
- `.github/workflows/ci.yml` 的 `shadow-test-guard` job 在 honesty-guard 之后阻断执行，node 20。
- 基线：shadow 858 / total 1533 / shadowLoc 225,750（批次 2 后；批次 1 后为 860）。

## 八、下一步

- 批次 3 候选：backend 纯计算类（batchCalcsEngine / quantitativeAnalysis / tradingEngineDeep 同族）与能与真实实现一一对应的服务；无真实对应物的 UI 形状用例不硬造生产代码。
- 迁移后同步下调基线数字，并在本文件「已完成的迁移」追加一行。
