import { describe, it, expect } from 'vitest';

// 后端数据模型完整性测试

interface StockBasicInfo {
  code: string;
  name: string;
  market: 'SH' | 'SZ' | 'BJ';
  industry: string;
  listingDate: string;
  totalShares: number;
  circulatingShares: number;
}

interface DailyQuote {
  code: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
  amplitude: number;
  changePercent: number;
  turnoverRate: number;
}

interface FinancialReport {
  code: string;
  period: string;
  revenue: number;
  netProfit: number;
  totalAssets: number;
  totalLiabilities: number;
  shareholdersEquity: number;
  operatingCashFlow: number;
  roe: number;
  grossMargin: number;
  netMargin: number;
  debtRatio: number;
}

function validateStockInfo(stock: Partial<StockBasicInfo>): string[] {
  const errors: string[] = [];
  if (!stock.code || !/^[036]\d{5}$/.test(stock.code)) errors.push('股票代码格式错误');
  if (!stock.name || stock.name.length < 2) errors.push('股票名称至少2个字符');
  if (!['SH', 'SZ', 'BJ'].includes(stock.market || '')) errors.push('市场类型无效');
  if (stock.totalShares !== undefined && stock.totalShares <= 0) errors.push('总股本必须为正');
  if (stock.circulatingShares !== undefined && stock.totalShares !== undefined) {
    if (stock.circulatingShares > stock.totalShares) errors.push('流通股不能大于总股本');
  }
  return errors;
}

function validateDailyQuote(quote: Partial<DailyQuote>): string[] {
  const errors: string[] = [];
  if (quote.high !== undefined && quote.low !== undefined && quote.high < quote.low) {
    errors.push('最高价不能低于最低价');
  }
  if (quote.open !== undefined && quote.high !== undefined && quote.low !== undefined) {
    if (quote.open > quote.high || quote.open < quote.low) {
      errors.push('开盘价不在最高/最低价范围内');
    }
  }
  if (quote.close !== undefined && quote.high !== undefined && quote.low !== undefined) {
    if (quote.close > quote.high || quote.close < quote.low) {
      errors.push('收盘价不在最高/最低价范围内');
    }
  }
  if (quote.volume !== undefined && quote.volume < 0) errors.push('成交量不能为负');
  if (quote.turnover !== undefined && quote.turnover < 0) errors.push('成交额不能为负');
  if (quote.amplitude !== undefined && quote.amplitude < 0) errors.push('振幅不能为负');
  if (quote.turnoverRate !== undefined) {
    if (quote.turnoverRate < 0 || quote.turnoverRate > 100) errors.push('换手率应在0-100之间');
  }
  return errors;
}

function validateFinancialReport(report: Partial<FinancialReport>): string[] {
  const errors: string[] = [];
  if (report.totalAssets !== undefined && report.totalLiabilities !== undefined) {
    if (report.totalLiabilities > report.totalAssets) errors.push('负债不能大于资产');
  }
  if (report.totalAssets !== undefined && report.totalLiabilities !== undefined && report.shareholdersEquity !== undefined) {
    const calculatedEquity = report.totalAssets - report.totalLiabilities;
    if (Math.abs(calculatedEquity - report.shareholdersEquity) / report.totalAssets > 0.01) {
      errors.push('资产=负债+权益 校验失败');
    }
  }
  if (report.grossMargin !== undefined && report.netMargin !== undefined) {
    if (report.grossMargin < report.netMargin && report.netMargin > 0) {
      errors.push('毛利率应>=净利率');
    }
  }
  if (report.debtRatio !== undefined) {
    if (report.debtRatio < 0 || report.debtRatio > 100) errors.push('资产负债率应在0-100之间');
  }
  if (report.roe !== undefined) {
    if (report.roe < -100 || report.roe > 100) errors.push('ROE范围异常');
  }
  return errors;
}

function calculateDerivedMetrics(report: FinancialReport): {
  grossProfit: number;
  netAssetPerShare: number;
  debtToEquity: number;
  currentRatio: number;
} {
  const grossProfit = report.revenue * (report.grossMargin / 100);
  const netAssetPerShare = report.shareholdersEquity > 0 ? report.totalAssets / report.shareholdersEquity : 0;
  const debtToEquity = report.shareholdersEquity > 0 ? (report.totalLiabilities / report.shareholdersEquity) * 100 : 0;
  const currentRatio = report.totalLiabilities > 0 ? report.totalAssets / report.totalLiabilities : 0;
  return { grossProfit, netAssetPerShare, debtToEquity, currentRatio };
}

function compareFinancialReports(current: FinancialReport, previous: FinancialReport): {
  revenueGrowth: number;
  profitGrowth: number;
  assetGrowth: number;
  roeChange: number;
} {
  const growth = (curr: number, prev: number) =>
    prev === 0 ? 0 : ((curr - prev) / Math.abs(prev)) * 100;
  
  return {
    revenueGrowth: growth(current.revenue, previous.revenue),
    profitGrowth: growth(current.netProfit, previous.netProfit),
    assetGrowth: growth(current.totalAssets, previous.totalAssets),
    roeChange: current.roe - previous.roe,
  };
}

