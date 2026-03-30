import { describe, it, expect } from 'vitest';

// ===== 交易系统逻辑 =====
describe('Trading System Logic', () => {
  interface Order {
    id: string;
    symbol: string;
    side: 'buy' | 'sell';
    type: 'limit' | 'market';
    price: number;
    quantity: number;
    filledQuantity: number;
    status: 'pending' | 'partial' | 'filled' | 'cancelled';
    timestamp: number;
  }

  interface Position {
    symbol: string;
    quantity: number;
    avgCost: number;
    currentPrice: number;
    marketValue: number;
    unrealizedPnL: number;
    realizedPnL: number;
  }

  const matchOrder = (order: Order, marketPrice: number): Order => {
    if (order.status === 'cancelled' || order.status === 'filled') return order;
    
    if (order.type === 'market') {
      return { ...order, filledQuantity: order.quantity, status: 'filled' };
    }
    
    // 限价单
    if (order.side === 'buy' && marketPrice <= order.price) {
      return { ...order, filledQuantity: order.quantity, status: 'filled' };
    }
    if (order.side === 'sell' && marketPrice >= order.price) {
      return { ...order, filledQuantity: order.quantity, status: 'filled' };
    }
    
    return order;
  };

  const updatePosition = (pos: Position, order: Order): Position => {
    if (order.status !== 'filled') return pos;
    
    if (order.side === 'buy') {
      const totalCost = pos.avgCost * pos.quantity + order.price * order.filledQuantity;
      const newQty = pos.quantity + order.filledQuantity;
      return {
        ...pos,
        quantity: newQty,
        avgCost: newQty > 0 ? totalCost / newQty : 0,
      };
    } else {
      const pnl = (order.price - pos.avgCost) * order.filledQuantity;
      return {
        ...pos,
        quantity: pos.quantity - order.filledQuantity,
        realizedPnL: pos.realizedPnL + pnl,
      };
    }
  };

  const calcPositionPnL = (pos: Position): { unrealized: number; realized: number; total: number } => {
    const unrealized = (pos.currentPrice - pos.avgCost) * pos.quantity;
    return {
      unrealized,
      realized: pos.realizedPnL,
      total: unrealized + pos.realizedPnL,
    };
  };

  const checkT1Restriction = (orderDate: string, tradeDate: string): boolean => {
    // T+1: 买入当日不能卖出
    return orderDate !== tradeDate;
  };

  const checkLotSize = (quantity: number): boolean => {
    // A股100股整数倍
    return quantity > 0 && quantity % 100 === 0;
  };

  it('应该成交市价买单', () => {
    const order: Order = { id: '1', symbol: '600519', side: 'buy', type: 'market', price: 100, quantity: 100, filledQuantity: 0, status: 'pending', timestamp: Date.now() };
    const filled = matchOrder(order, 100);
    expect(filled.status).toBe('filled');
    expect(filled.filledQuantity).toBe(100);
  });

  it('应该成交限价买单（市价低于限价）', () => {
    const order: Order = { id: '1', symbol: '600519', side: 'buy', type: 'limit', price: 100, quantity: 100, filledQuantity: 0, status: 'pending', timestamp: Date.now() };
    const filled = matchOrder(order, 98);
    expect(filled.status).toBe('filled');
  });

  it('不应该成交限价买单（市价高于限价）', () => {
    const order: Order = { id: '1', symbol: '600519', side: 'buy', type: 'limit', price: 100, quantity: 100, filledQuantity: 0, status: 'pending', timestamp: Date.now() };
    const filled = matchOrder(order, 102);
    expect(filled.status).toBe('pending');
  });

  it('应该更新买入持仓', () => {
    const pos: Position = { symbol: '600519', quantity: 0, avgCost: 0, currentPrice: 105, marketValue: 0, unrealizedPnL: 0, realizedPnL: 0 };
    const order: Order = { id: '1', symbol: '600519', side: 'buy', type: 'limit', price: 100, quantity: 100, filledQuantity: 100, status: 'filled', timestamp: Date.now() };
    const updated = updatePosition(pos, order);
    expect(updated.quantity).toBe(100);
    expect(updated.avgCost).toBe(100);
  });

  it('应该更新卖出持仓和实现盈亏', () => {
    const pos: Position = { symbol: '600519', quantity: 200, avgCost: 100, currentPrice: 110, marketValue: 22000, unrealizedPnL: 2000, realizedPnL: 0 };
    const order: Order = { id: '1', symbol: '600519', side: 'sell', type: 'limit', price: 110, quantity: 100, filledQuantity: 100, status: 'filled', timestamp: Date.now() };
    const updated = updatePosition(pos, order);
    expect(updated.quantity).toBe(100);
    expect(updated.realizedPnL).toBe(1000); // (110-100)*100
  });

  it('应该计算持仓盈亏', () => {
    const pos: Position = { symbol: '600519', quantity: 100, avgCost: 100, currentPrice: 110, marketValue: 11000, unrealizedPnL: 1000, realizedPnL: 500 };
    const pnl = calcPositionPnL(pos);
    expect(pnl.unrealized).toBe(1000);
    expect(pnl.realized).toBe(500);
    expect(pnl.total).toBe(1500);
  });

  it('应该检查T+1限制', () => {
    expect(checkT1Restriction('2026-03-24', '2026-03-24')).toBe(false); // 当日不能卖
    expect(checkT1Restriction('2026-03-23', '2026-03-24')).toBe(true); // 次日可卖
  });

  it('应该检查整手（100股整数倍）', () => {
    expect(checkLotSize(100)).toBe(true);
    expect(checkLotSize(500)).toBe(true);
    expect(checkLotSize(50)).toBe(false);
    expect(checkLotSize(0)).toBe(false);
    expect(checkLotSize(-100)).toBe(false);
  });

  it('应该处理多次加仓均价计算', () => {
    let pos: Position = { symbol: '600519', quantity: 0, avgCost: 0, currentPrice: 100, marketValue: 0, unrealizedPnL: 0, realizedPnL: 0 };
    
    // 第一次买入 100股 @100
    pos = updatePosition(pos, { id: '1', symbol: '600519', side: 'buy', type: 'limit', price: 100, quantity: 100, filledQuantity: 100, status: 'filled', timestamp: 1 });
    expect(pos.avgCost).toBe(100);
    
    // 第二次加仓 100股 @120
    pos = updatePosition(pos, { id: '2', symbol: '600519', side: 'buy', type: 'limit', price: 120, quantity: 100, filledQuantity: 100, status: 'filled', timestamp: 2 });
    expect(pos.quantity).toBe(200);
    expect(pos.avgCost).toBe(110); // (100*100 + 120*100) / 200
  });
});

