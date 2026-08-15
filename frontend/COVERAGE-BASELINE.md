# 前端覆盖率量化基线（COVERAGE-BASELINE.md）

> 生成日期：2026-08-14
> 生成方式：启用 `@vitest/coverage-v8`，定向跑关键目录（`src/services`、`src/utils`）真实产出 `text-summary` / `json-summary` / `lcov`。**所有百分比均来自真实运行输出，未编造**。
> 前置报告：`TEST-COVERAGE-REPORT.md` 曾指出「前端无任何量化覆盖率数据」，本报告补齐该空白。

---

## 1. 结论摘要

| 项目 | 结果 |
|------|------|
| 是否成功启用 v8 | ✅ 是（`frontend/vitest.config.ts` 已配 `provider: 'v8'`） |
| 依赖安装 | ✅ `@vitest/coverage-v8@4.1.10` 已落盘 `node_modules`；`npm install` 过程见 §3 诚实说明 |
| services 目录语句覆盖 | **40.47%**（835/2063） |
| utils 目录语句覆盖 | **72.67%**（27839/38304） |
| 定向用例规模 | **379 测试文件 / 6796 用例，全部通过** |
| 对比后端基线（语句 22.7%） | 前端 utils（72.67%）、services（40.47%）均显著高于后端 |
| lcov 落盘 | ✅ `frontend/coverage/lcov.info`（utils）、`frontend/coverage/services/lcov.info`（services） |

---

## 2. 配置变更

### 2.1 `frontend/vitest.config.ts`（coverage 段）

```ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'text-summary', 'json-summary', 'lcov'],
  reportsDirectory: './coverage',
  include: ['src/**/*.{ts,tsx}'],
  exclude: [
    '**/node_modules/**',
    '**/dist/**',
    '**/*.d.ts',
    '**/__tests__/**',
    '**/*.test.{ts,tsx}',
    '**/*.spec.{ts,tsx}',
  ],
},
```

变更点：原配置已有 `provider: 'v8'`，但 reporter 缺 `text-summary` / `json-summary` / `lcov`，且无 `include`。本轮补齐 reporter 并新增 `include`。

### 2.2 `frontend/package.json`

新增 devDependency：`"@vitest/coverage-v8": "^4.1.2"`（与 `vitest` 版本声明对齐）。

---

## 3. 依赖安装诚实说明

- 沙箱内执行 `npm install -D @vitest/coverage-v8` 报错 `ENOTEMPTY: directory not empty, rename .../node_modules/vitest`（npm 重命名临时目录与已有目录冲突）。
- 但安装包实际已下载到 `node_modules/@vitest/coverage-v8@4.1.10`（`dist/` 完整，`provider.js` 可加载），运行 `--coverage` 正常。
- `package.json` 由本 Agent 手动补上依赖声明（`^4.1.2`），`package-lock.json` 未同步更新（因 install 中断）。
- **用户本地完整安装命令**（修复 lock 文件一致性）：

  ```bash
  cd frontend && npm install -D @vitest/coverage-v8@^4.1.2
  ```

---

## 4. 定向覆盖率基线（目录级百分比）

> 测试文件全部集中在 `frontend/src/__tests__/`（扁平目录 + `components/`、`config/` 子目录），
> 源码按 `src/utils`、`src/services` 等目录组织。测试与源码通过「文件名」对应，
> 故定向跑采用「`--coverage.include=<目录>` + 该目录对应的测试文件列表」方式。

### 4.1 services 目录（22 个源文件，16 测试文件 / 243 用例）

| 指标 | 覆盖数 | 百分比 |
|------|--------|--------|
| Statements（语句） | 835 / 2063 | **40.47%** |
| Branches（分支） | 286 / 915 | **31.25%** |
| Functions（函数） | 214 / 527 | **40.60%** |
| Lines（行） | 771 / 1902 | **40.53%** |

### 4.2 utils 目录（393 个源文件，363 测试文件 / 6553 用例）

