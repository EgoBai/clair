# 历史数据校验设计

## 概述

A股历史数据校验引擎，参考 Wind 数据质量标准和 Bloomberg 数据校验规范，提供全面的数据质量检测。

## 校验维度

### 1. 完整性校验 (Completeness)
- **日期完整性**：所有记录是否都有交易日期
- **日期连续性**：检测缺失交易日（长间隔 >5天）
- **日期去重**：检测重复日期记录

### 2. 准确性校验 (Accuracy)
- **价格逻辑校验**：`high >= max(open, close)` && `low <= min(open, close)`
- **OHLC有效性**：所有价格 > 0
- **成交量模式**：检测极端异常值（偏离均值10倍以上）
- **异常模式检测**：连续相同成交量（可能为数据填充）
- **零成交量天数**：高比例零成交量可能是停牌

### 3. 一致性校验 (Consistency)
- **量额一致性**：有量必有额，无量则无额
- **价格跳变检测**：相邻K线收盘价变动超阈值

### 4. 时效性校验 (Timeliness)
- **时间序列单调性**：数据必须按时间正序排列

## 质量评分算法

```
质量分 = 100 - (Σ 异常权重) / (总记录数 × 2) × 100

权重：
- critical: 10分
- high: 5分
- medium: 2分
- low: 0.5分
```

## 财务交叉验证

### 三表联动
1. **资产负债表平衡**：资产 = 负债 + 所有者权益（1%容差）
2. **净利润与现金流匹配**：经营现金流 / 净利润 ≥ 0.5
3. **ROE一致性**：报告ROE vs 计算ROE（5%容差）
4. **资产负债率合理性**：0-100%
5. **毛利率 > 净利率**：基本财务逻辑

### 指标合理性
- PE: -500 ~ 500
- PB: -50 ~ 100
- ROE: ±100%
- 毛利率: -50% ~ 100%
- 资产负债率: 0 ~ 100%
- 流动比率: ≥ 0

## 使用方式

```typescript
import { HistoricalDataValidator, FinancialCrossValidator } from './utils/historicalDataValidator';

// K线校验
const validator = new HistoricalDataValidator();
const result = validator.validateKLineHistory('600519', klineData);
console.log(`质量分: ${result.overallScore}/100`);

// 财务交叉验证
const finValidator = new FinancialCrossValidator();
const check = finValidator.validateThreeStatements(balanceSheet, incomeStatement, cashFlow);
```

## 改进方向
1. 接入真实交易日历（排除节假日）
2. 多数据源交叉对比
3. 机器学习异常检测
4. 实时数据流校验
