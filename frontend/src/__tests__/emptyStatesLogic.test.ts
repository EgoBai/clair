import { describe, it, expect } from 'vitest';

/**
 * 空状态组件逻辑测试
 * EmptyStates / ErrorState / LoadingState 的配置逻辑
 */

type EmptyCategory =
  | 'search' | 'stocks' | 'watchlist' | 'alerts' | 'screener'
  | 'chart' | 'kline' | 'history' | 'backtest' | 'portfolio'
  | 'news' | 'screener_result' | 'social' | 'loading' | 'permission_denied'
  | 'error' | 'disconnected';

interface EmptyStateConfig {
  icon: string;
  title: string;
  description?: string;
  hasAction: boolean;
  actionText?: string;
  hasSecondaryAction: boolean;
}

const EMPTY_STATE_CONFIGS: Record<EmptyCategory, EmptyStateConfig> = {
  search: {
    icon: 'SearchOutlined',
    title: '搜索股票代码或名称',
    description: '输入股票代码、名称或拼音首字母快速搜索',
    hasAction: false,
    hasSecondaryAction: false,
  },
  stocks: {
    icon: 'StockOutlined',
    title: '暂无股票数据',
    description: '股票数据正在同步中，请稍后再试',
    hasAction: true,
    actionText: '刷新页面',
    hasSecondaryAction: false,
  },
  watchlist: {
    icon: 'StockOutlined',
    title: '自选股为空',
    description: '将感兴趣的股票添加到自选股，方便快速查看行情',
    hasAction: true,
    actionText: '浏览股票',
    hasSecondaryAction: false,
  },
  alerts: {
    icon: 'BellOutlined',
    title: '暂无预警规则',
    description: '设置价格、涨跌幅预警，第一时间获取市场异动通知',
    hasAction: false,
    hasSecondaryAction: false,
  },
  screener: {
    icon: 'FilterOutlined',
    title: '开始筛选',
    description: '设置筛选条件或选择预设模板，找到符合策略的投资标的',
    hasAction: false,
    hasSecondaryAction: false,
  },
  chart: {
    icon: 'BarChartOutlined',
    title: '暂无图表数据',
    description: '图表数据加载中或当前时间范围无数据',
    hasAction: false,
    hasSecondaryAction: false,
  },
  kline: {
    icon: 'BarChartOutlined',
    title: '暂无K线数据',
    description: '该股票暂无K线行情数据',
    hasAction: true,
    actionText: '数据同步',
    hasSecondaryAction: false,
  },
  history: {
    icon: 'FileSearchOutlined',
    title: '暂无历史记录',
    description: '你的操作历史将显示在这里',
    hasAction: false,
    hasSecondaryAction: false,
  },
  backtest: {
    icon: 'BarChartOutlined',
    title: '开始策略回测',
    description: '选择股票和策略参数，验证你的投资策略表现',
    hasAction: true,
    actionText: '选择策略',
    hasSecondaryAction: false,
  },
  portfolio: {
    icon: 'WalletOutlined',
    title: '投资组合为空',
    description: '添加持仓记录，跟踪你的投资收益',
    hasAction: true,
    actionText: '添加持仓',
    hasSecondaryAction: false,
  },
  news: {
    icon: 'ReadOutlined',
    title: '暂无新闻资讯',
    description: '当前筛选条件下没有找到相关资讯',
    hasAction: true,
    actionText: '刷新',
    hasSecondaryAction: false,
  },
  screener_result: {
    icon: 'FilterOutlined',
    title: '未找到匹配股票',
    description: '尝试放宽筛选条件，或使用预设策略模板',
    hasAction: false,
    hasSecondaryAction: false,
  },
  social: {
    icon: 'TeamOutlined',
    title: '暂无讨论内容',
    description: '成为第一个发表观点的人，分享你的市场分析',
    hasAction: true,
    actionText: '发表观点',
    hasSecondaryAction: false,
  },
  loading: {
    icon: 'SyncOutlined',
    title: '加载中',
    description: '数据正在加载，请稍候...',
    hasAction: false,
    hasSecondaryAction: false,
  },
  permission_denied: {
    icon: 'LockOutlined',
    title: '需要登录',
    description: '登录后即可使用该功能',
    hasAction: true,
    actionText: '立即登录',
    hasSecondaryAction: false,
  },
  error: {
    icon: 'WarningOutlined',
    title: '出了点问题',
    description: '请稍后再试，或联系技术支持',
    hasAction: true,
    actionText: '重试',
    hasSecondaryAction: false,
  },
  disconnected: {
    icon: 'DisconnectOutlined',
    title: '网络连接已断开',
    description: '请检查网络连接，确保设备已接入互联网',
    hasAction: true,
    actionText: '重新连接',
    hasSecondaryAction: false,
  },
};