| 指标 | 覆盖数 | 百分比 |
|------|--------|--------|
| Statements（语句） | 27839 / 38304 | **72.67%** |
| Branches（分支） | 12950 / 21300 | **60.79%** |
| Functions（函数） | 5473 / 7514 | **72.83%** |
| Lines（行） | 22704 / 30681 | **74.00%** |

### 4.3 定向汇总

| 目录 | 测试文件 | 用例数 | 语句% | 行% | 函数% | 分支% |
|------|---------|--------|-------|------|-------|-------|
| services | 16 | 243 | 40.47 | 40.53 | 40.60 | 31.25 |
| utils | 363 | 6553 | 72.67 | 74.00 | 72.83 | 60.79 |
| **定向合计** | **379** | **6796** | — | — | — | — |

---

## 5. 用例规模（真实计数）

- 前端测试文件总数：**856**（`*.test.ts` 820 + `*.test.tsx` 36，无 `*.spec`）。
- 测试分布：`src/__tests__/` 根目录 + `src/__tests__/components/`（9）+ `src/__tests__/config/`（2）。
- 本轮定向纳入：379 文件 / 6796 用例（全通过，0 失败）。
- 未纳入本轮定向基线：约 477 个测试文件（其余源码目录如 `components/`、`pages/`、`hooks/` 等，待后续批次补测）。

---

## 6. 与后端基线对比

后端基线（来自 `TEST-COVERAGE-REPORT.md`，`backend/coverage/coverage-final.json`，**Jul 13 历史快照**）：

| 指标 | 后端 | 前端 services | 前端 utils |
|------|------|--------------|------------|
| 语句 | 22.7% | 40.47% | 72.67% |
| 函数 | 17.4% | 40.60% | 72.83% |
| 分支 | 58.3% | 31.25% | 60.79% |

解读：
- 前端 utils 层（纯逻辑引擎）覆盖远高于后端，说明前端工具/算法引擎测试质量相对扎实。
- 前端 services 层语句 40.47% 高于后端整体 22.7%，但分支仅 31.25%，网络/I/O 边界分支覆盖不足。
- 后端 71% 测试「自包含」（不 import 真实业务代码）导致覆盖率虚高问题，前端 utils 因文件名与源码强对应，未发现同等程度的问题。

---

## 7. 覆盖率热点与真空清单

### 7.1 services 目录（22 文件）

**0% 真空（8 个，被统计但无任何语句执行）**：
`aiClient.ts`、`api.ts`、`auth.ts`、`backtestDataService.ts`、`enhancedWebsocket.ts`、`exportScheduler.ts`、`performanceMonitor.ts`、`websocket.ts`

> 其中 `auth.ts` 显示 0%，但存在 `auth.test.ts`（14 用例通过）——文件名匹配到的是 `src/services/auth.ts`，
> 而该测试实际 import 的是另一处 auth 模块，属「文件名匹配 ≈ import 关系」的近似误差（见 §9.4）。

**100% 热点（1 个）**：`breadthService.ts`

**低覆盖（<30%）**：`pushNotification.ts`（8.1%）、`notificationService.ts`（26.7%）

### 7.2 utils 目录（393 文件）

- **0% 真空：71 个**。主要构成：
  - 各类 `*Demo.ts` / `*Demo.tsx` 演示文件（`backtestDemo`、`demoData`、`etfDemo`、`factorLabDemo`、`financialInsightDemo`、`fundFlowPageDemo`、`hkConnectDemo`、`industryRotationDemo` 等）——无对应测试。
  - `*-typed.ts` 别名文件（`SmartRequestManager-typed.ts`、`debounceThrottle-typed.ts`）——类型别名，非可测逻辑。
  - 少数被文件名误匹配的模块（如 `ErrorBoundary.tsx`、`adaptiveChartTheme.ts`）。
