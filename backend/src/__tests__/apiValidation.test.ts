import { describe, it, expect } from 'vitest';

describe('API 参数验证与响应格式测试', () => {
  describe('统一响应格式', () => {
    it('成功响应应该有 code/data 结构', () => {
      const success = (data: any) => ({ code: 0, data, message: 'success' });
      expect(success({ items: [] }).code).toBe(0);
      expect(success([]).data).toEqual([]);
    });

    it('错误响应应该有 code/message', () => {
      const error = (code: number, message: string) => ({ code, data: null, message });
      expect(error(400, '参数错误').code).toBe(400);
      expect(error(401, '未授权').message).toBe('未授权');
    });

    it('分页响应应该有 total/page/pageSize', () => {
      const paginated = (data: any[], total: number, page: number, pageSize: number) => ({
        code: 0,
        data: { items: data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
      });
      const result = paginated([1, 2, 3], 100, 1, 20);
      expect(result.data.total).toBe(100);
      expect(result.data.totalPages).toBe(5);
    });
  });

  describe('查询参数验证', () => {
    it('page 应该 >= 1', () => {
      const validatePage = (p: any) => Math.max(1, parseInt(p) || 1);
      expect(validatePage(0)).toBe(1);
      expect(validatePage(-1)).toBe(1);
      expect(validatePage('abc')).toBe(1);
      expect(validatePage(5)).toBe(5);
    });

    it('pageSize 应该在 1-100 之间', () => {
      const validateSize = (s: any) => { const v = parseInt(s); return isNaN(v) ? 20 : Math.max(1, Math.min(100, v)); };
      expect(validateSize(0)).toBe(1);
      expect(validateSize(200)).toBe(100);
      expect(validateSize(20)).toBe(20);
    });

    it('排序字段应该是白名单中的值', () => {
      const allowed = ['price', 'changePercent', 'volume', 'turnover', 'marketCap'];
      const validateSort = (field: string) => allowed.includes(field) ? field : 'changePercent';
      expect(validateSort('price')).toBe('price');
      expect(validateSort('invalid_field')).toBe('changePercent');
    });

    it('排序方向只能是 asc 或 desc', () => {
      const validateOrder = (order: string) => order === 'asc' || order === 'desc' ? order : 'desc';
      expect(validateOrder('asc')).toBe('asc');
      expect(validateOrder('desc')).toBe('desc');
      expect(validateOrder('invalid')).toBe('desc');
    });
  });

  describe('路径参数验证', () => {
    it('股票代码应该6位数字', () => {
      const validate = (s: string) => /^\d{6}$/.test(s);
      expect(validate('600519')).toBe(true);
      expect(validate('12345')).toBe(false);
      expect(validate('abc123')).toBe(false);
    });

    it('日期参数应该 YYYY-MM-DD 格式', () => {
      const validate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d).getTime());
      expect(validate('2026-03-24')).toBe(true);
      expect(validate('2026-13-01')).toBe(false); // 无效月份
      expect(validate('invalid')).toBe(false);
    });

    it('新闻ID应该是正整数', () => {
      const validate = (id: any) => Number.isInteger(Number(id)) && Number(id) > 0;
      expect(validate('1')).toBe(true);
      expect(validate('0')).toBe(false);
      expect(validate('-1')).toBe(false);
    });
  });

  describe('请求体验证', () => {
    it('自选股添加应该有 symbol', () => {
      const validate = (body: any) => {
        if (!body.symbol) return { valid: false, error: 'symbol 必填' };
        if (!/^\d{6}$/.test(body.symbol)) return { valid: false, error: 'symbol 格式错误' };
        return { valid: true };
      };
      expect(validate({ symbol: '600519' }).valid).toBe(true);
      expect(validate({}).valid).toBe(false);
      expect(validate({ symbol: 'abc' }).valid).toBe(false);
    });

    it('回测参数应该有 symbol + strategy', () => {
      const validate = (body: any) => {
        const errors: string[] = [];
        if (!body.symbol) errors.push('symbol 必填');
        if (!body.strategy) errors.push('strategy 必填');
        if (body.startDate && body.endDate && body.startDate > body.endDate) errors.push('开始日期不能晚于结束日期');
        return { valid: errors.length === 0, errors };
      };
      expect(validate({ symbol: '600519', strategy: 'ma_cross' }).valid).toBe(true);
      expect(validate({ symbol: '600519' }).valid).toBe(false);
      expect(validate({ symbol: '600519', strategy: 'ma_cross', startDate: '2026-03-25', endDate: '2026-03-24' }).valid).toBe(false);
    });

    it('预警规则应该有 type 和 condition', () => {
      const validate = (body: any) => {
        const validTypes = ['price_above', 'price_below', 'change_above', 'change_below', 'volume_above'];
        if (!body.type || !validTypes.includes(body.type)) return false;
        if (body.value === undefined || body.value === null) return false;
        return true;
      };
      expect(validate({ type: 'price_above', value: 2000 })).toBe(true);
      expect(validate({ type: 'invalid', value: 2000 })).toBe(false);
      expect(validate({ type: 'price_above' })).toBe(false);
    });
  });

  describe('限速与配额', () => {
    it('不同端点应该有不同限速', () => {
      const limits: Record<string, number> = {
        '/api/stocks': 120,
        '/api/search': 60,
        '/api/sync': 5,
        '/api/backtest': 10,
      };
      expect(limits['/api/sync']).toBeLessThan(limits['/api/stocks']);
      expect(limits['/api/backtest']).toBeLessThan(limits['/api/search']);
    });

    it('批量操作应该有上限', () => {
      const MAX_BATCH = 100;
      const validateBatch = (items: any[]) => items.length <= MAX_BATCH;
      expect(validateBatch(Array(50).fill(0))).toBe(true);
      expect(validateBatch(Array(150).fill(0))).toBe(false);
    });
  });
});
