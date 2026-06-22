/**
 * 产业链 API
 * 
 * 提供产业链列表、详情、环节、公司等数据
 * 参考同花顺产业地图设计
 * 
 * v2: DB驱动的数据引擎 — segment通过stockFilter从数据库实时获取公司数据
 */

import { Router, Request, Response } from 'express';
import { asyncHandler, sendSuccess, sendNotFound, sendInternalError } from '../utils/apiResponse';
import { getDb } from '../db/dbFactory';
import segmentFilters from './industryChainFilters';
import conceptMappings from './industryChainConcepts';

const router = Router();

// ============= 产业链数据查询引擎 =============

interface StockFilter {
  industries: string[];       // Shenwan行业
  nameKeywords?: string[];    // 名称关键词
  excludeKeywords?: string[]; // 排除关键词
  marketCapMin?: number;      // 最小市值(亿元)
  leaderCount?: number;       // 龙头数量(按市值排序)
}

interface DbStock {
  symbol: string;
  name: string;
  industry: string;
  marketCap: number;
  changePercent: number;
  currentPrice: number;
  turnoverRate: number;
  peRatio: number;
}

/**
 * 从数据库查询符合条件的股票
 */
async function queryStocksByFilter(filter: StockFilter): Promise<DbStock[]> {
  const dbInstance = getDb();
  const knex = dbInstance.connection;
  
  let query = knex('stocks as s')
    .leftJoin('daily_quotes as dq', function(this: any) {
      this.on('s.id', '=', 'dq.stock_id')
        .andOn('dq.trade_date', '=', knex.raw(
          '(SELECT MAX(trade_date) FROM daily_quotes WHERE stock_id = s.id)'
        ));
    })
    .where('s.is_active', true)
    .whereNotNull('dq.close_price')
    .select(
      's.symbol',
      's.name',
      's.industry',
      knex.raw('COALESCE(dq.market_cap, s.market_cap) as market_cap'),
      knex.raw('COALESCE(dq.change_percent, 0) as change_percent'),
      knex.raw('COALESCE(dq.close_price, s.current_price) as current_price'),
      knex.raw('COALESCE(dq.turnover_rate, 0) as turnover_rate'),
      knex.raw('s.pe_ratio')
    );
  
  // 行业过滤
  if (filter.industries?.length > 0) {
    query = query.whereIn('s.industry', filter.industries);
  }
  
  // 关键词过滤
  if (filter.nameKeywords?.length > 0) {
    query = query.where(function(builder: any) {
      filter.nameKeywords!.forEach(kw => {
        builder.orWhere('s.name', 'like', `%${kw}%`);
      });
    });
  }
  
  // 排除关键词
  if (filter.excludeKeywords?.length > 0) {
    filter.excludeKeywords.forEach(kw => {
      query = query.whereNot('s.name', 'like', `%${kw}%`);
    });
  }
  
  // 市值过滤 (marketCapMin单位:亿, DB存万元)
  if (filter.marketCapMin) {
    query = query.where(knex.raw('COALESCE(dq.market_cap, s.market_cap)'), '>=', filter.marketCapMin * 1e4);
  }
  
  // 按市值排序
  query = query.orderBy(knex.raw('COALESCE(dq.market_cap, s.market_cap)'), 'desc');
  
  // 限制数量(龙头数*2，确保前端有足够数据)
  const limit = (filter.leaderCount || 3) * 6;
  query = query.limit(limit);
  
  const rows = await query;
  
  return rows.map((r: any) => ({
    symbol: r.symbol.replace(/\.(SH|SZ|BJ)$/, ''),
    name: (r.name || '').trim(),
    industry: r.industry || '',
    marketCap: parseFloat(r.market_cap) || 0,
    changePercent: parseFloat(r.change_percent) || 0,
    currentPrice: parseFloat(r.current_price) || 0,
    turnoverRate: parseFloat(r.turnover_rate) || 0,
    peRatio: parseFloat(r.pe_ratio) || 0,
  }));
}

/**
 * 将DB查询结果转换为segment所需的公司数据
 * 按市值排序，前N个标记为leader
 */
function dbStocksToCompanies(stocks: DbStock[], leaderCount: number = 3) {
  // 过滤掉ST、退市等
  const valid = stocks.filter(s => !s.name.includes('ST') && !s.name.includes('退') && s.marketCap > 0);
  
  return valid.map((s, i) => ({
    symbol: s.symbol,
    name: s.name,
    marketCap: Math.round(s.marketCap / 1e4), // 万元→亿
    changePercent: Math.round(s.changePercent * 100) / 100,
    currentPrice: Math.round(s.currentPrice * 100) / 100,
    position: i < leaderCount ? 'leader' : 'other',
    competitiveAdvantage: i < leaderCount ? `市值${s.industry}第${i+1}` : undefined,
  }));
}

