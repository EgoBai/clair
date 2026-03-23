-- A股行情分析网站数据库设计

-- 股票基本信息表
CREATE TABLE stocks (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL UNIQUE,           -- 股票代码 (如: 000001.SZ)
    name VARCHAR(100) NOT NULL,                   -- 股票名称
    full_name VARCHAR(200),                       -- 全称
    market VARCHAR(10) NOT NULL,                  -- 市场 (SZ/SH/BJ)
    industry VARCHAR(100),                        -- 行业
    sub_industry VARCHAR(100),                    -- 子行业
    area VARCHAR(50),                             -- 地区
    listing_date DATE,                            -- 上市日期
    total_shares BIGINT,                          -- 总股本
    circulating_shares BIGINT,                    -- 流通股本
    is_active BOOLEAN DEFAULT TRUE,               -- 是否活跃
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_stocks_symbol (symbol),
    INDEX idx_stocks_market (market),
    INDEX idx_stocks_industry (industry)
);

-- 股票日行情表
CREATE TABLE daily_quotes (
    id SERIAL PRIMARY KEY,
    stock_id INTEGER NOT NULL REFERENCES stocks(id),
    trade_date DATE NOT NULL,                     -- 交易日期
    open_price DECIMAL(10, 4),                    -- 开盘价
    close_price DECIMAL(10, 4),                   -- 收盘价
    high_price DECIMAL(10, 4),                    -- 最高价
    low_price DECIMAL(10, 4),                     -- 最低价
    volume BIGINT,                                -- 成交量 (股)
    turnover DECIMAL(20, 4),                      -- 成交额 (元)
    change DECIMAL(10, 4),                        -- 涨跌额
    change_percent DECIMAL(8, 4),                 -- 涨跌幅 (%)
    amplitude DECIMAL(8, 4),                      -- 振幅 (%)
    turnover_rate DECIMAL(8, 4),                  -- 换手率 (%)
    pe_ratio DECIMAL(10, 4),                      -- 市盈率
    pb_ratio DECIMAL(10, 4),                      -- 市净率
    market_cap DECIMAL(20, 4),                    -- 总市值
    circulating_market_cap DECIMAL(20, 4),        -- 流通市值
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (stock_id, trade_date),
    INDEX idx_daily_quotes_date (trade_date),
    INDEX idx_daily_quotes_stock_date (stock_id, trade_date DESC)
);

-- 股票分钟行情表 (用于实时数据)
CREATE TABLE minute_quotes (
    id SERIAL PRIMARY KEY,
    stock_id INTEGER NOT NULL REFERENCES stocks(id),
    quote_time TIMESTAMP NOT NULL,                -- 行情时间
    price DECIMAL(10, 4),                         -- 当前价
    volume BIGINT,                                -- 成交量
    turnover DECIMAL(20, 4),                      -- 成交额
    avg_price DECIMAL(10, 4),                     -- 均价
    bid_price_1 DECIMAL(10, 4),                   -- 买一价
    bid_volume_1 BIGINT,                          -- 买一量
    ask_price_1 DECIMAL(10, 4),                   -- 卖一价
    ask_volume_1 BIGINT,                          -- 卖一量
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (stock_id, quote_time),
    INDEX idx_minute_quotes_time (quote_time),
    INDEX idx_minute_quotes_stock_time (stock_id, quote_time DESC)
);

-- 财务指标表
CREATE TABLE financial_indicators (
    id SERIAL PRIMARY KEY,
    stock_id INTEGER NOT NULL REFERENCES stocks(id),
    report_date DATE NOT NULL,                    -- 报告期
    report_type VARCHAR(20),                      -- 报告类型 (Q1/Q2/Q3/Annual)
    total_revenue DECIMAL(20, 4),                 -- 营业收入
    net_profit DECIMAL(20, 4),                    -- 净利润
    eps DECIMAL(10, 4),                           -- 每股收益
    roe DECIMAL(8, 4),                            -- 净资产收益率
    gross_margin DECIMAL(8, 4),                   -- 毛利率
    net_margin DECIMAL(8, 4),                     -- 净利率
    total_assets DECIMAL(20, 4),                  -- 总资产
    total_liabilities DECIMAL(20, 4),             -- 总负债
    equity DECIMAL(20, 4),                        -- 净资产
    operating_cash_flow DECIMAL(20, 4),           -- 经营现金流
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (stock_id, report_date, report_type),
    INDEX idx_financial_report_date (report_date)
);

-- 技术指标表
CREATE TABLE technical_indicators (
    id SERIAL PRIMARY KEY,
    stock_id INTEGER NOT NULL REFERENCES stocks(id),
    calc_date DATE NOT NULL,                      -- 计算日期
    ma5 DECIMAL(10, 4),                           -- 5日均线
    ma10 DECIMAL(10, 4),                          -- 10日均线
    ma20 DECIMAL(10, 4),                          -- 20日均线
    ma60 DECIMAL(10, 4),                          -- 60日均线
    rsi DECIMAL(8, 4),                            -- RSI指标
    macd DECIMAL(10, 4),                          -- MACD
    macd_signal DECIMAL(10, 4),                   -- MACD信号线
    macd_histogram DECIMAL(10, 4),                -- MACD柱状图
    kdj_k DECIMAL(8, 4),                          -- KDJ K值
    kdj_d DECIMAL(8, 4),                          -- KDJ D值
    kdj_j DECIMAL(8, 4),                          -- KDJ J值
    boll_upper DECIMAL(10, 4),                    -- 布林上轨
    boll_middle DECIMAL(10, 4),                   -- 布林中轨
    boll_lower DECIMAL(10, 4),                    -- 布林下轨
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (stock_id, calc_date),
    INDEX idx_technical_calc_date (calc_date)
);

