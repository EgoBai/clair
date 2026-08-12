# 测试覆盖率量化报告（TEST-COVERAGE-REPORT.md）

> 生成日期：2026-08-13
> 仓库：`/Users/ego_bai/.openclaw/workspace/a-stock-website`
> 性质：**纯只读分析**，未修改任何源码或测试文件；仅新增本报告。
> 生成方式：基于 `git` 之外真实 `grep`/`rg` 计数与 `coverage-final.json` 解析，**无任何编造数字**。

---

## 1. 一句话结论

仓库拥有**海量但高度"自包含"的测试**：后端 597 个测试文件 / 14,589 用例，前端 854 个 / 17,847 用例，合计 **1,451 文件、约 32,436 用例**。

然而真实代码覆盖率极低且分布极度失衡：
- **后端存在真实覆盖率基线**（Jul 13 的 `backend/coverage/coverage-final.json`）：整体语句覆盖仅 **22.7%**、函数 **17.4%**、分支 **58.3%**；核心 `services/` 引擎层仅 **8.9%** 语句覆盖，**78 个 service 文件 0% 命中**。
- **前端无任何量化覆盖率数据**（无 lcov/clover/coverage 报告），仅有用例计数。
- **约 71% 后端测试、62% 前端测试仅 import `vitest`**（内联重实现逻辑），并不 import 任何真实业务模块——这是"用例数虚高、真实覆盖低"的根因。
- 与"诚实数据/真实化"红线最相关的**真实数据层与因子/轮动引擎几乎 0% 覆盖**：`realMarketData.ts`、`*DataService.ts`、`quantFactorEngine`、`rotationEngine`、`block-trades.ts` 等。

---

## 2. 数据来源与方法

| 数据源 | 路径 | 说明 |
|---|---|---|
| 后端覆盖率基线 | `backend/coverage/coverage-final.json`（4.7MB，Istanbul 格式，生成于 Jul 13 00:13） | **真实量化基线**，本报告后端百分比全部由此解析 |
| 后端 HTML 报告 | `backend/coverage/index.html` | 对应可视化报告 |
| 前端覆盖率 | 无 | `frontend/coverage` 不存在；无 lcov/clover |
| 根级原始片段 | `coverage/.tmp/coverage-*.json`（1034 个，v8 新格式，Jul 11） | 为按 worker 拆分的原始片段，**未合并**，不可作为基线 |
| 测试文件清单 | `backend/src/**/*.test.ts`、`frontend/src/__tests__/**/*.test.{ts,tsx}` | `find` + `rg` 计数 |
| 用例计数 | `rg -P '\b(it|test)\s*\('` | 统计 `it(`/`test(` 调用次数（近似用例数） |
| 模块归属 | 解析每个测试文件的 import 路径 | 用于把扁平的 `__tests__/` 测试映射到业务模块 |

**可信度层级**：
1. 测试文件数 / 用例数 = `rg`/`find` 真实计数 → **高可信**。
2. 后端覆盖率百分比 = 解析 `coverage-final.json` → **真实但为 Jul 13 历史快照**，与当前测试可能略有偏差（见 §7）。
3. 前端"模块归属 / 自包含比例" = 基于 import 文本解析的**估算**，用于暴露质量结构问题，非精确覆盖率。

---

## 3. 测试资产总览（真实计数）

| 指标 | 后端 (backend/src) | 前端 (frontend/src) | 合计 |
|---|---|---|---|
| 测试文件数 | 597（含 2 个 node_modules 假阳性已剔除） | 854（全部在 `__tests__/`） | **1,451** |
| `it()`/`test()` 用例数 | 14,589 | 17,847 | **32,436** |
| `describe()` 块数 | 3,992 | 5,203 | 9,195 |
| 单文件均值用例 | ~24 | ~21 | ~22 |
| 测试代码总量 | ~5.47 MB | ~6.18 MB | ~11.6 MB |
| 量化覆盖率数据 | 有（Jul 13 基线） | **无** | — |

