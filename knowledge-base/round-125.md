# Round 125 (Round 976 in project) — AStock: 修复calculateVolatility NaN守卫 + 清理陈旧文件

**轮次**: 125 (AStock项目内部轮次 976)
**日期**: 2026-04-26
**对标**: Bloomberg Terminal / QuantConnect

## 问题1: calculateVolatility 缺少空数组守卫（NaN传播风险）

### 问题现象
`backtestEngine.ts` 中的 `calculateVolatility()` 函数没有空数组守卫。当传入空数组时：
- `[].reduce((a,b) => a+b, 0) = 0` → `0 / 0 = NaN`
- `Math.sqrt(NaN) = NaN`
- NaN 沿调用链传播到 `runBacktest()` 的返回值中

### 跟因
在同文件中的 `calculateDownsideVolatility()` 已经正确实现了守卫：
```typescript
function calculateDownsideVolatility(returns: number[], mar: number = 0): number {
  if (returns.length === 0) return 0;  // ✅ 有守卫
  ...
}
```
但 `calculateVolatility()`（第509行）完全没有长度检查：
```typescript
function calculateVolatility(returns: number[]): number {
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;  // ❌ NaN if length===0
  ...
}
```

### 解决方案
添加 `if (returns.length === 0) return 0;` 守卫，与其他姊妹函数（`calculateDownsideVolatility`、`riskParityEngine` 的 `calculateVolatility`、`aiAnalysis` 的 `calculateVolatility`）保持一致。

### 可迁移原则
**防御性统计函数三原则**（从 Bloomberg Terminal 学到的底层原理）：
1. **每个统计函数都必须处理所有边界情况**（空数组、单元素、全相同值）
2. **一致性比正确性更难维护**——同一个概念（volatility计算）在同一文件中有4个不同实现，3个有守卫、1个没有。一致性检查应该在代码审查阶段自动进行
3. **NaN传播是静默的**——没有错误抛出，没有警告日志，只有一个错误的数值沿着调用链扩散。对金融应用尤其危险（回测报告中的 NaN 波动率可能被用户误读为"零波动率"）

## 问题2: WebVitalsWidget.original.tsx 陈旧文件

### 问题现象
`frontend/src/components/Common/WebVitalsWidget.original.tsx` 是一个替换后的旧组件备份，不再被任何文件 import，但仍在代码库中。

### 解决方案
删除该陈旧文件。

### 可迁移原则
**CI 中应包含"陈旧文件检测"步骤**——扫描所有 `.original.`、`.backup.`、`.old` 后缀的文件并报告。超过2轮迭代未引用的文件应自动标记删除。

## 对标对比

| 维度 | Bloombergl/QuantConnect 做法 | AStock 之前 | AStock 之后 |
|------|----------------------------|------------|------------|
| 统计函数守卫 | 所有数值计算函数都有边界守卫 | 1/4 的 volatility 缺少守卫 | 全部 4 个都有守卫 |
| 陈旧文件管理 | 每周自动扫描清理 | `.original.tsx` 残留 | 已清理 |

## 测试结果
- **后端**: 625/625 文件通过, **15192/15192** 测试通过 ✅
- **前端**: WebVitalsWidget.test.tsx 6/6 测试通过 ✅
- **合计**: 无回归 ❌ → 全绿 ✅
- **累计修复Bug**: 124 → **125 个** ✅