/**
 * 概念优先查询: 先用概念标签精确查询，再用关键词兜底
 */
async function queryStocksByConcept(chainId: string, segmentId: string): Promise<DbStock[]> {
  // 1. 优先使用概念精确映射
  const conceptMap = conceptMappings.find(c => c.conceptId === segmentId);
  if (conceptMap && conceptMap.symbols.length > 0) {
    const symbols = conceptMap.symbols.map(s => `${s}.SZ`).concat(conceptMap.symbols.map(s => `${s}.SH`));
    // 也加上 BJ 后缀的尝试
    const allSymbols = conceptMap.symbols.flatMap(s => [`${s}.SH`, `${s}.SZ`, `${s}.BJ`]);
    
    const dbInstance = getDb();
    const knex = dbInstance.connection;
    const rows = await knex('stocks as s')
      .leftJoin('daily_quotes as dq', function(this: any) {
        this.on('s.id', '=', 'dq.stock_id')
          .andOn('dq.trade_date', '=', knex.raw('(SELECT MAX(trade_date) FROM daily_quotes WHERE stock_id = s.id)'));
      })
      .whereIn('s.symbol', allSymbols)
      .where('s.is_active', true)
      .select(
        's.symbol', 's.name', 's.industry',
        knex.raw('COALESCE(dq.market_cap, s.market_cap) as market_cap'),
        knex.raw('COALESCE(dq.change_percent, 0) as change_percent'),
        knex.raw('COALESCE(dq.close_price, s.current_price) as current_price'),
        knex.raw('COALESCE(dq.turnover_rate, 0) as turnover_rate'),
        knex.raw('s.pe_ratio')
      )
      .orderBy(knex.raw('COALESCE(dq.market_cap, s.market_cap)'), 'desc');
    
    return rows.map((r: any) => ({
      symbol: r.symbol.replace(/\.(SH|SZ|BJ)$/, ''),
      name: (r.name || '').trim(),
      industry: r.industry || '',
      marketCap: parseFloat(r.market_cap) || 0,
      changePercent: parseFloat(r.change_percent) || 0,
      currentPrice: parseFloat(r.current_price) || 0,
      turnoverRate: parseFloat(r.turnover_rate) || 0,
      peRatio: parseFloat(r.pe_ratio) || 0,
    }));
  }
  
  // 2. 兜底: 关键词查询
  const filter = segmentFilters.find(f => f.chainId === chainId && f.segmentId === segmentId);
  if (filter) return queryStocksByFilter(filter);
  
  return [];
}

// ============= 模拟数据（生产环境应从数据库读取）=============

const industryChains = [
  {
    id: 'ai-computing',
    name: 'AI算力产业链',
    description: '从芯片到应用的AI算力全链条，涵盖光模块、交换机、服务器、数据中心等核心环节',
    theme: 'AI',
    category: 'technology',
    hotLevel: 95,
    segmentCount: 7,
    companyCount: 10,
    relatedConcepts: ['ChatGPT', '大模型', '算力', '光模块', '数据中心'],
    relatedPolicies: ['东数西算', '新基建', 'AI发展规划'],
    marketDrivers: ['AI算力需求爆发', '大模型训练', '数据中心扩容'],
    updatedAt: '2026-06-15',
  },
  {
    id: 'new-energy-vehicle',
    name: '新能源汽车产业链',
    description: '从电池到整车的新能源汽车全链条，涵盖锂矿、正负极材料、电池、电机、电控、整车等核心环节',
    theme: '新能源',
    category: 'energy',
    hotLevel: 85,
    segmentCount: 10,
    companyCount: 50,
    relatedConcepts: ['电动车', '锂电池', '充电桩', '智能驾驶'],
    relatedPolicies: ['新能源汽车补贴', '双积分政策', '碳中和'],
    marketDrivers: ['政策驱动', '技术进步', '成本下降'],
    updatedAt: '2026-06-15',
  },
  {
    id: 'semiconductor',
    name: '半导体产业链',
    description: '从设计到封测的半导体全链条，涵盖IC设计、晶圆制造、封装测试、设备、材料等核心环节',
    theme: '芯片',
    category: 'technology',
    hotLevel: 90,
    segmentCount: 12,
    companyCount: 80,
    relatedConcepts: ['芯片', '光刻机', '国产替代', 'EDA'],
    relatedPolicies: ['国家大基金', '芯片法案', '自主可控'],
    marketDrivers: ['国产替代需求', 'AI芯片需求', '汽车电子增长'],
    updatedAt: '2026-06-15',
  },
  {
    id: 'photovoltaic',
    name: '光伏产业链',
    description: '从硅料到电站的光伏全链条，涵盖硅料、硅片、电池片、组件、逆变器、电站等核心环节',
    theme: '太阳能',
    category: 'energy',
    hotLevel: 75,
    segmentCount: 8,
    companyCount: 40,
    relatedConcepts: ['太阳能', '碳中和', '新能源'],
    relatedPolicies: ['碳达峰碳中和', '可再生能源补贴'],
    marketDrivers: ['碳中和目标', '成本下降', '海外需求'],
    updatedAt: '2026-06-15',
  },
  {
    id: 'ai-robot',
    name: 'AI机器人产业链',
    description: '从核心零部件到整机的AI机器人全链条，涵盖减速器、伺服电机、控制器、传感器、本体等核心环节',
    theme: '机器人',
    category: 'technology',
    hotLevel: 80,
    segmentCount: 9,
    companyCount: 35,
    relatedConcepts: ['人形机器人', '减速器', '传感器'],
    relatedPolicies: ['机器人产业发展规划'],
    marketDrivers: ['人口老龄化', 'AI技术进步', '制造业升级'],
    updatedAt: '2026-06-15',
  },
];

