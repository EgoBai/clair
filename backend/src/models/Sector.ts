/**
 * 板块数据模型
 * 定义行业/概念板块的数据结构
 */

export interface Sector {
  id: number;
  code: string;             // 板块代码
  name: string;             // 板块名称
  type: SectorType;         // 板块类型
  parentId?: number;        // 父板块ID
  level: number;            // 层级 (1=一级行业, 2=二级行业, 3=三级行业)
  description?: string;
  stockCount: number;       // 成分股数量
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type SectorType = 
  | 'industry'    // 行业板块
  | 'concept'     // 概念板块
  | 'region'      // 地域板块
  | 'style';      // 风格板块

export interface SectorQuote {
  id: number;
  sectorId: number;
  tradeDate: Date;
  changePercent: number;    // 涨跌幅
  turnoverRate: number;     // 换手率
  volume: number;
  turnover: number;
  inflow: number;           // 资金流入
  outflow: number;          // 资金流出
  netInflow: number;        // 净流入
  risingCount: number;      // 上涨家数
  fallingCount: number;     // 下跌家数
  leadingStock?: string;    // 领涨股
  laggingStock?: string;    // 领跌股
  createdAt: Date;
}

export interface SectorStock {
  id: number;
  sectorId: number;
  stockId: number;
  stockSymbol: string;
  weight?: number;
  addedDate: Date;
  isActive: boolean;
}

export interface SectorHeatmap {
  sectorId: number;
  sectorName: string;
  changePercent: number;
  volume: number;
  turnover: number;
  netInflow: number;
  stockCount: number;
  risingRatio: number;      // 上涨比例
  children?: SectorHeatmap[];
}

export interface SectorRotation {
  date: Date;
  hotSectors: SectorPerformance[];    // 热门板块
  coldSectors: SectorPerformance[];   // 冷门板块
  consecutiveRising: SectorStreak[];  // 连续上涨板块
  consecutiveFalling: SectorStreak[]; // 连续下跌板块
}

export interface SectorPerformance {
  sectorId: number;
  sectorName: string;
  changePercent: number;
  turnover: number;
  netInflow: number;
  leadingStock: {
    symbol: string;
    name: string;
    changePercent: number;
  };
}

export interface SectorStreak {
  sectorId: number;
  sectorName: string;
  days: number;             // 连续天数
  totalChange: number;      // 累计涨跌幅
}

// 申万一级行业分类
export const SW_L1_INDUSTRIES = [
  '农林牧渔', '基础化工', '钢铁', '有色金属', '电子',
  '汽车', '家用电器', '食品饮料', '纺织服饰', '轻工制造',
  '医药生物', '公用事业', '交通运输', '房地产', '商贸零售',
  '社会服务', '银行', '非银金融', '综合', '建筑材料',
  '建筑装饰', '电力设备', '国防军工', '计算机', '传媒',
  '通信', '煤炭', '石油石化', '环保', '美容护理',
  '机械设备',
] as const;

// 热门概念板块
export const HOT_CONCEPTS = [
  // AI & 算力
  '人工智能', 'AI算力', 'AI应用', '大模型', '机器人',
  // 半导体 & 光通信
  '芯片', '半导体', '光模块', '光通信', 'CPO', '存储',
  // 新能源
  '新能源汽车', '光伏', '储能', '锂电', '风电',
  // 数字经济
  '数字经济', '信创', '数据要素', '网络安全',
  // 高端制造
  '军工', '航天', '卫星互联网', '低空经济', '工业母机',
  // 消费 & 医药
  '消费', '白酒', '医药', '创新药', '医疗器械',
  // 金融 & 地产
  '金融', '券商', '银行', '保险', '地产',
  // 基建 & 周期
  '基建', '建材', '钢铁', '煤炭', '有色',
  // 其他热门
  '汽车', '智能驾驶', '传媒', '游戏', '教育',
] as const;

// 验证函数
export function validateSectorCode(code: string): boolean {
  return /^[A-Z0-9]{2,10}$/.test(code);
}

export function getSectorTypeLabel(type: SectorType): string {
  const labels: Record<SectorType, string> = {
    industry: '行业板块',
    concept: '概念板块',
    region: '地域板块',
    style: '风格板块',
  };
  return labels[type] || type;
}

export function calculateSectorHeatmap(quotes: SectorQuote[]): SectorHeatmap[] {
  return quotes.map(q => ({
    sectorId: q.sectorId,
    sectorName: '',
    changePercent: q.changePercent,
    volume: q.volume,
    turnover: q.turnover,
    netInflow: q.netInflow,
    stockCount: 0,
    risingRatio: q.risingCount / (q.risingCount + q.fallingCount) || 0,
  }));
}