- **100% 热点：36 个**，以金融引擎类为主：`aStockTradeCostEngine.ts`、`blackLittermanEngine.ts`、`dcfFcfEngine.ts`、`ddmEngine.ts`、`eventDrivenBacktestEngine.ts`、`compositeScoreEngine.ts` 等。
- **低覆盖（≤30%）9 个**：`reactOptimize.ts`（7.7%）、`shortcutEngine.ts`（12.5%）、`imageLazyLoader.ts`（14.3%）、`swRegister.ts`（17.1%）、`deterministic.ts`（17.6%）、`pageTransitions.ts`（17.9%）、`accessibility.ts`（20.1%）、`uiPolish.ts`（23.6%）、`chartExport.ts`（26.9%）。

---

## 8. 全量覆盖率命令（供用户本地运行）

```bash
cd frontend

# 若依赖未装（当前沙箱 install 中断，本地需补一次以同步 lock）
npm install -D @vitest/coverage-v8@^4.1.2

# 全量覆盖率（全部 856 测试文件 + 全 src 统计）
npx vitest run --coverage
```

产物落在 `frontend/coverage/`：`coverage-summary.json`、`lcov.info`、`lcov-report/index.html`。

> ⚠️ **沙箱 OOM 限制**：本 Agent 沙箱内全量（或 `--coverage.include='src/utils/**'` 一次统计 394 文件）会触发
> `exit 137`（SIGKILL / OOM），属沙箱内存上限导致的**假错**，非测试本身失败。全量命令请在本地机器（内存充足）执行。

---

## 9. lcov 落盘与诚实说明

### 9.1 lcov 落盘位置（均已生成，真实文件）

| 数据 | 路径 | 大小 |
|------|------|------|
| utils lcov | `frontend/coverage/lcov.info` | ~984 KB |
| utils json-summary | `frontend/coverage/coverage-summary.json` | ~132 KB |
| utils HTML | `frontend/coverage/lcov-report/` | 403 文件 |
| services lcov | `frontend/coverage/services/lcov.info` | ~54 KB |
| services json-summary | `frontend/coverage/services/coverage-summary.json` | ~7.6 KB |

> `coverage/` 在根 `.gitignore` 第 6 行被忽略，产物**不入库**，仅本地留档。`frontend/coverage/services/` 亦在 `coverage/` 之下，同样被忽略。

### 9.2 沙箱 OOM 限制（诚实记录）

- 沙箱内 `--coverage.include='src/utils/**'`（一次 instrument 394 源文件）→ `exit 137` OOM。
- 沙箱内 40 文件批量 include → 同样失败（内存受限）。
- 以上在**沙箱外**（escalation）均正常：utils 全量 393 文件 / 363 测试文件 / 6553 用例一次跑通，用时 ~52s。
- 结论：定向基线数据为**沙箱外真实运行结果**；全量 src（856 测试 + 全部源码）沙箱内必然 OOM，须本地运行。

### 9.3 safe-delete 拦截（对结果无影响）

vitest 在启动（`clean`）与结束（`cleanAfterRun`）会清理 `coverage/.tmp` 临时目录（单次 >50 文件），
被 WorkBuddy `safe-delete` 保护机制拦截并抛 `Unhandled Error`。但 `json-summary` / `lcov` 在清理**之前**已成功写入，
因此**不影响覆盖率结果**；副作用是 `coverage/.tmp` 残留（位于 gitignore 内，无碍）。

### 9.4 文件名匹配局限（口径说明）

测试文件扁平集中在 `src/__tests__/`，本报告用「测试文件名 ↔ 源码文件名」建立对应关系。个别同名模块
（如 `auth.ts`、`ErrorBoundary.tsx`、`adaptiveChartTheme.ts`）的测试实际 import 的是其他目录的同名文件，
导致文件级 0% 清单含少量误标。目录级聚合百分比不受显著影响，但文件级「真空清单」请按近似口径理解。

---

## 10. 文件域变更清单（本轮实际改动）

| 文件 | 操作 |
|------|------|
| `frontend/vitest.config.ts` | 修改 coverage reporter + 新增 include |
| `frontend/package.json` | 新增 `@vitest/coverage-v8` devDependency |
| `frontend/COVERAGE-BASELINE.md` | 新建（本报告） |
| `frontend/coverage/**` | 覆盖率产物（gitignore 忽略，不入库） |

