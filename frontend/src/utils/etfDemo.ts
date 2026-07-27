/**
 * ETF 中心 — 确定性演示数据兜底
 *
 * 背景：项目后端 API 多缺失（技术债 T6），统一用「确定性 LCG 演示数据兜底」。
 * 沿用 northboundDemo.ts 的模式：固定基种子（20260726）+ LCG 线性同余，
 * 保证每次渲染数值稳定、可复现、绝不留空白页。
 *
 * 出参字段严格匹配 src/pages/ETFPage.tsx 的 ETFData interface，
 * 页面在无后端时直接消费本数据，并打「演示数据」Tag。
 */

/** 页面 ETFData 规范（与 ETFPage 保持一致） */
export interface ETFData {
  symbol: string;
  name: string;
  type: 'index' | 'sector' | 'qdii' | 'commodity' | 'bond' | 'theme';
  benchmark: string;
  nav: number;
  preNav: number;
  changePercent: number;
  premiumRate: number;
  totalAssets: number;
  trackingError: number;
  dividendYield: number;
  expenseRatio: number;
  volume: number;
  turnover: number;
  holdings: number;
}

const BASE_SEED = 20260726;

/** 线性同余发生器（LCG）：给定种子返回 [0,1) 的确定性序列 */
function createLCG(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

/** 将 [0,1) 映射到 [min,max] */
function mapRange(r: number, min: number, max: number): number {
  return min + r * (max - min);
}
const round2 = (x: number): number => Number(x.toFixed(2));

/** ETF 样本池（覆盖 index/sector/qdii/commodity/bond/theme 六类，共 22 只） */
const ETF_POOL: Array<{
  symbol: string;
  name: string;
  type: ETFData['type'];
  benchmark: string;
}> = [
  // 指数型
  { symbol: '510300', name: '沪深300ETF', type: 'index', benchmark: '沪深300指数' },
  { symbol: '588000', name: '科创50ETF', type: 'index', benchmark: '科创50指数' },
  { symbol: '510500', name: '中证500ETF', type: 'index', benchmark: '中证500指数' },
  { symbol: '159915', name: '创业板ETF', type: 'index', benchmark: '创业板指' },
  // 行业型
  { symbol: '512880', name: '证券ETF', type: 'sector', benchmark: '中证全指证券公司' },
  { symbol: '512480', name: '半导体ETF', type: 'sector', benchmark: '中证全指半导体' },
  { symbol: '512010', name: '医药ETF', type: 'sector', benchmark: '沪深300医药卫生' },
  { symbol: '512660', name: '军工ETF', type: 'sector', benchmark: '中证军工' },
  { symbol: '512800', name: '银行ETF', type: 'sector', benchmark: '中证银行' },
  // QDII
  { symbol: '513100', name: '纳指ETF', type: 'qdii', benchmark: '纳斯达克100' },
  { symbol: '513500', name: '标普500ETF', type: 'qdii', benchmark: '标普500' },
  { symbol: '159920', name: '恒生ETF', type: 'qdii', benchmark: '恒生指数' },
  // 商品型
  { symbol: '518880', name: '黄金ETF', type: 'commodity', benchmark: 'SGE黄金9999' },
  { symbol: '159980', name: '有色ETF', type: 'commodity', benchmark: '上期所有色金属' },
  // 债券型
  { symbol: '511260', name: '十年国债ETF', type: 'bond', benchmark: '上证10年国债' },
  { symbol: '511220', name: '城投债ETF', type: 'bond', benchmark: '中债城投债' },
  { symbol: '511360', name: '短融ETF', type: 'bond', benchmark: '中证短融' },
  // 主题型
  { symbol: '516160', name: '新能源ETF', type: 'theme', benchmark: '中证新能源' },
  { symbol: '515050', name: '5GETF', type: 'theme', benchmark: '中证5G通信' },
  { symbol: '159790', name: '碳中和ETF', type: 'theme', benchmark: '中证碳中和' },
  { symbol: '515980', name: '人工智能ETF', type: 'theme', benchmark: '中证人工智能' },
  { symbol: '159928', name: '消费ETF', type: 'theme', benchmark: '中证主要消费' },
];

/** 22 只 ETF 演示数据（LCG 确定性生成，字段匹配 ETFPage.ETFData） */
export const etfList: ETFData[] = (() => {
  const rng = createLCG(BASE_SEED);
  return ETF_POOL.map((p) => {
    const nav = round2(mapRange(rng(), 0.8, 4.5));
    const changePercent = round2(mapRange(rng(), -3.5, 3.5));
    const preNav = round2(nav / (1 + changePercent / 100));
    const premiumRate = round2(mapRange(rng(), -2.8, 2.8)); // 部分会超过 |1%| 触发套利检测
    const totalAssets = Math.round(mapRange(rng(), 2e9, 8e10));
    const trackingError = round2(mapRange(rng(), 0.05, 0.8));
    const dividendYield = round2(mapRange(rng(), 0, 3));
    const expenseRatio = round2(mapRange(rng(), 0.15, 0.6));
    const turnover = Math.round(mapRange(rng(), 3e8, 2e10));
    const volume = turnover; // 演示兜底：成交额口径，供引擎评分复用
    const holdings = Math.round(mapRange(rng(), 30, 90));
    return {
      ...p,
      nav,
      preNav,
      changePercent,
      premiumRate,
      totalAssets,
      trackingError,
      dividendYield,
      expenseRatio,
      volume,
      turnover,
      holdings,
    };
  });
})();
