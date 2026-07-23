/**
 * 演示数据模块 — demoData.ts
 *
 * 用途：当后端 API 不可达或返回空数据时，为新用户提供演示数据降级，
 *      避免首屏全空状态。所有数据为静态构造，不发起网络请求。
 *
 * 集成方式：
 *   import { DEMO_STOCKS, DEMO_MARKET_SUMMARY, isDemoMode } from '@/utils/demoData';
 *   if (isDemoMode()) { return DEMO_STOCKS; }
 *
 * 数据更新策略：演示数据使用固定时间戳，标记 _isDemo: true，
 *              消费方可据此显示"演示数据"徽标。
 */

import type {
  StockWithQuote,
  MarketSummary,
  IndustryPerformance,
  DailyQuote,
} from '../../../shared/types';

// ==================== 演示数据专用类型 ====================
// 注：这些类型用于演示数据降级，结构上与后端 WatchlistItem 等兼容，
//     但包含额外的 groupId / alertEnabled 等前端展示字段。

export interface DemoWatchlistItem {
  id: number;
  symbol: string;
  name: string;
  groupId: string;
  notes: string;
  addedAt: string;
  alertEnabled: boolean;
  stock: StockWithQuote;
}

export interface DemoWatchlistGroup {
  id: string;
  name: string;
  color: string;
  count: number;
}

export interface DemoReview {
  id: number;
  date: string;
  title: string;
  summary: string;
  trades: Array<{
    symbol: string;
    name: string;
    action: string;
    price: number;
    quantity: number;
    reason: string;
  }>;
  sentiment: 'cautious_optimistic' | 'neutral' | 'cautious' | 'optimistic';
  tags: string[];
}

export interface DemoNote {
  id: number;
  title: string;
  content: string;
  symbol?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DemoIndustryNode {
  id: string;
  name: string;
  level: number;
  value: number;
  change: number;
  parent?: string;
  children?: string[];
}

export interface DemoRadarStock {
  symbol: string;
  name: string;
  score: number;
  reasons: string[];
  sector: string;
  momentum: 'strong_up' | 'up' | 'stable' | 'down' | 'strong_down';
}

// ==================== 演示标记 ====================

/** 判断当前是否应使用演示数据（API 失败或空数据时） */
export function isDemoMode(): boolean {
  if (typeof window === 'undefined') return false;
  // 优先尊重用户偏好
  const pref = localStorage.getItem('clair:useDemoData');
  if (pref === 'true') return true;
  if (pref === 'false') return false;
  // 默认：仅在后端不可达时降级（由调用方判断）
  return false;
}

/** 强制启用演示数据 */
export function enableDemoMode(): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('clair:useDemoData', 'true');
  }
}

/** 禁用演示数据，恢复真实 API */
export function disableDemoMode(): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('clair:useDemoData', 'false');
  }
}

// ==================== 演示股票列表 ====================

const TODAY = new Date().toISOString().slice(0, 10);

function makeQuote(
  stockId: number,
  close: number,
  changePercent: number,
  opts: Partial<DailyQuote> = {},
): DailyQuote {
  const open = opts.openPrice ?? close / (1 + changePercent / 100);
  const high = opts.highPrice ?? Math.max(open, close) * 1.015;
  const low = opts.lowPrice ?? Math.min(open, close) * 0.985;
  const volume = opts.volume ?? Math.floor(50_000_000 + Math.random() * 200_000_000);
  return {
    id: stockId * 10000,
    stockId,
    tradeDate: TODAY,
    openPrice: +open.toFixed(2),
    closePrice: +close.toFixed(2),
    highPrice: +high.toFixed(2),
    lowPrice: +low.toFixed(2),
    volume,
    turnover: +(volume * close).toFixed(0),
    change: +(close - open).toFixed(2),
    changePercent: +changePercent.toFixed(2),
    amplitude: +(((high - low) / open) * 100).toFixed(2),
    turnoverRate: +((volume / 1_000_000_000) * 100).toFixed(2),
    peRatio: opts.peRatio ?? +(15 + Math.random() * 30).toFixed(2),
    pbRatio: opts.pbRatio ?? +(1.5 + Math.random() * 4).toFixed(2),
    marketCap: opts.marketCap ?? +(close * 5_000_000_000).toFixed(0),
    circulatingMarketCap: opts.circulatingMarketCap ?? +(close * 4_000_000_000).toFixed(0),
  };
}