// ===== 预警系统 =====
describe('Alert System', () => {
  interface AlertRule {
    id: string;
    symbol: string;
    type: 'price_above' | 'price_below' | 'change_above' | 'change_below' | 'volume_above';
    threshold: number;
    active: boolean;
    triggered: boolean;
    createdAt: number;
  }

  const evaluateAlert = (rule: AlertRule, quote: { price: number; change: number; volume: number }): { triggered: boolean; message: string } => {
    if (!rule.active || rule.triggered) return { triggered: false, message: '' };
    
    switch (rule.type) {
      case 'price_above':
        if (quote.price >= rule.threshold) return { triggered: true, message: `${rule.symbol} 价格突破 ${rule.threshold}` };
        break;
      case 'price_below':
        if (quote.price <= rule.threshold) return { triggered: true, message: `${rule.symbol} 价格跌破 ${rule.threshold}` };
        break;
      case 'change_above':
        if (quote.change >= rule.threshold) return { triggered: true, message: `${rule.symbol} 涨幅达到 ${rule.threshold}%` };
        break;
      case 'change_below':
        if (quote.change <= -rule.threshold) return { triggered: true, message: `${rule.symbol} 跌幅达到 ${rule.threshold}%` };
        break;
      case 'volume_above':
        if (quote.volume >= rule.threshold) return { triggered: true, message: `${rule.symbol} 成交量突破 ${rule.threshold}` };
        break;
    }
    return { triggered: false, message: '' };
  };

  const batchEvaluate = (rules: AlertRule[], quotes: Map<string, { price: number; change: number; volume: number }>) => {
    const triggered: { rule: AlertRule; message: string }[] = [];
    for (const rule of rules) {
      const quote = quotes.get(rule.symbol);
      if (!quote) continue;
      const result = evaluateAlert(rule, quote);
      if (result.triggered) {
        triggered.push({ rule: { ...rule, triggered: true }, message: result.message });
      }
    }
    return triggered;
  };

  it('应该触发价格突破预警', () => {
    const rule: AlertRule = { id: '1', symbol: '600519', type: 'price_above', threshold: 100, active: true, triggered: false, createdAt: Date.now() };
    const result = evaluateAlert(rule, { price: 105, change: 5, volume: 1e6 });
    expect(result.triggered).toBe(true);
    expect(result.message).toContain('突破');
  });

  it('应该触发价格跌破预警', () => {
    const rule: AlertRule = { id: '1', symbol: '600519', type: 'price_below', threshold: 95, active: true, triggered: false, createdAt: Date.now() };
    const result = evaluateAlert(rule, { price: 90, change: -5, volume: 1e6 });
    expect(result.triggered).toBe(true);
    expect(result.message).toContain('跌破');
  });

  it('不应该触发未达阈值的预警', () => {
    const rule: AlertRule = { id: '1', symbol: '600519', type: 'price_above', threshold: 120, active: true, triggered: false, createdAt: Date.now() };
    const result = evaluateAlert(rule, { price: 110, change: 5, volume: 1e6 });
    expect(result.triggered).toBe(false);
  });

  it('不应该触发已触发的预警', () => {
    const rule: AlertRule = { id: '1', symbol: '600519', type: 'price_above', threshold: 100, active: true, triggered: true, createdAt: Date.now() };
    const result = evaluateAlert(rule, { price: 105, change: 5, volume: 1e6 });
    expect(result.triggered).toBe(false);
  });

  it('不应该触发已停用的预警', () => {
    const rule: AlertRule = { id: '1', symbol: '600519', type: 'price_above', threshold: 100, active: false, triggered: false, createdAt: Date.now() };
    const result = evaluateAlert(rule, { price: 105, change: 5, volume: 1e6 });
    expect(result.triggered).toBe(false);
  });

  it('应该触发涨跌幅预警', () => {
    const rule: AlertRule = { id: '1', symbol: '600519', type: 'change_above', threshold: 5, active: true, triggered: false, createdAt: Date.now() };
    expect(evaluateAlert(rule, { price: 105, change: 5.5, volume: 1e6 }).triggered).toBe(true);
    expect(evaluateAlert(rule, { price: 105, change: 4.5, volume: 1e6 }).triggered).toBe(false);
  });

  it('应该触发成交量预警', () => {
    const rule: AlertRule = { id: '1', symbol: '600519', type: 'volume_above', threshold: 5e6, active: true, triggered: false, createdAt: Date.now() };
    expect(evaluateAlert(rule, { price: 100, change: 0, volume: 6e6 }).triggered).toBe(true);
  });

  it('应该批量评估预警', () => {
    const rules: AlertRule[] = [
      { id: '1', symbol: '600519', type: 'price_above', threshold: 100, active: true, triggered: false, createdAt: Date.now() },
      { id: '2', symbol: '000858', type: 'price_above', threshold: 100, active: true, triggered: false, createdAt: Date.now() },
      { id: '3', symbol: '600519', type: 'price_below', threshold: 90, active: true, triggered: false, createdAt: Date.now() },
    ];
    const quotes = new Map([
      ['600519', { price: 105, change: 5, volume: 1e6 }],
      ['000858', { price: 95, change: 2, volume: 2e6 }],
    ]);
    const result = batchEvaluate(rules, quotes);
    expect(result).toHaveLength(1);
    expect(result[0].rule.symbol).toBe('600519');
  });
});