// AI算力产业链详细数据
const aiComputingChainDetail = {
  id: 'ai-computing',
  name: 'AI算力产业链',
  description: '从芯片到应用的AI算力全链条',
  theme: 'AI',
  hotLevel: 95,
  layers: [
    {
      id: 'upstream',
      name: '上游',
      type: 'upstream',
      description: '核心硬件和基础组件',
      order: 1,
      segments: [
        {
          id: 'optical-chip',
          name: '光芯片',
          description: '光通信核心器件，决定传输速率和距离',
          layerId: 'upstream',
          stockFilter: { industries: ['电子', '通信'], nameKeywords: ['光', '光电', '激光', '光模块', '光器件'], excludeKeywords: ['光伏', '光电股份'], marketCapMin: 30, leaderCount: 3 },
          companies: [],
          characteristics: {
            marketSize: '2025年预计500亿元',
            growthRate: 'CAGR 25%',
            competitiveLandscape: '集中度高，龙头效应明显',
            barriers: ['技术门槛高', '研发投入大', '客户认证周期长'],
            keyDrivers: ['AI算力需求', '数据中心升级', '5G建设'],
          },
          upstreamTo: [],
          downstreamTo: ['optical-module'],
        },
        {
          id: 'pcb',
          name: 'PCB/载板',
          description: '电子元器件基础，支撑芯片封装',
          layerId: 'upstream',
          companies: [
            { symbol: '002916', name: '深南电路', marketCap: 500, changePercent: 2.15, currentPrice: 98.3, position: 'leader', competitiveAdvantage: '高端PCB龙头' },
          ],
          characteristics: {
            marketSize: '2025年预计3000亿元',
            growthRate: 'CAGR 8%',
            competitiveLandscape: '分散竞争，高端集中',
            barriers: ['资金密集', '工艺复杂', '环保要求'],
            keyDrivers: ['服务器需求', 'AI芯片封装'],
          },
          upstreamTo: [],
          downstreamTo: ['server'],
        },
      ],
    },
    {
      id: 'midstream',
      name: '中游',
      type: 'midstream',
      description: '核心设备和系统集成',
      order: 2,
      segments: [
        {
          id: 'optical-module',
          name: '光模块',
          description: '光电转换核心器件，数据中心互联关键',
          layerId: 'midstream',
          companies: [
            { symbol: '300308', name: '中际旭创', marketCap: 1200, changePercent: 5.23, currentPrice: 120.5, position: 'leader', competitiveAdvantage: '全球800G光模块龙头' },
            { symbol: '300502', name: '新易盛', marketCap: 800, changePercent: 4.12, currentPrice: 85.6, position: 'challenger', competitiveAdvantage: '高速光模块领先' },
          ],
          characteristics: {
            marketSize: '2025年预计800亿元',
            growthRate: 'CAGR 30%',
            competitiveLandscape: '双龙头格局',
            barriers: ['技术迭代快', '客户粘性高', '规模效应'],
            keyDrivers: ['AI训练需求', '数据中心扩容', '800G/1.6T升级'],
          },
          upstreamTo: ['optical-chip'],
          downstreamTo: ['switch'],
        },
        {
          id: 'switch',
          name: '交换机',
          description: '网络核心设备，数据中心流量枢纽',
          layerId: 'midstream',
          companies: [
            { symbol: '000063', name: '中兴通讯', marketCap: 1500, changePercent: 1.85, currentPrice: 32.5, position: 'leader', competitiveAdvantage: '全球通信设备龙头' },
          ],
          characteristics: {
            marketSize: '2025年预计600亿元',
            growthRate: 'CAGR 15%',
            competitiveLandscape: '寡头垄断',
            barriers: ['技术积累', '生态壁垒', '客户关系'],
            keyDrivers: ['数据中心建设', 'AI网络需求'],
          },
          upstreamTo: ['optical-module'],
          downstreamTo: ['data-center'],
        },
        {
          id: 'server',
          name: '服务器',
          description: '算力载体，AI训练和推理基础',
          layerId: 'midstream',
          companies: [
            { symbol: '000977', name: '浪潮信息', marketCap: 800, changePercent: 3.25, currentPrice: 45.8, position: 'leader', competitiveAdvantage: 'AI服务器龙头' },
            { symbol: '603019', name: '中科曙光', marketCap: 600, changePercent: 2.78, currentPrice: 52.3, position: 'challenger', competitiveAdvantage: '国产算力龙头' },
          ],
          characteristics: {
            marketSize: '2025年预计2000亿元',
            growthRate: 'CAGR 20%',
            competitiveLandscape: '双龙头+跟随者',
            barriers: ['供应链管理', '技术整合', '客户定制'],
            keyDrivers: ['AI算力需求', '国产替代', '云服务增长'],
          },
          upstreamTo: ['pcb'],
          downstreamTo: ['data-center'],
        },
      ],
    },
    {
      id: 'downstream',
      name: '下游',
      type: 'downstream',
      description: '应用场景和终端用户',
      order: 3,
      segments: [
        {
          id: 'data-center',
          name: '数据中心',
          description: '算力基础设施，AI应用载体',
          layerId: 'downstream',
          companies: [
            { symbol: '603881', name: '数据港', marketCap: 200, changePercent: 4.56, currentPrice: 35.2, position: 'leader', competitiveAdvantage: '第三方IDC龙头' },
          ],
          characteristics: {
            marketSize: '2025年预计5000亿元',
            growthRate: 'CAGR 18%',
            competitiveLandscape: '分散竞争',
            barriers: ['资金密集', '能耗指标', '选址要求'],
            keyDrivers: ['AI算力需求', '云计算增长', '政策支持'],
          },
          upstreamTo: ['switch', 'server'],
          downstreamTo: ['ai-application'],
        },
        {
          id: 'ai-application',
          name: 'AI应用',
          description: 'AI技术落地，创造商业价值',
          layerId: 'downstream',
          companies: [
            { symbol: '688111', name: '金山办公', marketCap: 1200, changePercent: 2.35, currentPrice: 320.5, position: 'leader', competitiveAdvantage: 'AI办公龙头' },
          ],
          characteristics: {
            marketSize: '2025年预计10000亿元',
            growthRate: 'CAGR 35%',
            competitiveLandscape: '百花齐放',
            barriers: ['数据积累', '场景理解', '用户习惯'],
            keyDrivers: ['大模型能力', '场景落地', '商业化'],
          },
          upstreamTo: ['data-center'],
          downstreamTo: [],
        },
      ],
    },
  ],
  relatedConcepts: ['ChatGPT', '大模型', '算力', '光模块', '数据中心'],
  relatedPolicies: ['东数西算', '新基建', 'AI发展规划'],
  marketDrivers: ['AI算力需求爆发', '大模型训练', '数据中心扩容'],
  aiAnalysis: {
    overview: 'AI算力产业链是当前市场最热门的投资主线之一。随着ChatGPT等大模型的爆发，AI算力需求呈现指数级增长，带动整个产业链从上游芯片到下游应用全面受益。',
    investmentLogic: '投资逻辑遵循"卖水人"原则：优先受益的是提供算力基础设施的上游硬件公司（光芯片、光模块），然后是中游设备商（交换机、服务器），最后是下游应用（数据中心、AI应用）。',
    benefitOrder: '上游硬件 → 中游设备 → 下游应用',
    elasticityRank: '光模块 > 交换机 > 服务器 > 数据中心',
    riskFactors: ['AI算力需求不及预期', '技术路线变化', '产能过剩风险', '地缘政治影响'],
    keyInsights: ['光模块是产业链弹性最大的环节', '800G/1.6T升级带来持续增长', '国产替代加速，关注国内龙头', '数据中心能耗问题可能制约发展'],
    generatedAt: '2026-06-15T10:00:00Z',
  },
};

