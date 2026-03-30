import { describe, it, expect } from 'vitest';

// 财务报表生成器
function generateBalanceSheet(overrides: Record<string, number> = {}) {
  const defaults = {
    totalAssets: 100000, currentAssets: 40000, fixedAssets: 60000,
    totalLiabilities: 60000, currentLiabilities: 25000, longTermLiabilities: 35000,
    equity: 40000, retainedEarnings: 15000, inventory: 8000,
    accountsReceivable: 12000, cash: 20000,
  };
  return { ...defaults, ...overrides };
}

function generateIncomeStatement(overrides: Record<string, number> = {}) {
  const defaults = {
    revenue: 50000, costOfGoodsSold: 30000, grossProfit: 20000,
    operatingExpenses: 10000, operatingIncome: 10000,
    interestExpense: 1000, incomeBeforeTax: 9000,
    taxExpense: 2250, netIncome: 6750,
    eps: 0.675, shares: 10000,
  };
  return { ...defaults, ...overrides };
}

function generateCashFlow(overrides: Record<string, number> = {}) {
  const defaults = {
    operatingCashFlow: 8000, investingCashFlow: -3000,
    financingCashFlow: -2000, netCashFlow: 3000,
    capitalExpenditure: 3000, freeCashFlow: 5000,
    dividendPaid: 1000,
  };
  return { ...defaults, ...overrides };
}

// 财务比率计算
function calcProfitability(income: ReturnType<typeof generateIncomeStatement>) {
  const grossMargin = income.revenue > 0 ? income.grossProfit / income.revenue : 0;
  const operatingMargin = income.revenue > 0 ? income.operatingIncome / income.revenue : 0;
  const netMargin = income.revenue > 0 ? income.netIncome / income.revenue : 0;
  return {
    grossMargin: +grossMargin.toFixed(4),
    operatingMargin: +operatingMargin.toFixed(4),
    netMargin: +netMargin.toFixed(4),
  };
}

function calcLiquidity(balance: ReturnType<typeof generateBalanceSheet>) {
  const currentRatio = balance.currentLiabilities > 0
    ? balance.currentAssets / balance.currentLiabilities : Infinity;
  const quickRatio = balance.currentLiabilities > 0
    ? (balance.currentAssets - balance.inventory) / balance.currentLiabilities : Infinity;
  const cashRatio = balance.currentLiabilities > 0
    ? balance.cash / balance.currentLiabilities : Infinity;
  return {
    currentRatio: +currentRatio.toFixed(4),
    quickRatio: +quickRatio.toFixed(4),
    cashRatio: +cashRatio.toFixed(4),
  };
}

function calcEfficiency(income: ReturnType<typeof generateIncomeStatement>, balance: ReturnType<typeof generateBalanceSheet>) {
  const assetTurnover = balance.totalAssets > 0 ? income.revenue / balance.totalAssets : 0;
  const inventoryTurnover = balance.inventory > 0 ? income.costOfGoodsSold / balance.inventory : 0;
  const receivableTurnover = balance.accountsReceivable > 0 ? income.revenue / balance.accountsReceivable : 0;
  return {
    assetTurnover: +assetTurnover.toFixed(4),
    inventoryTurnover: +inventoryTurnover.toFixed(4),
    receivableTurnover: +receivableTurnover.toFixed(4),
  };
}

function calcDuPont(income: ReturnType<typeof generateIncomeStatement>, balance: ReturnType<typeof generateBalanceSheet>) {
  const netMargin = income.revenue > 0 ? income.netIncome / income.revenue : 0;
  const assetTurnover = balance.totalAssets > 0 ? income.revenue / balance.totalAssets : 0;
  const equityMultiplier = balance.equity > 0 ? balance.totalAssets / balance.equity : 0;
  const roe = netMargin * assetTurnover * equityMultiplier;
  const roa = netMargin * assetTurnover;
  return {
    netMargin: +netMargin.toFixed(4),
    assetTurnover: +assetTurnover.toFixed(4),
    equityMultiplier: +equityMultiplier.toFixed(4),
    roe: +roe.toFixed(4),
    roa: +roa.toFixed(4),
  };
}

