/**
 * 交易所涨跌停价判定的**唯一**实现测试（P0 缺陷 2 收敛口径的守门测试）。
 *
 * 缺陷背景：同一天同一后端曾有三套涨停口径——
 *   - services/marketBreadth：现价 vs 腾讯 f47/f48（正确）
 *   - db/Database.getMarketSummary：change_percent >= 9.5%（近似，58/207）
 *   - db/Database.getSectorPerformanceEnhanced：change_percent >= 9.9%（近似）
 * 真实值（腾讯 f47/f48 逐只判定 2026-10-30 全 5184 只）= 涨停 49 / 跌停 93。
 *
 * 本测试钉住制度推算（含四舍五入边界）与容差比较，防止再次出现「两套算法两套值」。
 */

import { describe, it, expect } from 'vitest';
import {
  boardLimitRatio,
  exchangeLimitPrices,
  isAtLimitUp,
  isAtLimitDown,
  LIMIT_TOLERANCE_YUAN,
} from '../utils/exchangeLimit';

describe('boardLimitRatio', () => {
  it('科创板 688/689、创业板 300/301 → ±20%', () => {
    expect(boardLimitRatio('688111.SH')).toBe(0.2);
    expect(boardLimitRatio('689009.SH')).toBe(0.2);
    expect(boardLimitRatio('300750.SZ')).toBe(0.2);
    expect(boardLimitRatio('301236.SZ')).toBe(0.2);
  });

  it('北交所 4/8 开头 → ±30%', () => {
    expect(boardLimitRatio('430047.BJ')).toBe(0.3);
    expect(boardLimitRatio('830799.BJ')).toBe(0.3);
  });

  it('沪深主板 → ±10%（ST/*ST 同为 10%，2026-10-30 用腾讯 f47/f48 逐只核对过）', () => {
    expect(boardLimitRatio('600519.SH')).toBe(0.1);
    expect(boardLimitRatio('000001.SZ')).toBe(0.1);
    expect(boardLimitRatio('002816.SZ')).toBe(0.1); // *ST和科：真实跌停价 15.44 = 17.15×0.9
  });
});

describe('exchangeLimitPrices', () => {
  it('主板 ±10% 且保留 2 位小数', () => {
    expect(exchangeLimitPrices(1500, '600519.SH')).toEqual({
      limitUpPrice: 1650,
      limitDownPrice: 1350,
    });
  });

  it('创业板 ±20%', () => {
    // 183.34 × 1.2 = 220.008 → 220.01；183.34 × 0.8 = 146.672 → 146.67
    expect(exchangeLimitPrices(183.34, '300750.SZ')).toEqual({
      limitUpPrice: 220.01,
      limitDownPrice: 146.67,
    });
  });

  it('四舍五入边界：17.15 × 0.9 = 15.435 → 15.44（不可被浮点误差吃成 15.43）', () => {
    expect(exchangeLimitPrices(17.15, '002816.SZ')!.limitDownPrice).toBe(15.44);
  });

  it('前收盘价缺失/非正 → null（调用方须按不可判定处理，不得回退近似）', () => {
    expect(exchangeLimitPrices(0, '600519.SH')).toBeNull();
    expect(exchangeLimitPrices(-1, '600519.SH')).toBeNull();
    expect(exchangeLimitPrices(NaN, '600519.SH')).toBeNull();
  });
});

describe('isAtLimitUp / isAtLimitDown', () => {
  it('现价恰等于涨跌停价 → 命中', () => {
    expect(isAtLimitUp(11, 11)).toBe(true);
    expect(isAtLimitDown(9, 9)).toBe(true);
  });

  it('容差内（0.005 元）视为命中，容差外不命中', () => {
    expect(isAtLimitUp(11 - LIMIT_TOLERANCE_YUAN, 11)).toBe(true);
    expect(isAtLimitUp(11 - LIMIT_TOLERANCE_YUAN * 2, 11)).toBe(false);
    expect(isAtLimitDown(9 + LIMIT_TOLERANCE_YUAN, 9)).toBe(true);
    expect(isAtLimitDown(9 + LIMIT_TOLERANCE_YUAN * 2, 9)).toBe(false);
  });

  it('涨跌停价缺失（0）→ 不命中（不可判定，不能算作涨停）', () => {
    expect(isAtLimitUp(10, 0)).toBe(false);
    expect(isAtLimitDown(10, 0)).toBe(false);
  });

  it('「接近但未触及」不再被误判：-9.6% 的主板股不是跌停', () => {
    // 前收 10 元、跌停 9.00 元；现价 9.04（-9.6%）——旧 ±9.5% 口径会误算成跌停
    const p = exchangeLimitPrices(10, '600519.SH')!;
    expect(isAtLimitDown(9.04, p.limitDownPrice)).toBe(false);
    expect(isAtLimitDown(9.0, p.limitDownPrice)).toBe(true);
  });
});
