import { describe, it, expect } from 'vitest';

// 交易系统测试
describe('交易系统引擎', () => {
  // 订单管理系统
  describe('订单管理', () => {
    type OrderType = 'market' | 'limit' | 'stop' | 'stop_limit';
    type OrderSide = 'buy' | 'sell';
    type OrderStatus = 'pending' | 'filled' | 'cancelled' | 'partial';

    interface Order {
      id: string;
      symbol: string;
      type: OrderType;
      side: OrderSide;
      price: number;
      quantity: number;
      filledQty: number;
      status: OrderStatus;
      timestamp: number;
    }

    function createOrder(symbol: string, type: OrderType, side: OrderSide, price: number, quantity: number): Order {
      return { id: `${Date.now()}-${Math.random()}`, symbol, type, side, price, quantity, filledQty: 0, status: 'pending', timestamp: Date.now() };
    }

    function fillOrder(order: Order, fillQty: number, fillPrice: number): Order {
      const newFilled = Math.min(order.filledQty + fillQty, order.quantity);
      return { ...order, filledQty: newFilled, status: newFilled >= order.quantity ? 'filled' : 'partial', price: fillPrice };
    }

    function cancelOrder(order: Order): Order {
      if (order.status === 'filled') return order;
      return { ...order, status: 'cancelled' };
    }

    function getOrderValue(order: Order): number {
      return order.price * order.filledQty;
    }

    it('应创建有效订单', () => {
      const order = createOrder('600519', 'limit', 'buy', 1800, 100);
      expect(order.status).toBe('pending');
      expect(order.filledQty).toBe(0);
      expect(order.quantity).toBe(100);
    });

    it('应填充订单', () => {
      const order = createOrder('600519', 'limit', 'buy', 1800, 100);
      const filled = fillOrder(order, 50, 1800);
      expect(filled.status).toBe('partial');
      expect(filled.filledQty).toBe(50);
    });

    it('完全填充应标记为filled', () => {
      const order = createOrder('600519', 'limit', 'buy', 1800, 100);
      const filled = fillOrder(order, 100, 1800);
      expect(filled.status).toBe('filled');
      expect(filled.filledQty).toBe(100);
    });

    it('过度填充应限制', () => {
      const order = createOrder('600519', 'limit', 'buy', 1800, 100);
      const filled = fillOrder(order, 200, 1800);
      expect(filled.filledQty).toBe(100);
    });

    it('应取消未完成订单', () => {
      const order = createOrder('600519', 'limit', 'buy', 1800, 100);
      const cancelled = cancelOrder(order);
      expect(cancelled.status).toBe('cancelled');
    });

    it('已完成订单不可取消', () => {
      const order = createOrder('600519', 'limit', 'buy', 1800, 100);
      const filled = fillOrder(order, 100, 1800);
      const cancelled = cancelOrder(filled);
      expect(cancelled.status).toBe('filled');
    });

    it('应计算订单价值', () => {
      const order = { ...createOrder('600519', 'limit', 'buy', 1800, 100), filledQty: 50 };
      expect(getOrderValue(order)).toBe(90000);
    });

    it('批量订单类型应正确', () => {
      const types: OrderType[] = ['market', 'limit', 'stop', 'stop_limit'];
      types.forEach(type => {
        const order = createOrder('TEST', type, 'buy', 100, 10);
        expect(order.type).toBe(type);
      });
    });

    it('买卖方向应正确', () => {
      expect(createOrder('T', 'limit', 'buy', 100, 10).side).toBe('buy');
      expect(createOrder('T', 'limit', 'sell', 100, 10).side).toBe('sell');
    });
  });

  // 委托撮合引擎
  describe('委托撮合', () => {
    interface OrderBookEntry { price: number; quantity: number; side: 'buy' | 'sell'; }

    function matchOrders(buys: OrderBookEntry[], sells: OrderBookEntry[]): { price: number; quantity: number }[] {
      const trades: { price: number; quantity: number }[] = [];
      const sortedBuys = [...buys].sort((a, b) => b.price - a.price);
      const sortedSells = [...sells].sort((a, b) => a.price - b.price);

      let bi = 0, si = 0;
      while (bi < sortedBuys.length && si < sortedSells.length) {
        if (sortedBuys[bi].price >= sortedSells[si].price) {
          const qty = Math.min(sortedBuys[bi].quantity, sortedSells[si].quantity);
          trades.push({ price: sortedSells[si].price, quantity: qty });
          sortedBuys[bi].quantity -= qty;
          sortedSells[si].quantity -= qty;
          if (sortedBuys[bi].quantity === 0) bi++;
          if (sortedSells[si].quantity === 0) si++;
        } else break;
      }
      return trades;
    }

    it('应该撮合匹配的买卖', () => {
      const trades = matchOrders([{ price: 10, quantity: 100, side: 'buy' }], [{ price: 10, quantity: 100, side: 'sell' }]);
      expect(trades).toHaveLength(1);
      expect(trades[0].price).toBe(10);
    });

    it('买价低于卖价不撮合', () => {
      const trades = matchOrders([{ price: 9, quantity: 100, side: 'buy' }], [{ price: 10, quantity: 100, side: 'sell' }]);
      expect(trades).toHaveLength(0);
    });

    it('应部分撮合', () => {
      const trades = matchOrders([{ price: 10, quantity: 50, side: 'buy' }], [{ price: 10, quantity: 100, side: 'sell' }]);
      expect(trades[0].quantity).toBe(50);
    });

    it('多笔订单应按价格优先', () => {
      const trades = matchOrders(
        [{ price: 11, quantity: 50, side: 'buy' }, { price: 10, quantity: 50, side: 'buy' }],
        [{ price: 10, quantity: 100, side: 'sell' }]
      );
      expect(trades.length).toBeGreaterThan(0);
      expect(trades[0].price).toBe(10);
    });

    it('空订单簿返回空', () => {
      expect(matchOrders([], [])).toHaveLength(0);
    });

    it('单边不撮合', () => {
      expect(matchOrders([{ price: 10, quantity: 100, side: 'buy' }], [])).toHaveLength(0);
    });
  });

  // 持仓计算
  describe('持仓管理', () => {
    interface Position { symbol: string; quantity: number; avgCost: number; currentPrice: number; }

    function addPosition(pos: Position | null, qty: number, price: number): Position {
      if (!pos || pos.quantity === 0) return { symbol: '', quantity: qty, avgCost: price, currentPrice: price };
      const totalCost = pos.avgCost * pos.quantity + price * qty;
      const totalQty = pos.quantity + qty;
      return { ...pos, quantity: totalQty, avgCost: totalCost / totalQty };
    }

    function calcPnL(pos: Position): number {
      return (pos.currentPrice - pos.avgCost) * pos.quantity;
    }

    function calcPnLPercent(pos: Position): number {
      return ((pos.currentPrice - pos.avgCost) / pos.avgCost) * 100;
    }

    it('首次建仓应使用买入价', () => {
      const pos = addPosition(null, 100, 50);
      expect(pos.avgCost).toBe(50);
      expect(pos.quantity).toBe(100);
    });

    it('加仓应计算均价', () => {
      let pos = addPosition(null, 100, 50);
      pos = addPosition(pos, 100, 60);
      expect(pos.avgCost).toBe(55);
      expect(pos.quantity).toBe(200);
    });

    it('应计算浮盈', () => {
      const pos: Position = { symbol: 'T', quantity: 100, avgCost: 50, currentPrice: 60 };
      expect(calcPnL(pos)).toBe(1000);
    });

    it('应计算浮亏', () => {
      const pos: Position = { symbol: 'T', quantity: 100, avgCost: 60, currentPrice: 50 };
      expect(calcPnL(pos)).toBe(-1000);
    });

    it('应计算收益率', () => {
      const pos: Position = { symbol: 'T', quantity: 100, avgCost: 50, currentPrice: 60 };
      expect(calcPnLPercent(pos)).toBe(20);
    });

    it('零持仓加仓', () => {
      const pos = { symbol: 'T', quantity: 0, avgCost: 0, currentPrice: 0 };
      const newPos = addPosition(pos, 100, 50);
      expect(newPos.avgCost).toBe(50);
    });

    it('等量加仓均价', () => {
      let pos = addPosition(null, 100, 10);
      pos = addPosition(pos, 100, 20);
      pos = addPosition(pos, 100, 30);
      expect(pos.avgCost).toBeCloseTo(20, 5);
    });
  });

  // 止损止盈
  describe('止损止盈', () => {
    interface StopOrder { type: 'stop_loss' | 'take_profit'; triggerPrice: number; active: boolean; }

    function checkStops(currentPrice: number, stops: StopOrder[]): StopOrder[] {
      return stops.map(s => {
        if (!s.active) return s;
        if (s.type === 'stop_loss' && currentPrice <= s.triggerPrice) return { ...s, active: false };
        if (s.type === 'take_profit' && currentPrice >= s.triggerPrice) return { ...s, active: false };
        return s;
      });
    }

    it('价格低于止损价应触发', () => {
      const stops: StopOrder[] = [{ type: 'stop_loss', triggerPrice: 90, active: true }];
      const result = checkStops(85, stops);
      expect(result[0].active).toBe(false);
    });

    it('价格高于止盈价应触发', () => {
      const stops: StopOrder[] = [{ type: 'take_profit', triggerPrice: 110, active: true }];
      const result = checkStops(115, stops);
      expect(result[0].active).toBe(false);
    });

    it('价格在范围内不触发', () => {
      const stops: StopOrder[] = [
        { type: 'stop_loss', triggerPrice: 90, active: true },
        { type: 'take_profit', triggerPrice: 110, active: true },
      ];
      const result = checkStops(100, stops);
      expect(result.every(s => s.active)).toBe(true);
    });

    it('已触发订单不重复触发', () => {
      const stops: StopOrder[] = [{ type: 'stop_loss', triggerPrice: 90, active: false }];
      const result = checkStops(85, stops);
      expect(result[0].active).toBe(false);
    });

    it('空止损列表返回空', () => {
      expect(checkStops(100, [])).toHaveLength(0);
    });
  });
});

