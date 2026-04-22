# 第57轮迭代 - AStock 数据准确性修复

## 迭代时间
2026-04-21 22:30 (Asia/Shanghai)

## 项目状态
- 后端测试: 14318 tests, 14304 passed, 14 skipped, 0 failed
- 前端测试: aStockTradeCostEngine 35/35 passed
- 引擎模块: 115 backend services, 92 engine modules

## 改进清单

### 1. 修复波动率引擎 persistence 计算溢出 (flaky test)

**问题现象**: `volatilityEngine.test.ts` 的 `detectRegime > should have persistence 0-1` 测试间歇性失败。测试要求 persistence 值在 [0, 1] 范围内，但某些随机数据会导致超出范围。

**根本原因**: `detectRegime` 函数中的 persistence 计算使用滞后1自相关公式:
```typescript
persistence = den > 0 ? Math.abs(num / den) : 0;
```
这是 Yule-Walker AR(1) 系数估计，对于有限样本（尤其是趋势性数据），可以产生 > 1 的值。这不是 bug 而是统计特性——但业务语义要求 persistence ∈ [0, 1]。

**解决方案**: 添加 `Math.min(1, ...)` 钳位:
```typescript
persistence = den > 0 ? Math.min(1, Math.abs(num / den)) : 0;
```

**可迁移原则**:
- 对于任何有业务语义约束的统计量，必须在计算后添加边界钳位
- 自相关/相关系数等统计指标在有限样本下可能超出理论边界，必须处理
- Flaky test 往往暴露真实的边界条件 bug，不要简单地增加 tolerance

### 2. 修复 A 股交易成本过户费计算错误 (数据准确性)

**问题现象**: `aStockTradeCostEngine.ts` 中，深市 (sz) 交易不收取过户费，代码注释写"沪市收取，深市免收"。

**根本原因**: 代码基于 2022 年之前的费率规则。2022 年中国结算改革后，沪深北三市过户费统一为万分之0.1。旧代码只对 `sh` 和 `bj` 市场收取过户费。

**修复前**:
```typescript
// 过户费 (沪市收取，深市免收)
let transferFee = 0;
if (market === 'sh' || market === 'bj') {
  transferFee = Math.round(tradeAmount * TRANSFER_FEE_RATE * 100) / 100;
}
```

**修复后**:
```typescript
// 过户费 (2022年改革后沪深北统一收取)
let transferFee = 0;
transferFee = Math.round(tradeAmount * TRANSFER_FEE_RATE * 100) / 100;
```

**影响**: 深市交易的过户费从 0 变为 tradeAmount × 0.00001。以 10 万元交易为例，约增加 1 元成本。

**可迁移原则**:
- 金融费率/规则有明确的法规变动时间节点，必须跟踪更新
- 对于中国 A 股市场：2022 年 4 月起过户费统一，不再区分沪深
- 数据准确性是金融产品的生命线，费率错误会直接影响用户盈亏计算

## 对标分析

### Bloomberg Terminal 的数据准确性标准
- Bloomberg 的费率数据有专门的合规团队维护，定期更新
- 每次费率变更都有版本记录和生效日期
- 建议：为费率常量添加 `effectiveDate` 元数据，便于追踪和审计

### TradingView 的成本计算
- TradingView 的交易成本计算器会标注费率生效日期
- 支持历史费率查询（回测时使用当时费率）
- 建议：考虑实现费率版本管理，支持回测时使用历史费率

## 下一步建议
1. 为费率常量添加 `effectiveDate` 和 `source` 元数据
2. 考虑实现费率版本管理，支持回测时使用历史费率
3. 添加印花税率的动态获取（2023 年 8 月印花税减半政策）

---
**迭代完成状态**: ✅ 成功
**Bug 修复数**: 2
**测试通过率**: 100% (14304/14304 backend + 35/35 frontend)
**代码变更行数**: 7 行
**影响文件数**: 3 个
