-- 策略模板表
CREATE TABLE IF NOT EXISTS strategy_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  description TEXT,
  icon VARCHAR(20) DEFAULT '📊',
  category VARCHAR(50) NOT NULL DEFAULT 'custom',  -- value, growth, momentum, technical, income, custom
  
  -- 策略条件 (JSON格式)
  conditions JSONB NOT NULL DEFAULT '[]',
  logic VARCHAR(10) DEFAULT 'and',  -- and, or
  
  -- 排序配置
  sort_by VARCHAR(50) DEFAULT 'change_percent',
  sort_order VARCHAR(10) DEFAULT 'desc',
  secondary_sort JSONB,
  
  -- 元数据
  is_system BOOLEAN DEFAULT false,  -- 系统预设 vs 用户自定义
  user_id VARCHAR(100),             -- 用户ID (预留)
  usage_count INTEGER DEFAULT 0,    -- 使用次数
  last_used_at TIMESTAMP,
  
  -- 时间戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_strategy_templates_category ON strategy_templates(category);
CREATE INDEX idx_strategy_templates_is_system ON strategy_templates(is_system);
CREATE INDEX idx_strategy_templates_user_id ON strategy_templates(user_id);

-- 插入系统预设模板
INSERT INTO strategy_templates (name, name_en, description, icon, category, conditions, sort_by, sort_order, is_system) VALUES
  -- 价值投资
  ('价值股', 'Value Stocks', '低PE、低PB的价值投资标的', '💎', 'value', 
   '[{"field":"pe_ratio","operator":"gt","value":0},{"field":"pe_ratio","operator":"lt","value":20},{"field":"pb_ratio","operator":"gt","value":0},{"field":"pb_ratio","operator":"lt","value":3}]'::jsonb,
   'pe_ratio', 'asc', true),
   
  ('高股息', 'High Dividend Yield', '分红率高、适合收息的蓝筹股', '💰', 'income',
   '[{"field":"dividend_yield","operator":"gte","value":3},{"field":"market_cap","operator":"gte","value":10000000000}]'::jsonb,
   'dividend_yield', 'desc', true),
   
  ('低估值大盘', 'Undervalued Large Cap', '大盘蓝筹中估值较低的标的', '🏛️', 'value',
   '[{"field":"market_cap","operator":"gte","value":50000000000},{"field":"pe_ratio","operator":"gt","value":0},{"field":"pe_ratio","operator":"lt","value":15}]'::jsonb,
   'pe_ratio', 'asc', true),
   
  -- 成长股
  ('成长股', 'Growth Stocks', '涨幅靠前、成交量活跃的成长型标的', '🚀', 'growth',
   '[{"field":"change_percent","operator":"gt","value":2},{"field":"turnover_rate","operator":"gt","value":3}]'::jsonb,
   'change_percent', 'desc', true),
   
  ('小盘成长', 'Small Cap Growth', '小市值高活跃度成长股', '🌱', 'growth',
   '[{"field":"circulating_market_cap","operator":"gt","value":2000000000},{"field":"circulating_market_cap","operator":"lt","value":20000000000},{"field":"turnover_rate","operator":"gte","value":5}]'::jsonb,
   'change_percent', 'desc', true),
   
  -- 动量/趋势
  ('活跃股', 'Most Active', '高换手率、大成交额的活跃品种', '🔥', 'momentum',
   '[{"field":"turnover_rate","operator":"gt","value":5},{"field":"turnover","operator":"gt","value":500000000}]'::jsonb,
   'turnover', 'desc', true),
   
  ('涨幅榜', 'Top Gainers', '当日涨幅最大的股票', '📈', 'momentum',
   '[{"field":"change_percent","operator":"gt","value":3},{"field":"volume","operator":"gt","value":1000000}]'::jsonb,
   'change_percent', 'desc', true),
   
  ('跌幅榜', 'Top Losers', '当日跌幅最大的股票', '📉', 'momentum',
   '[{"field":"change_percent","operator":"lt","value":-3},{"field":"volume","operator":"gt","value":1000000}]'::jsonb,
   'change_percent', 'asc', true),
   
  -- 技术形态
  ('涨停股', 'Limit Up', '当日涨停的股票', '🔴', 'technical',
   '[{"field":"change_percent","operator":"gte","value":9.9}]'::jsonb,
   'turnover', 'desc', true),
   
  ('跌停股', 'Limit Down', '当日跌停的股票', '🟢', 'technical',
   '[{"field":"change_percent","operator":"lte","value":-9.9}]'::jsonb,
   'turnover', 'desc', true),
   
  ('放量股', 'High Volume', '成交量明显放大的股票', '📊', 'technical',
   '[{"field":"volume","operator":"gt","value":10000000}]'::jsonb,
   'volume', 'desc', true),
   
  ('高振幅', 'High Volatility', '振幅较大的品种，适合短线交易', '⚡', 'technical',
   '[{"field":"amplitude","operator":"gte","value":8},{"field":"turnover_rate","operator":"gte","value":3}]'::jsonb,
   'amplitude', 'desc', true),
   
  -- 市值分类
  ('小盘股', 'Small Cap', '流通市值小于50亿的小盘股', '🎯', 'growth',
   '[{"field":"circulating_market_cap","operator":"gt","value":0},{"field":"circulating_market_cap","operator":"lt","value":5000000000}]'::jsonb,
   'circulating_market_cap', 'asc', true),
   
  ('大盘蓝筹', 'Large Cap Blue Chip', '流通市值大于500亿的大盘蓝筹', '🏦', 'value',
   '[{"field":"circulating_market_cap","operator":"gt","value":50000000000}]'::jsonb,
   'market_cap', 'desc', true),
   
  ('中盘股', 'Mid Cap', '流通市值50-200亿的中盘股', '📦', 'value',
   '[{"field":"circulating_market_cap","operator":"gte","value":5000000000},{"field":"circulating_market_cap","operator":"lte","value":20000000000}]'::jsonb,
   'circulating_market_cap', 'asc', true)
ON CONFLICT DO NOTHING;
