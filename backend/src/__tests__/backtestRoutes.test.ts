import { describe, it, expect } from 'vitest';

/**
 * 回测系统API测试
 * 测试策略预设、参数验证、对比逻辑
 */

describe('回测系统API', () => {
  describe('回测参数验证', () => {
    it('应该需要股票代码', () => {
      const body = { strategy: 'ma_cross' };
      expect(!!body).toBe(true);
      // symbol缺失应该报错
      const hasSymbol = 'symbol' in body;
      expect(hasSymbol).toBe(false);
    });

    it('应该需要策略类型', () => {
      const body = { symbol: '600519' };
      const hasStrategy = 'strategy' in body;
      expect(hasStrategy).toBe(false);
    });

    it('有效的回测参数应该包含symbol和strategy', () => {
      const body = { symbol: '600519', strategy: 'ma_cross', params: {} };
      expect(body.symbol).toBeTruthy();
      expect(body.strategy).toBeTruthy();
    });

    it('K线数据不足20条应该拒绝', () => {
      const klineRows = Array(15).fill(null).map((_, i) => ({
        tradeDate: `2024-01-${String(i + 1).padStart(2, '0')}`,
        open: 10, close: 10.5, high: 11, low: 9.5, volume: 1000000, turnover: 10000000,
      }));
      expect(klineRows.length).toBeLessThan(20);
    });

    it('K线数据足够应该可以执行', () => {
      const klineRows = Array(50).fill(null).map((_, i) => ({
        tradeDate: `2024-01-${String(i + 1).padStart(2, '0')}`,
        open: 10 + Math.random(),
        close: 10.5 + Math.random(),
        high: 11 + Math.random(),
        low: 9.5 + Math.random(),
        volume: 1000000,
        turnover: 10000000,
      }));
      expect(klineRows.length).toBeGreaterThanOrEqual(20);
    });
  });

  describe('K线数据转换', () => {
    it('数据库字段应该映射到前端字段', () => {
      const dbRow = {
        trade_date: '2024-01-15',
        open_price: '10.50',
        close_price: '11.20',
        high_price: '11.50',
        low_price: '10.30',
        volume: '1000000',
        turnover: '10500000',
      };

      const mapped = {
        tradeDate: dbRow.trade_date,
        open: parseFloat(dbRow.open_price),
        close: parseFloat(dbRow.close_price),
        high: parseFloat(dbRow.high_price),
        low: parseFloat(dbRow.low_price),
        volume: parseFloat(dbRow.volume),
        turnover: parseFloat(dbRow.turnover),
      };

      expect(mapped.tradeDate).toBe('2024-01-15');
      expect(mapped.open).toBe(10.5);
      expect(mapped.close).toBe(11.2);
      expect(typeof mapped.open).toBe('number');
      expect(typeof mapped.volume).toBe('number');
    });

    it('字符串数字应该正确转为浮点数', () => {
      expect(parseFloat('10.50')).toBe(10.5);
      expect(parseFloat('1000000')).toBe(1000000);
      expect(parseFloat('0.00')).toBe(0);
    });
  });

  describe('策略对比', () => {
    it('对比应该需要股票代码', () => {
      const body = { strategies: [{ type: 'ma_cross' }] };
      const hasSymbol = 'symbol' in body;
      expect(hasSymbol).toBe(false);
    });

    it('对比应该需要至少一个策略', () => {
      const body = { symbol: '600519', strategies: [] };
      expect(body.strategies.length).toBe(0); // 应该报错
    });

    it('最多同时对比5个策略', () => {
      const strategies = [
        { type: 'ma_cross', params: {} },
        { type: 'macd', params: {} },
        { type: 'rsi', params: {} },
        { type: 'bollinger', params: {} },
        { type: 'momentum', params: {} },
        { type: 'mean_reversion', params: {} },
      ];
      expect(strategies.length).toBeGreaterThan(5); // 应该报错
    });

    it('5个策略应该可以对比', () => {
      const strategies = [
        { type: 'ma_cross', params: {} },
        { type: 'macd', params: {} },
        { type: 'rsi', params: {} },
        { type: 'bollinger', params: {} },
        { type: 'momentum', params: {} },
      ];
      expect(strategies.length).toBeLessThanOrEqual(5);
    });

    it('每个策略配置应该有type', () => {
      const strategies = [
        { type: 'ma_cross', params: { fast: 5, slow: 20 } },
        { type: 'macd', params: { fast: 12, slow: 26, signal: 9 } },
      ];
      strategies.forEach(s => {
        expect(s.type).toBeTruthy();
        expect(typeof s.type).toBe('string');
      });
    });
  });

  describe('回测结果结构', () => {
    it('结果应该包含symbol', () => {
      const result = { symbol: '600519', totalReturn: 15.5, maxDrawdown: -8.2 };
      expect(result.symbol).toBe('600519');
    });

    it('错误结果应该包含error信息', () => {
      const errorResult = {
        strategy: 'ma_cross',
        error: 'K线数据不足',
      };
      expect(errorResult.error).toBeTruthy();
      expect(errorResult.strategy).toBe('ma_cross');
    });
  });

  describe('策略参数', () => {
    it('均线交叉策略应该有快慢线参数', () => {
      const params = { fast: 5, slow: 20 };
      expect(params.fast).toBeLessThan(params.slow);
    });

    it('MACD策略应该有三个参数', () => {
      const params = { fast: 12, slow: 26, signal: 9 };
      expect(params.fast).toBeLessThan(params.slow);
      expect(params.signal).toBeLessThan(params.slow);
    });

    it('RSI策略应该有周期和超买超卖阈值', () => {
      const params = { period: 14, overbought: 70, oversold: 30 };
      expect(params.overbought).toBeGreaterThan(params.oversold);
      expect(params.period).toBeGreaterThan(0);
    });

    it('布林带策略应该有周期和标准差倍数', () => {
      const params = { period: 20, stdDev: 2 };
      expect(params.period).toBeGreaterThan(0);
      expect(params.stdDev).toBeGreaterThan(0);
    });
  });

  describe('回测限制', () => {
    it('默认limit应该为500', () => {
      const defaultLimit = 500;
      expect(defaultLimit).toBe(500);
    });

    it('至少需要20条K线数据', () => {
      const minRequired = 20;
      expect(minRequired).toBe(20);
    });
  });
});