// ===== 投资组合分析 =====
describe('Portfolio Analysis', () => {
  interface PortfolioPosition {
    symbol: string;
    quantity: number;
    costBasis: number;
    currentPrice: number;
    weight: number;
  }

  const calcPortfolioMetrics = (positions: PortfolioPosition[]) => {
    let totalValue = 0, totalCost = 0;
    for (const p of positions) {
      totalValue += p.currentPrice * p.quantity;
      totalCost += p.costBasis * p.quantity;
    }
    const totalPnL = totalValue - totalCost;
    const returnPct = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;
    
    const weights = positions.map(p => ({
      symbol: p.symbol,
      weight: totalValue > 0 ? (p.currentPrice * p.quantity / totalValue) * 100 : 0,
    }));
    
    const sectorWeights = new Map<string, number>();
    // 简化：直接按symbol分组
    for (const w of weights) {
      const sector = w.symbol.startsWith('6') ? 'SH' : 'SZ';
      sectorWeights.set(sector, (sectorWeights.get(sector) || 0) + w.weight);
    }
    
    return {
      totalValue,
      totalCost,
      totalPnL,
      returnPct,
      weights,
      sectorWeights: Object.fromEntries(sectorWeights),
      concentration: Math.max(...weights.map(w => w.weight)),
    };
  };

  const calcRebalanceSuggestion = (
    current: { symbol: string; weight: number }[],
    target: { symbol: string; weight: number }[]
  ) => {
    const suggestions: { symbol: string; action: 'buy' | 'sell' | 'hold'; diff: number }[] = [];
    const targetMap = new Map(target.map(t => [t.symbol, t.weight]));
    const currentMap = new Map(current.map(c => [c.symbol, c.weight]));
    
    const allSymbols = new Set([...currentMap.keys(), ...targetMap.keys()]);
    for (const symbol of allSymbols) {
      const cur = currentMap.get(symbol) || 0;
      const tgt = targetMap.get(symbol) || 0;
      const diff = tgt - cur;
      suggestions.push({
        symbol,
        action: diff > 1 ? 'buy' : diff < -1 ? 'sell' : 'hold',
        diff,
      });
    }
    return suggestions;
  };

  it('应该计算组合指标', () => {
    const positions: PortfolioPosition[] = [
      { symbol: '600519', quantity: 100, costBasis: 1700, currentPrice: 1800, weight: 50 },
      { symbol: '000858', quantity: 200, costBasis: 140, currentPrice: 150, weight: 30 },
      { symbol: '002415', quantity: 500, costBasis: 30, currentPrice: 35, weight: 20 },
    ];
    const metrics = calcPortfolioMetrics(positions);
    expect(metrics.totalValue).toBe(1800 * 100 + 150 * 200 + 35 * 500);
    expect(metrics.totalPnL).toBeGreaterThan(0);
    expect(metrics.returnPct).toBeGreaterThan(0);
  });

  it('应该计算持仓权重', () => {
    const positions: PortfolioPosition[] = [
      { symbol: '600519', quantity: 100, costBasis: 100, currentPrice: 100, weight: 0 },
      { symbol: '000858', quantity: 100, costBasis: 100, currentPrice: 100, weight: 0 },
    ];
    const metrics = calcPortfolioMetrics(positions);
    metrics.weights.forEach(w => expect(w.weight).toBeCloseTo(50));
  });

  it('应该计算集中度', () => {
    const positions: PortfolioPosition[] = [
      { symbol: '600519', quantity: 900, costBasis: 100, currentPrice: 100, weight: 0 },
      { symbol: '000858', quantity: 100, costBasis: 100, currentPrice: 100, weight: 0 },
    ];
    const metrics = calcPortfolioMetrics(positions);
    expect(metrics.concentration).toBeCloseTo(90);
  });

  it('应该生成再平衡建议', () => {
    const current = [{ symbol: 'A', weight: 60 }, { symbol: 'B', weight: 40 }];
    const target = [{ symbol: 'A', weight: 50 }, { symbol: 'B', weight: 50 }];
    const suggestions = calcRebalanceSuggestion(current, target);
    expect(suggestions.find(s => s.symbol === 'A')?.action).toBe('sell');
    expect(suggestions.find(s => s.symbol === 'B')?.action).toBe('buy');
  });

  it('应该标记无需调整的持仓', () => {
    const current = [{ symbol: 'A', weight: 50 }, { symbol: 'B', weight: 50 }];
    const target = [{ symbol: 'A', weight: 50 }, { symbol: 'B', weight: 50 }];
    const suggestions = calcRebalanceSuggestion(current, target);
    suggestions.forEach(s => expect(s.action).toBe('hold'));
  });

  it('应该处理空组合', () => {
    const metrics = calcPortfolioMetrics([]);
    expect(metrics.totalValue).toBe(0);
    expect(metrics.totalPnL).toBe(0);
  });
});

