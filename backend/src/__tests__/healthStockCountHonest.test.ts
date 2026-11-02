/**
 * 缺陷A 回归：/health 的 stockCount 不得再是 -1 哨兵值。
 *
 * 实测（2026-11-02，线上 https://clair-api-ryng.onrender.com/health）：
 *   {"dbType":"postgresql","degraded":false,...,"database":{...,"stockCount":-1}}
 * 根因：dbFactory.getDbStatus() 在 PG 模式下写死 `-1`（同步函数里取不了 count(*)），
 *       app.ts:406 直接把它塞进响应。前端/探针看到的是一个"正常整数"
 *       —— 比 null 更难识别的谎报。
 *
 * 修复后契约：
 *   - 能查到 → 真实整数（≈ stocks 表活跃标的数）；
 *   - 查不到/超时 → null + stockCountAvailable:false + 中文 stockCountReason；
 *   - 任何情况下都**不出现** -1 / 0 这种哨兵值。
 *
 * 本文件同时锁定缺陷B 的口径文案（composeCoverageNote 纯函数）。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

describe('缺陷B：summary 口径说明文案（纯函数）', () => {
  it('两个数字都真实时，文案同时包含两个数字并点明口径不同', () => {
    return import('../api/stock').then(({ composeCoverageNote }) => {
      const note = composeCoverageNote({
        quoteCoveredStocks: 5184,
        listedStockCount: 5546,
        excludedIndexRows: 5,
        asOf: '2026-11-02',
      });
      expect(note).toContain('totalStocks=5184');
      expect(note).toContain('5546');
      expect(note).toContain('2026-11-02');
      expect(note).toContain('剔除 5 条指数行');
      // 差额必须由数字算出，不是写死的
      expect(note).toContain('多出的 362 只');
      expect(note).toMatch(/口径不同/);
    });
  });

  it('差额随输入变化（证明文案是动态拼装而非硬编码）', () => {
    return import('../api/stock').then(({ composeCoverageNote }) => {
      const note = composeCoverageNote({
        quoteCoveredStocks: 100,
        listedStockCount: 130,
        excludedIndexRows: 0,
        asOf: '2026-01-05',
      });
      expect(note).toContain('多出的 30 只');
      expect(note).toContain('totalStocks=100');
    });
  });

  it('清单计数不可得时如实说明「不作估计」，不得编造对比数字', () => {
    return import('../api/stock').then(({ composeCoverageNote }) => {
      const note = composeCoverageNote({
        quoteCoveredStocks: 5184,
        listedStockCount: null,
        excludedIndexRows: null,
        asOf: '2026-11-02',
      });
      expect(note).toContain('totalStocks=5184');
      expect(note).toContain('不可得');
      expect(note).toContain('不作估计');
      // 不得出现任何被编造出来的清单总数
      expect(note).not.toContain('5546');
      expect(note).not.toContain('剔除');
    });
  });
});

describe('缺陷A：/health stockCount 如实', () => {
  let app: unknown;

  beforeAll(async () => {
    // 强制走「PostgreSQL 不可用 → 内存库降级」这条真实路径（内存库持有真实股票清单）
    delete process.env.DATABASE_URL;
    const { initDatabase } = await import('../db/dbFactory');
    await initDatabase();
    const mod = await import('../app');
    app = mod.app;
  }, 120_000);

  it('database.stockCount 是真实整数，且绝不是 -1', async () => {
    const res = await request(app as never).get('/health');
    expect(res.status).toBe(200);

    const db = res.body.database;
    // 锁死本次修复点：-1 是历史哨兵值，任何情况都不许回来
    expect(db.stockCount).not.toBe(-1);
    // 内存库持有 all_stocks_compact.json 的 5541 条真实清单（宽松下界防漂移）
    expect(typeof db.stockCount).toBe('number');
    expect(db.stockCount).toBeGreaterThan(1000);
    expect(Number.isInteger(db.stockCount)).toBe(true);
  });

  it('stockCountAvailable 为 true，且不出现 stockCountReason', async () => {
    const res = await request(app as never).get('/health');
    const db = res.body.database;
    expect(db.stockCountAvailable).toBe(true);
    expect(db.stockCountReason).toBeUndefined();
  });

  it('/health 仍是 HTTP 200（Render 健康探针路径不得被打挂）', async () => {
    const res = await request(app as never).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.dbType).toBe('memory');
  });

  it('resolveStockCount 的三件套自洽：available=false 必须配 null + 非空原因', async () => {
    const { resolveStockCount } = await import('../db/dbFactory');
    const probe = await resolveStockCount();
    if (probe.stockCountAvailable) {
      expect(typeof probe.stockCount).toBe('number');
      expect(probe.stockCount).toBeGreaterThanOrEqual(0);
      expect(probe.stockCountReason).toBeUndefined();
    } else {
      expect(probe.stockCount).toBeNull();
      expect(typeof probe.stockCountReason).toBe('string');
      expect((probe.stockCountReason ?? '').length).toBeGreaterThan(0);
    }
  });

  it('getDbStatus().stockCount 不再是负数哨兵（内存模式为真实计数）', async () => {
    const { getDbStatus } = await import('../db/dbFactory');
    const status = getDbStatus();
    expect(status.stockCount === null || status.stockCount >= 0).toBe(true);
  });
});
