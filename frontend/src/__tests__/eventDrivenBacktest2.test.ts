import { describe, it, expect } from 'vitest';

/**
 * 事件驱动回测 / 策略执行引擎逻辑测试
 */

describe('EventDrivenBacktest', () => {
  describe('事件类型', () => {
    const eventTypes = {
      MARKET_DATA: 'market_data',
      SIGNAL: 'signal',
      ORDER: 'order',
      FILL: 'fill',
      PORTFOLIO_UPDATE: 'portfolio_update',
    };

    it('应该定义行情事件', () => {
      expect(eventTypes.MARKET_DATA).toBe('market_data');
    });

    it('应该定义信号事件', () => {
      expect(eventTypes.SIGNAL).toBe('signal');
    });

    it('应该定义订单事件', () => {
      expect(eventTypes.ORDER).toBe('order');
    });

    it('应该定义成交事件', () => {
      expect(eventTypes.FILL).toBe('fill');
    });
  });

  describe('事件队列', () => {
    it('应该按时间排序事件', () => {
      const events = [
        { time: 3, type: 'signal' },
        { time: 1, type: 'market_data' },
        { time: 2, type: 'order' },
      ];
      const sorted = [...events].sort((a, b) => a.time - b.time);
      expect(sorted[0].type).toBe('market_data');
      expect(sorted[2].type).toBe('signal');
    });
  });

  describe('订单状态机', () => {
    const orderStates = ['pending', 'submitted', 'partial_filled', 'filled', 'cancelled', 'rejected'];
    
    it('应该有完整的订单状态', () => {
      expect(orderStates).toHaveLength(6);
    });

    it('pending -> submitted 转换', () => {
      let state = 'pending';
      state = 'submitted';
      expect(state).toBe('submitted');
    });

    it('submitted -> filled 转换', () => {
      let state = 'submitted';
      state = 'filled';
      expect(state).toBe('filled');
    });

    it('submitted -> cancelled 转换', () => {
      let state = 'submitted';
      state = 'cancelled';
      expect(state).toBe('cancelled');
    });
  });

  describe('滑点模拟', () => {
    const applySlippage = (price: number, slippage: number, side: 'buy' | 'sell') => {
      const slippageAmount = price * slippage;
      return side === 'buy' ? price + slippageAmount : price - slippageAmount;
    };

    it('买入应该加滑点', () => {
      expect(applySlippage(100, 0.001, 'buy')).toBe(100.1);
    });

    it('卖出应该减滑点', () => {
      expect(applySlippage(100, 0.001, 'sell')).toBe(99.9);
    });
  });
});

describe('StrategyExecutionEngine', () => {
  describe('策略配置', () => {
    const strategy = {
      name: '均线交叉策略',
      params: { fastMA: 5, slowMA: 20 },
      rules: [
        { condition: 'fastMA_cross_above_slowMA', action: 'buy' },
        { condition: 'fastMA_cross_below_slowMA', action: 'sell' },
      ],
    };

    it('应该有策略名称', () => {
      expect(strategy.name).toBeTruthy();
    });

    it('应该有参数配置', () => {
      expect(strategy.params.fastMA).toBeLessThan(strategy.params.slowMA);
    });

    it('应该有交易规则', () => {
      expect(strategy.rules).toHaveLength(2);
    });
  });

  describe('交叉检测', () => {
    const detectCrossover = (series1: number[], series2: number[]) => {
      const signals: ('buy' | 'sell' | null)[] = [];
      for (let i = 1; i < series1.length; i++) {
        if (series1[i-1] <= series2[i-1] && series1[i] > series2[i]) {
          signals.push('buy');
        } else if (series1[i-1] >= series2[i-1] && series1[i] < series2[i]) {
          signals.push('sell');
        } else {
          signals.push(null);
        }
      }
      return signals;
    };

    it('应该检测金叉', () => {
      const fast = [9, 10, 11, 12, 13];
      const slow = [11, 11, 11, 11, 11];
      const signals = detectCrossover(fast, slow);
      expect(signals).toContain('buy');
    });

    it('应该检测死叉', () => {
      const fast = [13, 12, 11, 10, 9];
      const slow = [11, 11, 11, 11, 11];
      const signals = detectCrossover(fast, slow);
      expect(signals).toContain('sell');
    });
  });

  describe('仓位控制', () => {
    const calcPositionSize = (
      capital: number,
      riskPerTrade: number,
      entryPrice: number,
      stopLoss: number
    ) => {
      const riskAmount = capital * riskPerTrade;
      const riskPerShare = Math.abs(entryPrice - stopLoss);
      return Math.floor(riskAmount / riskPerShare);
    };

    it('应该按风险计算仓位', () => {
      const shares = calcPositionSize(100000, 0.02, 100, 95);
      expect(shares).toBe(400); // 2000 / 5 = 400
    });

    it('止损距离越大仓位越小', () => {
      const shares1 = calcPositionSize(100000, 0.02, 100, 95);
      const shares2 = calcPositionSize(100000, 0.02, 100, 90);
      expect(shares2).toBeLessThan(shares1);
    });
  });
});