function validateFinancialConsistency(
  balance: ReturnType<typeof generateBalanceSheet>,
  income: ReturnType<typeof generateIncomeStatement>,
  cashFlow: ReturnType<typeof generateCashFlow>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  // A = L + E
  if (Math.abs(balance.totalAssets - (balance.totalLiabilities + balance.equity)) > 1) {
    errors.push('资产不等于负债加权益');
  }
  // Net income should be reasonable
  if (income.netIncome > income.revenue) {
    errors.push('净利润大于营收');
  }
  // Gross profit check
  if (income.grossProfit !== income.revenue - income.costOfGoodsSold) {
    errors.push('毛利计算错误');
  }
  // Cash flow total
  const calcNet = cashFlow.operatingCashFlow + cashFlow.investingCashFlow + cashFlow.financingCashFlow;
  if (Math.abs(calcNet - cashFlow.netCashFlow) > 1) {
    errors.push('现金流汇总不一致');
  }
  // FCF = OCF - CapEx
  if (Math.abs(cashFlow.freeCashFlow - (cashFlow.operatingCashFlow - cashFlow.capitalExpenditure)) > 1) {
    errors.push('自由现金流计算错误');
  }
  return { valid: errors.length === 0, errors };
}

describe('财务报表分析引擎', () => {
  describe('报表生成', () => {
    it('资产负债表默认字段完整', () => {
      const bs = generateBalanceSheet();
      expect(bs.totalAssets).toBe(100000);
      expect(bs.equity).toBe(40000);
      expect(bs.currentAssets).toBe(40000);
    });

    it('资产负债表可覆盖', () => {
      const bs = generateBalanceSheet({ totalAssets: 200000 });
      expect(bs.totalAssets).toBe(200000);
      expect(bs.equity).toBe(40000); // default preserved
    });

    it('利润表默认值', () => {
      const inc = generateIncomeStatement();
      expect(inc.revenue).toBe(50000);
      expect(inc.netIncome).toBe(6750);
    });

    it('现金流默认值', () => {
      const cf = generateCashFlow();
      expect(cf.netCashFlow).toBe(3000);
      expect(cf.freeCashFlow).toBe(5000);
    });
  });

  describe('盈利能力', () => {
    it('毛利率正确', () => {
      const p = calcProfitability(generateIncomeStatement());
      expect(p.grossMargin).toBe(0.4);
    });

    it('营业利润率正确', () => {
      const p = calcProfitability(generateIncomeStatement());
      expect(p.operatingMargin).toBe(0.2);
    });

    it('净利率正确', () => {
      const p = calcProfitability(generateIncomeStatement());
      expect(p.netMargin).toBe(0.135);
    });

    it('零营收返回零', () => {
      const p = calcProfitability(generateIncomeStatement({ revenue: 0 }));
      expect(p.grossMargin).toBe(0);
    });

    it('毛利率>=净利率', () => {
      const p = calcProfitability(generateIncomeStatement());
      expect(p.grossMargin).toBeGreaterThanOrEqual(p.netMargin);
    });

    it('亏损公司净利率为负', () => {
      const p = calcProfitability(generateIncomeStatement({ netIncome: -1000 }));
      expect(p.netMargin).toBeLessThan(0);
    });
  });

  describe('流动性', () => {
    it('流动比率正确', () => {
      const l = calcLiquidity(generateBalanceSheet());
      expect(l.currentRatio).toBe(1.6);
    });

    it('速动比率排除存货', () => {
      const l = calcLiquidity(generateBalanceSheet());
      expect(l.quickRatio).toBeLessThan(l.currentRatio);
    });

    it('现金比率最低', () => {
      const l = calcLiquidity(generateBalanceSheet());
      expect(l.cashRatio).toBeLessThan(l.quickRatio);
    });

    it('零负债返回Infinity', () => {
      const l = calcLiquidity(generateBalanceSheet({ currentLiabilities: 0 }));
      expect(l.currentRatio).toBe(Infinity);
    });

    it('健康公司流动比率>1', () => {
      const l = calcLiquidity(generateBalanceSheet());
      expect(l.currentRatio).toBeGreaterThan(1);
    });
  });

  describe('营运效率', () => {
    it('资产周转率正确', () => {
      const e = calcEfficiency(generateIncomeStatement(), generateBalanceSheet());
      expect(e.assetTurnover).toBe(0.5);
    });

    it('零资产返回0', () => {
      const e = calcEfficiency(generateIncomeStatement(), generateBalanceSheet({ totalAssets: 0 }));
      expect(e.assetTurnover).toBe(0);
    });

    it('零存货返回0', () => {
      const e = calcEfficiency(generateIncomeStatement(), generateBalanceSheet({ inventory: 0 }));
      expect(e.inventoryTurnover).toBe(0);
    });

    it('存货周转率正确', () => {
      const e = calcEfficiency(generateIncomeStatement(), generateBalanceSheet());
      expect(e.inventoryTurnover).toBe(3.75);
    });
  });

  describe('杜邦分析', () => {
    it('ROE = 净利率 × 资产周转率 × 权益乘数', () => {
      const dp = calcDuPont(generateIncomeStatement(), generateBalanceSheet());
      const manual = dp.netMargin * dp.assetTurnover * dp.equityMultiplier;
      expect(dp.roe).toBeCloseTo(manual, 4);
    });

    it('ROA = 净利率 × 资产周转率', () => {
      const dp = calcDuPont(generateIncomeStatement(), generateBalanceSheet());
      const manual = dp.netMargin * dp.assetTurnover;
      expect(dp.roa).toBeCloseTo(manual, 4);
    });

    it('零权益返回零ROE', () => {
      const dp = calcDuPont(generateIncomeStatement(), generateBalanceSheet({ equity: 0 }));
      expect(dp.roe).toBe(0);
    });

    it('高杠杆提升ROE', () => {
      const normal = calcDuPont(generateIncomeStatement(), generateBalanceSheet());
      const leveraged = calcDuPont(generateIncomeStatement(), generateBalanceSheet({ equity: 10000 }));
      expect(leveraged.roe).toBeGreaterThan(normal.roe);
    });
  });

  describe('财务一致性验证', () => {
    it('标准报表通过验证', () => {
      const r = validateFinancialConsistency(
        generateBalanceSheet(), generateIncomeStatement(), generateCashFlow()
      );
      expect(r.valid).toBe(true);
      expect(r.errors).toHaveLength(0);
    });

    it('资产不平衡被检出', () => {
      const r = validateFinancialConsistency(
        generateBalanceSheet({ totalAssets: 90000 }), generateIncomeStatement(), generateCashFlow()
      );
      expect(r.valid).toBe(false);
      expect(r.errors).toContain('资产不等于负债加权益');
    });

    it('净利润>营收被检出', () => {
      const r = validateFinancialConsistency(
        generateBalanceSheet(),
        generateIncomeStatement({ netIncome: 60000 }),
        generateCashFlow()
      );
      expect(r.valid).toBe(false);
    });

    it('现金流不一致被检出', () => {
      const r = validateFinancialConsistency(
        generateBalanceSheet(), generateIncomeStatement(),
        generateCashFlow({ netCashFlow: 99999 })
      );
      expect(r.valid).toBe(false);
    });

    it('自由现金流错误被检出', () => {
      const r = validateFinancialConsistency(
        generateBalanceSheet(), generateIncomeStatement(),
        generateCashFlow({ freeCashFlow: 999 })
      );
      expect(r.valid).toBe(false);
    });

    it('多错误同时收集', () => {
      const r = validateFinancialConsistency(
        generateBalanceSheet({ totalAssets: 1 }),
        generateIncomeStatement({ grossProfit: 99999 }),
        generateCashFlow({ netCashFlow: 1, freeCashFlow: 1 })
      );
      expect(r.errors.length).toBeGreaterThanOrEqual(2);
    });
  });
});