// 半导体产业链详细数据
const semiconductorChainDetail = {
  id: 'semiconductor',
  name: '半导体产业链',
  description: '从设计到封测的半导体全链条，涵盖IC设计、EDA/IP、晶圆制造、封装测试、设备、材料等核心环节',
  theme: '芯片',
  hotLevel: 90,
  layers: [
    {
      id: 'upstream',
      name: '上游',
      type: 'upstream',
      description: '设计工具、核心设备和基础材料',
      order: 1,
      segments: [
        {
          id: 'ic-design',
          name: 'IC设计',
          description: '芯片设计环节，定义芯片功能和性能，是半导体产业链附加值最高的环节之一',
          layerId: 'upstream',
          companies: [
            { symbol: '603501', name: '韦尔股份', marketCap: 1500, changePercent: 3.21, currentPrice: 105.8, position: 'leader', competitiveAdvantage: '全球CIS芯片龙头，收购豪威科技后产品线全覆盖' },
            { symbol: '603986', name: '兆易创新', marketCap: 800, changePercent: 2.85, currentPrice: 120.5, position: 'leader', competitiveAdvantage: '存储+MCU双轮驱动，NOR Flash国内龙头' },
            { symbol: '300223', name: '北京君正', marketCap: 350, changePercent: 4.12, currentPrice: 72.3, position: 'challenger', competitiveAdvantage: '收购ISSI后成为存储+处理器平台型公司' },
          ],
          characteristics: {
            marketSize: '2025年预计6000亿元',
            growthRate: 'CAGR 15%',
            competitiveLandscape: '分散竞争，细分领域各有龙头',
            barriers: ['技术门槛高', '人才稀缺', 'IP积累', '客户认证周期长'],
            keyDrivers: ['国产替代', 'AI芯片需求', '汽车电子', '物联网'],
          },
          upstreamTo: ['eda-ip'],
          downstreamTo: ['wafer-fabrication'],
        },
        {
          id: 'eda-ip',
          name: 'EDA/IP',
          description: '电子设计自动化工具和半导体IP核，是芯片设计的基础工具和核心资产',
          layerId: 'upstream',
          companies: [
            { symbol: '301269', name: '华大九天', marketCap: 500, changePercent: 5.67, currentPrice: 92.4, position: 'leader', competitiveAdvantage: '国内EDA龙头，全流程覆盖能力最强' },
            { symbol: '688206', name: '概伦电子', marketCap: 120, changePercent: 3.45, currentPrice: 28.6, position: 'challenger', competitiveAdvantage: '器件建模和电路仿真领域国际领先' },
          ],
          characteristics: {
            marketSize: '2025年预计200亿元',
            growthRate: 'CAGR 20%',
            competitiveLandscape: '海外三巨头垄断，国产替代起步',
            barriers: ['技术壁垒极高', '生态壁垒', '研发投入巨大', '客户粘性强'],
            keyDrivers: ['国产替代政策', '芯片设计需求增长', '先进制程演进'],
          },
          upstreamTo: [],
          downstreamTo: ['ic-design'],
        },
        {
          id: 'semiconductor-equipment',
          name: '半导体设备',
          description: '晶圆制造的核心支撑，包括光刻机、刻蚀机、薄膜沉积等关键设备',
          layerId: 'upstream',
          companies: [
            { symbol: '002371', name: '北方华创', marketCap: 2000, changePercent: 4.56, currentPrice: 380.2, position: 'leader', competitiveAdvantage: '国内半导体设备龙头，产品线最全' },
            { symbol: '688012', name: '中微公司', marketCap: 1000, changePercent: 3.78, currentPrice: 162.5, position: 'leader', competitiveAdvantage: '刻蚀设备国际领先，MOCVD设备龙头' },
          ],
          characteristics: {
            marketSize: '2025年预计1500亿元',
            growthRate: 'CAGR 25%',
            competitiveLandscape: '海外垄断，国产加速突破',
            barriers: ['技术壁垒极高', '研发投入大', '客户验证周期长', '供应链复杂'],
            keyDrivers: ['晶圆厂扩产', '国产替代', '先进制程需求', '政策支持'],
          },
          upstreamTo: [],
          downstreamTo: ['wafer-fabrication'],
        },
        {
          id: 'semiconductor-material',
          name: '半导体材料',
          description: '半导体制造的基础材料，包括硅片、光刻胶、电子气体、CMP抛光液等',
          layerId: 'upstream',
          companies: [
            { symbol: '688126', name: '沪硅产业', marketCap: 600, changePercent: 2.34, currentPrice: 22.8, position: 'leader', competitiveAdvantage: '国内大硅片龙头，300mm硅片产能领先' },
            { symbol: '605358', name: '立昂微', marketCap: 200, changePercent: 1.89, currentPrice: 45.6, position: 'challenger', competitiveAdvantage: '半导体硅片+功率器件双主业' },
          ],
          characteristics: {
            marketSize: '2025年预计800亿元',
            growthRate: 'CAGR 12%',
            competitiveLandscape: '日本企业主导，国产化率提升中',
            barriers: ['纯度要求极高', '工艺控制严格', '客户认证周期长'],
            keyDrivers: ['晶圆厂扩产', '国产替代', '先进制程材料需求'],
          },
          upstreamTo: [],
          downstreamTo: ['wafer-fabrication'],
        },
      ],
    },
    {
      id: 'midstream',
      name: '中游',
      type: 'midstream',
      description: '晶圆制造和封装测试',
      order: 2,
      segments: [
        {
          id: 'wafer-fabrication',
          name: '晶圆制造',
          description: '将设计好的芯片图案转移到硅片上，是半导体产业链资本和技术密集度最高的环节',
          layerId: 'midstream',
          companies: [
            { symbol: '688981', name: '中芯国际', marketCap: 4000, changePercent: 2.15, currentPrice: 50.8, position: 'leader', competitiveAdvantage: '国内晶圆代工龙头，14nm量产' },
            { symbol: '688347', name: '华虹半导体', marketCap: 800, changePercent: 1.56, currentPrice: 48.2, position: 'challenger', competitiveAdvantage: '特色工艺平台，功率器件代工领先' },
          ],
          characteristics: {
            marketSize: '2025年预计5000亿元',
            growthRate: 'CAGR 18%',
            competitiveLandscape: '台积电寡头，国内追赶',
            barriers: ['资本壁垒极高', '技术壁垒', '人才密集', '设备依赖'],
            keyDrivers: ['国产替代', 'AI芯片需求', '汽车电子', '物联网'],
          },
          upstreamTo: ['ic-design', 'semiconductor-equipment', 'semiconductor-material'],
          downstreamTo: ['packaging-testing'],
        },
      ],
    },
    {
      id: 'downstream',
      name: '下游',
      type: 'downstream',
      description: '封装测试和终端应用',
      order: 3,
      segments: [
        {
          id: 'packaging-testing',
          name: '封装测试',
          description: '将制造好的晶圆切割、封装成可用芯片并进行测试，是半导体产业链的重要环节',
          layerId: 'downstream',
          companies: [
            { symbol: '600584', name: '长电科技', marketCap: 600, changePercent: 3.45, currentPrice: 33.8, position: 'leader', competitiveAdvantage: '全球封测龙头，先进封装技术领先' },
            { symbol: '002156', name: '通富微电', marketCap: 350, changePercent: 2.78, currentPrice: 23.5, position: 'challenger', competitiveAdvantage: 'AMD核心封测伙伴，高端封装能力突出' },
            { symbol: '002185', name: '华天科技', marketCap: 280, changePercent: 2.12, currentPrice: 10.2, position: 'challenger', competitiveAdvantage: '国内封测第三，SiP封装布局领先' },
          ],
          characteristics: {
            marketSize: '2025年预计3000亿元',
            growthRate: 'CAGR 10%',
            competitiveLandscape: '三龙头格局，集中度提升',
            barriers: ['资金密集', '客户认证', '技术迭代', '规模效应'],
            keyDrivers: ['先进封装需求', 'AI芯片封装', '汽车电子', '国产替代'],
          },
          upstreamTo: ['wafer-fabrication'],
          downstreamTo: ['chip-application'],
        },
        {
          id: 'chip-application',
          name: '芯片应用',
          description: '半导体芯片的终端应用场景，涵盖消费电子、汽车电子、工业控制、通信等领域',
          layerId: 'downstream',
          companies: [
            { symbol: '002230', name: '科大讯飞', marketCap: 1000, changePercent: 1.89, currentPrice: 43.5, position: 'leader', competitiveAdvantage: 'AI语音芯片+应用生态' },
          ],
          characteristics: {
            marketSize: '2025年预计30000亿元',
            growthRate: 'CAGR 8%',
            competitiveLandscape: '应用场景广泛，细分龙头众多',
            barriers: ['生态壁垒', '客户粘性', '品牌认知'],
            keyDrivers: ['AI应用落地', '智能汽车', '物联网', '消费电子创新'],
          },
          upstreamTo: ['packaging-testing'],
          downstreamTo: [],
        },
      ],
    },
  ],
  relatedConcepts: ['芯片', '光刻机', '国产替代', 'EDA', '晶圆', '先进封装'],
  relatedPolicies: ['国家大基金', '芯片法案', '自主可控', '十四五规划'],
  marketDrivers: ['国产替代需求', 'AI芯片需求', '汽车电子增长', '物联网爆发'],
  aiAnalysis: {
    overview: '半导体产业链是国家战略重点支持方向，受地缘政治和国产替代双重驱动。从设计、制造到封测，国内企业正在加速追赶，但在先进制程和核心设备领域仍存在较大差距。',
    investmentLogic: '投资逻辑遵循"卡脖子"原则：优先关注国产替代空间大、技术突破可能性高的环节。上游设备和材料受益于晶圆厂扩产，中游制造是国产替代核心，下游封测技术差距最小。',
    benefitOrder: '上游设备/材料 → 中游制造 → 下游封测',
    elasticityRank: '半导体设备 > IC设计 > 晶圆制造 > 封装测试 > 半导体材料',
    riskFactors: ['地缘政治风险', '技术突破不及预期', '产能过剩', '需求周期性波动', '美国制裁升级'],
    keyInsights: ['半导体设备是最确定的国产替代方向', '先进封装成为后摩尔时代重要增长点', 'AI芯片带动先进制程需求', '大基金持续加码，政策支持力度大'],
    generatedAt: '2026-06-18T10:00:00Z',
  },
};

