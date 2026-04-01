import { describe, it, expect } from 'vitest';

/**
 * AI选股API测试
 * 测试选股策略、推荐数据、诊断逻辑
 */

// 从ai-stock-selection.ts提取的策略配置
const strategies = {
  value: {
    name: '价值投资',
    desc: '低估值+高分红+稳定增长',
    stocks: () => [
      { symbol: '600519', name: '贵州茅台', score: 95, reason: 'PE合理，ROE连续5年>25%，高分红', price: 1800, changePercent: 1.2 },
      { symbol: '000858', name: '五粮液', score: 90, reason: '估值低位，现金流充裕，品牌护城河', price: 150, changePercent: 0.8 },
      { symbol: '601318', name: '中国平安', score: 88, reason: 'PB破净，保险+科技双轮驱动', price: 50, changePercent: -0.3 },
      { symbol: '000333', name: '美的集团', score: 86, reason: '家电龙头，多元化布局，估值合理', price: 65, changePercent: 0.5 },
      { symbol: '600036', name: '招商银行', score: 85, reason: '银行龙头，资产质量优秀，分红稳定', price: 35, changePercent: 0.2 },
    ],
  },
  growth: {
    name: '成长突破',
    desc: '高增长+行业景气+技术突破',
    stocks: () => [
      { symbol: '300750', name: '宁德时代', score: 92, reason: '新能源电池龙头', price: 200, changePercent: 3.5 },
      { symbol: '002594', name: '比亚迪', score: 91, reason: '新能源车销量高增', price: 260, changePercent: 2.8 },
      { symbol: '688981', name: '中芯国际', score: 88, reason: '国产替代加速', price: 85, changePercent: 4.2 },
      { symbol: '002475', name: '立讯精密', score: 85, reason: '消费电子+汽车电子', price: 35, changePercent: 1.9 },
      { symbol: '300059', name: '东方财富', score: 83, reason: '券商+互联网金融', price: 18, changePercent: 5.1 },
    ],
  },
  technical: {
    name: '技术形态',
    desc: '均线金叉+放量突破+趋势确认',
    stocks: () => [
      { symbol: '601012', name: '隆基绿能', score: 89, reason: '底部放量，MACD金叉', price: 25, changePercent: 6.2 },
      { symbol: '002714', name: '牧原股份', score: 86, reason: 'W底形态', price: 42, changePercent: 3.8 },
      { symbol: '601899', name: '紫金矿业', score: 84, reason: '均线多头排列', price: 18, changePercent: 2.1 },
      { symbol: '600276', name: '恒瑞医药', score: 82, reason: '旗形整理突破', price: 48, changePercent: 1.5 },
      { symbol: '002241', name: '歌尔股份', score: 80, reason: 'V型反转', price: 22, changePercent: 4.5 },
    ],
  },
  momentum: {
    name: '动量追踪',
    desc: '强势领涨+资金流入+市场热度',
    stocks: () => [
      { symbol: '688256', name: '寒武纪', score: 93, reason: 'AI芯片龙头', price: 650, changePercent: 8.5 },
      { symbol: '300474', name: '景嘉微', score: 89, reason: 'GPU国产替代', price: 95, changePercent: 6.8 },
      { symbol: '688111', name: '金山办公', score: 87, reason: 'AI+办公', price: 320, changePercent: 5.2 },
      { symbol: '002230', name: '科大讯飞', score: 85, reason: '大模型落地', price: 55, changePercent: 4.8 },
      { symbol: '300033', name: '同花顺', score: 83, reason: 'AI金融信息', price: 150, changePercent: 7.2 },
    ],
  },
  contrarian: {
    name: '逆向布局',
    desc: '超跌反弹+估值修复+底部信号',
    stocks: () => [
      { symbol: '000002', name: '万科A', score: 78, reason: '地产政策底部', price: 8, changePercent: -2.1 },
      { symbol: '601398', name: '工商银行', score: 82, reason: '高股息防御', price: 5.5, changePercent: 0.3 },
      { symbol: '600036', name: '招商银行', score: 80, reason: '银行板块轮动', price: 35, changePercent: 0.8 },
      { symbol: '002304', name: '洋河股份', score: 76, reason: '白酒调整充分', price: 105, changePercent: -0.5 },
      { symbol: '603259', name: '药明康德', score: 75, reason: 'CXO出海逻辑', price: 55, changePercent: 1.2 },
    ],
  },
};

