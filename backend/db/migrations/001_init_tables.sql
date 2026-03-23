-- ============================================
-- A股行情分析网站 - 数据库初始化迁移
-- 版本: 001
-- 描述: 创建核心业务表结构
-- ============================================

-- 启用必要扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. 股票基本信息表
-- ============================================
CREATE TABLE IF NOT EXISTS stocks (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(10) NOT NULL UNIQUE,          -- 股票代码 (如: 000001.SZ)
  name VARCHAR(100) NOT NULL,                  -- 股票名称
  full_name VARCHAR(200),                      -- 全称
  market VARCHAR(5) NOT NULL,                  -- 市场 (SZ/SH/BJ)
  industry VARCHAR(50),                        -- 行业
  sub_industry VARCHAR(50),                    -- 子行业
  area VARCHAR(50),                            -- 地区
  listing_date DATE,                           -- 上市日期
  total_shares BIGINT,                         -- 总股本
  circulating_shares BIGINT,                   -- 流通股本
  is_active BOOLEAN DEFAULT true,              -- 是否活跃
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 股票表索引
CREATE INDEX idx_stocks_symbol ON stocks (symbol);
CREATE INDEX idx_stocks_market ON stocks (market);
CREATE INDEX idx_stocks_industry ON stocks (industry);
CREATE INDEX idx_stocks_is_active ON stocks (is_active);
CREATE INDEX idx_stocks_listing_date ON stocks (listing_date);

-- ============================================
-- 2. 日行情数据表
-- ============================================
CREATE TABLE IF NOT EXISTS daily_quotes (
  id SERIAL PRIMARY KEY,
  stock_id INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  trade_date DATE NOT NULL,                    -- 交易日期
  open_price DECIMAL(10,2) NOT NULL,          -- 开盘价
  close_price DECIMAL(10,2) NOT NULL,         -- 收盘价
  high_price DECIMAL(10,2) NOT NULL,          -- 最高价
  low_price DECIMAL(10,2) NOT NULL,           -- 最低价
  volume BIGINT NOT NULL,                      -- 成交量 (股)
  turnover DECIMAL(20,2) NOT NULL,            -- 成交额 (元)
  change DECIMAL(10,4) NOT NULL,              -- 涨跌额
  change_percent DECIMAL(10,4) NOT NULL,      -- 涨跌幅 (%)
  amplitude DECIMAL(10,4),                     -- 振幅 (%)
  turnover_rate DECIMAL(10,4),                 -- 换手率 (%)
  pe_ratio DECIMAL(10,4),                      -- 市盈率
  pb_ratio DECIMAL(10,4),                      -- 市净率
  market_cap DECIMAL(20,2),                    -- 总市值
  circulating_market_cap DECIMAL(20,2),        -- 流通市值
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(stock_id, trade_date)
);

-- 日行情表索引
CREATE INDEX idx_daily_quotes_stock_id ON daily_quotes (stock_id);
CREATE INDEX idx_daily_quotes_trade_date ON daily_quotes (trade_date);
CREATE INDEX idx_daily_quotes_change_percent ON daily_quotes (change_percent);
CREATE INDEX idx_daily_quotes_turnover ON daily_quotes (turnover);

-- ============================================
-- 3. 分钟行情数据表
-- ============================================
CREATE TABLE IF NOT EXISTS minute_quotes (
  id SERIAL PRIMARY KEY,
  stock_id INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  quote_time TIMESTAMP NOT NULL,               -- 行情时间
  price DECIMAL(10,2) NOT NULL,               -- 当前价
  volume INTEGER NOT NULL,                      -- 成交量
  turnover DECIMAL(20,2) NOT NULL,            -- 成交额
  avg_price DECIMAL(10,2),                     -- 均价
  bid_price1 DECIMAL(10,2),                   -- 买一价
  bid_volume1 INTEGER,                         -- 买一量
  ask_price1 DECIMAL(10,2),                   -- 卖一价
  ask_volume1 INTEGER,                         -- 卖一量
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(stock_id, quote_time)
);

-- 分钟行情表索引
CREATE INDEX idx_minute_quotes_stock_id ON minute_quotes (stock_id);
CREATE INDEX idx_minute_quotes_quote_time ON minute_quotes (quote_time);

-- ============================================
-- 4. 财务指标表
-- ============================================
CREATE TABLE IF NOT EXISTS financial_indicators (
  id SERIAL PRIMARY KEY,
  stock_id INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,                   -- 报告期
  report_type VARCHAR(10) NOT NULL,            -- 报告类型 (Q1/Q2/Q3/Annual)
  total_revenue DECIMAL(20,2),                -- 营业收入
  net_profit DECIMAL(20,2),                   -- 净利润
  eps DECIMAL(10,4),                           -- 每股收益
  roe DECIMAL(10,4),                           -- 净资产收益率
  gross_margin DECIMAL(10,4),                  -- 毛利率
  net_margin DECIMAL(10,4),                    -- 净利率
  total_assets DECIMAL(20,2),                 -- 总资产
  total_liabilities DECIMAL(20,2),            -- 总负债
  equity DECIMAL(20,2),                        -- 净资产
  operating_cash_flow DECIMAL(20,2),          -- 经营现金流
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(stock_id, report_date, report_type)
);

-- 财务指标表索引
CREATE INDEX idx_financial_indicators_stock_id ON financial_indicators (stock_id);
CREATE INDEX idx_financial_indicators_report_date ON financial_indicators (report_date);

-- ============================================
-- 5. 技术指标表
-- ============================================
CREATE TABLE IF NOT EXISTS technical_indicators (
  id SERIAL PRIMARY KEY,
  stock_id INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  calc_date DATE NOT NULL,                     -- 计算日期
  ma5 DECIMAL(10,4),                           -- 5日均线
  ma10 DECIMAL(10,4),                          -- 10日均线
  ma20 DECIMAL(10,4),                          -- 20日均线
  ma60 DECIMAL(10,4),                          -- 60日均线
  rsi DECIMAL(10,4),                           -- RSI指标
  macd DECIMAL(10,4),                          -- MACD
  macd_signal DECIMAL(10,4),                   -- MACD信号线
  macd_histogram DECIMAL(10,4),                -- MACD柱状图
  kdj_k DECIMAL(10,4),                         -- KDJ K值
  kdj_d DECIMAL(10,4),                         -- KDJ D值
  kdj_j DECIMAL(10,4),                         -- KDJ J值
  boll_upper DECIMAL(10,4),                    -- 布林上轨
  boll_middle DECIMAL(10,4),                   -- 布林中轨
  boll_lower DECIMAL(10,4),                    -- 布林下轨
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(stock_id, calc_date)
);

-- 技术指标表索引
CREATE INDEX idx_technical_indicators_stock_id ON technical_indicators (stock_id);
CREATE INDEX idx_technical_indicators_calc_date ON technical_indicators (calc_date);

-- ============================================
-- 6. 市场指数表
-- ============================================
CREATE TABLE IF NOT EXISTS market_indices (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(10) NOT NULL UNIQUE,          -- 指数代码
  name VARCHAR(100) NOT NULL,                  -- 指数名称
  trade_date DATE NOT NULL,                    -- 交易日期
  open_price DECIMAL(10,2) NOT NULL,          -- 开盘点位
  close_price DECIMAL(10,2) NOT NULL,         -- 收盘点位
  high_price DECIMAL(10,2) NOT NULL,          -- 最高点位
  low_price DECIMAL(10,2) NOT NULL,           -- 最低点位
  volume BIGINT,                               -- 成交量
  turnover DECIMAL(20,2),                     -- 成交额
  change DECIMAL(10,4),                        -- 涨跌点
  change_percent DECIMAL(10,4),               -- 涨跌幅 (%)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 市场指数表索引
CREATE INDEX idx_market_indices_symbol ON market_indices (symbol);
CREATE INDEX idx_market_indices_trade_date ON market_indices (trade_date);

-- ============================================
-- 7. 行业统计表
-- ============================================
CREATE TABLE IF NOT EXISTS industry_stats (
  id SERIAL PRIMARY KEY,
  industry VARCHAR(50) NOT NULL,               -- 行业名称
  trade_date DATE NOT NULL,                    -- 交易日期
  stock_count INTEGER NOT NULL,                -- 股票数量
  avg_change_percent DECIMAL(10,4),            -- 平均涨跌幅
  total_market_cap DECIMAL(20,2),             -- 总市值
  total_volume BIGINT,                         -- 总成交量
  total_turnover DECIMAL(20,2),              -- 总成交额
  top_symbol VARCHAR(10),                      -- 领涨股票代码
  top_change_percent DECIMAL(10,4),           -- 领涨涨跌幅
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(industry, trade_date)
);

-- 行业统计表索引
CREATE INDEX idx_industry_stats_industry ON industry_stats (industry);
CREATE INDEX idx_industry_stats_trade_date ON industry_stats (trade_date);

-- ============================================
-- 8. 数据采集日志表
-- ============================================
CREATE TABLE IF NOT EXISTS collection_logs (
  id SERIAL PRIMARY KEY,
  source VARCHAR(20) NOT NULL,                 -- 数据源 (tencent/sina/eastmoney)
  task_type VARCHAR(30) NOT NULL,              -- 任务类型 (stock_list/daily_quote/minute_quote)
  status VARCHAR(20) NOT NULL,                 -- 状态 (success/failed/partial)
  start_time TIMESTAMP NOT NULL,               -- 开始时间
  end_time TIMESTAMP,                          -- 结束时间
  records_fetched INTEGER DEFAULT 0,           -- 获取记录数
  records_saved INTEGER DEFAULT 0,             -- 保存记录数
  error_message TEXT,                          -- 错误信息
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 数据采集日志表索引
CREATE INDEX idx_collection_logs_source ON collection_logs (source);
CREATE INDEX idx_collection_logs_task_type ON collection_logs (task_type);
CREATE INDEX idx_collection_logs_status ON collection_logs (status);
CREATE INDEX idx_collection_logs_start_time ON collection_logs (start_time);

-- ============================================
-- 触发器：自动更新 updated_at 字段
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为需要的表添加触发器
CREATE TRIGGER update_stocks_updated_at 
  BEFORE UPDATE ON stocks 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_daily_quotes_updated_at 
  BEFORE UPDATE ON daily_quotes 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_financial_indicators_updated_at 
  BEFORE UPDATE ON financial_indicators 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_market_indices_updated_at 
  BEFORE UPDATE ON market_indices 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 初始数据：市场指数
-- ============================================
INSERT INTO market_indices (symbol, name, trade_date, open_price, close_price, high_price, low_price, volume, turnover, change, change_percent)
VALUES
  ('000001.SH', '上证指数', CURRENT_DATE, 0, 0, 0, 0, 0, 0, 0, 0),
  ('399001.SZ', '深证成指', CURRENT_DATE, 0, 0, 0, 0, 0, 0, 0, 0),
  ('399006.SZ', '创业板指', CURRENT_DATE, 0, 0, 0, 0, 0, 0, 0, 0),
  ('000688.SH', '科创50', CURRENT_DATE, 0, 0, 0, 0, 0, 0, 0, 0)
ON CONFLICT (symbol) DO NOTHING;

-- ============================================
-- 完成提示
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '✅ 数据库初始化迁移完成！';
  RAISE NOTICE '已创建表：stocks, daily_quotes, minute_quotes, financial_indicators, technical_indicators, market_indices, industry_stats, collection_logs';
  RAISE NOTICE '已创建索引和触发器';
END $$;
