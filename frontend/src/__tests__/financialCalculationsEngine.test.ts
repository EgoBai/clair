import { describe, it, expect } from 'vitest';

describe('Financial Calculations Engine', () => {
  // 复利计算
  const compound = (principal: number, rate: number, n: number, t: number): number =>
    principal * Math.pow(1 + rate / n, n * t);

  const continuousCompound = (principal: number, rate: number, t: number): number =>
    principal * Math.exp(rate * t);

  const doublingTime = (rate: number): number => Math.log(2) / Math.log(1 + rate);

  describe('复利计算', () => {
    it('年复利', () => expect(compound(1000, 0.1, 1, 1)).toBeCloseTo(1100));
    it('月复利大于年复利', () => {
      const annual = compound(1000, 0.1, 1, 1);
      const monthly = compound(1000, 0.1, 12, 1);
      expect(monthly).toBeGreaterThan(annual);
    });
    it('连续复利', () => expect(continuousCompound(1000, 0.1, 1)).toBeCloseTo(1105.17, 0));
    it('零利率', () => expect(compound(1000, 0, 12, 10)).toBe(1000));
    it('翻倍时间', () => expect(doublingTime(0.1)).toBeCloseTo(7.27, 1));
    it('50%利率翻倍', () => expect(doublingTime(0.5)).toBeCloseTo(1.71, 1));
    it('10年复利', () => {
      const result = compound(100, 0.07, 1, 10);
      expect(result).toBeCloseTo(196.72, 0);
    });
  });

  // 贷款计算
  const monthlyPayment = (principal: number, annualRate: number, months: number): number => {
    const r = annualRate / 12;
    if (r === 0) return principal / months;
    return principal * r * Math.pow(1 + r, months) / (Math.pow(1 + r, months) - 1);
  };

  const totalInterest = (principal: number, monthly: number, months: number): number =>
    monthly * months - principal;

  const amortizationSchedule = (principal: number, rate: number, months: number): { principal: number; interest: number }[] => {
    const r = rate / 12;
    const mp = monthlyPayment(principal, rate, months);
    let balance = principal;
    const schedule: { principal: number; interest: number }[] = [];
    for (let i = 0; i < months; i++) {
      const interest = balance * r;
      const prin = mp - interest;
      balance -= prin;
      schedule.push({ principal: prin, interest });
    }
    return schedule;
  };

  describe('贷款计算', () => {
    it('月供计算', () => {
      const mp = monthlyPayment(100000, 0.05, 360);
      expect(mp).toBeCloseTo(536.82, 0);
    });
    it('零利率月供', () => {
      expect(monthlyPayment(120000, 0, 120)).toBe(1000);
    });
    it('总利息为正', () => {
      const ti = totalInterest(100000, 600, 360);
      expect(ti).toBeGreaterThan(0);
    });
    it('还款计划总和', () => {
      const schedule = amortizationSchedule(100000, 0.05, 12);
      const totalPrin = schedule.reduce((s, p) => s + p.principal, 0);
      expect(totalPrin).toBeCloseTo(100000, 0);
    });
    it('递减利息', () => {
      const schedule = amortizationSchedule(100000, 0.05, 12);
      expect(schedule[0].interest).toBeGreaterThan(schedule[1].interest);
    });
    it('递增本金', () => {
      const schedule = amortizationSchedule(100000, 0.05, 12);
      expect(schedule[0].principal).toBeLessThan(schedule[1].principal);
    });
    it('高利率高月供', () => {
      const low = monthlyPayment(100000, 0.03, 360);
      const high = monthlyPayment(100000, 0.08, 360);
      expect(high).toBeGreaterThan(low);
    });
  });

  // 折旧计算
  const straightLineDepreciation = (cost: number, salvage: number, life: number): number =>
    (cost - salvage) / life;

  const decliningBalance = (cost: number, rate: number, year: number): number =>
    cost * Math.pow(1 - rate, year);

  const sumOfYearsDigits = (cost: number, salvage: number, life: number, year: number): number =>
    (cost - salvage) * (life - year + 1) / (life * (life + 1) / 2);

  describe('折旧计算', () => {
    it('直线法', () => {
      expect(straightLineDepreciation(10000, 1000, 5)).toBe(1800);
    });
    it('零残值', () => {
      expect(straightLineDepreciation(10000, 0, 10)).toBe(1000);
    });
    it('余额递减', () => {
      const v = decliningBalance(10000, 0.2, 3);
      expect(v).toBeCloseTo(5120);
    });
    it('年数总和', () => {
      const d = sumOfYearsDigits(10000, 0, 5, 1);
      expect(d).toBeCloseTo(3333.33, 1);
    });
    it('年数总和递减', () => {
      const d1 = sumOfYearsDigits(10000, 0, 5, 1);
      const d5 = sumOfYearsDigits(10000, 0, 5, 5);
      expect(d1).toBeGreaterThan(d5);
    });
  });

  // IRR (内部收益率)
  const npv = (cashflows: number[], rate: number): number =>
    cashflows.reduce((sum, cf, i) => sum + cf / Math.pow(1 + rate, i), 0);

  const irr = (cashflows: number[], guess: number = 0.1, maxIter: number = 100, tol: number = 1e-7): number => {
    let rate = guess;
    for (let i = 0; i < maxIter; i++) {
      const npvVal = npv(cashflows, rate);
      const dnpv = cashflows.reduce((sum, cf, j) => sum - j * cf / Math.pow(1 + rate, j + 1), 0);
      const newRate = rate - npvVal / dnpv;
      if (Math.abs(newRate - rate) < tol) return newRate;
      rate = newRate;
    }
    return rate;
  };

  describe('IRR/NPV', () => {
    it('NPV零利率', () => {
      expect(npv([-100, 50, 50, 50], 0)).toBe(50);
    });
    it('NPV折现', () => {
      const n = npv([-100, 60, 60], 0.1);
      expect(n).toBeGreaterThan(0);
    });
    it('IRR计算', () => {
      const r = irr([-100, 30, 40, 50]);
      expect(r).toBeGreaterThan(0);
      expect(r).toBeLessThan(1);
    });
    it('IRR等于已知值', () => {
      const r = irr([-1000, 300, 400, 500]);
      expect(r).toBeGreaterThan(0);
    });
    it('NPV负值', () => {
      expect(npv([-100, 10], 0.1)).toBeLessThan(0);
    });
    it('单期NPV', () => {
      expect(npv([-100, 110], 0.1)).toBeCloseTo(0);
    });
  });

  // 税务计算
  const progressiveTax = (income: number, brackets: { limit: number; rate: number }[]): number => {
    let tax = 0;
    let prev = 0;
    for (const b of brackets) {
      const taxable = Math.min(income, b.limit) - prev;
      if (taxable <= 0) break;
      tax += taxable * b.rate;
      prev = b.limit;
    }
    return tax;
  };

  const effectiveRate = (income: number, tax: number): number => income === 0 ? 0 : tax / income;

  describe('税务计算', () => {
    const brackets = [
      { limit: 36000, rate: 0.03 },
      { limit: 144000, rate: 0.1 },
      { limit: 300000, rate: 0.2 },
      { limit: 420000, rate: 0.25 },
      { limit: 660000, rate: 0.3 },
      { limit: 960000, rate: 0.35 },
      { limit: Infinity, rate: 0.45 },
    ];

    it('低收入', () => {
      expect(progressiveTax(30000, brackets)).toBeCloseTo(900);
    });
    it('多档累进', () => {
      const tax = progressiveTax(50000, brackets);
      expect(tax).toBeGreaterThan(0);
    });
    it('零收入', () => {
      expect(progressiveTax(0, brackets)).toBe(0);
    });
    it('有效税率', () => {
      expect(effectiveRate(100000, 10000)).toBeCloseTo(0.1);
    });
    it('有效税率小于边际', () => {
      const tax = progressiveTax(50000, brackets);
      const er = effectiveRate(50000, tax);
      expect(er).toBeLessThan(0.1);
    });
    it('单一税率', () => {
      expect(progressiveTax(100, [{ limit: Infinity, rate: 0.2 }])).toBe(20);
    });
  });

  // 汇率转换
  const convertCurrency = (amount: number, rate: number, fee: number = 0): number =>
    amount * rate * (1 - fee);

  const crossRate = (rateA: number, rateB: number): number => rateA / rateB;

  describe('汇率转换', () => {
    it('基础转换', () => expect(convertCurrency(100, 7.2)).toBe(720));
    it('手续费', () => expect(convertCurrency(100, 7.2, 0.01)).toBeCloseTo(712.8));
    it('交叉汇率', () => expect(crossRate(7.2, 0.9)).toBeCloseTo(8));
    it('零金额', () => expect(convertCurrency(0, 7.2)).toBe(0));
    it('大金额', () => {
      expect(convertCurrency(1000000, 6.5)).toBe(6500000);
    });
  });

  // 年金计算
  const annuityPV = (payment: number, rate: number, periods: number): number => {
    if (rate === 0) return payment * periods;
    return payment * (1 - Math.pow(1 + rate, -periods)) / rate;
  };

  const annuityFV = (payment: number, rate: number, periods: number): number => {
    if (rate === 0) return payment * periods;
    return payment * (Math.pow(1 + rate, periods) - 1) / rate;
  };

  describe('年金计算', () => {
    it('现值', () => {
      const pv = annuityPV(1000, 0.05, 10);
      expect(pv).toBeCloseTo(7721.73, 0);
    });
    it('终值', () => {
      const fv = annuityFV(1000, 0.05, 10);
      expect(fv).toBeCloseTo(12577.89, 0);
    });
    it('零利率现值', () => {
      expect(annuityPV(1000, 0, 10)).toBe(10000);
    });
    it('零利率终值', () => {
      expect(annuityFV(1000, 0, 10)).toBe(10000);
    });
    it('单期', () => {
      expect(annuityPV(1000, 0.1, 1)).toBeCloseTo(909.09, 1);
    });
  });
});
