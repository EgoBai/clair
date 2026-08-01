# 澄观 Clair 前端 UI 质量守卫 · 扫描报告

> 生成时间: 2026-08-01T18:27:56.818Z
> 层级: **轻量静态层（S6-1 / D6 决策）** —— 仅静态 AST + 正则/数据基线，**不含** Playwright 运行时截图（属第二阶段）。

## 1. 守卫设计概览

本守卫是 D6 决策确认的「轻量静态层」，目标是在不改变应用源码（`src/`）的前提下，以低成本静态检查捕获此前真实出现过的 UI 质量缺陷：

- **AST 扫描（ast-scan.mts / ts-morph）**
  - 死 `useState`：声明但从未被读取的状态（历史 bug：`showHeatmap` / `heatmapMode` 死状态）。
  - 引用未声明标识符：组件/函数内被使用但文件作用域未声明的变量（历史 bug：`displayMode` 被使用 4 次却从未声明），best-effort。
  - 路由重定向环路（A→B→A）与未定义路径引用。
  - 重复 state key（同一函数内同名 `useState`）。
- **基线扫描（baseline-scan.mts / 正则 + ts-morph）**
  - 重复符号 `++`（如模板字面量拼接导致渲染出 `++2.95%`）。
  - `NaN` / `undefined` 直接渲染到界面。
  - 硬编码空兜底 `|| ''` / `?? ''`（提示级）。
  - 数据基线：维度键数组（`ALL_DIM_KEYS`）数量与接口声明（`DemoMultidimData.dimensions`）属性数量一致性（历史 bug：11 vs 14）。

## 2. 如何运行

```bash
cd .
npm run guard          # 依次运行 ast-scan 与 baseline-scan，并生成本报告
npx tsc --noEmit       # 应用类型检查（守卫脚本自身不在该 tsconfig 的 include 内，不破坏既有检查）
```

退出码策略：存在 ERROR 级问题时进程返回非 0（可作为 CI 门禁）；WARN / INFO 不阻断。

## 3. AST 扫描结果

### ast-scan（扫描 600 个文件）

错误: 0 · 警告: 0 · 提示: 0

_未发现该层相关的问题。_


## 4. 基线扫描结果

### baseline-scan（扫描 600 个文件）

错误: 0 · 警告: 0 · 提示: 9

- **[INFO]** (hardcoded-empty-fallback) 检测到硬编码空兜底 (|| '' / ?? '')，可能掩盖缺失数据。 `./src/pages/DiscoverPage.tsx:576`
  - 代码: `const detail = hoverDetail['${industry}__${dimName}'] || '';`
  - 建议: 确认该兜底是否为预期；缺失数据建议显式提示而非静默隐藏。
- **[INFO]** (hardcoded-empty-fallback) 检测到硬编码空兜底 (|| '' / ?? '')，可能掩盖缺失数据。 `./src/pages/StockDetailPage.tsx:303`
  - 代码: `onClick={() => navigate('/industry-map?industry=${encodeURIComponent(stockInfo.industry || '')}')}`
  - 建议: 确认该兜底是否为预期；缺失数据建议显式提示而非静默隐藏。
- **[INFO]** (hardcoded-empty-fallback) 检测到硬编码空兜底 (|| '' / ?? '')，可能掩盖缺失数据。 `./src/pages/WatchlistPage.tsx:651`
  - 代码: `return '${sym}(${q?.name || ''}, ${q?.industry || ''}, PE:${q?.peRatio ?? 'N/A'}, PB:${q?.pbRatio ?? 'N/A'})';`
  - 建议: 确认该兜底是否为预期；缺失数据建议显式提示而非静默隐藏。
- **[INFO]** (hardcoded-empty-fallback) 检测到硬编码空兜底 (|| '' / ?? '')，可能掩盖缺失数据。 `./src/utils/aiModelExplainer.ts:175`
  - 代码: `const topFactors = exp?.factors.slice(0, 3).map(f => '${f.factor}(${f.score}分)').join('; ') || '';`
  - 建议: 确认该兜底是否为预期；缺失数据建议显式提示而非静默隐藏。
- **[INFO]** (hardcoded-empty-fallback) 检测到硬编码空兜底 (|| '' / ?? '')，可能掩盖缺失数据。 `./src/utils/darkPoolEngine.ts:117`
  - 代码: `const period = dates.length >= 2 ? '${dates[0]} ~ ${dates[dates.length - 1]}' : dates[0] || '';`
  - 建议: 确认该兜底是否为预期；缺失数据建议显式提示而非静默隐藏。
- **[INFO]** (hardcoded-empty-fallback) 检测到硬编码空兜底 (|| '' / ?? '')，可能掩盖缺失数据。 `./src/utils/insiderTradeEngine.ts:175`
  - 代码: `const period = dates.length >= 2 ? '${dates[0]} ~ ${dates[dates.length - 1]}' : dates[0] || '';`
  - 建议: 确认该兜底是否为预期；缺失数据建议显式提示而非静默隐藏。
- **[INFO]** (hardcoded-empty-fallback) 检测到硬编码空兜底 (|| '' / ?? '')，可能掩盖缺失数据。 `./src/utils/stateEngine.ts:192`
  - 代码: `logger.debug('[${name}] Action: ${action}', payload ?? '');`
  - 建议: 确认该兜底是否为预期；缺失数据建议显式提示而非静默隐藏。
- **[INFO]** (hardcoded-empty-fallback) 检测到硬编码空兜底 (|| '' / ?? '')，可能掩盖缺失数据。 `./src/components/Charts/ResponsiveChart.tsx:100`
  - 代码: `className={'responsive-chart ${className || ''}'}`
  - 建议: 确认该兜底是否为预期；缺失数据建议显式提示而非静默隐藏。
- **[INFO]** (hardcoded-empty-fallback) 检测到硬编码空兜底 (|| '' / ?? '')，可能掩盖缺失数据。 `./src/components/Market/CapitalFlowPanel.tsx:67`
  - 代码: `<div className={'capital-flow-panel ${className || ''}'} data-testid="capital-flow-panel">`
  - 建议: 确认该兜底是否为预期；缺失数据建议显式提示而非静默隐藏。


## 5. 汇总

- 错误(ERROR): 0
- 警告(WARN): 0
- 提示(INFO): 9
- 总文件扫描: AST 600 + 基线 600

**结论: ✅ PASS（无 ERROR 级问题）**

> 说明：本层为 best-effort 静态检查，可能存在少量误报（尤其「引用未声明标识符」与「死 useState」为启发式）。
> 发现的问题优先**报告**而非静默修复；仅当确认为琐碎、隔离、明显安全的源码 bug 时才直接修复，并在报告中显式标注。
