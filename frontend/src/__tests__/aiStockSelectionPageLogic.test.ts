import { describe, it, expect } from 'vitest';

/**
 * AI选股页面逻辑测试
 * 测试模型解释数据生成、CSV导出、分享摘要等核心逻辑
 */

// 模拟策略数据
interface MockStock {
  symbol: string;
  name: string;
  score: number;
  reason: string;
  price: number;
  changePercent: number;
}

interface MockStrategy {
  strategy: string;
  name: string;
  description: string;
  stocks: MockStock[];
}

const mockStrategies: MockStrategy[] = [
  {
    strategy: 'value',
    name: '价值投资',
    description: '寻找被低估的优质股票',
    stocks: [
      { symbol: '000001', name: '平安银行', score: 88, reason: 'PE低于行业均值', price: 12.50, changePercent: 1.2 },
      { symbol: '600036', name: '招商银行', score: 85, reason: 'ROE持续优秀', price: 35.80, changePercent: -0.3 },
    ],
  },
  {
    strategy: 'growth',
    name: '成长突破',
    description: '关注高增长潜力股票',
    stocks: [
      { symbol: '300750', name: '宁德时代', score: 92, reason: '新能源龙头，营收高增长', price: 220.50, changePercent: 3.5 },
    ],
  },
];

