/**
 * P0-KLINE-WINDOW（2026-11-04）：/kline 取数窗口回归测试
 *
 * ## 缺陷
 * 旧实现 `orderBy('trade_date','asc').limit(limit)` 取的是**最早** limit 根日K，
 * 于是「最近 250 日」窗口漂移成「上市最初 250 日」（shadow 实测：000858 首条
 * 2018-01-02，而库里最新已到 2026-11-03）。修法：DESC 取最近 limit 根后 reverse
 * 回升序，保证日K响应仍升序、周/月K聚合仍按时间升序。
 *
 * ## 本测试锁住什么（纯 mock，不连真库、不联网）
 * 1. 取数方向必须是 DESC（若改回 ASC 立即红）；
 * 2. limit=5 返回的是**最后 5 根**（最近 5 个交易日）且日期升序——不是最早 5 根；
 * 3. 周K 在 DESC 取数 + reverse 之后仍聚合出升序序列，最后一根的收盘价 = 最新一日收盘价
 *    （防止把 reverse 放到聚合之后，导致周K首尾颠倒/收盘价取错）。
 */

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// 30 根连续日K（2026-06-01 ~ 2026-06-30，仅验证排序窗口，不依赖真实交易日历）
const h = vi.hoisted(() => {
  const rows = Array.from({ length: 30 }, (_, i) => {
    const tradeDate = new Date(Date.UTC(2026, 5, 1 + i)).toISOString().slice(0, 10);
    const base = 10 + i;
    return {
      tradeDate,
      open: base,
      close: base + 0.5,
      high: base + 1,
      low: base - 1,
      volume: 1000 + i,
      turnover: 1_000_000 + i,
    };
  });
  const state: { orderDir: 'asc' | 'desc' | null; appliedLimit: number | null } = {
    orderDir: null,
    appliedLimit: null,
  };
  const builder: Record<string, unknown> = {
    where() { return builder; },
    select() { return builder; },
    orderBy(_column: string, direction: 'asc' | 'desc') {
      state.orderDir = direction;
      return builder;
    },
    limit(n: number) {
      state.appliedLimit = n;
      const sorted = [...rows].sort((a, b) => {
        const cmp = a.tradeDate < b.tradeDate ? -1 : a.tradeDate > b.tradeDate ? 1 : 0;
        return state.orderDir === 'desc' ? -cmp : cmp;
      });
      return Promise.resolve(sorted.slice(0, n));
    },
  };
  return { rows, state, builder };
});

vi.mock('../db/dbFactory', () => ({
  db: {
    getStockBySymbol: vi.fn(async (symbol: string) => ({
      id: 7,
      symbol,
      name: '窗口测试股',
      market: 'SZ',
      isActive: true,
    })),
    connection: vi.fn(() => h.builder),
  },
  getDb: vi.fn(),
  initDatabase: vi.fn(async () => ({})),
}));

import stockRouter from '../api/stock';

const app = express();
app.use(express.json());
app.use('/api', stockRouter);

const ALL_DATE_ASC = h.rows.map((r) => r.tradeDate);

describe('P0-KLINE-WINDOW · /kline 取「最近 N 根」且保持升序', () => {
  it('日K limit=5 返回最后 5 根（最近 5 日）且日期升序', async () => {
    const res = await request(app).get('/api/stocks/000001/kline?period=daily&limit=5');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.dataSource).toBe('real');

    // ① 取数方向必须是 DESC（若有人改回 asc，这里立刻红）
    expect(h.state.orderDir).toBe('desc');
    expect(h.state.appliedLimit).toBe(5);

    const quotes = res.body.data.quotes as { tradeDate: string; close: number }[];
    expect(quotes).toHaveLength(5);

    // ② 必须是最后 5 根（最近 5 日），而不是最早 5 根
    expect(quotes.map((q) => q.tradeDate)).toEqual(ALL_DATE_ASC.slice(-5));

    // ③ 响应日期严格升序（前端契约不变）
    for (let i = 1; i < quotes.length; i += 1) {
      expect(quotes[i].tradeDate > quotes[i - 1].tradeDate).toBe(true);
    }
    // 末根收盘价 = 最新一日收盘价（10 + 29 + 0.5）
    expect(quotes[4].close).toBe(39.5);
  });

  it('周K 聚合仍按时间升序，末根收盘价取最新一日收盘价', async () => {
    // limit=30 根日K → 约 5 个自然周；这里 2026-06-01 是周一，故 4 个整周 + 2 天
    const res = await request(app).get('/api/stocks/000001/kline?period=weekly&limit=30');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(h.state.orderDir).toBe('desc');

    const bars = res.body.data.quotes as { tradeDate: string; open: number; close: number }[];
    expect(bars.length).toBeGreaterThan(1);

    // 聚合结果必须升序（reverse 放在聚合之后会颠倒首尾，从而红）
    for (let i = 1; i < bars.length; i += 1) {
      expect(bars[i].tradeDate > bars[i - 1].tradeDate).toBe(true);
    }
    // 最后一根周K的收盘 = 最新一日（2026-06-30）的收盘价
    expect(bars[bars.length - 1].close).toBe(39.5);
    // 第一根周K的开盘 = 窗口首日（2026-06-01）的开盘价，不是最新日
    expect(bars[0].open).toBe(10);
  });
});
