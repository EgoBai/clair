import { describe, it, expect } from 'vitest';
import { toStockSymbol, toIndexSymbol, qualifiedMarket } from '../utils/symbolCode';

/**
 * 前端请求符号归一（2026-11-04 线上 400 回归）
 *
 * 事实来源：
 *   - Worker handleMarketKline（clair-worker/worker.js）对裸 6 位码返回 HTTP 400，
 *     错误原文「无法识别的 symbol「600519」：请使用 sh000001 / sz399006 / 600519.SH 形式」；
 *   - 线上 /factor-lab 因此 6 条 400、整页退回演示数据；/index/000001 的 K 线图恒不可用。
 *   - 修复选择：由调用方补前缀（调用方知道标的是指数还是股票），Worker 不猜。
 */

describe('qualifiedMarket：已限定写法归一', () => {
  it('前缀 / 后缀 / 点号三种写法都归一为小写前缀形式', () => {
    expect(qualifiedMarket('sh600519')).toEqual({ market: 'sh', code: '600519' });
    expect(qualifiedMarket('600519.SH')).toEqual({ market: 'sh', code: '600519' });
    expect(qualifiedMarket('sh.600519')).toEqual({ market: 'sh', code: '600519' });
    expect(qualifiedMarket('SZ000001')).toEqual({ market: 'sz', code: '000001' });
  });

  it('裸码与非法输入不属于限定写法', () => {
    expect(qualifiedMarket('600519')).toBeNull();
    expect(qualifiedMarket('')).toBeNull();
    expect(qualifiedMarket('60051')).toBeNull();
  });
});

describe('toStockSymbol：股票域', () => {
  it('按交易所规则补前缀（与 symbolUtils.normalizeSymbol 同口径）', () => {
    expect(toStockSymbol('600519')).toBe('sh600519');
    expect(toStockSymbol('000001')).toBe('sz000001'); // 平安银行
    expect(toStockSymbol('300750')).toBe('sz300750');
    expect(toStockSymbol('430047')).toBe('bj430047'); // 北交所旧段
    expect(toStockSymbol('920047')).toBe('bj920047'); // 北交所新段
  });

  it('沪市 B 股 900xxx 归 sh；深市 B 股不在 A 股主线内，原样返回不猜', () => {
    expect(toStockSymbol('900901')).toBe('sh900901');
    expect(toStockSymbol('200011')).toBe('200011');
  });

  it('已限定写法幂等，不被重复加前缀', () => {
    expect(toStockSymbol('sh600519')).toBe('sh600519');
    expect(toStockSymbol('600519.SH')).toBe('sh600519');
    expect(toStockSymbol('SH600519')).toBe('sh600519');
  });

  it('无法识别原样返回（交给 Worker 拒绝，前端不编造市场）', () => {
    expect(toStockSymbol('abc')).toBe('abc');
    expect(toStockSymbol('')).toBe('');
    expect(toStockSymbol('  600519 ')).toBe('sh600519');
  });
});

describe('toIndexSymbol：指数域', () => {
  it('裸码歧义段是指数域的关键差异：000001 上证指数 → sh，股票域是 sz', () => {
    expect(toIndexSymbol('000001')).toBe('sh000001');
    expect(toStockSymbol('000001')).toBe('sz000001');
    expect(toIndexSymbol('000300')).toBe('sh000300');
  });

  it('深证 / 北证指数段', () => {
    expect(toIndexSymbol('399006')).toBe('sz399006');
    expect(toIndexSymbol('899050')).toBe('bj899050');
  });

  it('已限定写法幂等', () => {
    expect(toIndexSymbol('sz399006')).toBe('sz399006');
    expect(toIndexSymbol('399006.SZ')).toBe('sz399006');
  });
});
