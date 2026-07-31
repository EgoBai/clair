/**
 * 导航分组配置 — 按投研工作流分组的侧栏两级结构树。
 *
 * 数据来源：design/navigation-ia-proposal.md §2.1（推荐案 A）。
 * - 路径全部引用 `src/routes/paths.ts` 的 ROUTE_PATHS 常量，不硬编码字符串。
 * - icon 使用 `@ant-design/icons` 的实名组件（React.ComponentType），不存字符串。
 *
 * 本文件为纯配置、无副作用，供 NavigationMenu 等导航壳层消费。
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
}

// 一级分组
export interface NavGroup {
  id: string;
  label: string;
  items: NavGroupItem[];
}

/**
 * 6 组按投研工作流分组（探索 → 求证 → 决策/持有 → 进阶 → 成长）。
 * 顺序与 §2.1 完全一致；详情级路由（:symbol）不进静态树。
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'market-overview',
    label: '市场总览',
    items: [
      { id: 'home', label: '市场洞察', path: ROUTE_PATHS.HOME, icon: DashboardOutlined },
      { id: 'macro', label: '宏观仪表盘', path: ROUTE_PATHS.MACRO, icon: GlobalOutlined },
      { id: 'industry-map', label: '产业地图', path: ROUTE_PATHS.INDUSTRY_MAP, icon: NodeIndexOutlined },
      { id: 'radar', label: '潜力雷达', path: ROUTE_PATHS.RADAR, icon: RadarChartOutlined },
      { id: 'fund-flow', label: '资金流向', path: ROUTE_PATHS.FUND_FLOW, icon: FundOutlined },
      { id: 'event-calendar', label: '事件日历', path: ROUTE_PATHS.EVENT_CALENDAR, icon: CalendarOutlined },
    ],
  },
  {
    id: 'stock-research',
    label: '个股研究',
    items: [
      { id: 'screener', label: '策略选股', path: ROUTE_PATHS.SCREENER, icon: FilterOutlined },
      // 投资笔记原位于第 4 组「组合与风控」末位（第 20 个导航项，约 1050px 处），
      // 侧栏默认全展开共 24 项，该位置在常见视口下需滚动才可见，发现率极低。
      // 笔记是「研究结论的沉淀」，与选股/对比/研报同属研究工作流，
      // 故移至本组第 2 位；分组数量与其余顺序均不变，属最小侵入调整。
      { id: 'knowledge', label: '投资笔记', path: ROUTE_PATHS.KNOWLEDGE, icon: FileTextOutlined },
      { id: 'stocks', label: '股票列表', path: ROUTE_PATHS.STOCKS, icon: UnorderedListOutlined },
      { id: 'compare', label: '同业对比', path: ROUTE_PATHS.COMPARE, icon: DiffOutlined },
      { id: 'report-center', label: '研报AI摘要', path: ROUTE_PATHS.REPORT_CENTER, icon: FileSearchOutlined },
      { id: 'top-traders', label: '龙虎榜', path: ROUTE_PATHS.TOP_TRADERS, icon: TrophyOutlined },
      { id: 'lockup-calendar', label: '解禁日历', path: ROUTE_PATHS.LOCKUP_CALENDAR, icon: AlertOutlined },
    ],
  },
  {
    id: 'capital',
    label: '资金面',
    items: [
      { id: 'north-bound', label: '北向资金', path: ROUTE_PATHS.NORTH_BOUND, icon: ArrowLeftOutlined },
      { id: 'margin-trading', label: '融资融券', path: ROUTE_PATHS.MARGIN_TRADING, icon: BankOutlined },
      { id: 'hk-connect', label: '港股通', path: ROUTE_PATHS.HK_CONNECT, icon: LinkOutlined },
      { id: 'etf', label: 'ETF中心', path: ROUTE_PATHS.ETF, icon: PieChartOutlined },
    ],
  },
  {
    id: 'portfolio-risk',
    label: '组合与风控',
    items: [
      { id: 'watchlist', label: '自选组合', path: ROUTE_PATHS.WATCHLIST, icon: StarOutlined },
      { id: 'portfolio', label: '投资组合', path: ROUTE_PATHS.PORTFOLIO, icon: WalletOutlined },
      { id: 'risk-center', label: '组合风控', path: ROUTE_PATHS.RISK_CENTER, icon: SafetyCertificateOutlined },
    ],
  },
  {
    id: 'quant',
    label: '量化实验',
    items: [
      { id: 'backtest', label: '回测', path: ROUTE_PATHS.BACKTEST, icon: HistoryOutlined },
      { id: 'strategies', label: '策略模板', path: ROUTE_PATHS.STRATEGIES, icon: ProfileOutlined },
      { id: 'factor-lab', label: '多因子实验室', path: ROUTE_PATHS.FACTOR_LAB, icon: ThunderboltOutlined },
    ],
  },
  {
    id: 'growth',
    label: '成长旅程',
    items: [
      { id: 'journey', label: '成长中心', path: ROUTE_PATHS.JOURNEY, icon: RocketOutlined },
    ],
  },
];

export default NAV_GROUPS;
