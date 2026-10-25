/**
 * /health 诚实降级契约 —— dbType / degraded / dataSource
 *
 * 背景（这条红线为什么必须有机器可读出口）：
 *   `backend/src/db/dbFactory.ts` 在 PostgreSQL 连不上时会**静默降级**到内存库。
 *   降级态下全站没有真实行情/估值来源，若 /health 不暴露这件事，
 *   运维在容器里看到的只是一句「200 OK」，**完全无从判断这台机器是否在降级兜底**。
 *   （这类「HTTP 200 但内容在退化」的缺陷比 404 更危险：它不会自己暴露。）
 *
 * 本测试锁定 /health 的三条硬契约：
 *   1. PostgreSQL 模式 → dbType='postgresql'、degraded=false、dataSource='real'
 *   2. 内存库降级态 → dbType='memory'、degraded=true、dataSource='unavailable'
 *      且 **status='degraded'**，但 **HTTP 状态码仍是 200**
 *      （探针不能被打死，否则托管平台会反复重启容器）
 *   3. 同一语义只有一个真源：顶层 dbType 与 database.dbType 必须同值
 *      （杜绝「同一含义两种拼写/两个真源」这类漂移）
 *
 * 与既有测试的分工：
 *   - healthHonestDegradation.test.ts：锁 database.connected / refusalActive /
 *     fabricationAllowed / stockCount 等**降级细节字段**。
 *   - 本文件：锁**运维契约三字段**本身 + 降级态的 HTTP 状态码语义。
 *
 * ⚠️ 环境变量隔离：测试必须删除 DATABASE_URL，否则本机若配了 PG，
 *    测的就不是降级路径了（降级路径正是这里要验的东西）。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

/**
 * 覆盖 dbFactory 的 getDbStatus / deriveHealthContract。
 *
 * 为什么用「可切换的 override」而不是直接 mock 成固定值：
 *   同一个 app 实例要同时测「内存降级态」与「PostgreSQL 态」两种模式，
 *   而 Express app 的导入成本很高（约 40 个 router）。
 *   故用一个可变开关，默认委托给**真实实现**（=真实降级路径），
 *   仅在需要构造 PG 态时临时改写 —— 两条路径都经过真实的
 *   deriveHealthContract() 推导逻辑，不存在「测了个假实现」。
 */
const dbState = vi.hoisted(() => ({
  override: null as null | { type: 'postgres' | 'memory'; degraded: boolean; stockCount: number },
}));

vi.mock('../db/dbFactory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/dbFactory')>();
  return {
    ...actual,
    getDbStatus: () => dbState.override ?? actual.getDbStatus(),
    // 无参调用（如 api/health.ts 内部）也要能反映 override，
    // 故此处显式回填 override，而不是依赖模块内自调用（vitest 不改写模块内自引用）。
    deriveHealthContract: (status?: { type: 'postgres' | 'memory'; degraded: boolean }) =>
      actual.deriveHealthContract(status ?? dbState.override ?? actual.getDbStatus()),
  };
});

describe('/health 诚实降级契约（dbType / degraded / dataSource）', () => {
  let app: express.Express;
  let originalDatabaseUrl: string | undefined;

  beforeAll(async () => {
    // 隔离本机环境：强制走「PG 不可用 → 内存库降级」这条真实路径
    originalDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    const { initDatabase } = await import('../db/dbFactory');
    await initDatabase();
    const mod = await import('../app');
    app = mod.app;
  }, 120_000);

  afterAll(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    dbState.override = null;
  });

  // ============================================================
  // 契约推导函数本身（纯函数，两种模式各一条）
  // ============================================================
  describe('契约推导 deriveHealthContract()', () => {
    it('PostgreSQL 模式：dbType=postgresql、degraded=false、dataSource=real', async () => {
      const { deriveHealthContract } = await import('../db/dbFactory');
      const contract = deriveHealthContract({ type: 'postgres', degraded: false });

      expect(contract.dbType).toBe('postgresql');
      expect(contract.degraded).toBe(false);
      expect(contract.dataSource).toBe('real');
    });

    it('内存库降级模式：dbType=memory、degraded=true、dataSource=unavailable', async () => {
      const { deriveHealthContract } = await import('../db/dbFactory');
      const contract = deriveHealthContract({ type: 'memory', degraded: true });

      expect(contract.dbType).toBe('memory');
      expect(contract.degraded).toBe(true);
      expect(contract.dataSource).toBe('unavailable');
    });
  });

  // ============================================================
  // 真实降级路径（无 DATABASE_URL → 内存库）
  // ============================================================
  describe('真实降级路径：GET /health', () => {
    it('降级态探针仍返回 HTTP 200（探针不能被打死，否则托管平台反复重启容器）', async () => {
      const res = await request(app as never).get('/health');

      expect(res.status).toBe(200);
    });

    it('降级态三字段齐备且取值正确：memory / true / unavailable', async () => {
      const res = await request(app as never).get('/health');

      expect(res.body.dbType).toBe('memory');
      expect(res.body.degraded).toBe(true);
      expect(res.body.dataSource).toBe('unavailable');
    });

    it('降级态 body.status 如实为 degraded（HTTP 200 与 status=degraded 并存）', async () => {
      const res = await request(app as never).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('degraded');
    });

    it('同一语义只有一个真源：顶层 dbType 与 database.dbType 同值', async () => {
      const res = await request(app as never).get('/health');

      expect(res.body.dbType).toBe('memory');
      expect(res.body.database.dbType).toBe(res.body.dbType);
      expect(res.body.database.degraded).toBe(res.body.degraded);
    });

    it('api/health.ts 的独立路由也暴露同一契约（防两处实现漂移）', async () => {
      // backend/src/api/health.ts 当前是**死代码**（全仓无 import/mount 引用点，
      // 真实 /health 由 app.ts 的内联 handler 兑现）。任务 #38 计划删除该文件，
      // 故此处先探测可用性：文件被删 ≠ 契约回归，不该因此报红。
      let healthRouter: express.Router | null = null;
      try {
        healthRouter = (await import('../api/health')).default;
      } catch {
        healthRouter = null;
      }
      if (!healthRouter) {
        // 该路由已被删除（#38 落地）：契约的真源仍是 deriveHealthContract + app.ts，
        // 由本文件其余用例覆盖。此处跳过即可，不算失败。
        expect(true).toBe(true);
        return;
      }

      const probe = express();
      probe.use('/health', healthRouter);

      const res = await request(probe as never).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.dbType).toBe('memory');
      expect(res.body.degraded).toBe(true);
      expect(res.body.dataSource).toBe('unavailable');
    });
  });

  // ============================================================
  // PostgreSQL 正常态（模拟 dbFactory 上报 PG 已连通）
  // ============================================================
  describe('PostgreSQL 模式：GET /health', () => {
    beforeAll(() => {
      dbState.override = { type: 'postgres', degraded: false, stockCount: 5544 };
    });

    afterAll(() => {
      dbState.override = null;
    });

    it('PG 模式三字段齐备且取值正确：postgresql / false / real', async () => {
      const res = await request(app as never).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.dbType).toBe('postgresql');
      expect(res.body.degraded).toBe(false);
      expect(res.body.dataSource).toBe('real');
    });

    it('PG 模式下 body.status 不再是 degraded（降级标记不会误报）', async () => {
      const res = await request(app as never).get('/health');

      expect(res.body.status).not.toBe('degraded');
    });
  });
});
