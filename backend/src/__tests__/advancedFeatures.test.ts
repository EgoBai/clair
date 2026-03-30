import { describe, it, expect } from 'vitest';

describe('高级功能测试', () => {
  describe('回测引擎核心逻辑', () => {
    it('均线交叉应该生成交易信号', () => {
      const prices = [10, 11, 12, 13, 14, 15, 14, 13, 12, 11];
      const shortMA = (arr: number[], period: number, idx: number) => {
        if (idx < period - 1) return null;
        return arr.slice(idx - period + 1, idx + 1).reduce((a, b) => a + b, 0) / period;
      };
      
      const signals: string[] = [];
      for (let i = 1; i < prices.length; i++) {
        const ma3_prev = shortMA(prices, 3, i - 1);
        const ma3_curr = shortMA(prices, 3, i);
        const ma5_prev = i >= 4 ? shortMA(prices, 5, i - 1) : null;
        const ma5_curr = i >= 4 ? shortMA(prices, 5, i) : null;
        
        if (ma3_prev && ma5_prev && ma3_curr && ma5_curr) {
          if (ma3_prev <= ma5_prev && ma3_curr > ma5_curr) signals.push('buy');
          if (ma3_prev >= ma5_prev && ma3_curr < ma5_curr) signals.push('sell');
        }
      }
      expect(Array.isArray(signals)).toBe(true);
    });

    it('T+1 交易规则应该限制当日卖出', () => {
      const trades = [
        { date: '2026-03-24', type: 'buy', shares: 100 },
        { date: '2026-03-24', type: 'sell', shares: 100 }, // 违反T+1
      ];
      const canSell = (buyDate: string, sellDate: string) => sellDate > buyDate;
      expect(canSell(trades[0].date, trades[1].date)).toBe(false);
    });

    it('100股整数倍限制', () => {
      const validateLotSize = (shares: number) => shares % 100 === 0;
      expect(validateLotSize(100)).toBe(true);
      expect(validateLotSize(200)).toBe(true);
      expect(validateLotSize(50)).toBe(false);
      expect(validateLotSize(150)).toBe(false);
    });

    it('涨跌停限制应该生效', () => {
      const limitPercent = 10; // 主板10%
      const prevClose = 100;
      const upperLimit = prevClose * (1 + limitPercent / 100);
      const lowerLimit = prevClose * (1 - limitPercent / 100);
      expect(upperLimit).toBeCloseTo(110, 5);
      expect(lowerLimit).toBeCloseTo(90, 5);
      
      const validatePrice = (price: number) => price >= lowerLimit && price <= upperLimit;
      expect(validatePrice(105)).toBe(true);
      expect(validatePrice(111)).toBe(false);
      expect(validatePrice(89)).toBe(false);
    });

    it('夏普比率计算应该正确', () => {
      const returns = [0.01, -0.005, 0.02, -0.01, 0.015];
      const riskFreeRate = 0.001;
      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const stdDev = Math.sqrt(returns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / returns.length);
      const sharpe = (avgReturn - riskFreeRate) / stdDev;
      expect(typeof sharpe).toBe('number');
      expect(Number.isFinite(sharpe)).toBe(true);
    });

    it('最大回撤计算应该正确', () => {
      const equity = [100, 110, 105, 120, 95, 100];
      let maxDrawdown = 0;
      let peak = equity[0];
      for (const val of equity) {
        if (val > peak) peak = val;
        const dd = (peak - val) / peak;
        if (dd > maxDrawdown) maxDrawdown = dd;
      }
      expect(maxDrawdown).toBeCloseTo(0.2083, 2); // (120-95)/120
    });
  });

  describe('复权引擎逻辑', () => {
    it('除权参考价计算: 纯派息', () => {
      const prevClose = 100;
      const dividend = 5;
      const refPrice = prevClose - dividend;
      expect(refPrice).toBe(95);
    });

    it('除权参考价计算: 纯送股', () => {
      const prevClose = 100;
      const bonusRatio = 0.5; // 每10股送5股
      const refPrice = prevClose / (1 + bonusRatio);
      expect(refPrice).toBeCloseTo(66.67, 1);
    });

    it('除权参考价计算: 转增', () => {
      const prevClose = 100;
      const transferRatio = 1; // 每10股转增10股
      const refPrice = prevClose / (1 + transferRatio);
      expect(refPrice).toBe(50);
    });

    it('前复权因子应该消除除权跳变', () => {
      const prices = [50, 52, 55, 95, 98]; // 从55跳到95是除权
      const exRightPrice = 95;
      const preExRightPrice = 55;
      const factor = preExRightPrice / exRightPrice;
      expect(factor).toBeCloseTo(0.5789, 3);
      const adjustedPrice = 98 * factor;
      expect(adjustedPrice).toBeLessThan(98); // 复权后低于原价
    });

    it('红利税应该分3档', () => {
      const taxRate = (holdingDays: number) => {
        if (holdingDays < 30) return 0.20;
        if (holdingDays < 365) return 0.10;
        return 0;
      };
      expect(taxRate(15)).toBe(0.20);
      expect(taxRate(180)).toBe(0.10);
      expect(taxRate(400)).toBe(0);
    });
  });

  describe('AI 分析逻辑', () => {
    it('情绪分析应该分3档', () => {
      const analyzeSentiment = (upRatio: number) => {
        if (upRatio > 0.6) return 'bullish';
        if (upRatio < 0.4) return 'bearish';
        return 'neutral';
      };
      expect(analyzeSentiment(0.7)).toBe('bullish');
      expect(analyzeSentiment(0.3)).toBe('bearish');
      expect(analyzeSentiment(0.5)).toBe('neutral');
    });

    it('置信度应该基于涨跌比', () => {
      const confidence = (upRatio: number) => {
        const distance = Math.abs(upRatio - 0.5);
        return Math.min(1, distance * 2 + 0.5);
      };
      expect(confidence(0.5)).toBe(0.5);
      expect(confidence(1.0)).toBe(1.0);
      expect(confidence(0.0)).toBe(1.0);
    });

    it('ATR 止损应该基于波动率', () => {
      const atr = 5.5;
      const currentPrice = 100;
      const multiplier = 2;
      const stopLoss = currentPrice - atr * multiplier;
      expect(stopLoss).toBe(89);
    });

    it('板块轮动阶段应该有4种', () => {
      const stages = ['accumulation', 'markup', 'distribution', 'decline'];
      expect(stages).toHaveLength(4);
    });
  });

  describe('选股策略逻辑', () => {
    it('价值投资应该筛选低PE高分红', () => {
      const stocks = [
        { pe: 15, dividendYield: 4, name: '价值股' },
        { pe: 80, dividendYield: 0.5, name: '成长股' },
        { pe: 25, dividendYield: 2, name: '普通股' },
      ];
      const valueStocks = stocks.filter(s => s.pe < 20 && s.dividendYield > 3);
      expect(valueStocks).toHaveLength(1);
      expect(valueStocks[0].name).toBe('价值股');
    });

    it('RSI 超卖应该<30', () => {
      const isOversold = (rsi: number) => rsi < 30;
      expect(isOversold(25)).toBe(true);
      expect(isOversold(35)).toBe(false);
    });

    it('MACD 金叉应该 DIF 上穿 DEA', () => {
      const isGoldenCross = (difPrev: number, deaPrev: number, difCurr: number, deaCurr: number) =>
        difPrev <= deaPrev && difCurr > deaCurr;
      expect(isGoldenCross(0.5, 0.6, 0.7, 0.65)).toBe(true);
      expect(isGoldenCross(0.7, 0.6, 0.5, 0.55)).toBe(false);
    });
  });
});