export const DEMO_STOCKS: StockWithQuote[] = [
  {
    id: 1, symbol: '600519.SH', name: '贵州茅台', fullName: '贵州茅台酒股份有限公司',
    market: 'SH', industry: '食品饮料', subIndustry: '白酒', area: '贵州',
    listingDate: '2001-08-27', totalShares: 1.256e9, circulatingShares: 1.256e9,
    isActive: true,
    latestQuote: makeQuote(1, 1685.50, 1.23, { peRatio: 28.5, pbRatio: 9.8 }),
  },
  {
    id: 2, symbol: '000001.SZ', name: '平安银行', fullName: '平安银行股份有限公司',
    market: 'SZ', industry: '银行', subIndustry: '股份制银行', area: '广东',
    listingDate: '1991-04-03', totalShares: 1.941e9, circulatingShares: 1.941e9,
    isActive: true,
    latestQuote: makeQuote(2, 11.85, -0.42, { peRatio: 4.2, pbRatio: 0.55 }),
  },
  {
    id: 3, symbol: '000858.SZ', name: '五粮液', fullName: '宜宾五粮液股份有限公司',
    market: 'SZ', industry: '食品饮料', subIndustry: '白酒', area: '四川',
    listingDate: '1998-04-27', totalShares: 3.882e8, circulatingShares: 3.882e8,
    isActive: true,
    latestQuote: makeQuote(3, 156.20, 2.15, { peRatio: 21.3, pbRatio: 5.6 }),
  },
  {
    id: 4, symbol: '300750.SZ', name: '宁德时代', fullName: '宁德时代新能源科技股份有限公司',
    market: 'SZ', industry: '电力设备', subIndustry: '电池', area: '福建',
    listingDate: '2018-06-11', totalShares: 4.399e8, circulatingShares: 4.399e8,
    isActive: true,
    latestQuote: makeQuote(4, 195.80, 3.45, { peRatio: 18.7, pbRatio: 3.2 }),
  },
  {
    id: 5, symbol: '601318.SH', name: '中国平安', fullName: '中国平安保险(集团)股份有限公司',
    market: 'SH', industry: '非银金融', subIndustry: '保险', area: '广东',
    listingDate: '2007-03-01', totalShares: 1.828e9, circulatingShares: 1.828e9,
    isActive: true,
    latestQuote: makeQuote(5, 48.65, 0.85, { peRatio: 8.9, pbRatio: 1.05 }),
  },
  {
    id: 6, symbol: '600036.SH', name: '招商银行', fullName: '招商银行股份有限公司',
    market: 'SH', industry: '银行', subIndustry: '股份制银行', area: '广东',
    listingDate: '2002-04-09', totalShares: 2.522e9, circulatingShares: 2.062e9,
    isActive: true,
    latestQuote: makeQuote(6, 35.42, -0.18, { peRatio: 6.5, pbRatio: 1.15 }),
  },
  {
    id: 7, symbol: '002594.SZ', name: '比亚迪', fullName: '比亚迪股份有限公司',
    market: 'SZ', industry: '汽车', subIndustry: '新能源汽车', area: '广东',
    listingDate: '2011-06-30', totalShares: 2.909e8, circulatingShares: 2.909e8,
    isActive: true,
    latestQuote: makeQuote(7, 245.30, 4.12, { peRatio: 22.5, pbRatio: 4.1 }),
  },
  {
    id: 8, symbol: '600276.SH', name: '恒瑞医药', fullName: '江苏恒瑞医药股份有限公司',
    market: 'SH', industry: '医药生物', subIndustry: '化学制药', area: '江苏',
    listingDate: '2000-10-18', totalShares: 6.379e8, circulatingShares: 6.379e8,
    isActive: true,
    latestQuote: makeQuote(8, 47.85, 1.68, { peRatio: 45.2, pbRatio: 5.8 }),
  },
  {
    id: 9, symbol: '601012.SH', name: '隆基绿能', fullName: '隆基绿能科技股份有限公司',
    market: 'SH', industry: '电力设备', subIndustry: '光伏', area: '陕西',
    listingDate: '2012-04-11', totalShares: 7.565e8, circulatingShares: 7.565e8,
    isActive: true,
    latestQuote: makeQuote(9, 22.18, -1.85, { peRatio: 12.3, pbRatio: 2.1 }),
  },
  {
    id: 10, symbol: '002415.SZ', name: '海康威视', fullName: '杭州海康威视数字技术股份有限公司',
    market: 'SZ', industry: '电子', subIndustry: '安防', area: '浙江',
    listingDate: '2010-05-28', totalShares: 9.227e8, circulatingShares: 9.227e8,
    isActive: true,
    latestQuote: makeQuote(10, 32.56, 0.95, { peRatio: 25.6, pbRatio: 4.5 }),
  },
];