// ============= API 路由 =============

/**
 * 获取产业链列表
 * GET /api/industry-chains
 */
router.get('/', (req: Request, res: Response) => {
  const { category, sortBy = 'hotLevel', sortOrder = 'desc' } = req.query;
  
  let data = [...industryChains];
  
  // 按分类筛选
  if (category) {
    data = data.filter(chain => chain.category === category);
  }
  
  // 排序
  data.sort((a, b) => {
    const aVal = (a as any)[sortBy as string] || 0;
    const bVal = (b as any)[sortBy as string] || 0;
    return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
  });
  
  sendSuccess(res, { chains: data, total: data.length });
});

/**
 * 获取产业链分类列表
 * GET /api/industry-chains/categories
 */
router.get('/categories', (req: Request, res: Response) => {
  const categories = [
    { id: 'technology', name: '科技', icon: '💻' },
    { id: 'energy', name: '能源', icon: '⚡' },
    { id: 'healthcare', name: '医疗', icon: '🏥' },
    { id: 'consumer', name: '消费', icon: '🛒' },
    { id: 'finance', name: '金融', icon: '💰' },
  ];
  
  sendSuccess(res, categories);
});

/**
 * 搜索产业链
 * GET /api/industry-chains/search
 */
router.get('/search', (req: Request, res: Response) => {
  const { q } = req.query;
  
  if (!q) {
    return sendSuccess(res, { chains: [], total: 0 });
  }
  
  const query = (q as string).toLowerCase();
  const results = industryChains.filter(chain => 
    chain.name.toLowerCase().includes(query) ||
    chain.description.toLowerCase().includes(query) ||
    chain.relatedConcepts.some(concept => concept.toLowerCase().includes(query))
  );
  
  sendSuccess(res, { chains: results, total: results.length });
});

