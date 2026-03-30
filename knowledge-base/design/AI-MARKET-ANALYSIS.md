# AI 市场分析设计

## 概述

AI 智能分析模块提供三大功能:
1. **自然语言行情解读** - 自动生成每日市场行情分析
2. **智能止盈止损** - 基于多种策略的风险管理建议
3. **板块轮动预测** - 行业资金流向和轮动分析

## 设计目标

- 参考同花顺 i问财的自然语言生成能力
- 输出结构化、可读的市场分析报告
- 提供量化、客观的止盈止损建议
- 识别板块轮动趋势，辅助投资决策

## 架构

```
aiMarketAnalysis.ts
├── MarketCommentaryGenerator   # 行情解读生成
│   ├── generateDailySummary()  # 每日行情摘要
│   ├── analyzeSentiment()      # 情绪分析
│   └── generate*()             # 各 section 生成
├── StopLossCalculator          # 止盈止损计算
│   ├── calculateByATR()        # 基于 ATR
│   ├── calculateByMA()         # 基于均线
│   └── calculateByPercent()    # 固定百分比
└── SectorRotationPredictor     # 板块轮动
    ├── analyze()               # 综合分析
    └── determinePhase()        # 阶段判断
```

## 行情解读生成

### 情绪判定规则

| 指标 | 看涨 | 看跌 | 中性 |
|------|------|------|------|
| 大盘涨跌幅 | > +1% 且涨家比 > 60% | < -1% 且涨家比 < 40% | 其他 |
| 涨家比 | > 55% | < 45% | 45%-55% |

### 输出结构

```typescript
interface MarketCommentary {
  title: string;        // 标题
  summary: string;      // 摘要
  sections: [           // 5个section
    { heading: '大势研判', ... },
    { heading: '涨跌分布', ... },
    { heading: '板块热点', ... },
    { heading: '资金动向', ... },
    { heading: '后市展望', ... },
  ];
  keywords: string[];   // 关键词
  sentiment: 'bullish' | 'bearish' | 'neutral';
  confidence: number;   // 置信度 0-100
}
```

### 置信度计算

```
置信度 = 涨跌比贡献(60分) + 涨跌幅贡献(10分/%) + 基础分(30分)
```

## 止盈止损策略

### ATR 方法
- ATR (Average True Range) 反映近期波动性
- 止损 = 当前价 - ATR × 倍数 (默认2)
- 止盈 = 当前价 + ATR × 倍数 × 1.5
- 优势: 自适应波动性

### 均线方法
- 止损 = N日均线 × 98%
- 止盈 = 当前价 + (当前价 - 止损) × 2
- 优势: 跟随趋势

### 百分比方法
- 止损 = 当前价 × (1 - 止损%)
- 止盈 = 当前价 × (1 + 止盈%)
- 优势: 简单直观

## 板块轮动分析

### 阶段判断

| 阶段 | 特征 |
|------|------|
| 吸筹 (Accumulation) | 短期涨、中期跌、有量 |
| 主升 (Markup) | 短期涨、中期涨、放量 |
| 派发 (Distribution) | 短期跌、中期涨、缩量 |
| 下跌 (Decline) | 短期跌、中期跌 |

### 动量评分

```
动量 = 短期涨跌幅 × 0.4 + 中期涨跌幅 × 0.3 + 量能得分 × 0.15 + 资金流得分 × 0.15
```

## 未来改进方向

1. 接入大语言模型 (GPT/Claude) 生成更自然的解读
2. 接入实时资金流数据 (东方财富Level-2)
3. 增加机器学习模型预测板块轮动
4. 支持自定义止盈止损策略
