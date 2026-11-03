/**
 * API 参数验证与响应格式测试 — 影子测试迁移（批次 23）
 *
 * 已绑定生产实现：
 * - backend/src/utils/apiResponse.ts:49    sendSuccess（{ success:true, data, timestamp }）
 * - backend/src/utils/apiResponse.ts:74    sendPaginated（data.pagination.totalCount）
 * - backend/src/utils/apiResponse.ts:103   sendError（{ success:false, error, code?, timestamp }）
 * - frontend/src/utils/validation.ts:17    validate
 * - frontend/src/utils/validation.ts:28    isValidStockCode
 * - frontend/src/utils/validation.ts:32    validateStockCode
 * - frontend/src/utils/validation.ts:75    isValidTradeDate
 * - frontend/src/utils/validation.ts:93    validateOrder
 * - backend/src/middleware/rateLimit.ts:129 apiRateLimit（120 次/分钟）
 * - backend/src/middleware/rateLimit.ts:138 syncRateLimit（5 次/分钟）
 *
 * 旧断言错在哪（旧值 → 生产值）：
 * | 旧断言 | 生产行为 | 依据 |
 * | 成功响应 { code:0, data, message } | { success:true, data, timestamp } | apiResponse.ts:49-56 |
 * | 错误响应 { code:number, data:null, message } | { success:false, error, code?:string, timestamp } | apiResponse.ts:103-121 |
 * | 分页 data.total / data.page | data.pagination.totalCount / data.pagination.page | apiResponse.ts:74-99 |
 * | 日期 new Date 可解析即通过 | isValidTradeDate 回读年月日，'2026-02-30' 拒绝 | validation.ts:75-83 |
 * | page(-1) = 1、pageSize(0) = 1 | 后端内联 parseInt||1 => -1；parseInt||20 => 20 | api/alerts.ts:205-206 |
 * | '/api/search' 60、'/api/backtest' 10 | 生产没有这些端点配额，只有全局 120 与 sync 5 | middleware/rateLimit.ts:129-143 |
 *
 * 未迁移（生产无对应实现 / 契约不同，保留本地 helper 与用例）：
 * - 后端分页参数解析：内联在 api/alerts.ts:205-206 与 api/user.ts:480-481，无导出；
 *   本地 helper 逐字复刻该内联逻辑，用于锁定真实行为。
 * - 排序字段白名单、asc/desc：后端无对应导出。
 * - 新闻 ID 正整数：后端路由内联校验，无导出。
 * - 回测请求体 symbol/strategy/日期先后：无生产校验函数导出。
 * - 预警请求体：生产 alertPushEngine.ts:261 validateAlert 是另一套契约
 *   （type=price/change/volume + condition{field,operator,value}），旧 API 白名单不迁移。
 * - 批量上限 MAX_BATCH=100：生产无统一批量上限导出。
 *
 * 本地保留业务规则：排序白名单、asc/desc、新闻 ID、回测体、预警体、批量上限。
 * 生产缺陷候选：
 * - 后端 page 参数 parseInt||1 未拒绝负数（-1 会原样向下传）。
 * - 生产没有统一批量上限（旧测试假设的 100 无依据）。
 * 新增：validate 通用规则 1 例、validateOrder 3 例。
 */

import { describe, it, expect, vi } from 'vitest';
import {
  validate,
  validateStockCode,
  isValidStockCode,
  isValidTradeDate,
  validateOrder,
} from '../../../frontend/src/utils/validation';
import { sendSuccess, sendPaginated, sendError } from '../utils/apiResponse';
import { apiRateLimit, syncRateLimit } from '../middleware/rateLimit';

function createMockRes() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader: vi.fn(),
    set: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
  };
  res.setHeader.mockImplementation((key: string, value: string) => {
    res.headers[key] = value;
    return res;
  });
  res.set.mockImplementation((key: string, value: string) => {
    res.headers[key] = value;
    return res;
  });
  res.status.mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json.mockImplementation((body: unknown) => {
    res.body = body;
    return res;
  });
  return res;
}

