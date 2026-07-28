/**
 * 路由路径常量 — 独立模块，无副作用依赖。
 *
 * 此文件从 routes/index.tsx 拆出，用于打破循环依赖：
 *   routes/index.tsx → AppLayout → NavigationMenu → routes/index.tsx (ROUTE_PATHS)
 *
 * 所有纯常量 / 类型 / 工具函数集中在此，任何组件均可安全在模块顶层引用。
 */

// 路由路径常量
export const ROUTE_PATHS = {
  HOME: '/',
  // 核心循环
  MARKET: '/market',
  SCREENER: '/screener',
  WATCHLIST: '/watchlist',
  REVIEW: '/review',
  // 穿透
  STOCKS: '/stocks',
  STOCK_DETAIL: '/stocks/:symbol',
  FINANCIALS: '/financials/:symbol',
  BACKTEST: '/backtest',
  STRATEGIES: '/strategies',
  INDUSTRY_MAP: '/industry-map',
  // Sprint 1 激活页
  COMPARE: '/compare',
  LOCKUP_CALENDAR: '/lockup-calendar',
  TOP_TRADERS: '/top-traders',
  MARGIN_TRADING: '/margin-trading',
  PORTFOLIO: '/portfolio',
  // Sprint 2 整合页
  MACRO: '/macro',
  EVENT_CALENDAR: '/event-calendar',
  RISK_CENTER: '/risk-center',
  // Sprint 3 AI深化
  REPORT_CENTER: '/report-center',
  // Sprint 4 资金面与回测
  NORTH_BOUND: '/north-bound',
  FACTOR_LAB: '/factor-lab',
  // Sprint 5 多资产
  HK_CONNECT: '/hk-connect',
  ETF: '/etf',
  // Sprint 6 战略重构：D4 资金流 + P2 游戏化
  FUND_FLOW: '/fund-flow',
  JOURNEY: '/journey',
  // T8 补齐：既有可达路由缺失常量（第20轮，路径字符串与 routes/index.tsx 完全一致，不改动任何路由）
  INDEX_DETAIL: '/index/:symbol',
  SECTOR_DETAIL: '/sectors/:symbol',
  RADAR: '/radar',
  KNOWLEDGE: '/knowledge',
} as const;

// 路由配置类型
export type RoutePath = keyof typeof ROUTE_PATHS;

// 获取路由路径（支持参数替换，如 :symbol）
export const getRoutePath = (route: RoutePath, params?: Record<string, string>): string => {
  let path: string = ROUTE_PATHS[route];

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      path = path.replace(`:${key}`, value);
    });
  }

  return path;
};
