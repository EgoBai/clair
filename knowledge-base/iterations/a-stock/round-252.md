# Round 252 - Market Calendar & Global Correlation Engine
**Date:** 2026-03-31
**Tests:** 820 files, 22105 passed (142 new tests)
**Files:** ~69168

## New Features Added

### 1. Market Calendar Engine (`marketCalendarEngine.ts`)
- `MarketCalendar` - A股交易日历（含2024-2026节假日数据）
  - 节假日/周末/交易日判断
  - 交易日导航（前后交易日）
  - 交易日区间统计
  - 市场开市时间判断
  - 财报季节计算
- `EarningsCalendar` - 财报日历
  - 按日期/板块/状态过滤
  - 超预期/低预期分析
  - 胜率统计
- `IPOCalendar` - IPO日历
  - 按板块/状态过滤
  - 募资总额/平均PE计算
- `DividendCalendar` - 分红日历
  - 高股息筛选
  - 除权日/股权登记日追踪
- `CalendarManager` - 统一管理器
  - 日/周/月概览
  - 综合统计

### 2. Global Correlation Engine (`globalCorrelationEngine.ts`)
- 全球18个主要指数定义（A股/美股/欧洲/亚太）
- 相关性计算：Pearson/Spearman/滚动/滞后
- Lead-Lag分析：市场领先-滞后关系
- Beta计算：单次/滚动Beta
- 波动率/最大回撤/Sharpe/Sortino/Information Ratio
- 脱钩检测：相关性断裂事件
- 相关性矩阵：完整矩阵/滚动矩阵
- 分散化比率计算

### 3. Backtest Performance Analyzer (`backtestPerformanceAnalyzer.ts`)
- 完整的回测绩效指标体系（30+指标）
- 权益曲线计算
- 最大回撤/最大回撤持续期
- Sharpe/Sortino/Calmar比率
- 胜率/盈亏比/期望值
- 连胜/连败统计
- Ulcer Index/Omega Ratio/CVaR/Tail Ratio
- 月度收益/交易分布分析
- 基准对比（Alpha/Beta/IR）

## Key Decisions
- 使用类模式封装各日历功能，便于独立使用
- 相关性引擎支持自定义窗口期
- 回测分析器支持基准对比
- 所有工具函数独立导出，便于测试

## Test Coverage
- marketCalendarEngine: 50 tests
- globalCorrelationEngine: 50 tests
- backtestPerformanceAnalyzer: 42 tests
- 总计新增142个测试