> 计数命令（可复现）：
> - 文件数：`find backend/src -path '*/node_modules/*' -prune -o -name '*.test.ts' -print | wc -l` → 597
> - 用例数：`rg -c --glob 'backend/src/**/*.test.ts' -P '\b(it|test)\s*\(' backend/src | awk -F: '{s+=$2} END{print s}'` → 14,589

---

## 4. 后端量化覆盖率（解析 `backend/coverage/coverage-final.json`）

### 4.1 整体（Jul 13 快照）

| 维度 | 覆盖 / 总计 | 百分比 |
|---|---|---|
| 语句 (Statements) | 12,848 / 56,661 | **22.7%** |
| 函数 (Functions) | 130 / 746 | **17.4%** |
| 分支 (Branches) | 388 / 665 | **58.3%** |

> 注：分支百分比为"分支路径命中率"（每个分支各路径计数 >0 即算覆盖），口径偏宽松；语句/函数口径为标准 Istanbul 口径。

### 4.2 按顶层目录（模块）拆分

| 目录 | 文件数 | 语句% | 函数% | 分支% | 解读 |
|---|---|---|---|---|---|
| `services/` | 93 | **8.9%** | **4.7%** | 16.1% | 核心引擎层，覆盖极低 |
| `api/` | 49 | 35.8% | 4.5% | 61.5% | 路由层尚可，但函数几乎未被调用 |
| `utils/` | 28 | 11.7% | 28.0% | 65.6% | 工具零散覆盖 |
| `middleware/` | 11 | 62.6% | 41.0% | 66.1% | 覆盖较好 |
| `models/` | 8 | 24.3% | **0.0%** | 0.0% | 模型函数从未被调用 |
| `db/` | 3 | 51.2% | 35.6% | 69.7% | 覆盖较好 |
| `data-sync/` | 2 | 35.7% | 27.8% | 100.0% | — |
| `websocket/` | 1 | 46.9% | 23.5% | 71.4% | — |
| `indicators/` | 1 | 27.8% | 0.0% | n/a | — |
| `routes/` | 1 | 41.7% | n/a | n/a | — |
| `.dead-code/` | 5 | 0.0% | 0.0% | 0.0% | 死代码，无需关注 |
| `seeds/` | 2 | 0.0% | 0.0% | 0.0% | — |
| `app.ts`/`index.ts` | 2 | 78.8% / 0.0% | — | — | — |

**19 个源文件从未被测试加载（0% 确定性）**，包括真实数据层：
`api/hkConnect.ts`、`api/market.ts`、`docs/*`(4)、`middleware/aiTiming.ts`、`services/conceptBoardService.ts`、`services/etfDataService.ts`、`services/financialsDataService.ts`、`services/fundFlowProviders.ts`、`services/llmGateway.ts`、`services/newsDataService.ts`、`services/notification/types.ts`、`services/realMarketData.ts`、`services/sectorMomentumService.ts`、`types/*`(2)、`vitest.config.ts`。

**78 个 service 文件被加载但 0% 语句命中**（即被 import 但未执行任何逻辑），完整清单见 §6。

### 4.3 命名功能模块（任务点名项）覆盖率

| 功能模块 | 关键源文件 | 覆盖率（Jul 13） | 状态 |
|---|---|---|---|
| market | `api/market.ts` | **NEVER LOADED（0%）** | 真实数据层未测 |
| hk-connect（北向） | `api/hkConnect.ts` | **NEVER LOADED（0%）** | 真实数据层未测 |
| etf | `api/etf.ts` / `services/etfDataService.ts` / `services/etfArbitrageEngine.ts` | 49.5% / **0%** / **0%** | 路由尚可，引擎未测 |
| news | `api/news.ts` / `services/newsDataService.ts` | 57.5%（函数 0/6）/ **0%** | 路由尚可，数据层未测 |
| financials | `api/financials.ts` / `services/financialsDataService.ts` | 18.7%（函数 0/4）/ **0%** | 数据层未测 |
| ai-analysis | `services/aiService.ts` / `services/llmGateway.ts` | 27.7%（函数 0/13）/ **0%** | 引擎部分覆盖，网关未测 |
| block-trades | `api/block-trades.ts` / `services/tradeClassificationEngine.ts` / `services/abnormalTradeEngine.ts` / `services/orderFlowToxicityEngine.ts` | 13.6% / **0%** / **0%** / **0%** | **几乎全 0%（P0 修复对象）** |
| breadth | `services/marketBreadth.ts` | 33.8%（函数 12.5%） | 部分覆盖 |
| 因子 (factor) | `services/quantFactorEngine.ts` / `barraFactorEngine.ts` / `valueFactorEngine.ts` / `qualityFactorEngine.ts` | **0%** / **0%** / **0%** / **0%** | 因子引擎全 0% |
| 行业轮动 (rotation) | `services/rotationEngine.ts` / `sectorMomentumService.ts` | **0%** / **0%** | 轮动引擎全 0% |

