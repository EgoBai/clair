# 影子测试普查（M2 第 0 步）

> 生成时间：2026-11-04 03:5x（Asia/Shanghai）
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
| 影子测试 | **860（56.1%）** |
| 真实导入 | 672 |
| 影子测试代码行 | **227,153 行** |
| 真实测试代码行 | 133,658 行 |

按行数算，63% 的测试代码在断言副本而不是产品代码。

## 三、目录分布

| 目录 | 影子/总数 | 影子占比 |
|------|-----------|----------|
| backend/src/__tests__（扁平） | 434/640 | 67.8% |
| frontend/src/__tests__（扁平） | 426/868 | 49.1% |
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

## 七、下一步

- CI 加守卫：影子占比不得高于本基线（56.2% / 861），新增测试必须真实导入；数字写入脚本，避免手改。
- 批次 1 候选：backend 纯计算类（batchCalcsEngine / quantitativeAnalysis / tradingEngineDeep 及其同族）。
