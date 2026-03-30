import { describe, it, expect } from 'vitest';

// ===== 交易系统逻辑测试 =====
describe('Trading System Logic', () => {
  // A股 T+1 规则
  describe('T+1 交易规则', () => {
    const checkTPlus1 = (buyDate: string, sellDate: string): boolean => {
      const buy = new Date(buyDate);
      const sell = new Date(sellDate);
      const diffDays = (sell.getTime() - buy.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays >= 1;
    };

    it('当天不能卖出', () => {
      expect(checkTPlus1('2026-03-20', '2026-03-20')).toBe(false);
    });

    it('次日可以卖出', () => {
      expect(checkTPlus1('2026-03-20', '2026-03-21')).toBe(true);
    });

    it('多日后可以卖出', () => {
      expect(checkTPlus1('2026-03-20', '2026-03-25')).toBe(true);
    });
  });

  // A股涨跌停规则
  describe('涨跌停限制', () => {
    const getLimitPct = (stockCode: string): number => {
      if (stockCode.startsWith('300') || stockCode.startsWith('688')) return 20; // 创业板/科创板
      if (stockCode.startsWith('8') || stockCode.startsWith('4')) return 30; // 北交所
      return 10; // 主板
    };

    const checkLimit = (prevClose: number, currentPrice: number, stockCode: string): 'up_limit' | 'down_limit' | 'normal' => {
      const limitPct = getLimitPct(stockCode) / 100;
      const changePct = (currentPrice - prevClose) / prevClose;
      if (changePct >= limitPct) return 'up_limit';
      if (changePct <= -limitPct) return 'down_limit';
      return 'normal';
    };

    it('主板涨跌停10%', () => {
      expect(getLimitPct('600519')).toBe(10);
      expect(checkLimit(100, 110, '600519')).toBe('up_limit');
      expect(checkLimit(100, 90, '600519')).toBe('down_limit');
    });

    it('创业板涨跌停20%', () => {
      expect(getLimitPct('300750')).toBe(20);
      expect(checkLimit(100, 120, '300750')).toBe('up_limit');
      expect(checkLimit(100, 80, '300750')).toBe('down_limit');
    });

    it('科创板涨跌停20%', () => {
      expect(getLimitPct('688001')).toBe(20);
    });

    it('北交所涨跌停30%', () => {
      expect(getLimitPct('830001')).toBe(30);
      expect(getLimitPct('430001')).toBe(30);
    });

    it('正常涨跌应返回normal', () => {
      expect(checkLimit(100, 105, '600519')).toBe('normal');
    });
  });

  // 手续费计算
  describe('交易手续费', () => {
    const calcFee = (amount: number, type: 'buy' | 'sell'): number => {
      const commission = Math.max(amount * 0.00025, 5); // 万分之2.5，最低5元
      const stampTax = type === 'sell' ? amount * 0.001 : 0; // 卖出千分之一印花税
      const transferFee = amount * 0.00001; // 过户费万分之0.1
      return commission + stampTax + transferFee;
    };

    it('买入手续费不含印花税', () => {
      const buyFee = calcFee(100000, 'buy');
      expect(buyFee).toBeLessThan(100000 * 0.0015);
    });

    it('卖出手续费应含印花税', () => {
      const buyFee = calcFee(100000, 'buy');
      const sellFee = calcFee(100000, 'sell');
      expect(sellFee).toBeGreaterThan(buyFee);
    });

    it('小金额应使用最低佣金', () => {
      const fee = calcFee(1000, 'buy');
      expect(fee).toBeGreaterThanOrEqual(5);
    });

    it('大金额手续费应与金额成正比', () => {
      const fee1 = calcFee(100000, 'sell');
      const fee2 = calcFee(200000, 'sell');
      expect(fee2).toBeCloseTo(fee1 * 2, 0);
    });
  });

  // A股整手交易
  describe('整手交易', () => {
    const roundToLot = (shares: number): number => {
      return Math.floor(shares / 100) * 100;
    };

    const calcLots = (budget: number, price: number): number => {
      return Math.floor(budget / price / 100) * 100;
    };

    it('应向下取整到100的倍数', () => {
      expect(roundToLot(350)).toBe(300);
      expect(roundToLot(299)).toBe(200);
      expect(roundToLot(100)).toBe(100);
    });

    it('0股应返回0', () => {
      expect(roundToLot(0)).toBe(0);
    });

    it('按金额计算手数', () => {
      expect(calcLots(100000, 50)).toBe(2000);
      expect(calcLots(100000, 33)).toBe(3000);
    });

    it('不够一手应返回0', () => {
      expect(calcLots(50, 100)).toBe(0);
    });
  });

  // 涨跌幅计算
  describe('涨跌幅计算', () => {
    const calcChangePct = (current: number, prev: number): number => {
      if (prev === 0) return 0;
      return ((current - prev) / prev) * 100;
    };

    const calcAmplitude = (high: number, low: number, prevClose: number): number => {
      if (prevClose === 0) return 0;
      return ((high - low) / prevClose) * 100;
    };

    it('上涨涨跌幅', () => {
      expect(calcChangePct(110, 100)).toBeCloseTo(10);
    });

    it('下跌涨跌幅', () => {
      expect(calcChangePct(90, 100)).toBeCloseTo(-10);
    });

    it('昨收为0应返回0', () => {
      expect(calcChangePct(100, 0)).toBe(0);
    });

    it('振幅计算', () => {
      expect(calcAmplitude(110, 90, 100)).toBeCloseTo(20);
    });

    it('振幅应≥涨跌幅绝对值', () => {
      expect(calcAmplitude(110, 95, 100)).toBeGreaterThanOrEqual(Math.abs(calcChangePct(105, 100)));
    });
  });

  // 股票代码验证
  describe('股票代码格式', () => {
    const validateCode = (code: string): boolean => {
      return /^(sh|sz|bj)?(600|601|603|605|000|001|002|003|300|688|8|4)\d{3,4}$/.test(code);
    };

    it('上证主板600xxx', () => {
      expect(validateCode('600519')).toBe(true);
    });

    it('深证主板000xxx', () => {
      expect(validateCode('000858')).toBe(true);
    });

    it('创业板300xxx', () => {
      expect(validateCode('300750')).toBe(true);
    });

    it('科创板688xxx', () => {
      expect(validateCode('688001')).toBe(true);
    });

    it('无效代码', () => {
      expect(validateCode('123456')).toBe(false);
      expect(validateCode('abc')).toBe(false);
    });
  });
});