describe('API 参数验证与响应格式测试', () => {
  describe('统一响应格式（生产 apiResponse）', () => {
    it('成功响应应使用 success/data/timestamp 结构', () => {
      const res = createMockRes();
      sendSuccess(res, { items: [] });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({ items: [] });
      expect(typeof res.body.timestamp).toBe('string');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json; charset=utf-8');
    });

    it('错误响应应该使用 success/error/code 结构', () => {
      const res = createMockRes();
      sendError(res, 400, '参数错误', 'VALIDATION_ERROR');

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('参数错误');
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(typeof res.body.timestamp).toBe('string');

      const unauthorized = createMockRes();
      sendError(unauthorized, 401, '未授权');
      expect(unauthorized.statusCode).toBe(401);
      expect(unauthorized.body.error).toBe('未授权');
      expect(unauthorized.body.code).toBeUndefined();
    });

    it('分页响应应该使用 data.pagination 结构', () => {
      const res = createMockRes();
      sendPaginated(res, [1, 2, 3], 1, 20, 100);

      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toEqual([1, 2, 3]);
      expect(res.body.data.pagination).toEqual({
        page: 1,
        pageSize: 20,
        totalCount: 100,
        totalPages: 5,
      });
    });
  });

  describe('查询参数解析（未迁移：后端内联无导出，本地复刻）', () => {
    // 未迁移：后端分页参数解析内联在 api/alerts.ts:205-206 与 api/user.ts:480-481，
    // 没有可导入的函数。本地 helper 逐字复刻该内联逻辑：
    // page = parseInt(req.query.page) || 1
    // pageSize = Math.min(parseInt(req.query.pageSize) || 20, 100)
    const parsePageParam = (page: unknown) => parseInt(String(page)) || 1;
    const parsePageSizeParam = (size: unknown) => Math.min(parseInt(String(size)) || 20, 100);

    it('page 参数按后端口径 parseInt||1 解析（负页未拦截）', () => {
      expect(parsePageParam(0)).toBe(1);
      expect(parsePageParam(-1)).toBe(-1); // 生产缺陷候选：负页未拒绝
      expect(parsePageParam('abc')).toBe(1);
      expect(parsePageParam(5)).toBe(5);
      expect(parsePageParam(undefined)).toBe(1);
    });

    it('pageSize 参数按后端口径 parseInt||20 解析并封顶 100', () => {
      expect(parsePageSizeParam(0)).toBe(20); // 旧断言 1 → 生产 20
      expect(parsePageSizeParam(200)).toBe(100);
      expect(parsePageSizeParam(20)).toBe(20);
      expect(parsePageSizeParam('abc')).toBe(20);
    });

    // 未迁移：后端没有排序字段白名单的导出实现。
    it('排序字段应该是白名单中的值', () => {
      const allowed = ['price', 'changePercent', 'volume', 'turnover', 'marketCap'];
      const validateSort = (field: string) => (allowed.includes(field) ? field : 'changePercent');
      expect(validateSort('price')).toBe('price');
      expect(validateSort('invalid_field')).toBe('changePercent');
    });

    // 未迁移：后端没有排序方向解析的导出实现。
    it('排序方向只能是 asc 或 desc', () => {
      const validateSortOrder = (order: string) => (order === 'asc' || order === 'desc' ? order : 'desc');
      expect(validateSortOrder('asc')).toBe('asc');
      expect(validateSortOrder('desc')).toBe('desc');
      expect(validateSortOrder('invalid')).toBe('desc');
    });
  });

  describe('路径参数验证', () => {
    it('股票代码应该6位数字（生产 isValidStockCode）', () => {
      expect(isValidStockCode('600519')).toBe(true);
      expect(isValidStockCode('12345')).toBe(false);
      expect(isValidStockCode('abc123')).toBe(false);
      expect(validateStockCode('600519')).toEqual({ valid: true, errors: [] });
    });

    it('日期参数应该 YYYY-MM-DD 且为真实日期（生产 isValidTradeDate）', () => {
      expect(isValidTradeDate('2026-03-24')).toBe(true);
      expect(isValidTradeDate('2026-13-01')).toBe(false); // 无效月份
      expect(isValidTradeDate('invalid')).toBe(false);
      // 旧实现用 new Date，会把 2026-02-30 归一化成 3 月 2 日而漏判。
      expect(isValidTradeDate('2026-02-30')).toBe(false);
    });

    // 未迁移：后端路由内联校验，无导出。
    it('新闻ID应该是正整数', () => {
      const validate = (id: any) => Number.isInteger(Number(id)) && Number(id) > 0;
      expect(validate('1')).toBe(true);
      expect(validate('0')).toBe(false);
      expect(validate('-1')).toBe(false);
    });
  });

  describe('请求体验证', () => {
    it('自选股添加应该有 symbol（生产 validateStockCode）', () => {
      const validateWatchlistBody = (body: { symbol?: string }) => {
        const result = validateStockCode(body.symbol ?? '');
        return { valid: result.valid, errors: result.errors };
      };
      expect(validateWatchlistBody({ symbol: '600519' }).valid).toBe(true);
      expect(validateWatchlistBody({}).valid).toBe(false);
      expect(validateWatchlistBody({}).errors).toContain('股票代码不能为空');
      expect(validateWatchlistBody({ symbol: 'abc' }).valid).toBe(false);
      expect(validateWatchlistBody({ symbol: 'abc' }).errors).toContain('股票代码必须是6位数字');
    });

    // 未迁移：生产没有导出回测请求体校验函数。
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

    // 未迁移：生产 alertPushEngine.ts:261 validateAlert 的契约是
    // { ticker, type: 'price'|'change'|'volume', condition: { field, operator, value } }，
    // 与旧 API 的 price_above/value 白名单语义不同，不能直接替换。
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

  describe('通用校验与订单校验（生产 validate / validateOrder）', () => {
    it('validate 按规则逐条收集错误', () => {
      const result = validate(150, [
        { name: 'max', validate: (value) => typeof value === 'number' && value <= 100, message: '超出上限' },
      ]);
      expect(result).toEqual({ valid: false, errors: ['超出上限'] });
      expect(validate(50, [])).toEqual({ valid: true, errors: [] });
    });

    it('validateOrder 接受合法买入订单', () => {
      expect(validateOrder({ stockCode: '600519', price: 1800, quantity: 1000, side: 'buy' })).toEqual({
        valid: true,
        errors: [],
      });
    });

    it('validateOrder 拒绝非 100 整数倍数量', () => {
      const result = validateOrder({ stockCode: '600519', price: 1800, quantity: 250, side: 'buy' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('A股数量必须是100的整数倍');
    });

    it('validateOrder 拒绝非法交易方向', () => {
      const result = validateOrder({ stockCode: '600519', price: 1800, quantity: 1000, side: 'hold' as 'buy' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('交易方向必须是买入或卖出');
    });
  });

  describe('限速与配额（生产中间件）', () => {
    it('API 限流为 120 次/分钟，第 121 次返回 429', () => {
      const ip = '10.23.0.1';
      const req: any = { ip, path: '/api/stocks', socket: { remoteAddress: ip } };
      const next = vi.fn();

      for (let i = 0; i < 120; i++) {
        apiRateLimit(req, createMockRes(), next);
      }
      expect(next).toHaveBeenCalledTimes(120);

      const blocked = createMockRes();
      apiRateLimit(req, blocked, next);
      expect(next).toHaveBeenCalledTimes(120);
      expect(blocked.statusCode).toBe(429);
      expect(blocked.body.success).toBe(false);
      expect(blocked.headers['X-RateLimit-Limit']).toBe('120');
      expect(blocked.headers['X-RateLimit-Remaining']).toBe('0');
    });

    it('数据同步限流为 5 次/分钟，第 6 次返回 429', () => {
      const ip = '10.23.0.2';
      const req: any = { ip, path: '/api/sync', socket: { remoteAddress: ip } };
      const next = vi.fn();

      for (let i = 0; i < 5; i++) {
        syncRateLimit(req, createMockRes(), next);
      }
      expect(next).toHaveBeenCalledTimes(5);

      const blocked = createMockRes();
      syncRateLimit(req, blocked, next);
      expect(next).toHaveBeenCalledTimes(5);
      expect(blocked.statusCode).toBe(429);
      expect(blocked.body.success).toBe(false);
      expect(blocked.headers['X-RateLimit-Limit']).toBe('5');
    });

    // 未迁移：生产没有统一批量上限导出。
    it('批量操作应该有上限', () => {
      const MAX_BATCH = 100;
      const validateBatch = (items: any[]) => items.length <= MAX_BATCH;
      expect(validateBatch(Array(50).fill(0))).toBe(true);
      expect(validateBatch(Array(150).fill(0))).toBe(false);
    });
  });
});
