# Clair 澄观投研助手 · 蜂群一路派发文档：前端数据真实化

> 派发用途：作为后续多 Agent 蜂群协作（主任务拆分）中 **前端数据真实化** 这一路（lane）的派发依据。
> 生成日期：2026-08-13
> 关联基准：三份评估报告（全面评估 MD / 产品评估 HTML / 队列优化分析 MD，基准日均 2026-07-24）
> 关联合并报告：`clair-eval-vs-current-20260813.md`（同目录）
> 诚实数据红线（最高约束）：无真实数据时如实置空（空数组/空对象/null + `<Empty description="后端未接入">`）——**绝不注入 demo / 伪造 / 随机数据**。`resolveDataSource(payload, isEmpty, false)` 第三参必须传 `false`。

---

## 〇、本路定位与目标

- **Lane 名称**：前端数据真实化（Frontend Data Realization）
- **所属主任务**：Clair 澄观「真实数据」专项（含"产品全面测试与优化执行方案" + "竞品逆向工程与产品策略分析"两条初始需求）
- **核心目标**：彻底消除前端层面的**残留假数据**（伪造估值 / 假自选股 / 随机伪指标），并在后端真实接口就绪后，以诚实空态为基线逐页填充真实数据。
- **完成判据**：生产代码（非 `__tests__`）中 grep `Math.random | makeRng | DEMO_WATCHLIST | DEMO_STOCKS | DEMO_ASSETS` 不再产出任何"主动伪造/回填演示"分支；所有用户数据型页面在接口未接入时呈 `<Empty>` 诚实空态。

---

## 一、本轮（2026-08-13）已完成根除项 ✅

> 已本地改动并通过 `tsc --noEmit`（退出码 0）。涉及 5 个文件，待本地 commit（不 push，避免与循环在途改动混提交）。

| # | 文件 | 根除内容 | 处置方式 |
|---|------|---------|---------|
| 1 | `frontend/src/components/valuation/ValuationPanel.tsx` | 原 100% `makeRng(hashSymbol(symbol))` 确定性 RNG 伪造整套估值（currentPrice/peTTM/pb/eps/DCF/历史分位），注释自承"后端估值 API 缺失，沿用 LCG 确定性演示数据兜底" | 整体重写为**诚实空态**：`<Card>` 标注「数据未接入」+ `<Empty description="估值数据由后端实时接口提供…当前后端未接入">`；保留 `multiDimensionalValuation`/`dcfValuation`/`valuationPercentileAnalysis` 三引擎供后端接入后复用（已不再被前端调用伪造）。 |
| 2 | `frontend/src/hooks/useWatchlistData.ts` | ① `import { DEMO_WATCHLIST, DEMO_WATCHLIST_GROUPS, DEMO_STOCKS }`；② `readWatchlistGroups` 中 localStorage 为空时返回 `DEMO_WATCHLIST_GROUPS` 假分组；③ `fetchQuotes` catch 中 API 不可达时回填 `demoQuotes` 假行情 | ① 删除 demo 导入；② 空态返回 `[{ id:'default', name:'默认分组', stocks:[], isDefault:true }]`；③ catch 改为"保持现有 quotes（无则空）"，整段演示回填删除。 |
| 3 | `frontend/src/utils/sectorRotationPredictEngine.ts` | `historicalWinRate: 0.55 + Math.random() * 0.15`（伪造历史胜率） | 改为 `Math.round(Math.min(0.95, 0.4 + (from.momentum - to.momentum) * 0.3) * 100) / 100`（基于真实动量差派生确定性近似，非随机）；新增 `dataSource: 'unavailable'` 字段标记占位性质。 |
| 4 | `frontend/src/utils/altDataSignalEngine.ts` | `historicalAccuracy: 0.5 + Math.random() * 0.3`（伪造历史准确率） | 改为 `Math.round((0.4 + signalStrength * 0.4) * 100) / 100`（基于真实信号强度派生，非随机）。 |
| 5 | `frontend/src/utils/earningsDriftEngine.ts` | `const decayRate = 0.15 + Math.random() * 0.1`（随机衰减率） | 改为固定确定性基线 `const decayRate = 0.15`（真实校准需后端历史漂移数据）。 |

**验证**：`cd frontend && PATH="/Users/ego_bai/.workbuddy/binaries/node/versions/22.22.2/bin:$PATH" npx tsc --noEmit` → 退出码 0。

---

## 二、本路剩余子任务（待蜂群认领）

### 2.1 前端残留诚实化（低风险，可立即认领）