describe('数据模型完整性', () => {
  describe('股票基本信息验证', () => {
    it('有效信息', () => {
      const errors = validateStockInfo({
        code: '600519', name: '贵州茅台', market: 'SH',
        totalShares: 125600, circulatingShares: 125600,
      });
      expect(errors).toHaveLength(0);
    });

    it('无效代码', () => {
      const errors = validateStockInfo({ code: '123' });
      expect(errors).toContain('股票代码格式错误');
    });

    it('名称太短', () => {
      const errors = validateStockInfo({ code: '600519', name: 'A' });
      expect(errors).toContain('股票名称至少2个字符');
    });

    it('无效市场', () => {
      const errors = validateStockInfo({ code: '600519', name: '茅台', market: 'NYSE' as any });
      expect(errors).toContain('市场类型无效');
    });

    it('总股本为负', () => {
      const errors = validateStockInfo({ code: '600519', name: '茅台', market: 'SH', totalShares: -1 });
      expect(errors).toContain('总股本必须为正');
    });

    it('流通股大于总股本', () => {
      const errors = validateStockInfo({
        code: '600519', name: '茅台', market: 'SH',
        totalShares: 100, circulatingShares: 200,
      });
      expect(errors).toContain('流通股不能大于总股本');
    });
  });

  describe('日线行情验证', () => {
    it('有效行情', () => {
      const errors = validateDailyQuote({
        code: '600519', date: '2024-01-01',
        open: 1800, high: 1850, low: 1790, close: 1840,
        volume: 10000, turnover: 18400000,
        amplitude: 3.33, changePercent: 2.22, turnoverRate: 0.08,
      });
      expect(errors).toHaveLength(0);
    });

    it('最高价低于最低价', () => {
      const errors = validateDailyQuote({ high: 100, low: 200 });
      expect(errors).toContain('最高价不能低于最低价');
    });

    it('开盘价超出范围', () => {
      const errors = validateDailyQuote({ open: 300, high: 200, low: 100 });
      expect(errors).toContain('开盘价不在最高/最低价范围内');
    });

    it('收盘价超出范围', () => {
      const errors = validateDailyQuote({ close: 50, high: 200, low: 100 });
      expect(errors).toContain('收盘价不在最高/最低价范围内');
    });

    it('负成交量', () => {
      const errors = validateDailyQuote({ volume: -1 });
      expect(errors).toContain('成交量不能为负');
    });

    it('换手率超范围', () => {
      const errors = validateDailyQuote({ turnoverRate: 150 });
      expect(errors).toContain('换手率应在0-100之间');
    });
  });

  describe('财务报表验证', () => {
    it('有效报表', () => {
      const errors = validateFinancialReport({
        code: '600519', period: '2024-Q3',
        revenue: 1000, netProfit: 500,
        totalAssets: 3000, totalLiabilities: 1000, shareholdersEquity: 2000,
        operatingCashFlow: 600,
        roe: 25, grossMargin: 90, netMargin: 50, debtRatio: 33.3,
      });
      expect(errors).toHaveLength(0);
    });

    it('负债大于资产', () => {
      const errors = validateFinancialReport({ totalAssets: 100, totalLiabilities: 200 });
      expect(errors).toContain('负债不能大于资产');
    });

    it('毛利率<净利率', () => {
      const errors = validateFinancialReport({ grossMargin: 30, netMargin: 50 });
      expect(errors).toContain('毛利率应>=净利率');
    });

    it('负债率超范围', () => {
      const errors = validateFinancialReport({ debtRatio: 150 });
      expect(errors).toContain('资产负债率应在0-100之间');
    });

    it('ROE异常', () => {
      const errors = validateFinancialReport({ roe: -200 });
      expect(errors).toContain('ROE范围异常');
    });
  });

  describe('衍生指标计算', () => {
    const report: FinancialReport = {
      code: '600519', period: '2024-Q3',
      revenue: 1000, netProfit: 500,
      totalAssets: 3000, totalLiabilities: 1000, shareholdersEquity: 2000,
      operatingCashFlow: 600,
      roe: 25, grossMargin: 90, netMargin: 50, debtRatio: 33.3,
    };

    it('毛利润', () => {
      const metrics = calculateDerivedMetrics(report);
      expect(metrics.grossProfit).toBe(900);
    });

    it('净资产/股', () => {
      const metrics = calculateDerivedMetrics(report);
      expect(metrics.netAssetPerShare).toBeCloseTo(1.5);
    });

    it('产权比率', () => {
      const metrics = calculateDerivedMetrics(report);
      expect(metrics.debtToEquity).toBeCloseTo(50);
    });

    it('流动比率', () => {
      const metrics = calculateDerivedMetrics(report);
      expect(metrics.currentRatio).toBe(3);
    });
  });

  describe('财务对比', () => {
    const current: FinancialReport = {
      code: '600519', period: '2024-Q3',
      revenue: 1200, netProfit: 600,
      totalAssets: 3500, totalLiabilities: 1200, shareholdersEquity: 2300,
      operatingCashFlow: 700, roe: 28, grossMargin: 91, netMargin: 50, debtRatio: 34.3,
    };
    const previous: FinancialReport = {
      code: '600519', period: '2023-Q3',
      revenue: 1000, netProfit: 500,
      totalAssets: 3000, totalLiabilities: 1000, shareholdersEquity: 2000,
      operatingCashFlow: 600, roe: 25, grossMargin: 90, netMargin: 50, debtRatio: 33.3,
    };

    it('营收增长', () => {
      const comp = compareFinancialReports(current, previous);
      expect(comp.revenueGrowth).toBeCloseTo(20);
    });

    it('利润增长', () => {
      const comp = compareFinancialReports(current, previous);
      expect(comp.profitGrowth).toBeCloseTo(20);
    });

    it('ROE变化', () => {
      const comp = compareFinancialReports(current, previous);
      expect(comp.roeChange).toBeCloseTo(3);
    });

    it('零基数增长', () => {
      const zero: FinancialReport = { ...previous, revenue: 0, netProfit: 0, totalAssets: 0, roe: 0 };
      const comp = compareFinancialReports(current, zero);
      expect(comp.revenueGrowth).toBe(0);
    });
  });
});