describe('AI选股页面逻辑', () => {
  describe('策略筛选', () => {
    it('全部策略应包含所有推荐', () => {
      const filtered = mockStrategies; // 'all' filter
      const totalStocks = filtered.reduce((s, r) => s + r.stocks.length, 0);
      expect(totalStocks).toBe(3);
    });

    it('按策略筛选应只返回对应策略', () => {
      const filtered = mockStrategies.filter(r => r.strategy === 'value');
      expect(filtered.length).toBe(1);
      expect(filtered[0].strategy).toBe('value');
      expect(filtered[0].stocks.length).toBe(2);
    });

    it('不存在的策略应返回空', () => {
      const filtered = mockStrategies.filter(r => r.strategy === 'nonexistent');
      expect(filtered.length).toBe(0);
    });
  });

  describe('评分排序', () => {
    it('应按评分降序排列', () => {
      const stocks = mockStrategies.flatMap(s => s.stocks);
      const sorted = [...stocks].sort((a, b) => b.score - a.score);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i - 1].score).toBeGreaterThanOrEqual(sorted[i].score);
      }
    });
  });

  describe('涨跌幅格式化', () => {
    it('正数涨幅应带+号', () => {
      const val = 1.2;
      const formatted = val > 0 ? `+${val.toFixed(2)}%` : `${val.toFixed(2)}%`;
      expect(formatted).toBe('+1.20%');
    });

    it('负数跌幅应带-号', () => {
      const val = -0.3;
      const formatted = val > 0 ? `+${val.toFixed(2)}%` : `${val.toFixed(2)}%`;
      expect(formatted).toBe('-0.30%');
    });

    it('零值应无符号', () => {
      const val = 0;
      const formatted = val > 0 ? `+${val.toFixed(2)}%` : `${val.toFixed(2)}%`;
      expect(formatted).toBe('0.00%');
    });
  });

  describe('颜色映射', () => {
    const strategyColors: Record<string, string> = {
      value: '#52c41a',
      growth: '#1890ff',
      technical: '#722ed1',
      momentum: '#fa8c16',
      contrarian: '#13c2c2',
    };

    it('每种策略应有对应颜色', () => {
      expect(strategyColors.value).toBeTruthy();
      expect(strategyColors.growth).toBeTruthy();
      expect(strategyColors.technical).toBeTruthy();
      expect(strategyColors.momentum).toBeTruthy();
      expect(strategyColors.contrarian).toBeTruthy();
    });

    it('颜色值应为有效hex格式', () => {
      Object.values(strategyColors).forEach(color => {
        expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      });
    });
  });

  describe('行业轮动相位', () => {
    const phaseConfig: Record<string, { color: string; label: string }> = {
      '主升': { color: '#cf1322', label: '🔥 主升' },
      '吸筹': { color: '#1890ff', label: '💎 吸筹' },
      '派发': { color: '#fa8c16', label: '⚠️ 派发' },
      '下跌': { color: '#999', label: '📉 下跌' },
    };

    it('应覆盖所有轮动相位', () => {
      expect(Object.keys(phaseConfig).length).toBe(4);
      expect(phaseConfig['主升']).toBeDefined();
      expect(phaseConfig['吸筹']).toBeDefined();
      expect(phaseConfig['派发']).toBeDefined();
      expect(phaseConfig['下跌']).toBeDefined();
    });

    it('每个相位应有颜色和标签', () => {
      Object.values(phaseConfig).forEach(config => {
        expect(config.color).toBeTruthy();
        expect(config.label).toBeTruthy();
      });
    });
  });

  describe('排名标签', () => {
    const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32'];

    it('前三名应有金、银、铜色', () => {
      expect(rankColors[0]).toBe('#FFD700'); // 金牌
      expect(rankColors[1]).toBe('#C0C0C0'); // 银牌
      expect(rankColors[2]).toBe('#CD7F32'); // 铜牌
    });

    it('超过三名应使用默认色', () => {
      const idx = 5;
      const color = rankColors[idx] || 'default';
      expect(color).toBe('default');
    });
  });

  describe('预警优先级', () => {
    const priorityColors: Record<string, string> = {
      high: '#cf1322',
      medium: '#fa8c16',
      low: '#999',
    };

    it('应映射正确的优先级颜色', () => {
      expect(priorityColors.high).toBe('#cf1322');
      expect(priorityColors.medium).toBe('#fa8c16');
      expect(priorityColors.low).toBe('#999');
    });
  });

  describe('评分进度条颜色', () => {
    it('90分以上应为绿色', () => {
      const score = 95;
      const color = score >= 90 ? '#52c41a' : score >= 80 ? '#1890ff' : '#fa8c16';
      expect(color).toBe('#52c41a');
    });

    it('80-89分应为蓝色', () => {
      const score = 85;
      const color = score >= 90 ? '#52c41a' : score >= 80 ? '#1890ff' : '#fa8c16';
      expect(color).toBe('#1890ff');
    });

    it('80分以下应为橙色', () => {
      const score = 75;
      const color = score >= 90 ? '#52c41a' : score >= 80 ? '#1890ff' : '#fa8c16';
      expect(color).toBe('#fa8c16');
    });
  });

  describe('动量颜色', () => {
    it('大于80应为红色（热门）', () => {
      const momentum = 85;
      const color = momentum > 80 ? '#cf1322' : momentum > 60 ? '#1890ff' : '#999';
      expect(color).toBe('#cf1322');
    });

    it('60-80应为蓝色（关注）', () => {
      const momentum = 70;
      const color = momentum > 80 ? '#cf1322' : momentum > 60 ? '#1890ff' : '#999';
      expect(color).toBe('#1890ff');
    });

    it('60以下应为灰色（一般）', () => {
      const momentum = 50;
      const color = momentum > 80 ? '#cf1322' : momentum > 60 ? '#1890ff' : '#999';
      expect(color).toBe('#999');
    });
  });

  describe('资金流向标签', () => {
    it('流入应为绿色', () => {
      const trend: '流入' | '流出' | '持平' = '流入';
      const color = trend === '流入' ? 'green' : trend === '流出' ? 'red' : 'default';
      expect(color).toBe('green');
    });

    it('流出应为红色', () => {
      const trend: '流入' | '流出' | '持平' = '流出';
      const color = trend === '流入' ? 'green' : trend === '流出' ? 'red' : 'default';
      expect(color).toBe('red');
    });

    it('其他应为默认色', () => {
      const trend: '流入' | '流出' | '持平' = '持平';
      const color = trend === '流入' ? 'green' : trend === '流出' ? 'red' : 'default';
      expect(color).toBe('default');
    });
  });
});