// 风险管理引擎
describe('风险管理引擎', () => {
  describe('VaR计算', () => {
    function calcVaR(returns: number[], confidence: number): number {
      if (returns.length === 0) return 0;
      const sorted = [...returns].sort((a, b) => a - b);
      const idx = Math.floor((1 - confidence) * sorted.length);
      return -sorted[Math.max(0, idx)];
    }

    it('95% VaR应为负值的反数', () => {
      const returns = Array.from({ length: 100 }, (_, i) => (i - 50) / 100);
      const var95 = calcVaR(returns, 0.95);
      expect(var95).toBeGreaterThan(0);
    });

    it('100% VaR应为最大损失', () => {
      const returns = [-0.1, -0.05, 0, 0.05, 0.1];
      expect(calcVaR(returns, 1)).toBe(0.1);
    });

    it('空数据返回零', () => {
      expect(calcVaR([], 0.95)).toBe(0);
    });

    it('更高置信度VaR应更大', () => {
      const returns = Array.from({ length: 100 }, (_, i) => (Math.random() - 0.5) * 0.2);
      expect(calcVaR(returns, 0.99)).toBeGreaterThanOrEqual(calcVaR(returns, 0.95));
    });
  });

  // 仓位管理
  describe('仓位管理', () => {
    function calcPositionSize(capital: number, riskPercent: number, entryPrice: number, stopPrice: number): number {
      const riskAmount = capital * (riskPercent / 100);
      const riskPerShare = Math.abs(entryPrice - stopPrice);
      if (riskPerShare === 0) return 0;
      return Math.floor(riskAmount / riskPerShare / 100) * 100;
    }

    it('应计算合理仓位', () => {
      const qty = calcPositionSize(100000, 2, 50, 48);
      expect(qty).toBeGreaterThan(0);
      expect(qty % 100).toBe(0);
    });

    it('风险越大仓位越大', () => {
      const small = calcPositionSize(100000, 1, 50, 48);
      const large = calcPositionSize(100000, 3, 50, 48);
      expect(large).toBeGreaterThan(small);
    });

    it('止损越近仓位越大', () => {
      const wide = calcPositionSize(100000, 2, 50, 45);
      const tight = calcPositionSize(100000, 2, 50, 49);
      expect(tight).toBeGreaterThan(wide);
    });

    it('零价差返回零', () => {
      expect(calcPositionSize(100000, 2, 50, 50)).toBe(0);
    });

    it('应为100的整数倍', () => {
      const qty = calcPositionSize(500000, 5, 100, 95);
      expect(qty % 100).toBe(0);
    });
  });

  // 组合风险指标
  describe('组合风险', () => {
    interface Holding { weight: number; volatility: number; }

    function portfolioVolatility(holdings: Holding[], correlations: number[][]): number {
      let var_sum = 0;
      for (let i = 0; i < holdings.length; i++) {
        for (let j = 0; j < holdings.length; j++) {
          var_sum += holdings[i].weight * holdings[j].weight * holdings[i].volatility * holdings[j].volatility * (correlations[i]?.[j] ?? (i === j ? 1 : 0));
        }
      }
      return Math.sqrt(Math.max(0, var_sum));
    }

    it('单资产波动率', () => {
      const vol = portfolioVolatility([{ weight: 1, volatility: 0.2 }], [[1]]);
      expect(vol).toBeCloseTo(0.2, 5);
    });

    it('分散化降低波动率', () => {
      const concentrated = portfolioVolatility([{ weight: 1, volatility: 0.3 }], [[1]]);
      const diversified = portfolioVolatility(
        [{ weight: 0.5, volatility: 0.3 }, { weight: 0.5, volatility: 0.3 }],
        [[1, 0], [0, 1]]
      );
      expect(diversified).toBeLessThan(concentrated);
    });

    it('完全正相关波动率最高', () => {
      const vol = portfolioVolatility(
        [{ weight: 0.5, volatility: 0.2 }, { weight: 0.5, volatility: 0.2 }],
        [[1, 1], [1, 1]]
      );
      expect(vol).toBeCloseTo(0.2, 5);
    });

    it('零权重返回零', () => {
      expect(portfolioVolatility([{ weight: 0, volatility: 0.5 }], [[1]])).toBe(0);
    });
  });
});

