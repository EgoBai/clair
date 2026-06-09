-- 性能优化索引迁移
-- Phase 11.1: 数据库索引优化

-- ==================== daily_quotes 表优化 ====================

-- 1. 筛选器常用字段索引（涨跌幅、换手率、市值等）
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_quotes_change_percent 
ON daily_quotes (change_percent DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_quotes_turnover_rate 
ON daily_quotes (turnover_rate DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_quotes_market_cap 
ON daily_quotes (market_cap DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_quotes_pe_ratio 
ON daily_quotes (pe_ratio) WHERE pe_ratio > 0;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_quotes_pb_ratio 
ON daily_quotes (pb_ratio) WHERE pb_ratio > 0;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_quotes_volume 
ON daily_quotes (volume DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_quotes_turnover 
ON daily_quotes (turnover DESC);

-- 2. 复合索引：最新行情查询优化
-- 获取每只股票最新行情的高效索引
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_quotes_latest 
ON daily_quotes (stock_id, trade_date DESC, close_price, change_percent);

-- 3. 行业筛选复合索引
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stocks_industry_active 
ON stocks (industry, is_active) WHERE is_active = true;

-- ==================== stocks 表优化 ====================

-- 4. 市场+活跃状态复合索引
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stocks_market_active 
ON stocks (market, is_active) WHERE is_active = true;

-- 5. 股票名称搜索索引（支持模糊搜索）
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stocks_name_trgm 
ON stocks USING gin (name gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stocks_symbol_trgm 
ON stocks USING gin (symbol gin_trgm_ops);

-- ==================== 策略模板表索引 ====================

-- 6. 策略模板分类+系统标识索引
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_strategy_templates_category_system 
ON strategy_templates (category, is_system);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_strategy_templates_usage 
ON strategy_templates (usage_count DESC);

-- ==================== 分析查询优化 ====================

-- 7. 涨跌统计视图（Materialized View for dashboard）
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_market_stats AS
SELECT 
    trade_date,
    COUNT(*) as total_stocks,
    SUM(CASE WHEN change_percent > 0 THEN 1 ELSE 0 END) as up_count,
    SUM(CASE WHEN change_percent < 0 THEN 1 ELSE 0 END) as down_count,
    SUM(CASE WHEN change_percent >= 9.9 THEN 1 ELSE 0 END) as limit_up,
    SUM(CASE WHEN change_percent <= -9.9 THEN 1 ELSE 0 END) as limit_down,
    AVG(change_percent) as avg_change,
    STDDEV(change_percent) as volatility,
    AVG(turnover_rate) as avg_turnover,
    SUM(turnover) as total_turnover
FROM daily_quotes
GROUP BY trade_date
ORDER BY trade_date DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_market_stats_date 
ON mv_market_stats (trade_date);

-- 8. 行业统计视图
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_industry_stats AS
SELECT 
    s.industry,
    dq.trade_date,
    COUNT(*) as stock_count,
    AVG(dq.change_percent) as avg_change,
    SUM(dq.turnover) as total_turnover,
    AVG(dq.turnover_rate) as avg_turnover_rate
FROM daily_quotes dq
JOIN stocks s ON s.id = dq.stock_id
WHERE s.industry IS NOT NULL
GROUP BY s.industry, dq.trade_date
ORDER BY dq.trade_date DESC, avg_change DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_industry_stats_date_industry 
ON mv_industry_stats (trade_date, industry);

-- 9. 刷新物化视图的函数
CREATE OR REPLACE FUNCTION refresh_market_stats()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_market_stats;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_industry_stats;
END;
$$ LANGUAGE plpgsql;

-- ==================== 统计信息更新 ====================

-- 10. 更新表统计信息以优化查询计划
ANALYZE stocks;
ANALYZE daily_quotes;
ANALYZE strategy_templates;
