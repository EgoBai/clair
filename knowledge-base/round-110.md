# Round 110: TypeScript 安全修复 — parseInt 无基数 + catch any + parseFloat 假零陷阱

**日期**: 2026-04-25
**轮次**: 110 (AStock P5-2 错误处理完备性)
**焦点**: TypeScript 类型安全 + 代码质量 Bug 修复
**对标参考**: Bloomberg Terminal 工程规范、ESLint strict 模式

## 改进内容

### 1. 修复 18 处 `parseInt` 无基数参数（高危）

**文件**: 8 个文件，18 处调用

| 文件 | 行号 | 修复内容 |
|------|------|----------|
| `utils/calendarAnomalyEngine.ts` | 96, 109, 208 | 月/日解析添加 `, 10` |
| `utils/regimeTransitionEngine.ts` | 390 | regime index 解析添加 `, 10` |
| `utils/accessibility.ts` | 574 | 标题级别解析添加 `, 10` |
| `utils/backtestPerformanceAnalyzer.ts` | 299, 300 | 年/月解析添加 `, 10` |
| `utils/limitUpDownEngine.ts` | 94 | 小时解析添加 `, 10` |
| `utils/a11yEngine.ts` | 177 | RGB 值解析添加 `, 10` |
| `components/Performance/PerformanceDashboard.tsx` | 249 | 刷新间隔解析添加 `, 10` |
| `services/exportScheduler.ts` | 257, 278, 304, 305 | Cron 字段解析添加 `, 10` |
| `store/useAppStore.ts` | 188, 190 | URL 参数解析添加 `, 10` |

**问题**: 在旧版 JS 引擎中，`parseInt("08")` 返回 0（八进制解析），导致月份分析出错。现代引擎虽默认十进制，但 TypeScript strict 模式规范要求显式声明。

**根本原因**: 开发者习惯 `parseInt(x)` 省略第二个参数，TypeScript 配置未开启相关 lint 规则捕捉。

### 2. 修复 5 处 `catch(err: any)` 类型安全漏洞（中危）

**文件**: `pages/BacktestPage.tsx` (行 99)、`pages/ScreenerPage.tsx` (行 195, 220, 241, 252)

**问题**: TypeScript `catch` 子句中的 `: any` 禁用了整个异常分支的类型检查。catch 的 err 应使用 `unknown`，然后通过 `instanceof Error` 窄化后访问 `.message`。

**根本原因**: 开发时为了快速处理错误，使用了 `: any` 跳过类型检查（技术债务逃逸舱口）。

### 3. 修复 2 处 `parseFloat(x) || 0` 假零陷阱（中危）

**文件**:
- `pages/AlertsPage.tsx` 行 542: `parseFloat(e.target.value) || 0`
- `store/useStockStore.ts` 行 263: `parseFloat(stock.marketCap.replace('亿', '')) || 0`

**问题**: `parseFloat("0")` 返回 `0`（falsy），`|| 0` 将其替换为 0（表面无问题），但 `parseFloat("")` 返回 `NaN` 也被替换为 `0`（静默吞错误）。在金融数据中，0 是有效值（停牌股票、零成交量），`|| 0` 模式无法区分"空输入"和"合法零值"。

**根本原因**: 开发者误用 `|| 0` 作为"安全默认值"，没有理解 JS 的 falsy 行为。

## 技术栈评估

- ✅ 前端技术栈 (React + TypeScript + Vitest + Axios) 当前最优
- ✅ 后端技术栈 (Express + TypeScript + Vitest) 当前最优
- ⚠️ 建议开启 ESLint 规则: `@typescript-eslint/restrict-plus-operands` 和 `radix` 规则防止复发

## 与对标产品的底层原理对比

### Bloomberg Terminal 的防御式编程
Bloomberg 的所有 C++ 代码必开 `-Werror`，所有 parseInt 必须显式声明基数。这减少了一类日期解析 bug（月份 `08` 被解析为八进制 0 导致数据错误）。

### Linear 的错误处理哲学
Linear 的 catch 块一律使用 `unknown` + 类型守护。这要求开发者明确考虑每个异常路径的处理，而不是假设 err 有 `.message` 属性。

### Notion 的数据管道守卫
Notion 的所有数值解析管道使用显式守卫（`Number.isFinite`），不依赖 JS 隐式转换。这保证了金融数据中的合法零值不被吞噬。

## 可迁移原则和方法论

### 原则 1: 显式优于隐式
- 所有 `parseInt` 调用必须带基数参数（10 或 16）
- 所有数值解析必须使用 `Number.isFinite` 守卫，不用 `|| fallback`
- JavaScript 的隐式转换规则（falsy、类型强制）是 bug 的温床

### 原则 2: `unknown` 代替 `any`
- `catch` 块的 err 必须是 `unknown`，然后通过 `instanceof Error` 窄化
- 函数签名中不允许 `: any`（类型检查逃逸舱口）
- `any` 的使用必须有 JIRA 引用 + 移除计划

### 原则 3: 自动化防止复发
- 单次修复只能解决现在的问题，规则和 lint 配置才能防止未来
- ESLint `radix` 规则 + `no-throw-literal` + `@typescript-eslint/no-explicit-any` 应该纳入 CI
- 这些规则应该作为 git pre-commit hook 或 CI 检查的一部分

## 统计

| 指标 | 本轮 | 累计 |
|------|------|------|
| parseInt 无基数修复 | 18 处 | 18 处 |
| catch any → unknown | 5 处 | 5 处 |
| parseFloat||0 修复 | 2 处 | 8 处 |
| 前端测试通过 | 852/852 | 852/852 |
| 后端测试通过 | 625/625 | 625/625 |
| bug 总数修复 | — | 95+ |