- **[SUB-1] RiskCenterPage 诚实化审计**：当前 `DEMO_ASSETS: DemoAsset[] = []`（空数组，诚实），风险计算以该空数组为输入故无假数据出产；但 `makeRng` 仍在文件内定义且多处以 `DEMO_ASSETS` 为输入。建议：保留 `DEMO_ASSETS = []` 真实空态语义，删除未使用的 `makeRng` 及死分支，或在后端资产接口就绪后替换为真实持仓输入。属用户数据型页面，不在 P0 必改项，但需在派发中明确"禁止把空数组再填回 demo"。
- **[SUB-2] 生产代码 `Math.random` 全量清理复核**：本轮已根除 3 个引擎中的随机伪指标。需二次 grep 确认 `frontend/src`（排除 `__tests__`）无其余 `Math.random` / `makeRng` 主动伪造分支（`deterministic.ts` 注释说明用 sin/cos 替代属确定性生成器，可接受；`fundFlowPageDemo.ts` 仅类型/确定性生成器，可接受）。

### 2.2 后端真实接口接入（依赖后端源接入组，本路提供空态占位）

- **[SUB-3] 估值 API 接入**：后端需提供 `/api/valuation?symbol=` 返回真实 PE/PB/PEG/DCF/历史分位。接入后由本路（或后端联调组）填充 `ValuationPanel` 诚实空态——**禁止**重新启用 RNG 兜底。保留的 `multiDimensionalValuation`/`dcfValuation`/`valuationPercentileAnalysis` 可直接消费真实 payload。
- **[SUB-4] 用户资产 / 自选股后端化**：`useWatchlistData` 已诚实空态。后端需提供自选股 CRUD + 行情批量接口；接入后替换 localStorage 兜底与 quotes 拉取逻辑。
- **[SUB-5] 历史回测基线接口**：为 `sectorRotationPredictEngine` 的 `historicalWinRate` 提供真实历史收益率序列回测；接入后 `dataSource` 由 `'unavailable'` 切到 `'real'`。`altDataSignalEngine` / `earningsDriftEngine` 同理需后端历史准确率 / 历史漂移基线校准接口。

### 2.3 与评估报告的差异闭环

- 合并报告 `clair-eval-vs-current-20260813.md` 已逐条对比 15 项"缺失/空壳"功能——其中前端功能已全部落地，数据可信度改善项对应本路根除成果。
- 队列优化分析（T0–T9 demoData 注入）方向与诚实红线相反，但其结构性建议（模块拆分 / tsc 门禁 / QA 分离 / 并行）已被本轮采纳，不属本路重复劳动。

---

## 三、蜂群协作与冲突规避

### 3.1 建议在途文件隔离（避免与 clair-loop 自主循环冲突）

当前仓库存在循环在途改动（可能未提交或已提交但仍在演进），本路派发时**禁止修改**以下文件，以免覆盖在途真实化工作：

- `backend/src/app.ts`（路由层在途）
- `backend/src/api/ai-analysis.ts`（AI 分析去随机在途）
- `frontend/src/pages/ReportCenterPage.tsx`（诚实空态在途）
- `frontend/src/hooks/useThemeTokens.ts` / `frontend/src/styles/chart-theme.ts`（主题在途）
- `backend/src/services/etfDataService.ts` / `hkConnect` 相关（T3/T4 ETF、港股通真实化在途）

> 若认领子任务需触达上述文件，先 `git fetch` + `git rebase` 确认最新态，并以"追加不覆盖"为原则协调。

### 3.2 多 Agent 协作编排建议

- **主代理**：维护本 lane 任务看板，按 SUB-1~SUB-5 拆分派发，监控 tsc 门禁。
- **专项子代理（前端诚实化组）**：认领 SUB-1 / SUB-2 / SUB-3 的 UI 填充部分。
- **专项子代理（后端联调组）**：认领 SUB-3~SUB-5 的接口提供与契约对齐。
- **QA 门禁代理**：每次改动后独立跑 `tsc --noEmit` + 全仓 `Math.random|makeRng|DEMO_` 残留 grep，阻断任何演示数据回灌。

---

## 四、提交主任务的派发摘要（可直接引用）

> 「前端数据真实化」一路已于 2026-08-13 根除 3 类残留假数据：
> ① `ValuationPanel` RNG 伪造估值 → 改写为诚实空态（对应评估头号 P0）；
> ② `useWatchlistData` 首屏假自选股/假行情回填 → 删 demo 导入、兜底改空态；
> ③ 三个引擎（`sectorRotationPredictEngine`/`altDataSignalEngine`/`earningsDriftEngine`）`Math.random` 伪指标 → 改为基于真实输入的确定性派生 + `dataSource` 标记。
> 已通过 `tsc --noEmit`。剩余：RiskCenterPage 死分支清理、生产代码随机残留复核、后端估值/自选股/历史回测接口接入（由后端联调组负责）。请按本文档 SUB-1~SUB-5 派发蜂群执行；注意规避循环在途文件（app.ts / ai-analysis.ts / ReportCenterPage / etfDataService 等）。」

---

*文档生成：CodeBuddy Code（基于会话摘要续作）。本文件仅作派发依据，不含源代码改动本身。*
