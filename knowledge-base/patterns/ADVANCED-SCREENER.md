# 高级选股器模式

## 概述
支持AND/OR组合逻辑、技术指标筛选、结果导出的高级选股器。

## 数据模型

### 条件组 (Condition Group)
```typescript
interface ConditionGroup {
  logic: 'and' | 'or';        // 组内逻辑
  conditions: Condition[];      // 条件列表
}
```
- 组间默认 AND (所有组都要满足)
- 组内可选 AND/OR

### 条件 (Condition)
```typescript
interface Condition {
  field: string;               // 筛选字段
  operator: 'gt'|'gte'|'lt'|'lte'|'eq'|'between'|'in';
  value: number | [number, number] | string[];
}
```

## 字段分类

| 类别 | 字段 | 说明 |
|------|------|------|
| 基础行情 | price, change_percent, volume, turnover, turnover_rate, amplitude | 最新行情数据 |
| 技术指标 | rsi, macd, macd_histogram, kdj_k/d/j, ma5/10/20/60, boll_* | 技术分析指标 |
| 财务指标 | pe_ratio, pb_ratio, market_cap, circulating_market_cap | 基本面数据 |

## 预设策略模板

| 模板 | 逻辑 | 条件 |
|------|------|------|
| MACD金叉 | AND | macd_histogram > 0 AND rsi < 70 |
| 超卖反弹 | AND | rsi < 30 AND kdj_j < 20 AND volume > 500万 |
| 价值质量股 | AND | 0 < pe < 20 AND 0 < pb < 3 |
| 放量突破 | AND | volume > 1000万 AND price > 0 |
| 复合筛选 | AND/OR | (pe < 15 OR 涨幅 > 3%) AND rsi < 70 |

## 导出功能
- **JSON**: 默认格式，分页返回
- **CSV**: 带 BOM 头 (兼容 Excel)，最多10000条

## SQL 构建策略
1. 基础查询: stocks JOIN latest daily_quotes LEFT JOIN technical_indicators
2. 条件组应用: 组间 WHERE AND，组内 WHERE (cond1 OR cond2 OR ...)
3. 排序: 支持任意允许字段
4. 分页: offset/limit

## 参考
- 通达信选股公式: 组合条件 + 指标筛选
- Finviz Screener: 多维度筛选 + 导出