function getEmptyStateConfig(category: EmptyCategory): EmptyStateConfig {
  return EMPTY_STATE_CONFIGS[category];
}

function getAllEmptyCategories(): EmptyCategory[] {
  return Object.keys(EMPTY_STATE_CONFIGS) as EmptyCategory[];
}

function getCategoriesWithActions(): EmptyCategory[] {
  return getAllEmptyCategories().filter(
    cat => EMPTY_STATE_CONFIGS[cat].hasAction
  );
}

function formatEmptyTitle(category: EmptyCategory, query?: string): string {
  if (category === 'search' && query) {
    return `未找到 "${query}" 的相关结果`;
  }
  return EMPTY_STATE_CONFIGS[category].title;
}

function formatEmptyDescription(category: EmptyCategory, query?: string): string {
  if (category === 'search' && query) {
    return '试试其他关键词，或检查拼写是否正确';
  }
  return EMPTY_STATE_CONFIGS[category].description ?? '';
}

function isValidEmptyCategory(cat: string): cat is EmptyCategory {
  return cat in EMPTY_STATE_CONFIGS;
}

describe('空状态组件逻辑', () => {
  describe('getEmptyStateConfig', () => {
    it('should return config for search', () => {
      const config = getEmptyStateConfig('search');
      expect(config.icon).toBe('SearchOutlined');
      expect(config.hasAction).toBe(false);
    });

    it('should return config for stocks', () => {
      const config = getEmptyStateConfig('stocks');
      expect(config.icon).toBe('StockOutlined');
      expect(config.actionText).toBe('刷新页面');
    });

    it('should return config for error with retry', () => {
      const config = getEmptyStateConfig('error');
      expect(config.actionText).toBe('重试');
      expect(config.hasAction).toBe(true);
    });

    it('should return config for disconnected', () => {
      const config = getEmptyStateConfig('disconnected');
      expect(config.title).toBe('网络连接已断开');
    });
  });

  describe('getAllEmptyCategories', () => {
    it('should return all categories', () => {
      const cats = getAllEmptyCategories();
      expect(cats).toHaveLength(17);
      expect(cats).toContain('search');
      expect(cats).toContain('error');
      expect(cats).toContain('permission_denied');
    });
  });

  describe('getCategoriesWithActions', () => {
    it('should only include categories with actions', () => {
      const cats = getCategoriesWithActions();
      expect(cats).toContain('stocks');
      expect(cats).toContain('error');
      expect(cats).toContain('disconnected');
      expect(cats).not.toContain('search');
      expect(cats).not.toContain('alerts');
    });
  });

  describe('formatEmptyTitle', () => {
    it('should return default title for search without query', () => {
      expect(formatEmptyTitle('search')).toBe('搜索股票代码或名称');
    });

    it('should return dynamic title for search with query', () => {
      expect(formatEmptyTitle('search', '茅台')).toBe('未找到 "茅台" 的相关结果');
    });

    it('should ignore query for non-search categories', () => {
      expect(formatEmptyTitle('stocks', 'anything')).toBe('暂无股票数据');
    });
  });

  describe('formatEmptyDescription', () => {
    it('should return default description', () => {
      expect(formatEmptyDescription('watchlist')).toBe(
        '将感兴趣的股票添加到自选股，方便快速查看行情'
      );
    });

    it('should return search hint with query', () => {
      expect(formatEmptyDescription('search', 'abc')).toBe(
        '试试其他关键词，或检查拼写是否正确'
      );
    });
  });

  describe('isValidEmptyCategory', () => {
    it('should validate known categories', () => {
      expect(isValidEmptyCategory('search')).toBe(true);
      expect(isValidEmptyCategory('error')).toBe(true);
      expect(isValidEmptyCategory('loading')).toBe(true);
    });

    it('should reject unknown categories', () => {
      expect(isValidEmptyCategory('unknown')).toBe(false);
      expect(isValidEmptyCategory('')).toBe(false);
    });
  });
});
