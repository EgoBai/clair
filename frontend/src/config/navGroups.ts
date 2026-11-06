/**
 * 导航分组配置 — 按研究工作流分组的侧栏两级结构树。
 *
 * 数据来源：design/research-first-reframe.md「研究工作台」五入口 IA。
 * - 路径全部引用 `src/routes/paths.ts` 的 ROUTE_PATHS 常量，不硬编码字符串。
 * - icon 使用 `@ant-design/icons` 的实名组件（React.ComponentType），不存字符串。
 * - 本文件为纯配置、无副作用，供 NavigationMenu / TabBar / pageIndex 消费。
 *
 * P1 收敛原则：只调整入口层级，不删除任何页面；26 个既有页面全部保留可达。
 * 「今日」保留市场与资金面入口（7 项），「工具」收纳量化与多资产工具（7 项），
 * 其余三组按研究动作划分，避免把行情页和 ETF 塞进「公司」研究入口。
 */

import type { ComponentType } from 'react';
import {
  DashboardOutlined,
  GlobalOutlined,
  NodeIndexOutlined,
  RadarChartOutlined,
  FundOutlined,
  CalendarOutlined,
  FilterOutlined,
  UnorderedListOutlined,
  DiffOutlined,
  FileSearchOutlined,
  TrophyOutlined,
  AlertOutlined,
  ArrowLeftOutlined,
  BankOutlined,
  LinkOutlined,
  PieChartOutlined,
  StarOutlined,
  WalletOutlined,
  SafetyCertificateOutlined,
  FileTextOutlined,
  HistoryOutlined,
  ProfileOutlined,
  ThunderboltOutlined,
  RocketOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { ROUTE_PATHS } from '../routes/paths';

// antd icon 组件类型（只约束我们实际使用的 className）
export type NavIcon = ComponentType<{ className?: string }>;

// 二级子项
export interface NavGroupItem {
  id: string;
  label: string;
  /** 已注册的路由路径常量（来自 ROUTE_PATHS） */
  path: string;
  icon: NavIcon;
  /** 高亮入口（如「投资笔记」）：主导航渲染为置顶强调样式 + 徽标 */
  featured?: boolean;
}

// 一级分组
export interface NavGroup {
  id: string;
  label: string;
  items: NavGroupItem[];
}

/**
 * 5 组研究工作台入口：今日 → 公司 → 产业 → 我的研究 → 工具。
 * 顺序即使用顺序：先看今日市场，再进公司/产业，最后沉淀到个人研究。
 * 详情级路由（:symbol）不进静态树。
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'today',
    label: '今日',
    items: [
      { id: 'home', label: '今日简报', path: ROUTE_PATHS.HOME, icon: DashboardOutlined },
      { id: 'event-calendar', label: '事件日历', path: ROUTE_PATHS.EVENT_CALENDAR, icon: CalendarOutlined },
      { id: 'top-traders', label: '龙虎榜', path: ROUTE_PATHS.TOP_TRADERS, icon: TrophyOutlined },
      { id: 'macro-hub', label: '宏观资金全景', path: ROUTE_PATHS.MACRO_HUB, icon: DashboardOutlined },
      { id: 'fund-flow', label: '资金流向', path: ROUTE_PATHS.FUND_FLOW, icon: FundOutlined },
      { id: 'north-bound', label: '北向资金', path: ROUTE_PATHS.NORTH_BOUND, icon: ArrowLeftOutlined },
      // 大宗交易 = 场外协议转让的成交/折溢价，属资金面口径，与「资金流向/北向资金」同组
      { id: 'block-trades', label: '大宗交易', path: ROUTE_PATHS.BLOCK_TRADES, icon: SwapOutlined },
    ],
  },
  {
    id: 'companies',
    label: '公司',
    items: [
      { id: 'stocks', label: '股票列表', path: ROUTE_PATHS.STOCKS, icon: UnorderedListOutlined },
      { id: 'screener', label: '策略选股', path: ROUTE_PATHS.SCREENER, icon: FilterOutlined },
      { id: 'compare', label: '同业对比', path: ROUTE_PATHS.COMPARE, icon: DiffOutlined },
      { id: 'report-center', label: '研报AI摘要', path: ROUTE_PATHS.REPORT_CENTER, icon: FileSearchOutlined },
      { id: 'lockup-calendar', label: '解禁日历', path: ROUTE_PATHS.LOCKUP_CALENDAR, icon: AlertOutlined },
    ],
  },
  {
    id: 'industry',
    label: '产业',
    items: [
      { id: 'industry-map', label: '产业地图', path: ROUTE_PATHS.INDUSTRY_MAP, icon: NodeIndexOutlined },
      { id: 'radar', label: '潜力雷达', path: ROUTE_PATHS.RADAR, icon: RadarChartOutlined },
    ],
  },
  {
    id: 'my-research',
    label: '我的研究',
    items: [
      // 投资笔记是「研究结论的沉淀」，置顶并打 featured 徽标，避免被折叠分组淹没。
      { id: 'knowledge', label: '投资笔记', path: ROUTE_PATHS.KNOWLEDGE, icon: FileTextOutlined, featured: true },
      { id: 'watchlist', label: '自选组合', path: ROUTE_PATHS.WATCHLIST, icon: StarOutlined },
      { id: 'portfolio', label: '投资组合', path: ROUTE_PATHS.PORTFOLIO, icon: WalletOutlined },
      // 组合风控归属「我的研究」：它回答的是「我的持仓风险」，不是宏观资金。
      { id: 'risk-center', label: '组合风控', path: ROUTE_PATHS.RISK_CENTER, icon: SafetyCertificateOutlined },
      { id: 'journey', label: '成长中心', path: ROUTE_PATHS.JOURNEY, icon: RocketOutlined },
    ],
  },
  {
    id: 'tools',
    label: '工具',
    items: [
      { id: 'backtest', label: '回测', path: ROUTE_PATHS.BACKTEST, icon: HistoryOutlined },
      { id: 'strategies', label: '策略模板', path: ROUTE_PATHS.STRATEGIES, icon: ProfileOutlined },
      { id: 'factor-lab', label: '多因子实验室', path: ROUTE_PATHS.FACTOR_LAB, icon: ThunderboltOutlined },
      { id: 'macro', label: '宏观仪表盘', path: ROUTE_PATHS.MACRO, icon: GlobalOutlined },
      { id: 'margin-trading', label: '融资融券', path: ROUTE_PATHS.MARGIN_TRADING, icon: BankOutlined },
      { id: 'hk-connect', label: '港股通', path: ROUTE_PATHS.HK_CONNECT, icon: LinkOutlined },
      // ETF 是标的筛选/溢折价工具，不是「公司」研究，归工具组。
      { id: 'etf', label: 'ETF中心', path: ROUTE_PATHS.ETF, icon: PieChartOutlined },
    ],
  },
];

export default NAV_GROUPS;
