-- 产业链数据表
-- 用于存储产业链定义、环节、公司关系

-- 产业链主表
CREATE TABLE IF NOT EXISTS industry_chains (
  id SERIAL PRIMARY KEY,
  chain_id VARCHAR(100) NOT NULL UNIQUE,          -- 唯一标识 (如: ai-computing)
  name VARCHAR(200) NOT NULL,                      -- 产业链名称
  description TEXT,                                -- 产业链描述
  theme VARCHAR(100),                              -- 主题标签
  category VARCHAR(50) DEFAULT 'technology',       -- 分类 (technology/energy/healthcare/consumer/finance)
  hot_level INTEGER DEFAULT 50,                    -- 热度 0-100
  
  -- 关联数据 (JSON 格式)
  related_concepts JSONB DEFAULT '[]',             -- 关联概念
  related_policies JSONB DEFAULT '[]',             -- 关联政策
  market_drivers JSONB DEFAULT '[]',               -- 市场驱动因素
  
  -- AI 分析 (JSON 格式)
  ai_analysis JSONB,                               -- AI 分析结果
  
  -- 元数据
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 产业链环节表
CREATE TABLE IF NOT EXISTS industry_chain_segments (
  id SERIAL PRIMARY KEY,
  chain_id INTEGER NOT NULL REFERENCES industry_chains(id) ON DELETE CASCADE,
  segment_id VARCHAR(100) NOT NULL,                -- 环节标识 (如: optical-chip)
  name VARCHAR(200) NOT NULL,                      -- 环节名称
  description TEXT,                                -- 环节描述
  layer_type VARCHAR(50) NOT NULL,                 -- 层级类型 (upstream/midstream/downstream/support)
  layer_order INTEGER DEFAULT 0,                   -- 层级排序
  
  -- 环节特征 (JSON 格式)
  characteristics JSONB DEFAULT '{}',              -- 市场规模、增速、竞争格局等
  
  -- 关联关系 (JSON 格式)
  upstream_to JSONB DEFAULT '[]',                  -- 上游环节ID列表
  downstream_to JSONB DEFAULT '[]',                -- 下游环节ID列表
  
  -- 元数据
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE (chain_id, segment_id)
);

-- 产业链公司关联表
CREATE TABLE IF NOT EXISTS industry_chain_stocks (
  id SERIAL PRIMARY KEY,
  chain_id INTEGER NOT NULL REFERENCES industry_chains(id) ON DELETE CASCADE,
  segment_id INTEGER NOT NULL REFERENCES industry_chain_segments(id) ON DELETE CASCADE,
  stock_id INTEGER REFERENCES stocks(id),          -- 关联股票表
  symbol VARCHAR(20) NOT NULL,                     -- 股票代码
  name VARCHAR(100),                               -- 股票名称
  
  -- 公司信息
  position VARCHAR(50) DEFAULT 'follower',         -- 市场地位 (leader/challenger/follower)
  competitive_advantage TEXT,                      -- 竞争优势
  revenue_breakdown TEXT,                          -- 收入结构
  
  -- 元数据
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE (chain_id, segment_id, symbol)
);

-- 索引
CREATE INDEX idx_industry_chains_chain_id ON industry_chains(chain_id);
CREATE INDEX idx_industry_chains_category ON industry_chains(category);
CREATE INDEX idx_industry_chains_hot_level ON industry_chains(hot_level DESC);
CREATE INDEX idx_industry_chain_segments_chain_id ON industry_chain_segments(chain_id);
CREATE INDEX idx_industry_chain_segments_layer_type ON industry_chain_segments(layer_type);
CREATE INDEX idx_industry_chain_stocks_chain_id ON industry_chain_stocks(chain_id);
CREATE INDEX idx_industry_chain_stocks_symbol ON industry_chain_stocks(symbol);
CREATE INDEX idx_industry_chain_stocks_position ON industry_chain_stocks(position);

-- 插入示例数据：AI算力产业链
INSERT INTO industry_chains (chain_id, name, description, theme, category, hot_level, related_concepts, related_policies, market_drivers, ai_analysis) VALUES
('ai-computing', 'AI算力产业链', '从芯片到应用的AI算力全链条，涵盖光模块、交换机、服务器、数据中心等核心环节', 'AI', 'technology', 95,
 '["ChatGPT", "大模型", "算力", "光模块", "数据中心"]'::jsonb,
 '["东数西算", "新基建", "AI发展规划"]'::jsonb,
 '["AI算力需求爆发", "大模型训练", "数据中心扩容"]'::jsonb,
 '{"overview":"AI算力产业链是当前市场最热门的投资主线之一。随着ChatGPT等大模型的爆发，AI算力需求呈现指数级增长，带动整个产业链从上游芯片到下游应用全面受益。","investmentLogic":"投资逻辑遵循\"卖水人\"原则：优先受益的是提供算力基础设施的上游硬件公司（光芯片、光模块），然后是中游设备商（交换机、服务器），最后是下游应用（数据中心、AI应用）。","benefitOrder":"上游硬件 → 中游设备 → 下游应用","elasticityRank":"光模块 > 交换机 > 服务器 > 数据中心","riskFactors":["AI算力需求不及预期","技术路线变化","产能过剩风险","地缘政治影响"],"keyInsights":["光模块是产业链弹性最大的环节","800G/1.6T升级带来持续增长","国产替代加速，关注国内龙头","数据中心能耗问题可能制约发展"],"generatedAt":"2026-06-15T10:00:00Z"}'::jsonb
),
('new-energy-vehicle', '新能源汽车产业链', '从电池到整车的新能源汽车全链条，涵盖锂矿、正负极材料、电池、电机、电控、整车等核心环节', '新能源', 'energy', 85,
 '["电动车", "锂电池", "充电桩", "智能驾驶"]'::jsonb,
 '["新能源汽车补贴", "双积分政策", "碳中和"]'::jsonb,
 '["政策驱动", "技术进步", "成本下降"]'::jsonb,
 '{"overview":"新能源汽车产业链是全球汽车产业转型的核心方向，中国在电池、电机等核心环节具有全球竞争力。","investmentLogic":"投资逻辑：上游锂资源→中游电池材料→下游整车。电池环节技术壁垒最高，整车环节品牌效应最强。","benefitOrder":"上游资源 → 中游电池 → 下游整车","elasticityRank":"锂矿 > 电解液 > 隔膜 > 整车","riskFactors":["补贴退坡","原材料价格波动","技术路线变化","竞争加剧"],"keyInsights":["电池环节是产业链核心","固态电池是下一代技术方向","充电基础设施建设加速","智能化是差异化关键"],"generatedAt":"2026-06-15T10:00:00Z"}'::jsonb
),
('semiconductor', '半导体产业链', '从设计到封测的半导体全链条，涵盖IC设计、晶圆制造、封装测试、设备、材料等核心环节', '芯片', 'technology', 90,
 '["芯片", "光刻机", "国产替代", "EDA"]'::jsonb,
 '["国家大基金", "芯片法案", "自主可控"]'::jsonb,
 '["国产替代需求", "AI芯片需求", "汽车电子增长"]'::jsonb,
 '{"overview":"半导体产业链是国家战略性产业，国产替代是长期主线，设备和材料环节受益确定性最高。","investmentLogic":"投资逻辑：设备/材料（确定性最高）→制造（资本密集）→设计（轻资产高弹性）→封测（成熟环节）。","benefitOrder":"设备材料 → 晶圆制造 → IC设计 → 封装测试","elasticityRank":"光刻机 > EDA > 晶圆代工 > 封测","riskFactors":["技术封锁","研发投入大","周期性波动","人才短缺"],"keyInsights":["设备和材料是国产替代核心","先进制程是突破方向","汽车芯片是新增长点","Chiplet技术绕过先进制程限制"],"generatedAt":"2026-06-15T10:00:00Z"}'::jsonb
)
ON CONFLICT (chain_id) DO NOTHING;

-- 插入AI算力产业链环节数据
DO $$
DECLARE
  chain_id_val INTEGER;
BEGIN
  SELECT id INTO chain_id_val FROM industry_chains WHERE chain_id = 'ai-computing';
  
  IF chain_id_val IS NOT NULL THEN
    -- 上游环节
    INSERT INTO industry_chain_segments (chain_id, segment_id, name, description, layer_type, layer_order, characteristics, upstream_to, downstream_to) VALUES
    (chain_id_val, 'optical-chip', '光芯片', '光通信核心器件，决定传输速率和距离', 'upstream', 1,
     '{"marketSize":"2025年预计500亿元","growthRate":"CAGR 25%","competitiveLandscape":"集中度高，龙头效应明显","barriers":["技术门槛高","研发投入大","客户认证周期长"],"keyDrivers":["AI算力需求","数据中心升级","5G建设"]}'::jsonb,
     '[]'::jsonb, '["optical-module"]'::jsonb),
    (chain_id_val, 'pcb', 'PCB/载板', '电子元器件基础，支撑芯片封装', 'upstream', 2,
     '{"marketSize":"2025年预计3000亿元","growthRate":"CAGR 8%","competitiveLandscape":"分散竞争，高端集中","barriers":["资金密集","工艺复杂","环保要求"],"keyDrivers":["服务器需求","AI芯片封装"]}'::jsonb,
     '[]'::jsonb, '["server"]'::jsonb),
    
    -- 中游环节
    (chain_id_val, 'optical-module', '光模块', '光电转换核心器件，数据中心互联关键', 'midstream', 1,
     '{"marketSize":"2025年预计800亿元","growthRate":"CAGR 30%","competitiveLandscape":"双龙头格局","barriers":["技术迭代快","客户粘性高","规模效应"],"keyDrivers":["AI训练需求","数据中心扩容","800G/1.6T升级"]}'::jsonb,
     '["optical-chip"]'::jsonb, '["switch"]'::jsonb),
    (chain_id_val, 'switch', '交换机', '网络核心设备，数据中心流量枢纽', 'midstream', 2,
     '{"marketSize":"2025年预计600亿元","growthRate":"CAGR 15%","competitiveLandscape":"寡头垄断","barriers":["技术积累","生态壁垒","客户关系"],"keyDrivers":["数据中心建设","AI网络需求"]}'::jsonb,
     '["optical-module"]'::jsonb, '["data-center"]'::jsonb),
    (chain_id_val, 'server', '服务器', '算力载体，AI训练和推理基础', 'midstream', 3,
     '{"marketSize":"2025年预计2000亿元","growthRate":"CAGR 20%","competitiveLandscape":"双龙头+跟随者","barriers":["供应链管理","技术整合","客户定制"],"keyDrivers":["AI算力需求","国产替代","云服务增长"]}'::jsonb,
     '["pcb"]'::jsonb, '["data-center"]'::jsonb),
    
    -- 下游环节
    (chain_id_val, 'data-center', '数据中心', '算力基础设施，AI应用载体', 'downstream', 1,
     '{"marketSize":"2025年预计5000亿元","growthRate":"CAGR 18%","competitiveLandscape":"分散竞争","barriers":["资金密集","能耗指标","选址要求"],"keyDrivers":["AI算力需求","云计算增长","政策支持"]}'::jsonb,
     '["switch", "server"]'::jsonb, '["ai-application"]'::jsonb),
    (chain_id_val, 'ai-application', 'AI应用', 'AI技术落地，创造商业价值', 'downstream', 2,
     '{"marketSize":"2025年预计10000亿元","growthRate":"CAGR 35%","competitiveLandscape":"百花齐放","barriers":["数据积累","场景理解","用户习惯"],"keyDrivers":["大模型能力","场景落地","商业化"]}'::jsonb,
     '["data-center"]'::jsonb, '[]'::jsonb);
    
    -- 插入公司数据
    INSERT INTO industry_chain_stocks (chain_id, segment_id, symbol, name, position, competitive_advantage) VALUES
    -- 光芯片公司
    (chain_id_val, (SELECT id FROM industry_chain_segments WHERE segment_id = 'optical-chip'), '300308', '中际旭创', 'leader', '全球光模块龙头，800G产品领先'),
    (chain_id_val, (SELECT id FROM industry_chain_segments WHERE segment_id = 'optical-chip'), '002281', '光迅科技', 'challenger', '国产光芯片突破'),
    
    -- PCB公司
    (chain_id_val, (SELECT id FROM industry_chain_segments WHERE segment_id = 'pcb'), '002916', '深南电路', 'leader', '高端PCB龙头'),
    
    -- 光模块公司
    (chain_id_val, (SELECT id FROM industry_chain_segments WHERE segment_id = 'optical-module'), '300308', '中际旭创', 'leader', '全球800G光模块龙头'),
    (chain_id_val, (SELECT id FROM industry_chain_segments WHERE segment_id = 'optical-module'), '300502', '新易盛', 'challenger', '高速光模块领先'),
    
    -- 交换机公司
    (chain_id_val, (SELECT id FROM industry_chain_segments WHERE segment_id = 'switch'), '000063', '中兴通讯', 'leader', '全球通信设备龙头'),
    
    -- 服务器公司
    (chain_id_val, (SELECT id FROM industry_chain_segments WHERE segment_id = 'server'), '000977', '浪潮信息', 'leader', 'AI服务器龙头'),
    (chain_id_val, (SELECT id FROM industry_chain_segments WHERE segment_id = 'server'), '603019', '中科曙光', 'challenger', '国产算力龙头'),
    
    -- 数据中心公司
    (chain_id_val, (SELECT id FROM industry_chain_segments WHERE segment_id = 'data-center'), '603881', '数据港', 'leader', '第三方IDC龙头'),
    
    -- AI应用公司
    (chain_id_val, (SELECT id FROM industry_chain_segments WHERE segment_id = 'ai-application'), '688111', '金山办公', 'leader', 'AI办公龙头');
  END IF;
END $$;