未改动 `frontend/src/**`、`backend/**` 及任何在途自动化文件。未执行 `git add/commit/push`。

---

## 11. 自包含测试改写波次（2026-08-15）——真实覆盖率回填

### 11.1 问题定位

前端 **858** 个测试文件中，**451** 个为「完全自包含」测试：仅 `import { describe, it, expect } from 'vitest'`，
把被测逻辑**内联重实现**一份（甚至另写一套与真实模块不符的逻辑），导致真实源码模块 **0% 覆盖**。
其中 **46** 个能精确映射到同名真实模块（其余 405 个为孤儿测试，无对应模块）。

### 11.2 处理动作

将这 **46** 个自包含测试改写为 `import` 真实模块并驱动真实行为；删除内联重实现副本，断言对准真实模块契约。
涉及真实模块：`src/utils/*`（40 个引擎/工具）+ `src/services/auth.ts` + `src/hooks/*`（4 个钩子）。
全部 46 个测试文件经定向 vitest（OOM 安全：`NODE_OPTIONS=--max-old-space-size=4096 npx vitest run <file> --pool=forks`）**独立核验通过（46/46）**。

> 改写中发现并修正的「旧测试 invented 期望值」：
> - `chartTheme.test.ts`：旧断言 `#F87171/#4ADE80`，真实 `DARK_THEME` 实为 `#EF4444/#22C55E` —— 已改为断言真实色值。
> - `sentimentAnalysisEngine.test.ts`：旧断言否定词翻转 + impact 饱和到 1，真实模块无否定处理且 impact 有界 0.306 —— 已修正。
> - `regimeDetectionEngine.test.ts`：旧用 `Math.random()` 喂数据且 `detectRegimeChanges` 签名错误（应为 `(prices, timestamps, window)`）—— 已改确定性序列 + 真实签名。

### 11.3 改写后 46 个真实模块的 v8 覆盖率（来自 `coverage/coverage-summary.json`，定向 46 文件运行）

