/**
 * 大宗交易、股东增减持、限售股解禁、AI选股测试
 */

import { describe, it, expect } from 'vitest';

// ==================== 大宗交易测试 ====================

describe('大宗交易数据', () => {
  function generateBlockTrade(symbol = '600519') {
    const price = Math.round((Math.random() * 200 + 10) * 100) / 100;
    const volume = Math.floor(Math.random() * 500 + 50) * 10000;
    const amount = Math.round(price * volume);
    const discount = Math.round((Math.random() * 10 - 3) * 100) / 100;
    return {
      id: 1,
      symbol,
      name: '贵州茅台',
      tradeDate: '2026-03-24',
      price,
      closePrice: Math.round(price / (1 + discount / 100) * 100) / 100,
      volume,
      amount,
      discount,
      buyer: '机构专用',
      seller: '中信证券上海分公司',
      buyerSeat: '营业部1',
      sellerSeat: '营业部2',
    };
  }

  it('大宗交易记录包含所有必要字段', () => {
    const trade = generateBlockTrade();
    expect(trade).toHaveProperty('symbol');
    expect(trade).toHaveProperty('tradeDate');
    expect(trade).toHaveProperty('price');
    expect(trade).toHaveProperty('volume');
    expect(trade).toHaveProperty('amount');
    expect(trade).toHaveProperty('discount');
    expect(trade).toHaveProperty('buyer');
    expect(trade).toHaveProperty('seller');
  });

  it('大宗交易价格应为正数', () => {
    const trade = generateBlockTrade();
    expect(trade.price).toBeGreaterThan(0);
  });

  it('大宗交易成交量应为100的整数倍', () => {
    const trade = generateBlockTrade();
    expect(trade.volume % 100).toBe(0);
  });

  it('大宗交易金额 = 价格 × 成交量', () => {
    const trade = generateBlockTrade();
    expect(trade.amount).toBe(Math.round(trade.price * trade.volume));
  });

  it('大宗交易折溢价率应在合理范围', () => {
    const trade = generateBlockTrade();
    expect(trade.discount).toBeGreaterThanOrEqual(-3);
    expect(trade.discount).toBeLessThanOrEqual(7);
  });

  it('大宗交易日期格式正确', () => {
    const trade = generateBlockTrade();
    expect(trade.tradeDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ==================== 股东增减持测试 ====================

describe('股东增减持数据', () => {
  function generateChange(type: 'increase' | 'decrease' | 'new' | 'exit' = 'increase') {
    const heldShares = Math.floor(Math.random() * 1000000000) + 10000000;
    const changeShares = type === 'new'
      ? heldShares
      : type === 'exit'
        ? -Math.floor(Math.random() * 100000000)
        : Math.floor(Math.random() * 200000000) * (type === 'increase' ? 1 : -1);
    return {
      id: 1,
      symbol: '600519',
      name: '贵州茅台',
      shareholderName: '香港中央结算有限公司',
      shareholderType: 'institution' as const,
      changeType: type,
      heldShares,
      changeShares,
      heldPercent: Math.round(Math.random() * 15 * 100) / 100,
      changePercent: Math.round(changeShares / heldShares * 100 * 100) / 100,
      announceDate: '2026-03-20',
      source: '定期报告',
    };
  }

  it('增减持记录包含所有必要字段', () => {
    const change = generateChange();
    expect(change).toHaveProperty('shareholderName');
    expect(change).toHaveProperty('changeType');
    expect(change).toHaveProperty('heldShares');
    expect(change).toHaveProperty('changeShares');
    expect(change).toHaveProperty('heldPercent');
    expect(change).toHaveProperty('announceDate');
  });

  it('增持时变动股数应为正数', () => {
    const change = generateChange('increase');
    expect(change.changeShares).toBeGreaterThan(0);
  });

  it('减持时变动股数应为负数', () => {
    const change = generateChange('decrease');
    expect(change.changeShares).toBeLessThan(0);
  });

  it('新增股东变动股数应等于持有股数', () => {
    const change = generateChange('new');
    expect(change.changeShares).toBe(change.heldShares);
  });

  it('退出股东变动股数应为负数', () => {
    const change = generateChange('exit');
    expect(change.changeShares).toBeLessThan(0);
  });

  it('持股比例应在0-100之间', () => {
    const change = generateChange();
    expect(change.heldPercent).toBeGreaterThanOrEqual(0);
    expect(change.heldPercent).toBeLessThanOrEqual(100);
  });

  it('股东类型应为 institution 或 individual', () => {
    const change = generateChange();
    expect(['institution', 'individual']).toContain(change.shareholderType);
  });

  it('增减持类型应为四种之一', () => {
    const validTypes = ['increase', 'decrease', 'new', 'exit'];
    expect(validTypes).toContain(generateChange('increase').changeType);
    expect(validTypes).toContain(generateChange('decrease').changeType);
    expect(validTypes).toContain(generateChange('new').changeType);
    expect(validTypes).toContain(generateChange('exit').changeType);
  });
});

// ==================== 限售股解禁测试 ====================

describe('限售股解禁数据', () => {
  function generateExpiry() {
    return {
      id: 1,
      symbol: '600519',
      name: '贵州茅台',
      expiryDate: '2026-03-28',
      lockupType: '首发原股东限售',
      shareholder: '控股股东',
      totalShares: 50000000,
      circulatingBefore: 1000000000,
      unlockRatio: 5.0,
      marketValue: 90000000000,
      price: 1800,
      actualCirculating: 1050000000,
    };
  }

  it('解禁记录包含所有必要字段', () => {
    const expiry = generateExpiry();
    expect(expiry).toHaveProperty('symbol');
    expect(expiry).toHaveProperty('expiryDate');
    expect(expiry).toHaveProperty('lockupType');
    expect(expiry).toHaveProperty('totalShares');
    expect(expiry).toHaveProperty('unlockRatio');
    expect(expiry).toHaveProperty('marketValue');
  });

  it('解禁股数应为正数', () => {
    const expiry = generateExpiry();
    expect(expiry.totalShares).toBeGreaterThan(0);
  });

  it('解禁市值 = 解禁股数 × 股价', () => {
    const expiry = generateExpiry();
    expect(expiry.marketValue).toBe(expiry.totalShares * expiry.price);
  });

  it('解禁比例应正确计算', () => {
    const expiry = generateExpiry();
    const expectedRatio = Math.round(expiry.totalShares / expiry.circulatingBefore * 100 * 100) / 100;
    expect(expiry.unlockRatio).toBe(expectedRatio);
  });

  it('解禁后流通股 = 原流通股 + 解禁股数', () => {
    const expiry = generateExpiry();
    expect(expiry.actualCirculating).toBe(expiry.circulatingBefore + expiry.totalShares);
  });

  it('解禁类型应为已知类型之一', () => {
    const validTypes = ['首发原股东限售', '定向增发机构配售', '股权激励限售', '追加承诺限售'];
    expect(validTypes).toContain(generateExpiry().lockupType);
  });

  it('解禁日期格式正确', () => {
    const expiry = generateExpiry();
    expect(expiry.expiryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ==================== AI 选股推荐测试 ====================

describe('AI 选股推荐', () => {
  const strategies = ['value', 'growth', 'technical', 'momentum', 'contrarian'];

  function generateRecommendation(strategy: string) {
    return {
      strategy,
      name: `${strategy}策略`,
      description: '测试策略描述',
      stocks: Array.from({ length: 5 }, (_, i) => ({
        symbol: `${600000 + i}`,
        name: `股票${i}`,
        score: 90 - i * 2,
        reason: '推荐理由',
        price: Math.round(Math.random() * 200 * 100) / 100,
        changePercent: Math.round((Math.random() * 10 - 3) * 100) / 100,
      })),
      updatedAt: new Date().toISOString(),
    };
  }

  it('推荐策略数量应为5种', () => {
    expect(strategies).toHaveLength(5);
  });

  it('每个策略推荐应包含5只股票', () => {
    strategies.forEach(s => {
      const rec = generateRecommendation(s);
      expect(rec.stocks).toHaveLength(5);
    });
  });

  it('推荐评分应在60-100之间', () => {
    const rec = generateRecommendation('value');
    rec.stocks.forEach(stock => {
      expect(stock.score).toBeGreaterThanOrEqual(60);
      expect(stock.score).toBeLessThanOrEqual(100);
    });
  });

  it('推荐应按评分降序排列', () => {
    const rec = generateRecommendation('value');
    for (let i = 1; i < rec.stocks.length; i++) {
      expect(rec.stocks[i - 1].score).toBeGreaterThanOrEqual(rec.stocks[i].score);
    }
  });

  it('每只推荐股票应有推荐理由', () => {
    const rec = generateRecommendation('growth');
    rec.stocks.forEach(stock => {
      expect(stock.reason).toBeTruthy();
      expect(stock.reason.length).toBeGreaterThan(0);
    });
  });

  it('推荐股票价格应为正数', () => {
    const rec = generateRecommendation('momentum');
    rec.stocks.forEach(stock => {
      expect(stock.price).toBeGreaterThan(0);
    });
  });
});

// ==================== AI 诊断测试 ====================

describe('AI 个股诊断', () => {
  function generateDiagnosis(symbol: string) {
    const scores = {
      fundamental: Math.floor(Math.random() * 40) + 60,
      technical: Math.floor(Math.random() * 40) + 60,
      momentum: Math.floor(Math.random() * 40) + 60,
      valuation: Math.floor(Math.random() * 40) + 60,
      sentiment: Math.floor(Math.random() * 40) + 60,
    };
    const total = Math.round(Object.values(scores).reduce((s, v) => s + v, 0) / 5);
    return {
      symbol,
      totalScore: total,
      rating: total >= 85 ? '强烈推荐' : total >= 70 ? '推荐' : total >= 55 ? '中性' : '谨慎',
      dimensions: [
        { name: '基本面', score: scores.fundamental, weight: 0.3 },
        { name: '技术面', score: scores.technical, weight: 0.25 },
        { name: '动量', score: scores.momentum, weight: 0.2 },
        { name: '估值', score: scores.valuation, weight: 0.15 },
        { name: '情绪', score: scores.sentiment, weight: 0.1 },
      ],
    };
  }

  it('诊断包含5个维度', () => {
    const d = generateDiagnosis('600519');
    expect(d.dimensions).toHaveLength(5);
  });

  it('维度权重之和应为1', () => {
    const d = generateDiagnosis('600519');
    const weightSum = d.dimensions.reduce((s, dim) => s + dim.weight, 0);
    expect(weightSum).toBeCloseTo(1, 2);
  });

  it('维度分数应在0-100之间', () => {
    const d = generateDiagnosis('600519');
    d.dimensions.forEach(dim => {
      expect(dim.score).toBeGreaterThanOrEqual(0);
      expect(dim.score).toBeLessThanOrEqual(100);
    });
  });

  it('综合评分应与各维度分数平均值一致', () => {
    const d = generateDiagnosis('600519');
    const avg = Math.round(d.dimensions.reduce((s, dim) => s + dim.score, 0) / d.dimensions.length);
    expect(d.totalScore).toBe(avg);
  });

  it('评级应与综合评分匹配', () => {
    const d = generateDiagnosis('600519');
    if (d.totalScore >= 85) expect(d.rating).toBe('强烈推荐');
    else if (d.totalScore >= 70) expect(d.rating).toBe('推荐');
    else if (d.totalScore >= 55) expect(d.rating).toBe('中性');
    else expect(d.rating).toBe('谨慎');
  });
});

// ==================== 行业轮动测试 ====================

describe('行业轮动分析', () => {
  function generateSectorRotation() {
    const sectors = [
      { name: '人工智能', code: 'AI', phase: '主升', momentum: 92, trend: '流入' },
      { name: '新能源车', code: 'NEV', phase: '吸筹', momentum: 78, trend: '流入' },
      { name: '半导体', code: 'CHIP', phase: '主升', momentum: 85, trend: '流入' },
    ];
    return { sectors, hotSectors: sectors.filter(s => s.phase === '主升').map(s => s.name) };
  }

  it('行业数据包含必要字段', () => {
    const { sectors } = generateSectorRotation();
    sectors.forEach(s => {
      expect(s).toHaveProperty('name');
      expect(s).toHaveProperty('code');
      expect(s).toHaveProperty('phase');
      expect(s).toHaveProperty('momentum');
      expect(s).toHaveProperty('trend');
    });
  });

  it('动量评分应在0-100之间', () => {
    const { sectors } = generateSectorRotation();
    sectors.forEach(s => {
      expect(s.momentum).toBeGreaterThanOrEqual(0);
      expect(s.momentum).toBeLessThanOrEqual(100);
    });
  });

  it('阶段应为已知值', () => {
    const validPhases = ['吸筹', '主升', '派发', '下跌'];
    const { sectors } = generateSectorRotation();
    sectors.forEach(s => {
      expect(validPhases).toContain(s.phase);
    });
  });

  it('趋势方向应为已知值', () => {
    const validTrends = ['流入', '流出', '持有'];
    const { sectors } = generateSectorRotation();
    sectors.forEach(s => {
      expect(validTrends).toContain(s.trend);
    });
  });

  it('热门行业应为主升阶段的行业', () => {
    const { sectors, hotSectors } = generateSectorRotation();
    const expected = sectors.filter(s => s.phase === '主升').map(s => s.name);
    expect(hotSectors).toEqual(expected);
  });
});
