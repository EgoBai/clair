/**
 * 页面跳转索引 — 轻量页面搜索源
 * 用于全局搜索（GlobalSearch）命中"页面"类型结果。
 *
 * 【D17 导航一致性 A 方案】本索引**派生自 navGroups**，navGroups 为导航唯一真源：
 * - label 直接取 navGroups 的 item.label，与桌面侧栏 / 移动 TabBar 完全一致，
 *   消除「侧栏叫 A、搜索叫 B」的同名异义。
 * - keywords 由 [label, id, 别名表] 组成，覆盖用户可能输入的别称。
 * - /market、/review 为重定向路由（非真实目的地），不进入 navGroups，故天然排除，
 *   消除「搜索命中重定向死链 / label 名不副实」。
 * 新增页面只需改 navGroups，搜索索引自动同步，无需双处维护。
 */

import { NAV_GROUPS } from './navGroups';

export interface PageEntry {
  keywords: string[];
  label: string;
  path: string;
}

/**
 * 搜索关键词别名表（按 nav item id 索引）。
 * 仅补充「用户可能输入的别称」；label 与 id 已自动进入 keywords，
 * 不可在此重复定义 label，避免 keywords 内部重复（测试断言）。
 */
const KEYWORD_ALIASES: Record<string, string[]> = {
  home: ['首页', 'home', '概况', '仪表盘', '市场'],
  macro: ['宏观', 'macro', '经济', 'gdp', '经济数据'],
  'industry-map': ['行业', 'industry', '行业地图', '板块', '产业链'],
  radar: ['雷达', 'radar', '探索', '发现', '潜力'],
  'fund-flow': ['资金流', 'fund-flow', '资金', '主力', '大单'],
  'event-calendar': ['事件', 'event', '日历', 'event-calendar', '财经日历'],
  screener: ['选股', 'screener', '筛选', '条件选股', '量化选股'],
  knowledge: ['笔记', 'knowledge', '投资笔记', '研究笔记', '备忘'],
  stocks: ['股票', 'stocks', '列表', '个股', 'A股', '全部股票'],
  compare: ['对比', 'compare', '比较', '同业对比', '个股对比'],
  'report-center': ['研报', 'report', '研报中心', 'AI研报', '券商研报'],
  'top-traders': ['龙虎榜', 'top-traders', '席位', '游资', '敢死队'],
  'lockup-calendar': ['解禁', 'lockup', '解禁日历', '限售', '减持'],
  'north-bound': ['北向', 'north', '北向资金', '外资', '沪深港通'],
  'margin-trading': ['融资', 'margin', '融券', '两融', '信用交易'],
  'hk-connect': ['港股', 'hk', '港股通', '沪深港', '恒生'],
  etf: ['etf', '基金', '交易型', '指数基金'],
  watchlist: ['自选', 'watchlist', '关注', '我的股票', '自选股', '复盘'],
  portfolio: ['组合', 'portfolio', '投资组合', '持仓', '资产'],
  'risk-center': ['风险', 'risk', '风险中心', '风控', '组合风险'],
  backtest: ['回测', 'backtest', '策略回测', '历史回测'],
  strategies: ['策略', 'strategy', 'strategies', '策略中心', '模板'],
  'factor-lab': ['因子', 'factor', '因子实验室', '多因子', '量化'],
  journey: ['成长', 'journey', '成长中心', '学习', '进阶'],
};

/** 去重（忽略大小写，保留首次出现的原始大小写），避免 keywords 内部重复 */
function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * PAGE_INDEX 由 navGroups 派生（D17 A 方案）。
 * 每条 nav 项 → 一条搜索条目；顺序与 navGroups 一致。
 */
export const PAGE_INDEX: PageEntry[] = NAV_GROUPS.flatMap((group) =>
  group.items.map((item) => ({
    label: item.label,
    path: item.path,
    keywords: dedupe([item.label, item.id, ...(KEYWORD_ALIASES[item.id] ?? [])]),
  })),
);

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