// ===== 行业轮动分析 =====
describe('Sector Rotation Analysis', () => {
  interface SectorData {
    name: string;
    change1d: number;
    change5d: number;
    change20d: number;
    volume: number;
    avgVolume: number;
    netInflow: number;
  }

  const calcMomentum = (sector: SectorData): number => {
    const changeScore = (sector.change1d * 0.5 + sector.change5d * 0.3 + sector.change20d * 0.2);
    const volumeRatio = sector.avgVolume > 0 ? sector.volume / sector.avgVolume : 1;
    const inflowScore = sector.netInflow > 0 ? 1 : sector.netInflow < 0 ? -1 : 0;
    return changeScore * 0.6 + (volumeRatio - 1) * 20 * 0.2 + inflowScore * 5 * 0.2;
  };

  const classifyPhase = (sector: SectorData): '吸筹' | '主升' | '派发' | '下跌' => {
    const momentum = calcMomentum(sector);
    const trend = sector.change20d;
    const volumeTrend = sector.volume > sector.avgVolume * 1.2;
    
    if (momentum > 3 && trend > 5 && volumeTrend) return '主升';
    if (momentum > 0 && trend > 0 && !volumeTrend) return '吸筹';
    if (momentum < -3 && trend < -5) return '下跌';
    if (momentum < 0 && trend > 0) return '派发';
    return '吸筹';
  };

  const rankSectors = (sectors: SectorData[]): SectorData[] => {
    return [...sectors].sort((a, b) => calcMomentum(b) - calcMomentum(a));
  };

  const sectors: SectorData[] = [
    { name: '白酒', change1d: 3, change5d: 8, change20d: 15, volume: 2e6, avgVolume: 1.5e6, netInflow: 5e7 },
    { name: '新能源', change1d: -2, change5d: -5, change20d: -10, volume: 3e6, avgVolume: 2e6, netInflow: -3e7 },
    { name: '半导体', change1d: 1, change5d: 3, change20d: 5, volume: 1e6, avgVolume: 1.2e6, netInflow: 1e7 },
    { name: '银行', change1d: 0.5, change5d: 1, change20d: 2, volume: 5e5, avgVolume: 8e5, netInflow: 0 },
  ];

  it('应该计算动量评分', () => {
    const momentum = calcMomentum(sectors[0]);
    expect(typeof momentum).toBe('number');
    expect(Number.isFinite(momentum)).toBe(true);
  });

  it('应该区分强势和弱势板块', () => {
    const baijiu = calcMomentum(sectors[0]);
    const energy = calcMomentum(sectors[1]);
    expect(baijiu).toBeGreaterThan(energy);
  });

  it('应该分类板块阶段', () => {
    expect(classifyPhase(sectors[0])).toBe('主升');
    expect(['吸筹', '下跌', '派发']).toContain(classifyPhase(sectors[1]));
  });

  it('应该排序板块', () => {
    const ranked = rankSectors(sectors);
    expect(ranked[0].name).toBe('白酒');
    expect(ranked[ranked.length - 1].name).toBe('新能源');
  });

  it('应该识别资金流入板块', () => {
    const inflow = sectors.filter(s => s.netInflow > 0);
    expect(inflow.map(s => s.name)).toContain('白酒');
  });

  it('应该处理零数据板块', () => {
    const empty: SectorData = { name: '测试', change1d: 0, change5d: 0, change20d: 0, volume: 0, avgVolume: 0, netInflow: 0 };
    expect(calcMomentum(empty)).toBeDefined();
    expect(classifyPhase(empty)).toBeDefined();
  });
});
