import { describe, it, expect } from 'vitest';

// 数据质量验证引擎
interface ValidationResult {
  isValid: boolean;
  score: number;
  errors: string[];
  warnings: string[];
}

interface StockData {
  code: string;
  name: string;
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
  turnover: number;
  pe: number;
  pb: number;
  date: string;
}

class DataQualityValidator {
  static validateStockCode(code: string): ValidationResult {
    const errors: string[] = [];
    if (!code) errors.push('股票代码不能为空');
    else if (!/^[036]\d{5}$/.test(code)) errors.push('股票代码格式不正确');
    return { isValid: errors.length === 0, score: errors.length === 0 ? 100 : 0, errors, warnings: [] };
  }

  static validateOHLCV(data: StockData): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (data.high < data.low) errors.push('最高价不能低于最低价');
    if (data.high < data.open) warnings.push('开盘价高于最高价');
    if (data.high < data.close) warnings.push('收盘价高于最高价');
    if (data.low > data.open) warnings.push('开盘价低于最低价');
    if (data.low > data.close) warnings.push('收盘价低于最低价');
    if (data.volume < 0) errors.push('成交量不能为负');
    if (data.amount < 0) errors.push('成交额不能为负');
    if (data.price <= 0) errors.push('价格必须为正');
    if (data.volume > 0 && data.amount > 0) {
      const impliedPrice = data.amount / (data.volume * 100);
      if (Math.abs(impliedPrice - data.close) / data.close > 0.1) {
        warnings.push('成交额与成交量不匹配');
      }
    }
    const score = Math.max(0, 100 - errors.length * 30 - warnings.length * 10);
    return { isValid: errors.length === 0, score, errors, warnings };
  }

  static validateDateRange(start: string, end: string): ValidationResult {
    const errors: string[] = [];
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (isNaN(startDate.getTime())) errors.push('开始日期格式无效');
    if (isNaN(endDate.getTime())) errors.push('结束日期格式无效');
    if (startDate > endDate) errors.push('开始日期不能晚于结束日期');
    if (endDate > new Date()) errors.push('结束日期不能晚于今天');
    return { isValid: errors.length === 0, score: errors.length === 0 ? 100 : 0, errors, warnings: [] };
  }

  static detectOutliers(values: number[], threshold: number = 3): { outliers: number[]; indices: number[] } {
    if (values.length < 3) return { outliers: [], indices: [] };
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
    if (std === 0) return { outliers: [], indices: [] };
    const outliers: number[] = [];
    const indices: number[] = [];
    values.forEach((v, i) => {
      if (Math.abs((v - mean) / std) > threshold) {
        outliers.push(v);
        indices.push(i);
      }
    });
    return { outliers, indices };
  }

  static validateTurnover(turnover: number): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (turnover < 0) errors.push('换手率不能为负');
    if (turnover > 100) warnings.push('换手率超过100%');
    if (turnover > 20) warnings.push('换手率异常高');
    return { isValid: errors.length === 0, score: 100 - errors.length * 50 - warnings.length * 10, errors, warnings };
  }

  static validatePE(pe: number): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (pe < 0 && pe !== -1) warnings.push('负PE可能表示亏损');
    if (pe > 200) warnings.push('PE异常高');
    if (pe > 0 && pe < 5) warnings.push('PE异常低');
    return { isValid: true, score: 100 - warnings.length * 15, errors, warnings };
  }

  static validateDataCompleteness(data: Partial<StockData>): ValidationResult {
    const required: (keyof StockData)[] = ['code', 'name', 'price', 'close', 'volume', 'date'];
    const errors: string[] = [];
    for (const field of required) {
      if (data[field] === undefined || data[field] === null || data[field] === '') {
        errors.push(`缺少必填字段: ${field}`);
      }
    }
    return { isValid: errors.length === 0, score: Math.max(0, 100 - errors.length * 20), errors, warnings: [] };
  }

  static detectDuplicates(records: StockData[]): number[][] {
    const groups: Map<string, number[]> = new Map();
    records.forEach((r, i) => {
      const key = `${r.code}-${r.date}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(i);
    });
    return Array.from(groups.values()).filter(g => g.length > 1);
  }

  static validateDataConsistency(records: StockData[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const change = Math.abs(curr.close - prev.close) / prev.close;
      if (change > 0.2) warnings.push(`${curr.date}: 日涨跌幅超过20%`);
    }

    return { isValid: errors.length === 0, score: Math.max(0, 100 - errors.length * 20 - warnings.length * 5), errors, warnings };
  }

  static sanitizeData(data: StockData): StockData {
    return {
      ...data,
      code: data.code?.trim() || '',
      name: data.name?.trim() || '',
      price: isFinite(data.price) ? Math.max(0, data.price) : 0,
      volume: Math.max(0, Math.round(data.volume)),
      amount: Math.max(0, data.amount),
      turnover: Math.min(100, Math.max(0, data.turnover)),
    };
  }

  static generateQualityReport(records: StockData[]): {
    totalRecords: number;
    validRecords: number;
    avgScore: number;
    issues: Record<string, number>;
  } {
    let totalScore = 0;
    const issues: Record<string, number> = {};
    let validCount = 0;

    for (const record of records) {
      const completeness = this.validateDataCompleteness(record);
      const ohlcv = this.validateOHLCV(record);
      totalScore += (completeness.score + ohlcv.score) / 2;
      if (completeness.isValid && ohlcv.isValid) validCount++;
      for (const err of [...completeness.errors, ...ohlcv.errors]) {
        issues[err] = (issues[err] || 0) + 1;
      }
    }

    return {
      totalRecords: records.length,
      validRecords: validCount,
      avgScore: records.length > 0 ? totalScore / records.length : 0,
      issues,
    };
  }
}

describe('数据质量验证引擎', () => {
  const validStock: StockData = {
    code: '600519', name: '贵州茅台', price: 1800, open: 1790, high: 1820,
    low: 1780, close: 1800, volume: 50000, amount: 900000000, turnover: 0.4,
    pe: 35, pb: 12, date: '2026-03-24',
  };

  describe('股票代码验证', () => {
    it('应该验证正确的6开头代码', () => {
      expect(DataQualityValidator.validateStockCode('600519').isValid).toBe(true);
    });
    it('应该验证正确的0开头代码', () => {
      expect(DataQualityValidator.validateStockCode('000858').isValid).toBe(true);
    });
    it('应该验证正确的3开头代码', () => {
      expect(DataQualityValidator.validateStockCode('300750').isValid).toBe(true);
    });
    it('应该拒绝空代码', () => {
      expect(DataQualityValidator.validateStockCode('').isValid).toBe(false);
    });
    it('应该拒绝格式错误的代码', () => {
      expect(DataQualityValidator.validateStockCode('12345').isValid).toBe(false);
    });
  });

  describe('OHLCV验证', () => {
    it('应该通过有效的OHLCV数据', () => {
      expect(DataQualityValidator.validateOHLCV(validStock).isValid).toBe(true);
    });
    it('应该拒绝最高价低于最低价', () => {
      const bad = { ...validStock, high: 1700, low: 1800 };
      expect(DataQualityValidator.validateOHLCV(bad).isValid).toBe(false);
    });
    it('应该拒绝负成交量', () => {
      const bad = { ...validStock, volume: -100 };
      expect(DataQualityValidator.validateOHLCV(bad).isValid).toBe(false);
    });
    it('应该警告不匹配的成交额', () => {
      const bad = { ...validStock, amount: 100, volume: 50000 };
      const r = DataQualityValidator.validateOHLCV(bad);
      expect(r.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('日期范围验证', () => {
    it('应该通过有效的日期范围', () => {
      expect(DataQualityValidator.validateDateRange('2026-01-01', '2026-03-24').isValid).toBe(true);
    });
    it('应该拒绝反向日期范围', () => {
      expect(DataQualityValidator.validateDateRange('2026-03-24', '2026-01-01').isValid).toBe(false);
    });
    it('应该拒绝无效日期格式', () => {
      expect(DataQualityValidator.validateDateRange('abc', '2026-03-24').isValid).toBe(false);
    });
    it('应该拒绝未来结束日期', () => {
      expect(DataQualityValidator.validateDateRange('2026-01-01', '2030-01-01').isValid).toBe(false);
    });
  });

  describe('异常值检测', () => {
    it('应该检测异常值', () => {
      // Use population std dev. Need a value far enough from mean (>3 sigma)
      // With 10 values at ~100 and 1 at 1000000, z-score will exceed 3
      const values = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 1000000];
      const result = DataQualityValidator.detectOutliers(values);
      expect(result.indices.length).toBeGreaterThan(0);
      expect(result.outliers).toContain(1000000);
    });
    it('应该忽略正常波动', () => {
      const values = [100, 101, 99, 100, 102, 98, 101];
      const result = DataQualityValidator.detectOutliers(values);
      expect(result.outliers).toHaveLength(0);
    });
    it('应该处理少于3个值的数组', () => {
      expect(DataQualityValidator.detectOutliers([1, 2]).outliers).toHaveLength(0);
    });
    it('应该处理标准差为0的数组', () => {
      expect(DataQualityValidator.detectOutliers([5, 5, 5, 5]).outliers).toHaveLength(0);
    });
  });

  describe('换手率验证', () => {
    it('应该通过正常换手率', () => {
      expect(DataQualityValidator.validateTurnover(1.5).isValid).toBe(true);
    });
    it('应该拒绝负换手率', () => {
      expect(DataQualityValidator.validateTurnover(-1).isValid).toBe(false);
    });
    it('应该警告超高换手率', () => {
      const r = DataQualityValidator.validateTurnover(25);
      expect(r.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('PE验证', () => {
    it('应该通过正常PE', () => {
      expect(DataQualityValidator.validatePE(25).warnings).toHaveLength(0);
    });
    it('应该警告超高PE', () => {
      expect(DataQualityValidator.validatePE(300).warnings.length).toBeGreaterThan(0);
    });
    it('应该警告极低PE', () => {
      expect(DataQualityValidator.validatePE(2).warnings.length).toBeGreaterThan(0);
    });
  });

  describe('数据完整性', () => {
    it('应该验证完整数据', () => {
      expect(DataQualityValidator.validateDataCompleteness(validStock).isValid).toBe(true);
    });
    it('应该拒绝缺少必填字段', () => {
      const { code, ...rest } = validStock;
      expect(DataQualityValidator.validateDataCompleteness(rest).isValid).toBe(false);
    });
  });

  describe('重复数据检测', () => {
    it('应该检测重复记录', () => {
      const records = [validStock, { ...validStock }, { ...validStock, date: '2026-03-25' }];
      const dups = DataQualityValidator.detectDuplicates(records);
      expect(dups.length).toBeGreaterThan(0);
    });
    it('应该放过不重复的记录', () => {
      const records = [
        { ...validStock, date: '2026-03-24' },
        { ...validStock, date: '2026-03-25' },
      ];
      expect(DataQualityValidator.detectDuplicates(records)).toHaveLength(0);
    });
  });

  describe('数据一致性', () => {
    it('应该验证一致的数据', () => {
      const records = [
        { ...validStock, close: 1800, date: '2026-03-22' },
        { ...validStock, close: 1820, date: '2026-03-23' },
      ];
      expect(DataQualityValidator.validateDataConsistency(records).isValid).toBe(true);
    });
    it('应该警告异常波动', () => {
      const records = [
        { ...validStock, close: 1800, date: '2026-03-22' },
        { ...validStock, close: 2500, date: '2026-03-23' },
      ];
      const r = DataQualityValidator.validateDataConsistency(records);
      expect(r.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('数据清理', () => {
    it('应该清理数据', () => {
      const dirty: StockData = {
        ...validStock, code: ' 600519 ', name: ' 贵州茅台 ',
        price: -100, volume: -50, amount: -1000, turnover: 150,
      };
      const clean = DataQualityValidator.sanitizeData(dirty);
      expect(clean.code).toBe('600519');
      expect(clean.price).toBe(0);
      expect(clean.volume).toBe(0);
      expect(clean.turnover).toBe(100);
    });
  });

  describe('质量报告', () => {
    it('应该生成质量报告', () => {
      const report = DataQualityValidator.generateQualityReport([validStock, validStock]);
      expect(report.totalRecords).toBe(2);
      expect(report.validRecords).toBe(2);
      expect(report.avgScore).toBeGreaterThan(0);
    });
    it('应该处理空数据', () => {
      const report = DataQualityValidator.generateQualityReport([]);
      expect(report.totalRecords).toBe(0);
      expect(report.avgScore).toBe(0);
    });
  });
});
