/**
 * 产业链 API
 * 
 * 提供产业链列表、详情、环节、公司等数据
 * 参考同花顺产业地图设计
 */

import { Router, Request, Response } from 'express';
import { asyncHandler, sendSuccess, sendNotFound, sendInternalError } from '../utils/apiResponse';

const router = Router();

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
          companies: [
            { symbol: '300308', name: '中际旭创', marketCap: 1200, changePercent: 5.23, currentPrice: 120.5, position: 'leader', competitiveAdvantage: '全球光模块龙头，800G产品领先' },
            { symbol: '002281', name: '光迅科技', marketCap: 350, changePercent: 3.45, currentPrice: 45.2, position: 'challenger', competitiveAdvantage: '国产光芯片突破' },
          ],
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
 * 获取产业链详情
 * GET /api/industry-chains/:id
 */
router.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  
  // 返回详细数据（目前只有AI算力产业链有完整数据）
  if (id === 'ai-computing') {
    return sendSuccess(res, { chain: aiComputingChainDetail });
  }
  
  // 其他产业链返回摘要
  const chain = industryChains.find(c => c.id === id);
  if (!chain) {
    return sendNotFound(res, '产业链未找到');
  }
  
  sendSuccess(res, { chain });
});

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
  
  sendSuccess(res, { analysis: null });
});

export default router;