// ==================== 演示板块表现 ====================

export const DEMO_INDUSTRIES: IndustryPerformance[] = [
  { industry: '电力设备', avgChangePercent: 2.85, totalMarketCap: 8.5e12, stockCount: 215, totalVolume: 5.6e8, totalTurnover: 1.2e10 },
  { industry: '食品饮料', avgChangePercent: 1.92, totalMarketCap: 6.8e12, stockCount: 132, totalVolume: 3.2e8, totalTurnover: 8.5e9 },
  { industry: '医药生物', avgChangePercent: 1.45, totalMarketCap: 7.2e12, stockCount: 421, totalVolume: 4.8e8, totalTurnover: 9.8e9 },
  { industry: '电子', avgChangePercent: 0.85, totalMarketCap: 9.5e12, stockCount: 385, totalVolume: 6.1e8, totalTurnover: 1.5e10 },
  { industry: '汽车', avgChangePercent: 0.62, totalMarketCap: 5.3e12, stockCount: 198, totalVolume: 3.5e8, totalTurnover: 7.2e9 },
  { industry: '非银金融', avgChangePercent: 0.35, totalMarketCap: 7.8e12, stockCount: 88, totalVolume: 2.1e8, totalTurnover: 6.5e9 },
  { industry: '银行', avgChangePercent: -0.18, totalMarketCap: 1.2e13, stockCount: 42, totalVolume: 1.8e8, totalTurnover: 4.2e9 },
  { industry: '计算机', avgChangePercent: -0.55, totalMarketCap: 4.6e12, stockCount: 312, totalVolume: 3.9e8, totalTurnover: 8.8e9 },
  { industry: '传媒', avgChangePercent: -1.12, totalMarketCap: 2.1e12, stockCount: 145, totalVolume: 2.5e8, totalTurnover: 3.5e9 },
  { industry: '房地产', avgChangePercent: -1.85, totalMarketCap: 1.8e12, stockCount: 128, totalVolume: 3.2e8, totalTurnover: 4.8e9 },
];

// ==================== 演示市场总览 ====================

export const DEMO_MARKET_SUMMARY: MarketSummary = {
  date: TODAY,
  totalStocks: 5541,
  totalMarketCap: 8.85e13,
  totalVolume: 8.5e9,
  totalTurnover: 1.05e12,
  risingStocks: 3994,
  fallingStocks: 1139,
  unchangedStocks: 408,
  rising: 3994,
  falling: 1139,
  flat: 408,
  limitUp: 150,
  limitDown: 5,
  totalAmount: 1.05e12,
  northboundFlow: 8.5e9,
  avgChange: 0.85,
  industryPerformance: DEMO_INDUSTRIES,
  indices: [
    { symbol: '000001.SH', name: '上证指数', close_price: 3258.32, change_percent: 0.85 },
    { symbol: '399001.SZ', name: '深证成指', close_price: 10256.45, change_percent: 1.12 },
    { symbol: '399006.SZ', name: '创业板指', close_price: 2056.78, change_percent: 1.45 },
    { symbol: '000688.SH', name: '科创50',  close_price: 985.32,  change_percent: 0.65 },
  ],
};

// ==================== 演示自选股 ====================

function pickStock(symbol: string): StockWithQuote {
  const s = DEMO_STOCKS.find(x => x.symbol === symbol);
  if (!s) throw new Error(`unknown symbol ${symbol}`);
  return s;
}