-- 用户表
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    avatar_url VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    is_admin BOOLEAN DEFAULT FALSE,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_users_email (email),
    INDEX idx_users_username (username)
);

-- 用户自选股表
CREATE TABLE user_watchlist (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    stock_id INTEGER NOT NULL REFERENCES stocks(id),
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    UNIQUE (user_id, stock_id),
    INDEX idx_watchlist_user (user_id),
    INDEX idx_watchlist_stock (stock_id)
);

-- 预警规则表
CREATE TABLE alert_rules (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    stock_id INTEGER NOT NULL REFERENCES stocks(id),
    rule_type VARCHAR(20) NOT NULL,               -- 规则类型 (price/volume/change/technical)
    condition_type VARCHAR(20) NOT NULL,          -- 条件类型 (above/below/cross)
    threshold DECIMAL(20, 4) NOT NULL,            -- 阈值
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_alert_rules_user (user_id),
    INDEX idx_alert_rules_stock (stock_id)
);

-- 预警记录表
CREATE TABLE alert_logs (
    id SERIAL PRIMARY KEY,
    alert_rule_id INTEGER NOT NULL REFERENCES alert_rules(id),
    trigger_value DECIMAL(20, 4),                 -- 触发值
    trigger_time TIMESTAMP NOT NULL,              -- 触发时间
    is_notified BOOLEAN DEFAULT FALSE,            -- 是否已通知
    notified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_alert_logs_time (trigger_time),
    INDEX idx_alert_logs_rule (alert_rule_id)
);

-- 数据采集日志表
CREATE TABLE data_collection_logs (
    id SERIAL PRIMARY KEY,
    data_type VARCHAR(50) NOT NULL,               -- 数据类型 (daily/minute/financial)
    start_time TIMESTAMP NOT NULL,                -- 开始时间
    end_time TIMESTAMP,                           -- 结束时间
    status VARCHAR(20) NOT NULL,                  -- 状态 (success/failed/partial)
    records_collected INTEGER,                    -- 采集记录数
    error_message TEXT,                           -- 错误信息
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_collection_logs_time (start_time),
    INDEX idx_collection_logs_status (status)
);

-- 系统配置表
CREATE TABLE system_config (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(100) NOT NULL UNIQUE,      -- 配置键
    config_value TEXT,                            -- 配置值
    description TEXT,                             -- 描述
    is_public BOOLEAN DEFAULT FALSE,              -- 是否公开
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_system_config_key (config_key)
);

-- 创建更新时间触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为需要更新时间的表创建触发器
CREATE TRIGGER update_stocks_updated_at BEFORE UPDATE ON stocks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_daily_quotes_updated_at BEFORE UPDATE ON daily_quotes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_financial_indicators_updated_at BEFORE UPDATE ON financial_indicators
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_alert_rules_updated_at BEFORE UPDATE ON alert_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_config_updated_at BEFORE UPDATE ON system_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 插入初始系统配置
INSERT INTO system_config (config_key, config_value, description, is_public) VALUES
('data_source_primary', 'tushare', '主要数据源', TRUE),
('data_source_backup', 'akshare', '备用数据源', TRUE),
('market_open_time', '09:30:00', '市场开盘时间', TRUE),
('market_close_time', '15:00:00', '市场收盘时间', TRUE),
('data_collection_interval', '60', '数据采集间隔(秒)', FALSE),
('max_concurrent_collections', '10', '最大并发采集数', FALSE),
('alert_check_interval', '300', '预警检查间隔(秒)', FALSE),
('retention_days_daily', '3650', '日行情保留天数', FALSE),
('retention_days_minute', '30', '分钟行情保留天数', FALSE);

-- 创建分区表函数（用于大数据量优化）
CREATE OR REPLACE FUNCTION create_daily_quotes_partition(year INTEGER, month INTEGER)
RETURNS VOID AS $$
DECLARE
    partition_name TEXT;
    start_date DATE;
    end_date DATE;
BEGIN
    partition_name := format('daily_quotes_%s_%s', year, LPAD(month::TEXT, 2, '0'));
    start_date := format('%s-%s-01', year, LPAD(month::TEXT, 2, '0'))::DATE;
    end_date := (start_date + INTERVAL '1 month')::DATE;
    
    EXECUTE format('
        CREATE TABLE %I PARTITION OF daily_quotes
        FOR VALUES FROM (%L) TO (%L)',
        partition_name, start_date, end_date
    );
    
    -- 创建索引
    EXECUTE format('
        CREATE INDEX %I ON %I (stock_id, trade_date DESC)',
        partition_name || '_idx_stock_date', partition_name
    );
END;
$$ LANGUAGE plpgsql;