// 数据源管理
describe('数据源管理', () => {
  describe('数据源优先级', () => {
    interface DataSource { name: string; priority: number; available: boolean; latency: number; }

    function selectSource(sources: DataSource[]): DataSource | null {
      const available = sources.filter(s => s.available);
      if (available.length === 0) return null;
      return available.sort((a, b) => a.priority - b.priority || a.latency - b.latency)[0];
    }

    it('应选择最高优先级', () => {
      const sources: DataSource[] = [
        { name: 'low', priority: 3, available: true, latency: 100 },
        { name: 'high', priority: 1, available: true, latency: 200 },
      ];
      expect(selectSource(sources)?.name).toBe('high');
    });

    it('不可用数据源应跳过', () => {
      const sources: DataSource[] = [
        { name: 'primary', priority: 1, available: false, latency: 50 },
        { name: 'backup', priority: 2, available: true, latency: 100 },
      ];
      expect(selectSource(sources)?.name).toBe('backup');
    });

    it('全部不可用返回null', () => {
      const sources: DataSource[] = [{ name: 'x', priority: 1, available: false, latency: 50 }];
      expect(selectSource(sources)).toBeNull();
    });

    it('同优先级按延迟排序', () => {
      const sources: DataSource[] = [
        { name: 'slow', priority: 1, available: true, latency: 200 },
        { name: 'fast', priority: 1, available: true, latency: 50 },
      ];
      expect(selectSource(sources)?.name).toBe('fast');
    });

    it('空列表返回null', () => {
      expect(selectSource([])).toBeNull();
    });
  });

  // 数据质量检查
  describe('数据质量', () => {
    interface DataQualityResult { score: number; issues: string[]; passed: boolean; }

    function checkDataQuality(data: Record<string, any>[], requiredFields: string[]): DataQualityResult {
      const issues: string[] = [];
      let score = 100;

      if (data.length === 0) return { score: 0, issues: ['空数据集'], passed: false };

      for (const field of requiredFields) {
        const missing = data.filter(d => d[field] === undefined || d[field] === null).length;
        if (missing > 0) {
          issues.push(`${field}: ${missing}条缺失`);
          score -= (missing / data.length) * 20;
        }
      }

      return { score: Math.max(0, Math.round(score)), issues, passed: score >= 80 };
    }

    it('完整数据应满分', () => {
      const result = checkDataQuality([{ a: 1, b: 2 }, { a: 3, b: 4 }], ['a', 'b']);
      expect(result.score).toBe(100);
      expect(result.passed).toBe(true);
    });

    it('缺失字段应扣分', () => {
      const result = checkDataQuality([{ a: 1, b: 2 }, { a: 1 }], ['a', 'b']);
      expect(result.score).toBeLessThan(100);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('空数据集应失败', () => {
      const result = checkDataQuality([], ['a']);
      expect(result.passed).toBe(false);
    });

    it('分数应在0-100之间', () => {
      const data = Array.from({ length: 10 }, () => ({}));
      const result = checkDataQuality(data, ['a', 'b', 'c']);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });
});
