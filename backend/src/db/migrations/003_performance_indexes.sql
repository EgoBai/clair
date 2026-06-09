-- 性能优化索引
-- 针对常见查询模式添加覆盖索引

-- 1. 股票查询优化
CREATE INDEX IF NOT EXISTS idx_stocks_symbol_active ON stocks(symbol) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_stocks_market_industry ON stocks(market, industry);
CREATE INDEX IF NOT EXISTS idx_stocks_change_percent ON stocks(change_percent DESC);

-- 2. 日线数据查询优化（最新行情）
CREATE INDEX IF NOT EXISTS idx_daily_quotes_stock_date_covering ON daily_quotes(stock_id, trade_date DESC) 
  INCLUDE (close_price, change_percent, volume, turnover, market_cap);

-- 3. 自选股查询优化
CREATE INDEX IF NOT EXISTS idx_user_watchlist_user_stock ON user_watchlist(user_id, stock_id);
CREATE INDEX IF NOT EXISTS idx_user_watchlist_user_group ON user_watchlist(user_id, group_id);

-- 4. 分钟线查询优化
CREATE INDEX IF NOT EXISTS idx_minute_quotes_stock_time_covering ON minute_quotes(stock_id, quote_time DESC)
  INCLUDE (close_price, volume);

-- 5. 资金流向查询优化
CREATE INDEX IF NOT EXISTS idx_money_flow_stock_date ON money_flow(stock_id, trade_date DESC);

-- 6. 行业统计优化
CREATE INDEX IF NOT EXISTS idx_stocks_industry_active ON stocks(industry) WHERE is_active = true;

-- 7. 搜索优化（模糊查询）
CREATE INDEX IF NOT EXISTS idx_stocks_symbol_lower ON stocks(LOWER(symbol));
CREATE INDEX IF NOT EXISTS idx_stocks_name_lower ON stocks(LOWER(name));

-- 8. 预警规则查询优化
CREATE INDEX IF NOT EXISTS idx_alert_rules_user_active ON alert_rules(user_id, is_active) WHERE is_active = true;

-- 9. 收藏日志查询优化
CREATE INDEX IF NOT EXISTS idx_collection_logs_date ON collection_logs(created_at DESC);

-- 10. 市场快照查询优化
CREATE INDEX IF NOT EXISTS idx_market_snapshots_date ON market_snapshots(snapshot_date DESC);

-- 重建索引以确保最优性能
REINDEX TABLE stocks;
REINDEX TABLE daily_quotes;
REINDEX TABLE user_watchlist;
