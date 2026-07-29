/**
 * 页面跳转索引 — 轻量页面搜索源
 * 用于全局搜索（GlobalSearch）命中"页面"类型结果。
 * 路径统一引用 ROUTE_PATHS 常量，避免硬编码。
 */

import { ROUTE_PATHS } from '../routes/paths';

export interface PageEntry {
  keywords: string[];
  label: string;
  path: string;
}

/** 主要页面跳转索引（24 项） */
export const PAGE_INDEX: PageEntry[] = [
  { keywords: ['首页', 'home', '概况', '仪表盘'], label: '首页', path: ROUTE_PATHS.HOME },
  { keywords: ['行情', 'market', '大盘', '市场'], label: '行情总览', path: ROUTE_PATHS.MARKET },
  { keywords: ['选股', 'screener', '筛选', '条件选股'], label: '条件选股', path: ROUTE_PATHS.SCREENER },
  { keywords: ['自选', 'watchlist', '关注', '我的股票'], label: '自选股', path: ROUTE_PATHS.WATCHLIST },
  { keywords: ['复盘', 'review', '总结', '回顾'], label: '复盘中心', path: ROUTE_PATHS.REVIEW },
  { keywords: ['股票', 'stocks', '列表', '个股'], label: '股票列表', path: ROUTE_PATHS.STOCKS },
  { keywords: ['回测', 'backtest', '策略回测'], label: '回测', path: ROUTE_PATHS.BACKTEST },
  { keywords: ['策略', 'strategy', 'strategies'], label: '策略中心', path: ROUTE_PATHS.STRATEGIES },
  { keywords: ['行业', 'industry', '行业地图', '板块'], label: '行业地图', path: ROUTE_PATHS.INDUSTRY_MAP },
  { keywords: ['对比', 'compare', '比较'], label: '个股对比', path: ROUTE_PATHS.COMPARE },
  { keywords: ['解禁', 'lockup', '解禁日历', '限售'], label: '解禁日历', path: ROUTE_PATHS.LOCKUP_CALENDAR },
  { keywords: ['龙虎榜', 'top-traders', '席位', '游资'], label: '龙虎榜', path: ROUTE_PATHS.TOP_TRADERS },
  { keywords: ['融资', 'margin', '融券', '两融'], label: '融资融券', path: ROUTE_PATHS.MARGIN_TRADING },
  { keywords: ['组合', 'portfolio', '投资组合', '持仓'], label: '投资组合', path: ROUTE_PATHS.PORTFOLIO },
  { keywords: ['宏观', 'macro', '经济', 'gdp'], label: '宏观经济', path: ROUTE_PATHS.MACRO },
  { keywords: ['事件', 'event', '日历', 'event-calendar'], label: '事件日历', path: ROUTE_PATHS.EVENT_CALENDAR },
  { keywords: ['风险', 'risk', '风险中心'], label: '风险中心', path: ROUTE_PATHS.RISK_CENTER },
  { keywords: ['研报', 'report', '研报中心'], label: '研报中心', path: ROUTE_PATHS.REPORT_CENTER },
  { keywords: ['北向', 'north', '北向资金', '外资'], label: '北向资金', path: ROUTE_PATHS.NORTH_BOUND },
  { keywords: ['因子', 'factor', '因子实验室'], label: '因子实验室', path: ROUTE_PATHS.FACTOR_LAB },
  { keywords: ['港股', 'hk', '港股通', '沪深港'], label: '港股通', path: ROUTE_PATHS.HK_CONNECT },
  { keywords: ['etf', '基金', '交易型'], label: 'ETF', path: ROUTE_PATHS.ETF },
  { keywords: ['资金流', 'fund-flow', '资金', '主力'], label: '资金流', path: ROUTE_PATHS.FUND_FLOW },
  { keywords: ['雷达', 'radar', '探索', '发现'], label: '探索雷达', path: ROUTE_PATHS.RADAR },
];

/**
 * 简单包含匹配页面索引。
 * label 或任一 keyword 命中即返回，最多 limit 条（默认 3）。
 */
export function searchPages(q: string, limit = 3): PageEntry[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  return PAGE_INDEX.filter(
    (p) =>
      p.label.toLowerCase().includes(query) ||
      p.keywords.some((k) => k.toLowerCase().includes(query)),
  ).slice(0, limit);
}