/**
 * 获取产业链详情 (DB驱动版)
 * GET /api/industry-chains/:id
 * 
 * 自动从数据库填充公司数据，保持行情实时同步
 */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  
  // 获取产业链详细数据
  let chainDetail: any = null;
  if (id === 'ai-computing') chainDetail = aiComputingChainDetail;
  else if (id === 'semiconductor') chainDetail = semiconductorChainDetail;
  else {
    const chain = industryChains.find(c => c.id === id);
    if (!chain) return sendNotFound(res, '产业链未找到');
    // 无详细数据的产业链直接返回摘要
    const enriched = { ...chain };
    // 尝试从DB查询，如果有filter定义
    const filters = segmentFilters.filter((f: any) => f.chainId === id);
    if (filters.length > 0) {
      enriched.layers = [{
        id: 'main', name: '产业链', type: 'midstream', description: chain.description, order: 1,
        segments: await Promise.all(filters.map(async (f: any) => {
          let companies: any[] = [];
          try {
            companies = dbStocksToCompanies(await queryStocksByConcept(id, f.segmentId), f.leaderCount || 3);
          } catch { /* ignore: best-effort concept query */ }
          return {
            id: f.segmentId, name: f.segmentName, description: f.description || '', layerId: 'main',
            companies, characteristics: {}, upstreamTo: [], downstreamTo: [],
          };
        })),
      }];
    }
    return sendSuccess(res, { chain: enriched });
  }
  
  // DB数据注入: 为每个segment填充公司数据 (概念优先 + 关键词兜底)
  const enriched = { ...chainDetail };
  if (enriched.layers) {
    for (const layer of enriched.layers) {
      for (const segment of layer.segments) {
        try {
          segment.companies = dbStocksToCompanies(
            await queryStocksByConcept(id, segment.id),
            (segment.stockFilter as any)?.leaderCount || 3
          );
        } catch (err) {
          console.error(`[产业链] 查询 ${id}/${segment.id} 失败:`, err);
          segment.companies = [];
        }
      }
    }
  }
  
  sendSuccess(res, { chain: enriched });
}));