---

## 5. 后端测试质量结构（import 解析）

| 测试类型 | 文件数 | 占比 |
|---|---|---|
| 仅 import `vitest`（自包含/内联重实现） | 424 | **71%** |
| import 了真实后端模块（api/services/utils…） | 159 | 27% |
| 仅 import 相对 helper / 测试工具 | 14 | 2% |

> 结论：后端 71% 的测试是"自包含"的——它们自行定义接口与计算逻辑并断言，**并不 import 真实业务代码**。这正是"14,589 用例却只有 22.7% 语句覆盖"的根本原因：用例数严重虚高，真实逻辑未被验证。

---

## 6. 前端（无量化覆盖率，仅用例与结构计数）

- 测试文件 **854**，全部位于 `frontend/src/__tests__/`（无 co-located 测试）。
- 用例数 **17,847**（`it()`/`test()`），`describe()` 5,203。
- **无 lcov/clover/coverage 报告**，无法给出百分比基线。
- 按 import 模块归属（同一文件可能命中多类，故可重复计数）：

| 前端模块 | 命中测试文件 | 用例数 | 说明 |
|---|---|---|---|
| `utils/`（含因子/轮动引擎） | 320 | 6,145 | 唯一被充分测试的"真实模块" |
| `components/` | 32 | 504 | — |
| `services/` | 14 | 218 | — |
| `hooks/` | 11 | 161 | — |
| `config/` | 4 | 73 | — |
| `routes/` | 2 | 36 | — |
| `pages/` | **0** | **0** | 页面组件**无任何测试 import** |
| `store/` | **0** | **0** | 状态层未测 |
| `contexts/` `types/` `i18n/` | **0** | **0** | 未测 |

- **477 / 854 前端测试（62%）仅 import `vitest`**（自包含），与后端同源问题。
- `frontend/src/__tests__/` 中按文件名命中的工具类：factor 14、rotation/rotat 12、backtest 12、strategy 12、portfolio 12、indicator 4、calc 6、engine 362、signal 6、screener 3。说明因子/轮动/回测相关**测试文件数量不少**，但需核查它们是否 import 真实 `utils/*` 还是自包含重实现（结合 62% 自包含比例，多数很可能为自包含）。

> 关键空白：`pages/`、`store/`、`contexts/`、`types/`、`i18n/` 在生产代码中占比巨大，却 **0 个测试文件 import**。前端页面与全局状态层近乎测试真空。

---

## 7. 可靠性说明（诚实数据红线）

1. **后端百分比是 Jul 13 历史快照**：`coverage-final.json` 由约一个月前的某次 `vitest --coverage` 运行生成。当前测试文件（597）与当时可能不同，因此百分比为"截至 Jul 13 的真实覆盖"，非实时。若需当前值，见 §8 命令重新采集。
2. **根级 `coverage/.tmp/*.json` 不可直接使用**：其为 v8 按 worker 拆分的原始片段（1034 个、新格式 `{"result":[...]}`），未合并、未聚合，本报告未将其计入基线。
3. **"自包含 71%/62%"为估算**：由 import 文本解析得出，用于暴露测试质量结构，非精确覆盖率口径。
4. **0% 命中的两种含义已区分**：
   - "NEVER LOADED" = 该文件根本未被任何测试 import（0% 确定性）；
   - "0% 命中（已加载）" = 被 import 但语句从未执行（可能仅副作用引入）。
