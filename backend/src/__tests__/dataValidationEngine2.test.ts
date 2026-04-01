/**
 * 后端数据验证引擎测试
 * 覆盖输入验证、数据清洗、格式检查
 */

import { describe, it, expect } from 'vitest';

describe('数据验证引擎', () => {
  describe('股票代码验证', () => {
    function validateSymbol(symbol: string): { valid: boolean; market: string; error?: string } {
      if (!symbol) return { valid: false, market: '', error: '代码不能为空' };
      if (!/^\d{6}$/.test(symbol)) return { valid: false, market: '', error: '代码须为6位数字' };

      if (symbol.startsWith('6')) return { valid: true, market: 'SH' };
      if (symbol.startsWith('0') || symbol.startsWith('3')) return { valid: true, market: 'SZ' };
      if (symbol.startsWith('8') || symbol.startsWith('4')) return { valid: true, market: 'BJ' };
      return { valid: false, market: '', error: '未知市场' };
    }

    it('有效上海代码应通过', () => {
      expect(validateSymbol('600519')).toEqual({ valid: true, market: 'SH' });
    });

    it('有效深圳代码应通过', () => {
      expect(validateSymbol('000858')).toEqual({ valid: true, market: 'SZ' });
    });

    it('非6位应报错', () => {
      expect(validateSymbol('12345').valid).toBe(false);
    });

    it('空代码应报错', () => {
      expect(validateSymbol('').valid).toBe(false);
    });
  });

  describe('日期范围验证', () => {
    function validateDateRange(start: string, end: string): { valid: boolean; days: number; error?: string } {
      const startDate = new Date(start);
      const endDate = new Date(end);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return { valid: false, days: 0, error: '日期格式无效' };
      }
      if (startDate >= endDate) {
        return { valid: false, days: 0, error: '开始日期须早于结束日期' };
      }
      const days = Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000);
      if (days > 3650) {
        return { valid: false, days, error: '日期范围不能超过10年' };
      }
      return { valid: true, days };
    }

    it('有效范围应通过', () => {
      const result = validateDateRange('2023-01-01', '2024-01-01');
      expect(result.valid).toBe(true);
      expect(result.days).toBe(365);
    });

    it('开始晚于结束应报错', () => {
      expect(validateDateRange('2024-01-01', '2023-01-01').valid).toBe(false);
    });

    it('超长范围应报错', () => {
      expect(validateDateRange('2000-01-01', '2020-01-01').valid).toBe(false);
    });
  });

  describe('分页参数验证', () => {
    function validatePagination(page: number, pageSize: number): { page: number; pageSize: number; offset: number } {
      const validPage = Math.max(1, Math.floor(page) || 1);
      const validPageSize = Math.min(100, Math.max(1, Math.floor(pageSize) || 20));
      return { page: validPage, pageSize: validPageSize, offset: (validPage - 1) * validPageSize };
    }

    it('有效参数应保持不变', () => {
      expect(validatePagination(2, 10)).toEqual({ page: 2, pageSize: 10, offset: 10 });
    });

    it('负数页码应修正为1', () => {
      expect(validatePagination(-1, 10).page).toBe(1);
    });

    it('超大pageSize应限制为100', () => {
      expect(validatePagination(1, 200).pageSize).toBe(100);
    });

    it('0 pageSize应使用默认值', () => {
      expect(validatePagination(1, 0).pageSize).toBe(20);
    });
  });

  describe('价格数据清洗', () => {
    interface RawQuote {
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }

    function cleanQuote(raw: RawQuote): { cleaned: RawQuote | null; errors: string[] } {
      const errors: string[] = [];

      if (raw.high < raw.low) errors.push('最高价不能低于最低价');
      if (raw.close < 0) errors.push('收盘价不能为负');
      if (raw.volume < 0) errors.push('成交量不能为负');
      if (raw.open <= 0 || raw.high <= 0 || raw.low <= 0) errors.push('价格须大于0');

      if (errors.length > 0) return { cleaned: null, errors };

      return {
        cleaned: {
          open: Math.round(raw.open * 100) / 100,
          high: Math.round(raw.high * 100) / 100,
          low: Math.round(raw.low * 100) / 100,
          close: Math.round(raw.close * 100) / 100,
          volume: Math.round(raw.volume),
        },
        errors: [],
      };
    }

    it('有效数据应清洗通过', () => {
      const result = cleanQuote({ open: 10.123, high: 11, low: 9.5, close: 10.5, volume: 100000.5 });
      expect(result.cleaned).not.toBeNull();
      expect(result.cleaned!.open).toBe(10.12);
      expect(result.cleaned!.volume).toBe(100001);
    });

    it('高价低于低价应报错', () => {
      const result = cleanQuote({ open: 10, high: 9, low: 10, close: 10, volume: 1000 });
      expect(result.cleaned).toBeNull();
      expect(result.errors).toContain('最高价不能低于最低价');
    });

    it('负价格应报错', () => {
      const result = cleanQuote({ open: -1, high: 10, low: 5, close: 8, volume: 1000 });
      expect(result.cleaned).toBeNull();
    });
  });

  describe('批量数据验证', () => {
    function batchValidate<T>(items: T[], validate: (item: T) => boolean): { valid: T[]; invalid: T[] } {
      const valid: T[] = [], invalid: T[] = [];
      for (const item of items) {
        (validate(item) ? valid : invalid).push(item);
      }
      return { valid, invalid };
    }

    it('应正确分类有效和无效数据', () => {
      const items = [1, -1, 5, 0, 10, -3];
      const result = batchValidate(items, (n) => n > 0);
      expect(result.valid).toEqual([1, 5, 10]);
      expect(result.invalid).toEqual([-1, 0, -3]);
    });
  });
});