/**
 * 获取产业链环节列表
 * GET /api/industry-chains/:id/segments
 */
router.get('/:id/segments', (req: Request, res: Response) => {
  const { id } = req.params;
  
  if (id === 'ai-computing') {
    const segments = aiComputingChainDetail.layers.flatMap(layer => 
      layer.segments.map(segment => ({
        ...segment,
        layerType: layer.type,
        layerName: layer.name,
      }))
    );
    return sendSuccess(res, { segments, total: segments.length });
  }
  
  if (id === 'semiconductor') {
    const segments = semiconductorChainDetail.layers.flatMap(layer => 
      layer.segments.map(segment => ({
        ...segment,
        layerType: layer.type,
        layerName: layer.name,
      }))
    );
    return sendSuccess(res, { segments, total: segments.length });
  }
  
  sendSuccess(res, { segments: [], total: 0 });
});

/**
 * 获取产业链公司列表
 * GET /api/industry-chains/:id/stocks
 */
router.get('/:id/stocks', (req: Request, res: Response) => {
  const { id } = req.params;
  const { segmentId, position, sortBy = 'changePercent', sortOrder = 'desc' } = req.query;
  
  if (id === 'ai-computing') {
    let stocks = aiComputingChainDetail.layers.flatMap(layer => 
      layer.segments.flatMap(segment => 
        segment.companies.map(company => ({
          ...company,
          segmentId: segment.id,
          segmentName: segment.name,
          layerType: layer.type,
        }))
      )
    );
    
    // 按环节筛选
    if (segmentId) {
      stocks = stocks.filter(s => s.segmentId === segmentId);
    }
    
    // 按地位筛选
    if (position) {
      stocks = stocks.filter(s => s.position === position);
    }
    
    // 去重（同一公司可能出现在多个环节）
    const uniqueStocks = Array.from(new Map(stocks.map(s => [s.symbol, s])).values());
    
    // 排序
    uniqueStocks.sort((a, b) => {
      const aVal = (a as any)[sortBy as string] || 0;
      const bVal = (b as any)[sortBy as string] || 0;
      return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
    });
    
    return sendSuccess(res, { stocks: uniqueStocks, total: uniqueStocks.length });
  }
  
  if (id === 'semiconductor') {
    let stocks = semiconductorChainDetail.layers.flatMap(layer => 
      layer.segments.flatMap(segment => 
        segment.companies.map(company => ({
          ...company,
          segmentId: segment.id,
          segmentName: segment.name,
          layerType: layer.type,
        }))
      )
    );
    
    // 按环节筛选
    if (segmentId) {
      stocks = stocks.filter(s => s.segmentId === segmentId);
    }
    
    // 按地位筛选
    if (position) {
      stocks = stocks.filter(s => s.position === position);
    }
    
    // 去重（同一公司可能出现在多个环节）
    const uniqueStocks = Array.from(new Map(stocks.map(s => [s.symbol, s])).values());
    
    // 排序
    uniqueStocks.sort((a, b) => {
      const aVal = (a as any)[sortBy as string] || 0;
      const bVal = (b as any)[sortBy as string] || 0;
      return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
    });
    
    return sendSuccess(res, { stocks: uniqueStocks, total: uniqueStocks.length });
  }
  
  sendSuccess(res, { stocks: [], total: 0 });
});