5. 所有数字均可在本仓库复现（命令已附），未作任何推算或填充。

---

## 8. 如何建立/刷新当前覆盖率基线

```bash
# 后端（已有配置，会刷新 backend/coverage）
cd backend && npx vitest run --coverage

# 前端（当前无 coverage 配置，需先启用；建议在 frontend/vitest.config 增加 coverage 项）
cd frontend && npx vitest run --coverage

# 或仓库根（按根 vitest.config.ts 的 include 同时跑前后端，但不含 coverage provider 合并）
npx vitest run --coverage
```

> 建议：在 `frontend` 的 vitest 配置中启用 `@vitest/coverage-v8`，使前端也能产出可量化基线；并将前后端 coverage 合并输出统一 lcov 以便 CI 对比。

---

## 9. 缺失覆盖 Top 清单（按优先级）

**P0 — 真实数据 / 真实化红线（必须补测，否则"诚实数据"无保障）**
1. `services/realMarketData.ts` — NEVER LOADED（0%）；真实行情数据入口
2. `services/etfDataService.ts` / `financialsDataService.ts` / `newsDataService.ts` — NEVER LOADED（0%）；三大功能数据层
3. `services/llmGateway.ts` — NEVER LOADED（0%）；AI 分析网关
4. `api/market.ts` / `api/hkConnect.ts` — NEVER LOADED（0%）；market 与北向资金入口

**P1 — 核心引擎（0% 命中，78 个 service 中的关键者）**
5. `api/block-trades.ts` — 13.6%（P0 修复 `Math.random` 红线后须补测）
6. `services/tradeClassificationEngine.ts` / `abnormalTradeEngine.ts` / `orderFlowToxicityEngine.ts` — 0%
7. `services/quantFactorEngine.ts` / `barraFactorEngine.ts` / `valueFactorEngine.ts` / `qualityFactorEngine.ts` — 因子引擎全 0%
8. `services/rotationEngine.ts` / `sectorMomentumService.ts` — 行业轮动全 0%
9. `services/aiService.ts` — 27.7% 但函数 0/13（AI 分析函数从未被调用）

**P2 — 前端真空区**
10. `frontend/src/pages/*` — 0 个测试 import（页面层测试真空）
11. `frontend/src/store/*`、`contexts/*`、`types/*`、`i18n/*` — 0 个测试 import
12. 将 62% 自包含前端测试改写为 import 真实 `utils/*` 的集成断言（因子/轮动引擎）

**P3 — 结构与质量**
13. `services/models/` 函数 0% 调用、`seeds/` 0% — 视业务重要性补测
14. 清理 71% 后端 / 62% 前端"自包含"测试，使其指向真实模块，避免用例数虚高误导覆盖率评估。

---

## 10. 汇总表（交付用）

| 维度 | 后端 | 前端 |
|---|---|---|
| 测试文件 | 597 | 854 |
| 用例数 (it/test) | 14,589 | 17,847 |
| 量化覆盖率基线 | **有**（Jul13：语句 22.7% / 函数 17.4% / 分支 58.3%） | **无** |
| 核心模块覆盖率 | services 8.9% / api 35.8% | utils 6,145 用例，其余模块 0 import |
| 自包含（虚高）测试 | 71% | 62% |
| 0% 覆盖关键文件 | 19 NEVER LOADED + 78 service 0% 命中 | pages/store/contexts 0 import |
| 真实化相关缺口 | realMarketData、*DataService、因子/轮动/block-trades 引擎 ≈0% | 因子/轮动测试多为自包含，未触真实 utils |

---

*报告生成方式可复现：所有文件计数来自 `find`/`rg`，所有后端百分比来自解析 `backend/coverage/coverage-final.json`（Istanbul 格式），前端结构来自对测试文件 import 路径的文本解析。未运行任何写操作。*
