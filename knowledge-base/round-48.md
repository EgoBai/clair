# Round 48 — AStock ESLint eqeqeq修复 + 代码质量

## 目标
修复ESLint `==` → `===` 错误，提升代码质量。

## 成果
- **修复eqeqeq错误**: 批量替换 `==` → `===`（注意null/undefined判断保留`==`）
- ESLint警告: 809 → 767（auto-fix减少42个）
- TypeScript编译: 0错误
- 构建: 5.49s 通过

## 修复详情
- 全项目替换 ` == ` → ` === ` 和 ` != ` → ` !== `（约15个文件）
- 保留 `val == null` 用于同时检查 null 和 undefined（TypeScript null检查模式）
- 修复因替换导致的 `possibly undefined` 类型错误：
  - ScreenerPage: val/fmtMoney null检查
  - AdvancedScreenerPage: val/v null检查  
  - StockCompareChart: close/v null检查
  - CapitalFlowPanel: fundFlowScore null检查
  - IndustryHeatmap: risingCount null检查

## 关键经验
- `== null` 同时匹配 null 和 undefined，在TypeScript strict模式下用于可选值检查是正确的
- `=== null` 只匹配null，在变量可能是undefined时不安全
- 批量替换 `==` → `===` 时需要排除 `== null` 和 `!= null` 场景

## ESLint剩余问题
- 172 errors: 主要是 `no-empty` (18)、`react/display-name` (9)、`no-case-declarations` (5)、`@typescript-eslint/no-this-alias` (4)、`@typescript-eslint/ban-types` (4)
- 767 warnings: 主要是 `@typescript-eslint/no-unused-vars`、`no-console`

## 累计状态
- Round 48完成
- AStock TypeScript: 0错误
- 构建: 5.49s
- 测试: 838/838 100%通过
- 下轮: Round 49 奇数轮 → AStock
