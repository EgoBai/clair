/**
 * AI 产业地图 — 类型定义
 * 
 * 定义产业链数据结构、图谱节点、交互接口
 */

// ============= 产业链核心类型 =============

/** 产业链定义 */
export interface IndustryChain {
  id: string;
  name: string;                    // 如 "AI算力产业链"
  description: string;             // 产业链概述
  theme: string;                   // 主题标签
  hotLevel: number;                // 热度 0-100
  createdAt: string;
  updatedAt: string;
  
  // 产业链层级
  layers: ChainLayer[];
  
  // 关联数据
  relatedConcepts: string[];       // 关联概念
  relatedPolicies: string[];       // 关联政策
  marketDrivers: string[];         // 市场驱动因素
  
  // AI 分析
  aiAnalysis?: ChainAIAnalysis;
}

/** 产业链层级 */
export interface ChainLayer {
  id: string;
  name: string;                    // "上游" / "中游" / "下游"
  type: LayerType;
  description: string;
  order: number;                   // 排序
  
  // 该层级的细分环节
  segments: ChainSegment[];
}

export type LayerType = 'upstream' | 'midstream' | 'downstream' | 'support';

/** 产业链环节 */
export interface ChainSegment {
  id: string;
  name: string;                    // 如 "光芯片"、"光模块"、"数据中心"
  description: string;
  layerId: string;
  
  // 核心公司
  companies: ChainCompany[];
  
  // 环节特征
  characteristics: SegmentCharacteristics;
  
  // 关联关系
  upstreamTo: string[];            // 上游环节ID
  downstreamTo: string[];          // 下游环节ID
}

/** 环节特征 */
export interface SegmentCharacteristics {
  marketSize?: string;             // 市场规模
  growthRate?: string;             // 增速
  competitiveLandscape?: string;   // 竞争格局
  barriers?: string[];             // 进入壁垒
  keyDrivers?: string[];           // 核心驱动因素
}

/** 产业链公司 */
export interface ChainCompany {
  symbol: string;
  name: string;
  marketCap?: number;              // 市值（亿）
  changePercent?: number;          // 涨跌幅
  currentPrice?: number;           // 现价
  position: CompanyPosition;
  competitiveAdvantage?: string;   // 竞争优势
  revenueBreakdown?: string;       // 收入结构
  isETF?: boolean;                 // 是否ETF
}

export type CompanyPosition = 'leader' | 'challenger' | 'follower';

// ============= AI 分析类型 =============

/** AI 产业链分析 */
export interface ChainAIAnalysis {
  overview: string;                // 产业链概述
  investmentLogic: string;         // 投资逻辑
  benefitOrder: string;            // 受益顺序
  elasticityRank: string;          // 弹性排序
  riskFactors: string[];           // 风险因素
  keyInsights: string[];           // 核心洞察
  generatedAt: string;
}

/** AI 问答请求 */
export interface ChainQuestionRequest {
  question: string;
  context?: {
    segmentId?: string;            // 聚焦环节
    companyId?: string;            // 聚焦公司
  };
}

/** AI 问答响应 (SSE) */
export interface ChainQuestionResponse {
  type: 'text' | 'done' | 'error';
  content: string;
}

// ============= 图谱可视化类型 =============

/** React Flow 节点数据 */
export interface ChainNodeData {
  segment: ChainSegment;
  layerType: LayerType;
  isHighlighted?: boolean;
  isSelected?: boolean;
}

/** React Flow 边数据 */
export interface ChainEdgeData {
  relationship: 'supply' | 'demand' | 'support';
  description?: string;
  strength?: 'strong' | 'medium' | 'weak';
}

/** 图谱布局配置 */
export interface ChainLayoutConfig {
  direction: 'LR' | 'TB';         // 左右 or 上下
  nodeSpacing: number;
  layerSpacing: number;
  animationDuration: number;
}

// ============= 筛选和排序 =============

/** 筛选条件 */
export interface ChainFilter {
  layerType?: LayerType[];
  companyPosition?: CompanyPosition[];
  minMarketCap?: number;
  maxMarketCap?: number;
  sortBy: 'changePercent' | 'marketCap' | 'name';
  sortOrder: 'asc' | 'desc';
}

// ============= API 响应类型 =============

/** 产业链列表响应 */
export interface ChainListResponse {
  chains: IndustryChainSummary[];
  total: number;
}

/** 产业链摘要 */
export interface IndustryChainSummary {
  id: string;
  name: string;
  description: string;
  hotLevel: number;
  segmentCount: number;
  companyCount: number;
  relatedConcepts: string[];
  updatedAt: string;
}

/** 产业链详情响应 */
export interface ChainDetailResponse {
  chain: IndustryChain;
  relatedChains: IndustryChainSummary[];
}

// ============= 常量定义 =============

/** 层级颜色 */
export const LAYER_COLORS: Record<LayerType, string> = {
  upstream: '#1890ff',      // 蓝色 - 上游
  midstream: '#52c41a',     // 绿色 - 中游
  downstream: '#faad14',    // 黄色 - 下游
  support: '#722ed1',       // 紫色 - 支持环节
};

/** 层级中文名 */
export const LAYER_NAMES: Record<LayerType, string> = {
  upstream: '上游',
  midstream: '中游',
  downstream: '下游',
  support: '支持',
};

