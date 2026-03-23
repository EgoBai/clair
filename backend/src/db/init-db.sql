-- ============================================
-- A股行情分析网站 - 数据库初始化脚本
-- 使用方法: psql -U postgres -f init-db.sql
-- ============================================

-- 创建数据库（如果不存在）
-- CREATE DATABASE a_stock OWNER postgres;

-- ============================================
-- 1. 股票基本信息表
-- ============================================
CREATE TABLE IF NOT EXISTS stocks (
    id              SERIAL PRIMARY KEY,
    symbol          VARCHAR(20) UNIQUE NOT NULL,      -- 股票代码（如 600519.SH）
    code            VARCHAR(10) NOT NULL,             -- 纯代码（600519）
    market          VARCHAR(5) NOT NULL,              -- 市场（SH/SZ/BJ）
    name            VARCHAR(50) NOT NULL,             -- 股票名称
    industry        VARCHAR(50),                      -- 所属行业
    is_active       BOOLEAN DEFAULT true,             -- 是否活跃
    current_price   DECIMAL(10,2),                    -- 当前价格
    open_price      DECIMAL(10,2),                    -- 开盘价
    high_price      DECIMAL(10,2),                    -- 最高价
    low_price       DECIMAL(10,2),                    -- 最低价
    prev_close      DECIMAL(10,2),                    -- 昨收价
    volume          BIGINT DEFAULT 0,                 -- 成交量
    turnover        DECIMAL(20,2) DEFAULT 0,          -- 成交额
    change_amount   DECIMAL(10,2) DEFAULT 0,          -- 涨跌额
    change_percent  DECIMAL(8,4) DEFAULT 0,           -- 涨跌幅
    amplitude       DECIMAL(8,4) DEFAULT 0,           -- 振幅
    turnover_rate   DECIMAL(8,4) DEFAULT 0,           -- 换手率
    pe_ratio        DECIMAL(10,2),                    -- 市盈率
    pb_ratio        DECIMAL(10,2),                    -- 市净率
    market_cap      DECIMAL(20,2),                    -- 总市值
    circulating_market_cap DECIMAL(20,2),             -- 流通市值
    bid_price_1     DECIMAL(10,2),                    -- 买一价
    ask_price_1     DECIMAL(10,2),                    -- 卖一价
    bid_volume_1    BIGINT,                           -- 买一量
    ask_volume_1    BIGINT,                           -- 卖一量
    data_source     VARCHAR(20),                      -- 数据来源
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_stocks_symbol ON stocks(symbol);
CREATE INDEX IF NOT EXISTS idx_stocks_code ON stocks(code);
CREATE INDEX IF NOT EXISTS idx_stocks_market ON stocks(market);
CREATE INDEX IF NOT EXISTS idx_stocks_industry ON stocks(industry);
CREATE INDEX IF NOT EXISTS idx_stocks_change_percent ON stocks(change_percent);

-- ============================================
-- 2. 日行情表
-- ============================================
CREATE TABLE IF NOT EXISTS daily_quotes (
    id              SERIAL PRIMARY KEY,
    stock_id        INTEGER REFERENCES stocks(id) ON DELETE CASCADE,
    trade_date      DATE NOT NULL,
    open_price      DECIMAL(10,2) NOT NULL,
    close_price     DECIMAL(10,2) NOT NULL,
    high_price      DECIMAL(10,2) NOT NULL,
    low_price       DECIMAL(10,2) NOT NULL,
    volume          BIGINT NOT NULL,
    turnover        DECIMAL(20,2) NOT NULL,
    change_amount   DECIMAL(10,2) DEFAULT 0,
    change_percent  DECIMAL(8,4) DEFAULT 0,
    amplitude       DECIMAL(8,4) DEFAULT 0,
    turnover_rate   DECIMAL(8,4) DEFAULT 0,
    market_cap      DECIMAL(20,2),
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(stock_id, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_quotes_stock_date ON daily_quotes(stock_id, trade_date);
CREATE INDEX IF NOT EXISTS idx_daily_quotes_date ON daily_quotes(trade_date);

-- ============================================
-- 3. 分钟行情表（实时数据）
-- ============================================
CREATE TABLE IF NOT EXISTS minute_quotes (
    id              SERIAL PRIMARY KEY,
    stock_id        INTEGER REFERENCES stocks(id) ON DELETE CASCADE,
    trade_time      TIMESTAMP NOT NULL,
    price           DECIMAL(10,2) NOT NULL,
    volume          INTEGER NOT NULL,
    turnover        DECIMAL(15,2) NOT NULL,
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_minute_quotes_stock_time ON minute_quotes(stock_id, trade_time);

-- ============================================
-- 4. 行业板块表
-- ============================================
CREATE TABLE IF NOT EXISTS industries (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(50) UNIQUE NOT NULL,
    stock_count     INTEGER DEFAULT 0,
    avg_change      DECIMAL(8,4) DEFAULT 0,
    total_turnover  DECIMAL(20,2) DEFAULT 0,
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 5. 概念板块表
-- ============================================
CREATE TABLE IF NOT EXISTS concepts (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(50) UNIQUE NOT NULL,
    description     TEXT,
    stock_count     INTEGER DEFAULT 0,
    avg_change      DECIMAL(8,4) DEFAULT 0,
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 6. 资金流向表
-- ============================================
CREATE TABLE IF NOT EXISTS money_flow (
    id              SERIAL PRIMARY KEY,
    stock_id        INTEGER REFERENCES stocks(id) ON DELETE CASCADE,
    trade_date      DATE NOT NULL,
    main_net_inflow DECIMAL(20,2) DEFAULT 0,          -- 主力净流入
    retail_net_inflow DECIMAL(20,2) DEFAULT 0,        -- 散户净流入
    super_large_inflow DECIMAL(20,2) DEFAULT 0,       -- 超大单流入
    large_inflow    DECIMAL(20,2) DEFAULT 0,           -- 大单流入
    medium_inflow   DECIMAL(20,2) DEFAULT 0,           -- 中单流入
    small_inflow    DECIMAL(20,2) DEFAULT 0,           -- 小单流入
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(stock_id, trade_date)
);

-- ============================================
-- 7. 用户自选股表
-- ============================================
CREATE TABLE IF NOT EXISTS watchlist (
    id              SERIAL PRIMARY KEY,
    user_id         VARCHAR(50) NOT NULL,             -- 用户ID（暂未实现用户系统）
    stock_id        INTEGER REFERENCES stocks(id) ON DELETE CASCADE,
    added_at        TIMESTAMP DEFAULT NOW(),
    notes           TEXT,
    UNIQUE(user_id, stock_id)
);

-- ============================================
-- 8. 预警规则表
-- ============================================
CREATE TABLE IF NOT EXISTS alerts (
    id              SERIAL PRIMARY KEY,
    user_id         VARCHAR(50) NOT NULL,
    stock_id        INTEGER REFERENCES stocks(id) ON DELETE CASCADE,
    alert_type      VARCHAR(20) NOT NULL,             -- price_above, price_below, change_percent
    threshold       DECIMAL(10,2) NOT NULL,
    is_active       BOOLEAN DEFAULT true,
    triggered_at    TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 9. 数据采集日志表
-- ============================================
CREATE TABLE IF NOT EXISTS collection_logs (
    id              SERIAL PRIMARY KEY,
    source          VARCHAR(20) NOT NULL,
    status          VARCHAR(10) NOT NULL,             -- success, partial, failed
    records_count   INTEGER DEFAULT 0,
    error_message   TEXT,
    duration_ms     INTEGER,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 10. 市场概况快照表
-- ============================================
CREATE TABLE IF NOT EXISTS market_snapshots (
    id              SERIAL PRIMARY KEY,
    snapshot_date   DATE NOT NULL UNIQUE,
    total_stocks    INTEGER DEFAULT 0,
    total_market_cap DECIMAL(20,2) DEFAULT 0,
    total_turnover  DECIMAL(20,2) DEFAULT 0,
    total_volume    BIGINT DEFAULT 0,
    rising_count    INTEGER DEFAULT 0,
    falling_count   INTEGER DEFAULT 0,
    unchanged_count INTEGER DEFAULT 0,
    limit_up_count  INTEGER DEFAULT 0,                -- 涨停数
    limit_down_count INTEGER DEFAULT 0,               -- 跌停数
    created_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 触发器：自动更新 updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为 stocks 表创建触发器
DROP TRIGGER IF EXISTS trigger_stocks_updated_at ON stocks;
CREATE TRIGGER trigger_stocks_updated_at
    BEFORE UPDATE ON stocks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 视图：市场概况
-- ============================================
CREATE OR REPLACE VIEW v_market_summary AS
SELECT
    COUNT(*) as total_stocks,
    SUM(market_cap) as total_market_cap,
    SUM(turnover) as total_turnover,
    SUM(volume) as total_volume,
    COUNT(*) FILTER (WHERE change_percent > 0) as rising_count,
    COUNT(*) FILTER (WHERE change_percent < 0) as falling_count,
    COUNT(*) FILTER (WHERE change_percent = 0) as unchanged_count,
    CURRENT_DATE as snapshot_date
FROM stocks
WHERE is_active = true;

-- ============================================
-- 视图：涨幅榜
-- ============================================
CREATE OR REPLACE VIEW v_top_gainers AS
SELECT *
FROM stocks
WHERE is_active = true AND change_percent > 0
ORDER BY change_percent DESC
LIMIT 50;

-- ============================================
-- 视图：跌幅榜
-- ============================================
CREATE OR REPLACE VIEW v_top_losers AS
SELECT *
FROM stocks
WHERE is_active = true AND change_percent < 0
ORDER BY change_percent ASC
LIMIT 50;

-- ============================================
-- 视图：成交额榜
-- ============================================
CREATE OR REPLACE VIEW v_top_turnover AS
SELECT *
FROM stocks
WHERE is_active = true
ORDER BY turnover DESC
LIMIT 50;

-- ============================================
-- 完成
-- ============================================
\echo '=========================================='
\echo '  数据库初始化完成!'
\echo '  表: stocks, daily_quotes, minute_quotes,'
\echo '      industries, concepts, money_flow,'
\echo '      watchlist, alerts, collection_logs,'
\echo '      market_snapshots'
\echo '  视图: v_market_summary, v_top_gainers,'
\echo '        v_top_losers, v_top_turnover'
\echo '=========================================='