| 模块 | 语句% | 行% | 函数% |
|------|-------|-----|-------|
| src/services/auth.ts | 69.56 | 70.76 | 73.91 |
| src/utils/adaptiveChartTheme.ts | 100 | 100 | 100 |
| src/utils/anomalyDetectionEngine.ts | 89.52 | 94.55 | 89.28 |
| src/utils/calendarAnomalyEngine.ts | 99.34 | 99.20 | 100 |
| src/utils/chartPerformance.ts | 98.05 | 98.85 | 100 |
| src/utils/chartTheme.ts | 81.81 | 80.00 | 77.77 |
| src/utils/convertibleBondEngine.ts | 92.72 | 100 | 100 |
| src/utils/dynamicLocaleLoader.ts | 73.17 | 83.87 | 73.33 |
| src/utils/elliottWaveEngine.ts | 84.50 | 85.71 | 96.77 |
| src/utils/etfHoldingEngine.ts | 97.91 | 98.76 | 95.83 |
| src/utils/greeksEngine.ts | 93.52 | 93.98 | 100 |
| src/utils/insiderClusterEngine.ts | 84.61 | 84.93 | 95.23 |
| src/utils/lazyLoad.tsx | 76.92 | 76.59 | 52.38 |
| src/utils/liquidityScoreEngine.ts | 85.00 | 91.30 | 90.90 |
| src/utils/loadingOrchestrator.ts | 82.44 | 88.07 | 80.43 |
| src/utils/offlineMode.ts | 44.18 | 47.52 | 48.31 |
| src/utils/patternRecognition.ts | 85.29 | 86.58 | 100 |
| src/utils/performance.ts | 54.54 | 55.72 | 61.36 |
| src/utils/performanceAttributionEngine.ts | 100 | 100 | 100 |
| src/utils/portfolioOptimizer.ts | 86.47 | 90.17 | 92.45 |
| src/utils/positionSizingEngine.ts | 100 | 100 | 100 |
| src/utils/quantFactorEngine.ts | 89.83 | 100 | 100 |
| src/utils/reactOptimize.ts | 58.46 | 59.64 | 69.56 |
| src/utils/regimeDetectionEngine.ts | 93.53 | 94.63 | 100 |
| src/utils/researchReportAnalysisEngine.ts | 97.00 | 100 | 100 |
| src/utils/responsiveUtils.ts | 98.55 | 98.36 | 100 |
| src/utils/riskScenarioEngine.ts | 94.38 | 96.00 | 88.23 |
| src/utils/rtlSupport.ts | 92.00 | 91.66 | 84.61 |
| src/utils/seasonalPatternEngine.ts | 90.63 | 91.03 | 98.76 |
| src/utils/sectorRotation.ts | 95.00 | 95.52 | 100 |
| src/utils/sentimentAnalysisEngine.ts | 95.10 | 96.25 | 97.05 |
| src/utils/seoI18n.ts | 82.60 | 87.69 | 80.00 |
| src/utils/shortInterestEngine.ts | 90.32 | 97.36 | 100 |
| src/utils/stDelistingRiskEngine.ts | 93.49 | 97.77 | 100 |
| src/utils/stockComparisonEngine.ts | 98.66 | 98.30 | 100 |
| src/utils/stockConnectDeepEngine.ts | 93.67 | 95.52 | 94.44 |
| src/utils/supplyChainRiskEngine.ts | 92.30 | 97.22 | 86.20 |
| src/utils/trendFollowingEngine.ts | 85.29 | 87.50 | 100 |
| src/utils/volSurfaceEngine.ts | 92.45 | 93.82 | 96.15 |
| src/utils/volumeProfileEngine.ts | 98.85 | 100 | 100 |
| src/utils/webVitals.ts | 63.85 | 68.91 | 66.66 |
| src/utils/wsConnectionPool.ts | 95.89 | 96.29 | 89.28 |
| src/hooks/useEnhancedWebSocket.ts | 86.36 | 92.10 | 64.28 |
| src/hooks/useKeyboardShortcuts.ts | 98.36 | 98.27 | 100 |
| src/hooks/useNetworkStatus.ts | 82.55 | 82.05 | 71.42 |
| src/hooks/useVirtualScroll.ts | 90.66 | 90.90 | 78.57 |

### 11.4 解读

- 上述 46 个模块**改写前均为 0%**（测试内联重实现，未触达真实代码）。
- 改写后 24 个 ≥90% 语句、8 个 80–90%、其余为重型模块（`offlineMode` 44% 因 IndexedDB 异步 + 无 fake-indexeddb；
  `performance` 55% / `reactOptimize` 58% / `webVitals` 64% 因 rAF/timer/observer 边界）的**诚实部分覆盖**，非虚高。
- §7.2 原「0% 真空」清单中的 `adaptiveChartTheme.ts`、`auth.ts` 经本轮改写已消除 0%（见上表），§9.4 同名误标问题同步修正。

### 11.5 红线核查（诚实记录）

- **Math.random 红线**：46 个被测模块中有 5 个含真实 `Math.random`（`loadingOrchestrator/offlineMode/webVitals` 各 1 处生成 ID；`wsConnectionPool` 2 处含重连 jitter；`riskScenarioEngine` 1 处风险模拟正态近似）——均**非伪造行情/指标数据**，属 ID/抖动/模拟内部用途，为**改写前既有**状态，本轮未改动这些模块。
- 46 个测试文件本身未引入任何 `Math.random` 伪造数据（仅 `webVitals.test.ts` 用其生成事件 id 字符串，与模块自身一致；其余 3 处为「no Math.random」注释文字）。
- **在途文件未触碰**：`factorEngine.ts`/`etfDataService.ts`/`api/factors.ts`/`_schema_check.ts`/`PLAN.md`/`DECISION_LOG.md`/`ReportCenterPage.tsx`/`ui-guard-report.md` 均未被本波次修改（仅 `git add` 46 个 `src/__tests__/*.test.ts`）。