/** 公司地位颜色 */
export const POSITION_COLORS: Record<CompanyPosition, string> = {
  leader: '#ff4d4f',        // 红色 - 龙头
  challenger: '#faad14',    // 黄色 - 挑战者
  follower: '#8c8c8c',      // 灰色 - 跟随者
};

/** 公司地位中文名 */
export const POSITION_NAMES: Record<CompanyPosition, string> = {
  leader: '龙头',
  challenger: '挑战者',
  follower: '跟随者',
};

// ============= 示例数据 =============

/** AI算力产业链示例数据 */
export const AI_COMPUTING_CHAIN: IndustryChain = {
  id: 'ai-computing',
  name: 'AI算力产业链',
  description: '从芯片到应用的AI算力全链条，涵盖光模块、交换机、服务器、数据中心等核心环节',
  theme: 'AI',
  hotLevel: 95,
  createdAt: '2026-06-15',
  updatedAt: '2026-06-15',
  
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
            {
              symbol: '300308',
              name: '中际旭创',
              marketCap: 1200,
              changePercent: 5.23,
              currentPrice: 120.5,
              position: 'leader',
              competitiveAdvantage: '全球光模块龙头，800G产品领先',
            },
            {
              symbol: '002281',
              name: '光迅科技',
              marketCap: 350,
              changePercent: 3.45,
              currentPrice: 45.2,
              position: 'challenger',
              competitiveAdvantage: '国产光芯片突破',
            },
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
            {
              symbol: '002916',
              name: '深南电路',
              marketCap: 500,
              changePercent: 2.15,
              currentPrice: 98.3,
              position: 'leader',
              competitiveAdvantage: '高端PCB龙头',
            },
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
            {
              symbol: '300308',
              name: '中际旭创',
              marketCap: 1200,
              changePercent: 5.23,
              currentPrice: 120.5,
              position: 'leader',
              competitiveAdvantage: '全球800G光模块龙头',
            },
            {
              symbol: '300502',
              name: '新易盛',
              marketCap: 800,
              changePercent: 4.12,
              currentPrice: 85.6,
              position: 'challenger',
              competitiveAdvantage: '高速光模块领先',
            },
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
            {
              symbol: '000063',
              name: '中兴通讯',
              marketCap: 1500,
              changePercent: 1.85,
              currentPrice: 32.5,
              position: 'leader',
              competitiveAdvantage: '全球通信设备龙头',
            },
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
            {
              symbol: '000977',
              name: '浪潮信息',
              marketCap: 800,
              changePercent: 3.25,
              currentPrice: 45.8,
              position: 'leader',
              competitiveAdvantage: 'AI服务器龙头',
            },
            {
              symbol: '603019',
              name: '中科曙光',
              marketCap: 600,
              changePercent: 2.78,
              currentPrice: 52.3,
              position: 'challenger',
              competitiveAdvantage: '国产算力龙头',
            },
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
            {
              symbol: '603881',
              name: '数据港',
              marketCap: 200,
              changePercent: 4.56,
              currentPrice: 35.2,
              position: 'leader',
              competitiveAdvantage: '第三方IDC龙头',
            },
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
            {
              symbol: '688111',
              name: '金山办公',
              marketCap: 1200,
              changePercent: 2.35,
              currentPrice: 320.5,
              position: 'leader',
              competitiveAdvantage: 'AI办公龙头',
            },
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
    riskFactors: [
      'AI算力需求不及预期',
      '技术路线变化',
      '产能过剩风险',
      '地缘政治影响',
    ],
    keyInsights: [
      '光模块是产业链弹性最大的环节',
      '800G/1.6T升级带来持续增长',
      '国产替代加速，关注国内龙头',
      '数据中心能耗问题可能制约发展',
    ],
    generatedAt: '2026-06-15T10:00:00Z',
  },
};

/** 热门产业链列表 */
export const HOT_CHAINS: IndustryChainSummary[] = [
  {
    id: 'ai-computing',
    name: 'AI算力产业链',
    description: '从芯片到应用的AI算力全链条',
    hotLevel: 95,
    segmentCount: 8,
    companyCount: 25,
    relatedConcepts: ['ChatGPT', '大模型', '算力'],
    updatedAt: '2026-06-15',
  },
  {
    id: 'new-energy-vehicle',
    name: '新能源汽车产业链',
    description: '从电池到整车的新能源汽车全链条',
    hotLevel: 85,
    segmentCount: 10,
    companyCount: 50,
    relatedConcepts: ['电动车', '锂电池', '充电桩'],
    updatedAt: '2026-06-15',
  },
  {
    id: 'semiconductor',
    name: '半导体产业链',
    description: '从设计到封测的半导体全链条',
    hotLevel: 90,
    segmentCount: 12,
    companyCount: 80,
    relatedConcepts: ['芯片', '光刻机', '国产替代'],
    updatedAt: '2026-06-15',
  },
  {
    id: 'photovoltaic',
    name: '光伏产业链',
    description: '从硅料到电站的光伏全链条',
    hotLevel: 75,
    segmentCount: 8,
    companyCount: 40,
    relatedConcepts: ['太阳能', '碳中和', '新能源'],
    updatedAt: '2026-06-15',
  },
  {
    id: 'ai-robot',
    name: 'AI机器人产业链',
    description: '从核心零部件到整机的AI机器人全链条',
    hotLevel: 80,
    segmentCount: 9,
    companyCount: 35,
    relatedConcepts: ['人形机器人', '减速器', '传感器'],
    updatedAt: '2026-06-15',
  },
];