export const DEMO_WATCHLIST: DemoWatchlistItem[] = [
  { id: 1, symbol: '600519.SH', name: '贵州茅台', groupId: 'core',    notes: '高端白酒龙头', addedAt: '2024-12-01T08:00:00Z', alertEnabled: true,  stock: pickStock('600519.SH') },
  { id: 2, symbol: '300750.SZ', name: '宁德时代', groupId: 'core',    notes: '动力电池龙头', addedAt: '2024-12-05T10:30:00Z', alertEnabled: true,  stock: pickStock('300750.SZ') },
  { id: 3, symbol: '002594.SZ', name: '比亚迪',   groupId: 'core',    notes: '新能源汽车',   addedAt: '2025-01-10T14:20:00Z', alertEnabled: false, stock: pickStock('002594.SZ') },
  { id: 4, symbol: '601318.SH', name: '中国平安', groupId: 'finance', notes: '保险龙头',     addedAt: '2025-01-15T09:15:00Z', alertEnabled: true,  stock: pickStock('601318.SH') },
  { id: 5, symbol: '600036.SH', name: '招商银行', groupId: 'finance', notes: '零售银行',     addedAt: '2025-02-01T11:00:00Z', alertEnabled: false, stock: pickStock('600036.SH') },
  { id: 6, symbol: '600276.SH', name: '恒瑞医药', groupId: 'pharma',  notes: '创新药',       addedAt: '2025-02-20T13:45:00Z', alertEnabled: true,  stock: pickStock('600276.SH') },
];

// ==================== 演示自选股分组 ====================

export const DEMO_WATCHLIST_GROUPS: DemoWatchlistGroup[] = [
  { id: 'core',    name: '核心持仓', color: '#f59e0b', count: 3 },
  { id: 'finance', name: '金融配置', color: '#3b82f6', count: 2 },
  { id: 'pharma',  name: '医药观察', color: '#10b981', count: 1 },
];

// ==================== 演示复盘记录 ====================

export const DEMO_REVIEWS: DemoReview[] = [
  {
    id: 1,
    date: TODAY,
    title: '震荡市中的结构性机会',
    summary: '三大指数分化，创业板领涨。新能源赛道资金回流，宁德时代、比亚迪领涨核心标的。银行板块承压，但招商银行基本面稳健，维持持有。',
    trades: [
      { symbol: '300750.SZ', name: '宁德时代', action: '加仓', price: 195.80, quantity: 100, reason: '突破前高，量价配合' },
      { symbol: '002594.SZ', name: '比亚迪',   action: '持有', price: 245.30, quantity: 0,   reason: '趋势完好，继续持有' },
    ],
    sentiment: 'cautious_optimistic' as const,
    tags: ['新能源', '结构性机会', '震荡市'],
  },
  {
    id: 2,
    date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    title: '高低切换，关注估值修复',
    summary: '市场风格切换明显，高位题材股回调，低估值蓝筹企稳。中国平安、招商银行具备安全边际。光伏板块隆基绿能超跌，关注反弹机会。',
    trades: [
      { symbol: '601318.SH', name: '中国平安', action: '建仓', price: 48.65, quantity: 200, reason: '估值低位，保费数据改善' },
    ],
    sentiment: 'neutral' as const,
    tags: ['估值修复', '风格切换', '蓝筹'],
  },
];

// ==================== 演示投资笔记 ====================

export const DEMO_NOTES: DemoNote[] = [
  {
    id: 1,
    title: '宁德时代 2025Q3 业绩跟踪',
    content: '动力电池出货量同比增长 35%，储能业务爆发式增长。毛利率环比改善 2.3pct，主要受益于碳酸锂价格下行。海外市场拓展顺利，欧洲工厂产能爬坡中。',
    symbol: '300750.SZ',
    tags: ['业绩跟踪', '新能源', '电池'],
    createdAt: '2025-07-15T10:30:00Z',
    updatedAt: '2025-07-15T10:30:00Z',
  },
  {
    id: 2,
    title: '白酒行业渠道库存调研',
    content: '茅台批价稳定在 1680-1700 元区间，五粮液批价 950-965 元。渠道库存整体健康，经销商打款积极性回升。中秋旺季备货已启动，关注动销数据。',
    symbol: '600519.SH',
    tags: ['行业调研', '白酒', '消费'],
    createdAt: '2025-07-10T15:20:00Z',
    updatedAt: '2025-07-12T09:15:00Z',
  },
  {
    id: 3,
    title: '招商银行 2025 半年报点评',
    content: '营收增速转正，净息差企稳。不良率 0.95%，环比下降 2bp。零售客户数突破 2 亿，AUM 同比增长 12%。财富管理中收占比提升至 35%。',
    symbol: '600036.SH',
    tags: ['财报点评', '银行', '零售'],
    createdAt: '2025-07-05T14:00:00Z',
    updatedAt: '2025-07-05T14:00:00Z',
  },
];

