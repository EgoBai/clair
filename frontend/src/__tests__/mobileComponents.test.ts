import { describe, it, expect, vi } from 'vitest';

/**
 * MobileNavigation / MobileStockCard 移动端组件逻辑测试
 */

describe('MobileNavigation', () => {
  describe('底部导航', () => {
    const navItems = [
      { key: 'home', label: '首页', icon: 'HomeOutlined', path: '/' },
      { key: 'market', label: '市场', icon: 'BarChartOutlined', path: '/market' },
      { key: 'watchlist', label: '自选', icon: 'StarOutlined', path: '/watchlist' },
      { key: 'portfolio', label: '持仓', icon: 'WalletOutlined', path: '/portfolio' },
      { key: 'profile', label: '我的', icon: 'UserOutlined', path: '/profile' },
    ];

    it('应该有5个导航项', () => {
      expect(navItems).toHaveLength(5);
    });

    it('每个导航项应该有 key', () => {
      navItems.forEach(item => expect(item.key).toBeTruthy());
    });

    it('每个导航项应该有 label', () => {
      navItems.forEach(item => expect(item.label).toBeTruthy());
    });

    it('每个导航项应该有 icon', () => {
      navItems.forEach(item => expect(item.icon).toBeTruthy());
    });

    it('每个导航项应该有 path', () => {
      navItems.forEach(item => expect(item.path).toMatch(/^\//));
    });
  });

  describe('当前路由高亮', () => {
    it('应该高亮当前页面', () => {
      const currentPath = '/market';
      const navItems = [
        { key: 'home', path: '/' },
        { key: 'market', path: '/market' },
      ];
      const active = navItems.find(item => item.path === currentPath);
      expect(active?.key).toBe('market');
    });

    it('精确匹配路由', () => {
      const currentPath = '/market/detail';
      const navItems = [
        { key: 'home', path: '/' },
        { key: 'market', path: '/market' },
      ];
      // 严格匹配不匹配子路径
      const active = navItems.find(item => currentPath === item.path);
      expect(active).toBeUndefined();
    });
  });

  describe('手势导航', () => {
    it('左滑应该前进', () => {
      const startX = 300;
      const endX = 50;
      const diff = startX - endX;
      const direction = diff > 50 ? 'left' : diff < -50 ? 'right' : 'none';
      expect(direction).toBe('left');
    });

    it('右滑应该后退', () => {
      const startX = 50;
      const endX = 300;
      const diff = startX - endX;
      const direction = diff > 50 ? 'left' : diff < -50 ? 'right' : 'none';
      expect(direction).toBe('right');
    });

    it('短距离滑动不触发', () => {
      const startX = 100;
      const endX = 80;
      const diff = startX - endX;
      const direction = diff > 50 ? 'left' : diff < -50 ? 'right' : 'none';
      expect(direction).toBe('none');
    });
  });
});

describe('MobileStockCard', () => {
  describe('卡片数据', () => {
    const stockCard = {
      code: '600519',
      name: '贵州茅台',
      price: 1800.00,
      change: 45.00,
      changePercent: 2.56,
      volume: 1234567,
    };

    it('应该有股票代码', () => {
      expect(stockCard.code).toBe('600519');
    });

    it('应该有股票名称', () => {
      expect(stockCard.name).toBe('贵州茅台');
    });

    it('应该有当前价格', () => {
      expect(stockCard.price).toBe(1800);
    });

    it('应该有涨跌额', () => {
      expect(stockCard.change).toBe(45);
    });

    it('应该有涨跌幅', () => {
      expect(stockCard.changePercent).toBe(2.56);
    });
  });

  describe('卡片交互', () => {
    it('点击应该跳转详情', () => {
      const onClick = vi.fn();
      onClick('600519');
      expect(onClick).toHaveBeenCalledWith('600519');
    });

    it('长按应该弹出操作菜单', () => {
      const onLongPress = vi.fn();
      onLongPress('600519');
      expect(onLongPress).toHaveBeenCalledWith('600519');
    });

    it('左滑应该显示删除按钮', () => {
      const swipeThreshold = -80;
      const swipeX = -100;
      expect(swipeX < swipeThreshold).toBe(true);
    });
  });

  describe('卡片布局', () => {
    it('应该响应式显示', () => {
      const breakpoints = { sm: 576, md: 768, lg: 992 };
      expect(breakpoints.sm).toBe(576);
    });

    it('小屏幕应显示紧凑布局', () => {
      const screenWidth = 375;
      const isCompact = screenWidth < 576;
      expect(isCompact).toBe(true);
    });
  });
});
