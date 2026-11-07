import { describe, expect, it } from 'vitest';
import { parseThesisPrices } from '../hooks/useThesisPrices';

/**
 * 线上真实契约（2026-11-07 实测 POST /api/stocks/batch/quotes）：
 * { data: StockWithQuote[], success: true }
 * 旧的 data.stocks 包装也要兼容，避免后端换壳时静默退化成全部「待验证」。
 */
describe('观点检查取价解析', () => {
  it('解析线上批量行情 data 数组形状', () => {
    const payload = {
      data: [{ symbol: '600519', latestQuote: { closePrice: 1453 } }],
      success: true,
    };
    expect(parseThesisPrices(payload)).toEqual({ '600519': 1453 });
  });

  it('兼容 data.stocks 包装', () => {
    const payload = {
      data: { stocks: [{ symbol: '000001', latestQuote: { closePrice: 11.25 } }], count: 1 },
    };
    expect(parseThesisPrices(payload)).toEqual({ '000001': 11.25 });
  });

  it('缺少最新价时记 null，不伪造价格', () => {
    const payload = { data: [{ symbol: '600519', latestQuote: null }], success: true };
    expect(parseThesisPrices(payload)).toEqual({ '600519': null });
  });

  it('异常响应返回空对象', () => {
    expect(parseThesisPrices({ success: false, error: 'unavailable' })).toEqual({});
    expect(parseThesisPrices(null)).toEqual({});
  });
});
