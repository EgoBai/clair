# Round 891 - 测试覆盖扩展 + 修复

## 新增测试文件 (16个)

### Backend (6个)
1. **technicalIndicators.test.ts** — 技术指标 (19 tests)
   - MA/EMA/MACD/RSI/KDJ/布林带
2. **validationEngine.test.ts** — 验证引擎 (13 tests)
   - Validator链式验证/股票代码/价格/手机号
3. **factorExposureEngine.test.ts** — 因子暴露 (10 tests)
   - 线性回归/多因子分析/tracking error
4. **earningsSurpriseEngine.test.ts** — 财报异动 (8 tests)
   - 营收/毛利率/现金流/健康评分
5. **tcaEngine.test.ts** — 交易成本分析 (9 tests)
   - 执行成本/implementation shortfall/venue对比
6. **logAnalyzer.test.ts** — 日志分析器 (10 tests)
   - 日志解析/统计/异常检测
7. **sectorServiceLogic.test.ts** — 板块逻辑 (6 tests)
   - 板块汇总/排序/轮动分析
8. **capitalFlowTracker.test.ts** — 资金流向 (8 tests)
   - 净流入/板块汇总/流向反转

### Frontend (8个)
1. **sentimentAnalysisEngine.test.ts** — 情绪分析 (12 tests)
2. **regimeDetectionEngine.test.ts** — 市场状态检测 (13 tests)
3. **positionSizingEngine.test.ts** — 仓位管理 (14 tests)
4. **shortInterestEngine.test.ts** — 融券做空 (9 tests)
5. **liquidityScoreEngine.test.ts** — 流动性评分 (7 tests)
6. **calendarAnomalyEngine.test.ts** — 日历异象 (9 tests)
7. **etfHoldingEngine.test.ts** — ETF持仓跟踪 (7 tests)
8. **insiderClusterEngine.test.ts** — 内部人集群 (8 tests)
9. **chartLogic.test.ts** — 图表逻辑 (9 tests)
10. **seasonalPatternEngine.test.ts** — 季节性模式 (7 tests)
11. **trendFollowingEngine.test.ts** — 趋势跟踪 (12 tests)
12. **stockConnectDeepEngine.test.ts** — 沪深港通 (5 tests)
13. **greeksEngine.test.ts** — 期权Greeks (13 tests)

## 修复的测试 (11个)
- apiResponseFormatLogic: pageSize 0用??替代||
- batchOperationsLogic: windowStart初始值
- healthCheckLogic: slugify尾部连字符
- algoExecutionEngine: urgency因子反转
- chartSkeletonRows: Math.max(1,...)保证最小行
- globalSearchLogic: 原始大小写保留
- searchHighlightLogic: 分段数量
- lazyPageLogic: leading dash修复
- industryCyclePrediction: PMI信号

## 累计
- 测试文件: ~1350
- 测试数: ~30,400+
