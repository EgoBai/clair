/**
 * /health 诚实降级暴露 —— 回归测试
 *
 * 背景（2026-09-22 实测确证的假话，由 be-datapath 在 R0'-3 报告中指出）：
 *   `app.ts` 的 `/health` 用 `database.connected = health.healthy`，
 *   而 `InMemoryDatabase.healthCheck()` **恒返回 healthy:true**。于是即使
 *   PostgreSQL **根本没配置**，/health 仍报 `connected: true` —— 与事实相反。
 *
 *   配套缺陷：`isMemoryMode()` 全仓从不参与 `dataSource` 设置，health 也不暴露
 *   `dbType`，致使「PG 不可用 → 后端静默供给 5541 只 Math.random 伪造行情」
 *   这一降级态**不可被任何机器观测**。
 *
 * 本测试锁定修复后的契约。它的价值在于：**只要有人把 connected 改回
 * `health.healthy`，或删掉 dbType/degraded/refusalActive 字段，这里立刻红。**
 *
 * 注意：本测试**不 mock 数据库**——它就是要验证真实的降级路径。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

describe('/health 诚实降级暴露', () => {
  let app: unknown;

  beforeAll(async () => {
    // 强制走「PostgreSQL 不可用 → 内存库降级」这条真实路径
    delete process.env.DATABASE_URL;
    const { initDatabase } = await import('../db/dbFactory');
    await initDatabase();
    const mod = await import('../app');
    app = mod.app;
    // 注意：本 hook 真的很慢——app.ts 会拉入约 40 个 router，且 initDatabase()
    // 在内存模式下要为 5541 只股票各生成 120 日伪行情（约 66 万个对象）。
    // 故显式放宽超时；默认 10s 必超时。
  }, 120_000);

  it('响应 200 且提供 database 块', async () => {
    const res = await request(app as never).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.database).toBeDefined();
  });

  it('【核心】内存库降级态下 database.connected 必须为 false', async () => {
    const res = await request(app as never).get('/health');
    const db = res.body.database;

    // 先确认我们确实处在降级态，否则本断言没有意义
    expect(db.dbType).toBe('memory');
    expect(db.degraded).toBe(true);

    // 这条是本次修复的要点：PG 没连上就说没连上，
    // 不得沿用 InMemoryDatabase.healthCheck() 恒真的 healthy。
    expect(db.connected).toBe(false);
  });

  it('status 在降级态应为 degraded，而非 healthy', async () => {
    const res = await request(app as never).get('/health');
    expect(res.body.status).toBe('degraded');
  });

  it('refusalActive 与 fabricationAllowed 必须互斥，且恰有一个为真', async () => {
    const res = await request(app as never).get('/health');
    const db = res.body.database;

    expect(typeof db.refusalActive).toBe('boolean');
    expect(typeof db.fabricationAllowed).toBe('boolean');

    // 二选一：要么已拒绝供给伪造行情（诚实），要么正在放行伪造行情（须可见）
    expect(db.refusalActive !== db.fabricationAllowed).toBe(true);
  });

  it('非生产环境下 fabricationAllowed 为 true —— 即诚实声明「当前确在供给伪造行情」', async () => {
    const res = await request(app as never).get('/health');
    const db = res.body.database;

    // 测试/开发环境本就允许伪行情（拒供仅在 NODE_ENV=production 生效）。
    // 关键不是把它关掉，而是**如实声明**，让降级态不再静默。
    expect(process.env.NODE_ENV).not.toBe('production');
    expect(db.fabricationAllowed).toBe(true);
    expect(db.refusalActive).toBe(false);
  });

  it('stockCount 反映真实股票清单规模（真实数据不应被拒供误伤）', async () => {
    const res = await request(app as never).get('/health');
    const stockCount = res.body.database.stockCount;

    // all_stocks_compact.json 为 5541 条真实清单；用宽松下界避免硬编码漂移
    expect(stockCount).toBeGreaterThan(1000);
  });
});