/**
 * 获取产业链热点股票
 * GET /api/industry-chains/:id/hot-stocks
 */
router.get('/:id/hot-stocks', (req: Request, res: Response) => {
  const { id } = req.params;
  const { limit = 10, metric = 'changePercent' } = req.query;
  
  if (id === 'ai-computing') {
    const stocks = aiComputingChainDetail.layers.flatMap(layer => 
      layer.segments.flatMap(segment => segment.companies)
    );
    
    // 去重
    const uniqueStocks = Array.from(new Map(stocks.map(s => [s.symbol, s])).values());
    
    // 排序
    uniqueStocks.sort((a, b) => {
      const aVal = (a as any)[metric as string] || 0;
      const bVal = (b as any)[metric as string] || 0;
      return bVal - aVal;
    });
    
    return sendSuccess(res, { stocks: uniqueStocks.slice(0, Number(limit)) });
  }
  
  if (id === 'semiconductor') {
    const stocks = semiconductorChainDetail.layers.flatMap(layer => 
      layer.segments.flatMap(segment => segment.companies)
    );
    
    // 去重
    const uniqueStocks = Array.from(new Map(stocks.map(s => [s.symbol, s])).values());
    
    // 排序
    uniqueStocks.sort((a, b) => {
      const aVal = (a as any)[metric as string] || 0;
      const bVal = (b as any)[metric as string] || 0;
      return bVal - aVal;
    });
    
    return sendSuccess(res, { stocks: uniqueStocks.slice(0, Number(limit)) });
  }
  
  sendSuccess(res, { stocks: [] });
});

/**
 * 获取产业链AI分析
 * GET /api/industry-chains/:id/analysis
 */
router.get('/:id/analysis', (req: Request, res: Response) => {
  const { id } = req.params;
  
  if (id === 'ai-computing') {
    return sendSuccess(res, { analysis: aiComputingChainDetail.aiAnalysis });
  }
  
  if (id === 'semiconductor') {
    return sendSuccess(res, { analysis: semiconductorChainDetail.aiAnalysis });
  }
  
  sendSuccess(res, { analysis: null });
});

export default router;