// ==================== 演示产业地图节点 ====================

export const DEMO_INDUSTRY_NODES: DemoIndustryNode[] = [
  { id: 'battery',   name: '动力电池',   level: 0, value: 8.5e12, change: 2.85, children: ['cathode', 'anode', 'electrolyte', 'separator'] },
  { id: 'cathode',   name: '正极材料',   level: 1, value: 1.2e12, change: 3.25, parent: 'battery' },
  { id: 'anode',     name: '负极材料',   level: 1, value: 8.5e11, change: 2.10, parent: 'battery' },
  { id: 'electrolyte', name: '电解液',   level: 1, value: 6.2e11, change: 1.85, parent: 'battery' },
  { id: 'separator', name: '隔膜',       level: 1, value: 4.8e11, change: 2.45, parent: 'battery' },
  { id: 'vehicle',   name: '新能源汽车', level: 0, value: 1.05e13, change: 4.12, children: ['bev', 'phev', 'parts'] },
  { id: 'bev',       name: '纯电动',     level: 1, value: 6.8e12, change: 5.20, parent: 'vehicle' },
  { id: 'phev',      name: '插电混动',   level: 1, value: 3.2e12, change: 2.85, parent: 'vehicle' },
  { id: 'parts',     name: '汽车零部件', level: 1, value: 5.5e11, change: 1.25, parent: 'vehicle' },
  { id: 'pv',        name: '光伏',       level: 0, value: 4.2e12, change: -1.85, children: ['silicon', 'wafer', 'cell', 'module'] },
  { id: 'silicon',   name: '硅料',       level: 1, value: 8.5e11, change: -2.85, parent: 'pv' },
  { id: 'wafer',     name: '硅片',       level: 1, value: 1.1e12, change: -2.10, parent: 'pv' },
  { id: 'cell',      name: '电池片',     level: 1, value: 1.3e12, change: -1.55, parent: 'pv' },
  { id: 'module',    name: '组件',       level: 1, value: 9.5e11, change: -1.20, parent: 'pv' },
];

// ==================== 演示潜力雷达 ====================

export const DEMO_RADAR_STOCKS: DemoRadarStock[] = [
  { symbol: '300750.SZ', name: '宁德时代', score: 92, reasons: ['量价齐升', '北向加仓', '机构上调'], sector: '电力设备', momentum: 'strong_up' },
  { symbol: '002594.SZ', name: '比亚迪',   score: 88, reasons: ['销量超预期', '海外扩张', '技术突破'], sector: '汽车', momentum: 'up' },
  { symbol: '600519.SH', name: '贵州茅台', score: 85, reasons: ['批价企稳', '旺季临近', '分红提升'], sector: '食品饮料', momentum: 'stable' },
  { symbol: '000858.SZ', name: '五粮液',   score: 78, reasons: ['动销改善', '估值修复', '渠道优化'], sector: '食品饮料', momentum: 'up' },
  { symbol: '601318.SH', name: '中国平安', score: 75, reasons: ['保费改善', '低估值', '回购加力'], sector: '非银金融', momentum: 'stable' },
];

// ==================== 演示数据徽标组件辅助 ====================

/** 判断数据对象是否为演示数据 */
export function isDemoData(data: unknown): boolean {
  if (data == null || typeof data !== 'object') return false;
  return (data as { _isDemo?: boolean })._isDemo === true;
}

/** 标记数据为演示数据 */
export function markAsDemo<T>(data: T): T & { _isDemo: true } {
  return { ...data, _isDemo: true } as T & { _isDemo: true };
}

// ==================== 统一导出 ====================

export const DEMO_DATA = {
  stocks: DEMO_STOCKS,
  marketSummary: DEMO_MARKET_SUMMARY,
  industries: DEMO_INDUSTRIES,
  watchlist: DEMO_WATCHLIST,
  watchlistGroups: DEMO_WATCHLIST_GROUPS,
  reviews: DEMO_REVIEWS,
  notes: DEMO_NOTES,
  industryNodes: DEMO_INDUSTRY_NODES,
  radarStocks: DEMO_RADAR_STOCKS,
} as const;

export default DEMO_DATA;