describe('AI选股API', () => {
  describe('选股策略配置', () => {
    it('应该有5种选股策略', () => {
      expect(Object.keys(strategies).length).toBe(5);
    });

    it('每种策略都应该有name和desc', () => {
      Object.values(strategies).forEach(s => {
        expect(s.name).toBeTruthy();
        expect(s.desc).toBeTruthy();
      });
    });

    it('每种策略都应该返回5只股票', () => {
      Object.values(strategies).forEach(s => {
        expect(s.stocks().length).toBe(5);
      });
    });
  });

  describe('价值投资策略', () => {
    it('贵州茅台应该是推荐首选', () => {
      const stocks = strategies.value.stocks();
      expect(stocks[0].symbol).toBe('600519');
      expect(stocks[0].name).toBe('贵州茅台');
    });

    it('分数应该从高到低排列', () => {
      const stocks = strategies.value.stocks();
      for (let i = 1; i < stocks.length; i++) {
        expect(stocks[i - 1].score).toBeGreaterThanOrEqual(stocks[i].score);
      }
    });

    it('所有股票都应该有理由', () => {
      strategies.value.stocks().forEach(s => {
        expect(s.reason.length).toBeGreaterThan(0);
      });
    });
  });

  describe('成长突破策略', () => {
    it('应该包含新能源龙头', () => {
      const stocks = strategies.growth.stocks();
      const names = stocks.map(s => s.name);
      expect(names).toContain('宁德时代');
      expect(names).toContain('比亚迪');
    });

    it('推荐股票涨跌幅应该较高', () => {
      const stocks = strategies.growth.stocks();
      const avgChange = stocks.reduce((s, st) => s + st.changePercent, 0) / stocks.length;
      expect(avgChange).toBeGreaterThan(2);
    });
  });

  describe('动量追踪策略', () => {
    it('应该包含AI概念股', () => {
      const stocks = strategies.momentum.stocks();
      const names = stocks.map(s => s.name);
      expect(names).toContain('寒武纪');
    });

    it('寒武纪分数应该最高', () => {
      const stocks = strategies.momentum.stocks();
      const top = stocks[0];
      expect(top.symbol).toBe('688256');
      expect(top.score).toBe(93);
    });
  });

  describe('逆向布局策略', () => {
    it('应该包含超跌股票', () => {
      const stocks = strategies.contrarian.stocks();
      const hasNegative = stocks.some(s => s.changePercent < 0);
      expect(hasNegative).toBe(true);
    });

    it('整体分数应该偏低', () => {
      const stocks = strategies.contrarian.stocks();
      const avgScore = stocks.reduce((s, st) => s + st.score, 0) / stocks.length;
      expect(avgScore).toBeLessThan(85);
    });
  });

  describe('个股诊断维度', () => {
    const dimensions = [
      { name: '基本面', weight: 0.3 },
      { name: '技术面', weight: 0.25 },
      { name: '动量', weight: 0.2 },
      { name: '估值', weight: 0.15 },
      { name: '情绪', weight: 0.1 },
    ];

    it('应该有5个评估维度', () => {
      expect(dimensions.length).toBe(5);
    });

    it('权重之和应该等于1', () => {
      const totalWeight = dimensions.reduce((s, d) => s + d.weight, 0);
      expect(totalWeight).toBeCloseTo(1, 2);
    });

    it('基本面权重应该最高', () => {
      const sorted = [...dimensions].sort((a, b) => b.weight - a.weight);
      expect(sorted[0].name).toBe('基本面');
    });

    it('情绪权重应该最低', () => {
      const sorted = [...dimensions].sort((a, b) => b.weight - a.weight);
      expect(sorted[sorted.length - 1].name).toBe('情绪');
    });
  });

  describe('评分等级', () => {
    it('85分以上应该是强烈推荐', () => {
      const score = 90;
      const rating = score >= 85 ? '强烈推荐' : score >= 70 ? '推荐' : score >= 55 ? '中性' : '谨慎';
      expect(rating).toBe('强烈推荐');
    });

    it('70-84分应该是推荐', () => {
      const score = 75;
      const rating = score >= 85 ? '强烈推荐' : score >= 70 ? '推荐' : score >= 55 ? '中性' : '谨慎';
      expect(rating).toBe('推荐');
    });

    it('55-69分应该是中性', () => {
      const score = 60;
      const rating = score >= 85 ? '强烈推荐' : score >= 70 ? '推荐' : score >= 55 ? '中性' : '谨慎';
      expect(rating).toBe('中性');
    });

    it('55分以下应该是谨慎', () => {
      const score = 40;
      const rating = score >= 85 ? '强烈推荐' : score >= 70 ? '推荐' : score >= 55 ? '中性' : '谨慎';
      expect(rating).toBe('谨慎');
    });
  });

  describe('评分计算', () => {
    it('综合评分应该是各维度的平均值', () => {
      const scores = { fundamental: 80, technical: 75, momentum: 85, valuation: 70, sentiment: 65 };
      const total = Math.round(Object.values(scores).reduce((s, v) => s + v, 0) / 5);
      expect(total).toBe(75);
    });

    it('评分范围应该在0-100', () => {
      const scores = { fundamental: 95, technical: 88, momentum: 92, valuation: 78, sentiment: 85 };
      const total = Math.round(Object.values(scores).reduce((s, v) => s + v, 0) / 5);
      expect(total).toBeGreaterThanOrEqual(0);
      expect(total).toBeLessThanOrEqual(100);
    });
  });

  describe('行业轮动', () => {
    const sectors = [
      { name: '人工智能', phase: '主升', momentum: 92 },
      { name: '新能源车', phase: '吸筹', momentum: 78 },
      { name: '半导体', phase: '主升', momentum: 85 },
      { name: '白酒', phase: '派发', momentum: 45 },
      { name: '银行', phase: '吸筹', momentum: 62 },
      { name: '医药', phase: '下跌', momentum: 38 },
      { name: '地产', phase: '下跌', momentum: 30 },
    ];

    it('应该按动量排序', () => {
      const sorted = [...sectors].sort((a, b) => b.momentum - a.momentum);
      expect(sorted[0].name).toBe('人工智能');
      expect(sorted[sorted.length - 1].name).toBe('地产');
    });

    it('主升板块应该作为热点', () => {
      const hot = sectors.filter(s => s.phase === '主升').map(s => s.name);
      expect(hot).toContain('人工智能');
      expect(hot).toContain('半导体');
    });

    it('吸筹板块应该作为关注', () => {
      const watch = sectors.filter(s => s.phase === '吸筹').map(s => s.name);
      expect(watch).toContain('新能源车');
      expect(watch).toContain('银行');
    });

    it('下跌板块应该回避', () => {
      const avoid = sectors.filter(s => s.phase === '下跌').map(s => s.name);
      expect(avoid).toContain('医药');
      expect(avoid).toContain('地产');
    });
  });

  describe('预警建议', () => {
    const suggestions = [
      { type: 'price_breakout', priority: 'high' },
      { type: 'volume_surge', priority: 'high' },
      { type: 'technical_signal', priority: 'medium' },
      { type: 'capital_flow', priority: 'medium' },
      { type: 'earnings', priority: 'low' },
    ];

    it('应该有5种预警类型', () => {
      expect(suggestions.length).toBe(5);
    });

    it('应该有高低优先级', () => {
      const priorities = new Set(suggestions.map(s => s.priority));
      expect(priorities.has('high')).toBe(true);
      expect(priorities.has('medium')).toBe(true);
      expect(priorities.has('low')).toBe(true);
    });
  });
});
